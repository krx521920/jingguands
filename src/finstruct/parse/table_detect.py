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
        if not cells_raw or n_rows < 2:
            # 单行"表格"多半是排版噪声（一条横线），不当表格处理
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
                    # cell_id：物理单元格序号，表内唯一，**这是分组与引用该用的键**。
                    # 不能用 (row,col) 当键：合并单元格会让不同物理单元格推出相同的
                    # (row,col)，按它分组合并后取到的 box 装不下全部字符，会静默丢字
                    # （实测 pledge-001 第 1 页丢了 193 个字符）。
                    "cell_id": f"c{i + 1:03d}",
                    # cell_ref：人类可读的网格位置（1 基），对齐魏文宇契约的
                    # provenance.cell_ref —— run_extract.mjs 读 block.table_ref.cell_ref，
                    # 少这个字段他的链路会把表格出处静默丢成 null。
                    "cell_ref": f"r{r + 1}c{c + 1}",
                }
            )

        # 非重叠的行带：相异上边界之间即一行。给"落在表格内但不在任何单元格里"的
        # 字符兜底分组用 —— 多行表头常有文字落在绘制出的单元格矩形之外。
        row_bands = []
        for i, top in enumerate(row_tops):
            bottom = row_tops[i + 1] if i + 1 < len(row_tops) else t.bbox[3]
            row_bands.append((round(top, 2), round(bottom, 2)))

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
