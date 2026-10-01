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

    # 关于「按文本对齐补表格」的失败尝试（2026-10-01，D5）
    #   pdfplumber 的按线检测在竖线缺失时会整列甚至整表漏检，于是试了用
    #   find_tables({"vertical_strategy": "text", ...}) 做补充通道。实测**净效果为负**：
    #     换来 D5-EQC-007 的达标页 14/18 → 16/18，
    #     但 D5-EQC-003 从 34/34 退到 33/34、D5-EQC-008 从 19/19 退到 18/19，
    #     且区域重建一致率普遍下降（001 由 100% 降到 97.7%）。
    #   原因：按文本通道会把换行的单元格裂成多行，网格对不齐；
    #   而"单元格更多且区域没明显变大"这个替换闸拦不住它 —— 格子多不等于切得对。
    #   真正的解法应当能识别「换行单元格」的纵向合并，而不是单纯比较格子数量。
    #   在做出那个判据之前，保留按线通道，宁可漏检也不误切。
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

        # 关于「补出漏检的列」的失败尝试（2026-10-01，D5）
        #   判据本身是验证过的：表格外接矩形是检出单元格的并集，竖线缺失的列不在其中，
        #   那列字符落在表格之外掉进正文流。实测 D5-EQC-007 p7 的「序号」列（x 91–112）
        #   与「其他国家居留权情况」列（x 409–503）都命中 6/6 行 —— 判据成立。
        #   按该判据补列后确实见效：007 区域重建 97.8% → 99.4%，p7 的重叠由 157 降到 28，
        #   004/005 也各升 0.3%。
        #   但**代价是致命类退步**：007 的 p10 由「0 未覆盖」变成「4 未覆盖」，
        #   达标页 14/18 → 13/18。试过把补出列的字符按最近行带归行、格的 y 取
        #   该列实际字符的并集，结果完全不变，说明那 4 个字符走的是另一条路径。
        #   在查清之前不回退到「宁可漏检也不误切」：**4 个字符真丢字，
        #   换来的是 129 个外接矩形交叠的减少 —— 后者本来就是良性的。**
        #   下一步应当先定位 p10 那 4 个字符为何认领不到，再启用补列。
        # 补出**漏检的列**：pdfplumber 的表格外接矩形是它检出单元格的并集，
        # 竖线缺失的列不在其中，那列字符于是落在表格之外、掉进正文流 ——
        # 既失去列归属，又与别的单元格文字混成一行（bbox 横跨整张表）。
        # 判据：某段 x 若在**半数以上的行**里都有字符，它就是一列；正文不会这样对齐。
        # 实测 D5-EQC-007 p11 左右各一列、D5-EQC-004 p9 左右各一列。
        x0e, y0e, x1e, y1e = t.bbox
        extra_cols = _columns_outside(page, t.bbox, row_bands, col_bands)
        if extra_cols:
            col_bands = sorted(list(col_bands) + extra_cols, key=lambda b: b[0])
            col_lefts = [b[0] for b in col_bands]
            n_cols = len(col_bands)
            occupied = {(c["row"], c["col"]) for c in cell_boxes}
            # 该列各区间的字符，按**最近行带**归行（不要求严格落在带内）——
            # 补出的列与中间列的行高未必一致，严格包含会有字符认领不到。
            band_chars: Dict[int, List[Dict]] = {}
            for c in page.chars or []:
                cx = (c["x0"] + c["x1"]) / 2
                cy = (c["top"] + c["bottom"]) / 2
                if not (y0e - 1 <= cy <= y1e + 1):
                    continue
                if not any(e0 - 0.5 <= cx <= e1 + 0.5 for e0, e1 in extra_cols):
                    continue
                ri, bd = 0, float("inf")
                for i, (e0, e1) in enumerate(row_bands):
                    dd = 0.0 if e0 <= cy <= e1 else min(abs(cy - e0), abs(cy - e1))
                    if dd < bd:
                        bd, ri = dd, i
                band_chars.setdefault(ri, []).append(c)
            next_ord = len(cell_boxes) + 1
            for (ex0, ex1) in extra_cols:
                ci = _nearest(col_lefts, ex0)
                for ri in range(len(row_bands)):
                    if (ri, ci) in occupied:
                        continue
                    by0, by1 = row_bands[ri]
                    cs = [c for c in band_chars.get(ri, [])
                          if ex0 - 0.5 <= (c["x0"] + c["x1"]) / 2 <= ex1 + 0.5]
                    if cs:      # 格的 y 取该行带与该列实际字符的并集，保证认领得到
                        by0 = min(by0, min(c["top"] for c in cs))
                        by1 = max(by1, max(c["bottom"] for c in cs))
                    cell_boxes.append(
                        {
                            "table_id": table_id,
                            "box": [round(v, 2) for v in (ex0, by0, ex1, by1)],
                            "row": ri, "col": ci, "rowspan": 1, "colspan": 1,
                            "cell_id": f"{table_id}_c{next_ord:03d}",
                            "cell_ref": f"r{ri + 1}c{ci + 1}",
                            "covers": None,
                            "_synthesized": True,
                        }
                    )
                    next_ord += 1
                    occupied.add((ri, ci))

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
# 补充通道：按文本对齐推断表格的设置。
# text_*_tolerance 决定「同一列」的 x 容差 —— 取 3pt，约半个汉字宽：
# 太小会把换行的单元格裂成两列，太大又会把相邻列合成一列。
TEXT_TABLE_SETTINGS = {
    "vertical_strategy": "text",
    "horizontal_strategy": "text",
    "text_x_tolerance": 3,
    "text_y_tolerance": 3,
}

# 替换判据里的区域放大容忍度：按文本检出的表比按线检出的大出这个倍数就不换。
# 变大往往意味着把正文也圈进来了 —— 实测 D5-EQC-007 p11 大 5.7 倍。
TEXT_AREA_TOL = 1.3

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


def _find_text_tables(page) -> List:
    """按文本对齐推断表格。解析不出就返回空 —— 这是补充通道，不该让主通道失败。"""
    try:
        return list(page.find_tables(TEXT_TABLE_SETTINGS))
    except Exception:
        return []


def _area(bbox) -> float:
    x0, y0, x1, y1 = bbox
    return max(0.0, x1 - x0) * max(0.0, y1 - y0)


def _overlaps(a, b) -> bool:
    """两个矩形是否实质重叠（用较小者的面积占比判断，避免大表吃掉小表）。"""
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    if inter <= 0:
        return False
    smaller = min(_area(a), _area(b)) or 1.0
    return inter / smaller >= 0.5


# 某段 x 要算作「一列」，至少要在这么多比例的行里出现。
# 正文的左右边距也会对齐，但它通常只跨表格的一部分行；真正的列是整列贯通的。
COLUMN_ROW_COVERAGE = 0.5


def _columns_outside(page, bbox, row_bands, col_bands) -> List[Tuple[float, float]]:
    """找出表格左右两侧、与行对齐的列（pdfplumber 因竖线缺失而漏检的那些）。"""
    if not row_bands:
        return []
    x0, y0, x1, y1 = bbox
    inside = [
        c for c in (page.chars or [])
        if y0 - 1 <= (c["top"] + c["bottom"]) / 2 <= y1 + 1
    ]
    need = max(2, int(len(row_bands) * COLUMN_ROW_COVERAGE + 0.999))
    out: List[Tuple[float, float]] = []
    for is_left in (True, False):
        cand = [
            c for c in inside
            if (((c["x0"] + c["x1"]) / 2 < x0 - 0.5) if is_left
                else ((c["x0"] + c["x1"]) / 2 > x1 + 0.5))
        ]
        if not cand:
            continue
        cand.sort(key=lambda c: c["x0"])
        groups: List[Dict] = []
        for c in cand:
            if groups and c["x0"] <= groups[-1]["x1"] + 2.0:
                g = groups[-1]
                g["x1"] = max(g["x1"], c["x1"])
                g["chars"].append(c)
            else:
                groups.append({"x0": c["x0"], "x1": c["x1"], "chars": [c]})
        for g in groups:
            rows_hit = set()
            for c in g["chars"]:
                cy = (c["top"] + c["bottom"]) / 2
                for i, (e0, e1) in enumerate(row_bands):
                    if e0 - 1 <= cy <= e1 + 1:
                        rows_hit.add(i)
                        break
            if len(rows_hit) >= need:
                out.append((round(g["x0"], 2), round(g["x1"], 2)))
    return out
