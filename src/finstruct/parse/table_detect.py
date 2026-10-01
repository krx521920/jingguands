"""表格区域与单元格切分（D2 基础版）。

## 为什么 D2 就要做这个

原本表格重建排在 D3/D4。但 D2 实测真实公告时发现：**表格会破坏块级出处的自洽性。**

`pledge.pdf`（万集科技质押公告）第 1 页的股权质押情况表有一张多行表头，
块区域重叠，68 个字符被两个以上的块重复覆盖，区域重建一致率从 100% 掉到 81.8%。
原因：行聚类容差（中位字高 × 0.6）在表格里会把相邻两行并成一行，于是块的
bbox 互相压住 —— 实测 `01_b00034` 的 y 从 660.0 到 673.4，`01_b00035` 从 665.9
到 679.2，重叠 7.5pt。

**这不是补个字段能糊过去的，必须按表格自己的几何来切。**

## 为什么用单元格而不是行

pdfplumber 的 `table.rows[].bbox` 在有纵向合并单元格时会互相重叠
（实测 row1 = 469.5–575.3，row2 = 504.8–540.1），拿它当切分单元会重现同样的问题。
而 `table.cells` 是**平铺整张表、彼此不重叠**的，是唯一可靠的切分单元。

## 本模块的边界（D3/D4 还要做的）

已做：表格区域检测、单元格切分、行列坐标、每个字符归属唯一所有者。
未做（留给 D3/D4）：
- 多层表头的 header_path 继承（把「本次质押 / 股数」拼出来）
- 跨页表格拼接
- 无框表格（stream 模式）
- 单元格质量自检
"""
from __future__ import annotations

import re
from typing import Dict, List, Optional, Tuple

from . import evidence as ev


def _overlap_ratio(a: Tuple[float, float, float, float], b: Tuple[float, float, float, float]) -> float:
    """a 与 b 的交集面积占 a 面积的比例。"""
    x0 = max(a[0], b[0]); y0 = max(a[1], b[1])
    x1 = min(a[2], b[2]); y1 = min(a[3], b[3])
    if x1 <= x0 or y1 <= y0:
        return 0.0
    inter = (x1 - x0) * (y1 - y0)
    area = max(1e-6, (a[2] - a[0]) * (a[3] - a[1]))
    return inter / area


def detect_tables(doc_id: str, page_no: int, page) -> List[Dict]:
    """检测本页的表格，返回表格元数据列表。

    只给元数据（region / n_rows / n_cols）与单元格几何，**不在这里塞单元格文本**：
    单元格文本以 block 的形式统一交付（带 source_type="cell" 与 table_ref），
    避免同一份内容在两处出现、日后漂移。

    返回：
        [{"table_id", "page", "region", "n_rows", "n_cols",
          "_cells": [{"table_id","box","row","col","cell_id","cell_ref"}],
          "_row_edges": [(top,bottom)]}]
    """
    try:
        found = page.find_tables()
    except Exception:
        return []

    tables: List[Dict] = []
    for seq, t in enumerate(found, start=1):
        try:
            cells_raw = list(t.cells)
            n_rows = len(t.rows)
            n_cols = len(t.columns)
        except Exception:
            continue
        if not cells_raw or n_rows < 2 or n_cols < 2:
            # 单行"表格"多半是排版噪声（一条横线）。
            # **单列"表格"则几乎都是正文被误检** —— 实测 D4-PLD-009 p3 的正文章节
            # 被 pdfplumber 判成 4 行×1 列的表格，它的"行"正好是正文的四行。
            # 后果不只是多一张表：那行的字符被当表格处理，而字符中心恰好落在表格
            # 右边界上时会擦边漏认领，掉回正文流单独成行 —— 于是出现「，」这样一个
            # 单字段落块，且它的 region 与外层段落重叠，区域重建一致率掉到 99%。
            continue

        # pdfplumber 的 t.rows / t.columns 边界在**纵向合并**时会互相重叠
        # （实测 pledge-001 p1 的 rows[1] 与 rows[2] 的 y 区间交叠），
        # 拿它做"落在第几行"的判定会取到错误的行 —— 实测把第 2 行误判成第 1 行，
        # 于是 c001 与 c002 得到同一个 cell_ref。网格改从**单元格自身的坐标**推：
        # 所有相异的上边界即行，相异的左边界即列。
        row_tops = sorted({round(cy0, 1) for (_x0, cy0, _x1, _y1) in cells_raw})
        col_lefts = sorted({round(cx0, 1) for (cx0, _y0, _x1, _y1) in cells_raw})

        def _nearest(values: List[float], v: float) -> int:
            key = round(v, 1)
            if key in values:
                return values.index(key)
            return min(range(len(values)), key=lambda i: abs(values[i] - key))

        # 非重叠的行带 / 列带：相异边界之间即一行/一列。
        # 行带还兼作"落在表格内但不在任何单元格里"的字符兜底分组用
        #（多行表头常有文字落在绘制出的单元格矩形之外）。
        row_bands = []
        for i, top in enumerate(row_tops):
            bottom = row_tops[i + 1] if i + 1 < len(row_tops) else t.bbox[3]
            row_bands.append((round(top, 2), round(bottom, 2)))
        col_bands = []
        for i, left in enumerate(col_lefts):
            right = col_lefts[i + 1] if i + 1 < len(col_lefts) else t.bbox[2]
            col_bands.append((round(left, 2), round(right, 2)))

        def _span(bands, lo: float, hi: float) -> int:
            """单元格的 [lo,hi] 覆盖了几个网格带 —— 即 colspan/rowspan。

            没有这一项就拼不出多行表头：实测 pledge-001 p1 表2 的「已质押股份情况」
            是一个跨 2 列的合并单元格，不知道跨度就无法把它归给下面两个子列。
            """
            n = 0
            for b0, b1 in bands:
                if min(hi, b1) - max(lo, b0) > 0.5:
                    n += 1
            return max(1, n)

        table_id = ev.make_table_id(doc_id, page_no, seq)
        cell_boxes = []
        for i, (cx0, cy0, cx1, cy1) in enumerate(cells_raw):
            r = _nearest(row_tops, cy0)
            c = _nearest(col_lefts, cx0)
            cell_boxes.append(
                {
                    "table_id": table_id,
                    "box": (cx0, cy0, cx1, cy1),
                    "row": r,
                    "col": c,
                    "rowspan": _span(row_bands, cy0, cy1),
                    "colspan": _span(col_bands, cx0, cx1),
                    # cell_id：**全文档唯一**的单元格键，分组与回溯都用它。
                    # 必须带 table_id 前缀：两张表各自从 c001 编号会撞车 —— 实测
                    # pledge-001 p1 的 t002 覆盖了 t001 的 c001–c035，导致 t001 第 1–8 列
                    # 的字符全部认领失败、掉进兜底块（D2 那个 94/95 的根因）。
                    # 也不能用 (row,col) 当键：合并单元格会让不同物理单元格推出相同的
                    # (row,col)，按它分组会把装不下全部字符的 box 取来，静默丢字。
                    "cell_id": f"{table_id}_c{i + 1:03d}",
                    # cell_ref：人类可读的网格位置（1 基），对齐魏文宇契约的
                    # provenance.cell_ref —— run_extract.mjs 读 block.table_ref.cell_ref，
                    # 少这个字段他的链路会把表格出处静默丢成 null。
                    "cell_ref": f"r{r + 1}c{c + 1}",
                }
            )

        # 合并单元格覆盖了哪些位置：显式写出来，消费方不必自己推行列网格。
        #
        # 为什么不做成"给被覆盖位置也产一份文本"：那会破坏本模块的核心不变量
        # ——每个字符恰好属于一个块。同一个「翟军」被两个块拥有，
        # 字符守恒与区域重建立刻失效。所以只写位置，不复制内容。
        _annotate_covers(cell_boxes)

        tables.append(
            {
                "table_id": table_id,
                "page": page_no,
                "region": [round(v, 2) for v in t.bbox],
                # 行列数用推出来的网格，不用 pdfplumber 的 t.rows/t.columns
                #（它们在有纵向合并时会把一行重复计数）
                "n_rows": len(row_tops),
                "n_cols": len(col_lefts),
                "_cells": cell_boxes,
                "_row_edges": row_bands,
                "_col_edges": col_bands,
            }
        )
    return tables


def assign_owner(cell_boxes: List[Dict], char) -> Optional[str]:
    """判断一个字符属于哪个单元格，返回 cell_id；不属于任何单元格返回 None。

    用**字符中心点**判定，和 check_evidence 的取值方式一致，保证可复现。
    """
    cx = (char["x0"] + char["x1"]) / 2
    cy = (char["top"] + char["bottom"]) / 2
    for cell in cell_boxes:
        x0, y0, x1, y1 = cell["box"]
        if x0 <= cx <= x1 and y0 <= cy <= y1:
            return cell["cell_id"]
    return None


# ---------------------------------------------------------------- 多层表头
# 值型内容：数字、百分比、金额。用来区分"表头行"和"数据行"。
_VALUE_RE = re.compile(r"^[¥￥$]?\s*-?[\d,]+(?:\.\d+)?\s*(?:%|股|元|万元|亿元|个|次)?$")

# 表头最多占前几行。中文公告里见过 2 行；给到 3 是留余量。
MAX_HEADER_ROWS = 3


def _is_value_like(text: str) -> bool:
    t = (text or "").strip()
    return bool(t) and bool(_VALUE_RE.match(t))


def detect_header_rows(grid_texts: Dict, n_rows: int, n_cols: int) -> int:
    """判断表头占前几行，返回行数（0 = 不认为有表头）。

    规则：从第一行往下，只要该行的"值型单元格"不超过 1 个就算表头行，遇到第一个
    数据行即停；上限 MAX_HEADER_ROWS 行。

    列数 < 3 时直接返回 0：那种窄表多半是"字段名: 值"的竖排键值表
    （实测 equity_change p2 表1 就是「股东名称 / 国寿成达…」这种），
    按网格表头处理会把每一行都误当表头。
    """
    if n_cols < 3:
        return 0
    n = 0
    for r in range(min(MAX_HEADER_ROWS, n_rows)):
        vals = sum(1 for c in range(n_cols) if _is_value_like(grid_texts.get((r, c))))
        if vals > 1:
            break
        n += 1
    if n >= n_rows:
        # 整张表都是"表头" → 说明没有数据行，宁可不判
        return 0
    return n


def build_header_paths(
    cells: List[Dict], grid_texts: Dict, n_header: int
) -> Dict[str, Optional[str]]:
    """给每个单元格算出完整列名（多层表头逐级拼起来）。

    合并单元格按 rowspan/colspan 铺到它覆盖的每个网格位上，这样子列才能取到
    祖父级表头 —— 实测 pledge-001 p1 表2 的「已质押股份情况」跨 2 列，
    其下两个子列各自应得到「已质押股份情况/已质押股份限售和冻结、标记数」与
    「已质押股份情况/占已质押股份比例（%）」。

    没有这一项，抽取层只能拿到「占已质押股份比例（%）」这种失去归属的列名，
    分不清它说的是"已质押"还是"未质押"那一组。
    """
    if n_header <= 0:
        return {c["cell_id"]: None for c in cells}

    grid: Dict[tuple, Dict] = {}
    for c in cells:
        for dr in range(c.get("rowspan") or 1):
            for dc in range(c.get("colspan") or 1):
                grid.setdefault((c["row"] + dr, c["col"] + dc), c)

    out: Dict[str, Optional[str]] = {}
    for c in cells:
        parts: List[str] = []
        for r in range(n_header):
            hc = grid.get((r, c["col"]))
            if hc is None:
                continue
            t = (grid_texts.get((hc["row"], hc["col"])) or "").strip()
            if t and t not in parts:
                parts.append(t)
        out[c["cell_id"]] = "/".join(parts) if parts else None
    return out


def _annotate_covers(cells: List[Dict]) -> None:
    """给每个合并单元格写出它覆盖的**其它**位置。

    只对 span > 1 的单元格做，且**跳过已有自己单元格的位置** ——
    后者说明那不是被合并覆盖的空位，而是另一个真实单元格。

    实测场景：D3-PLD-001 表1 的「翟军」rowspan=3，覆盖 (2,0)/(3,0)。
    没有这一项，消费方要自己推「rowspan=3 从 (1,0) 往下数三格是哪几格」。
    多一个推理环节就多一处能出错的地方。
    """
    occupied = {(c["row"], c["col"]) for c in cells}
    for c in cells:
        rs = c.get("rowspan") or 1
        cs = c.get("colspan") or 1
        if rs == 1 and cs == 1:
            continue
        covers = []
        for dr in range(rs):
            for dc in range(cs):
                if dr == 0 and dc == 0:
                    continue          # 原点自己不算
                r, col = c["row"] + dr, c["col"] + dc
                if (r, col) in occupied:
                    continue          # 那格有自己的单元格，不是被覆盖的空位
                covers.append({"row": r, "col": col, "cell_ref": f"r{r + 1}c{col + 1}"})
        c["covers"] = covers or None

