"""跨页续表拼接。

中文公告的表格常跨页断开，断点有两种形态：

1. **行边界断开** —— 上一页最后一行是完整数据行，下一页第一行是新数据行。
   这种只需知道"是同一张表"，行本身不用动。

2. **单元格内断开** —— 某个单元格的长文本被页边界切成两半，下一页第一行只有
   那一列有内容、其余列空着。**这种不管就会产生错值**：
   实测 pledge-001 第 2 页第一行是「有限公司－山东信托·传字63」，
   它其实是上一页「山东省国际信托股份」的下半截，两半合起来才是完整股东名称。
   抽取层若把它当独立的值，股东名称字段就错了。

本模块只做**打标**，不做拼接：给续表打 `continued_from`，给碎片行的单元格打
`continues`（指回上一页同列的单元格）。拼接交给消费方 —— 因为该怎么拼取决于
语义（同一个单元格的延续 vs 恰好同列的两个不同值），解析层不该替下游决定。
"""
from __future__ import annotations

from typing import Dict, List, Optional

# 表格离页边多近算"贴边"。实测 pledge-001 的断点：上页表底距页底 77pt、
# 下页表顶距页顶 72pt（页高 842）——都远小于 0.12×842≈101pt。
EDGE_RATIO = 0.12

# 列边界对齐容差（pt）。同一张表的续页列宽一致，实测左右边界完全相同。
COL_TOL = 2.0

# 续页首行"够满"的门槛：单元格数超过列数这个比例就认为不是碎片行。
FRAGMENT_ROW_RATIO = 0.5


def _cells_of(page: Dict, table_id: str) -> List[Dict]:
    return [
        b
        for b in page["blocks"]
        if b.get("source_type") == "cell" and b["table_ref"]["table_id"] == table_id
    ]


def _is_continuation(a: Dict, prev_page: Dict, b: Dict, cur_page: Dict) -> bool:
    """判断下一页的第一张表是不是上一页最后一张表的续页。"""
    if a["n_cols"] != b["n_cols"]:
        return False
    # 左右边界要对齐：同一张表的续页列宽一致
    if abs(a["region"][0] - b["region"][0]) > COL_TOL:
        return False
    if abs(a["region"][2] - b["region"][2]) > COL_TOL:
        return False
    # 上页的表要贴下边
    if prev_page["height"] - a["region"][3] > EDGE_RATIO * prev_page["height"]:
        return False
    # 下页的表要贴上边
    if b["region"][1] > EDGE_RATIO * cur_page["height"]:
        return False
    return True


def _mark_fragment_row(prev_page: Dict, a: Dict, cur_page: Dict, b: Dict) -> Optional[int]:
    """续页首行若是碎片行，把它的单元格指回上一页同列的单元格。

    返回标了几个；不是碎片行则返回 None。
    """
    rows: Dict[int, List[Dict]] = {}
    for blk in _cells_of(cur_page, b["table_id"]):
        rows.setdefault(blk["table_ref"]["row"], []).append(blk)
    first = rows.get(0)
    if not first:
        return None
    if len(first) > FRAGMENT_ROW_RATIO * b["n_cols"]:
        # 首行够满 → 是行边界断开，单元格本身没被切断
        return None

    prev_cells = _cells_of(prev_page, a["table_id"])
    if not prev_cells:
        return None
    last_row = max(blk["table_ref"]["row"] for blk in prev_cells)
    by_col = {
        blk["table_ref"]["col"]: blk
        for blk in prev_cells
        if blk["table_ref"]["row"] == last_row
    }

    n = 0
    for blk in first:
        src = by_col.get(blk["table_ref"]["col"])
        if src is None:
            continue
        blk["table_ref"]["continues"] = {
            "table_id": a["table_id"],
            "cell_ref": src["table_ref"]["cell_ref"],
            "block_id": src["block_id"],
        }
        n += 1
    return n


def link_continued_tables(pages: List[Dict]) -> List[str]:
    """给各页的续表打标，返回警告文案列表（供写进 quality.warnings）。"""
    notes: List[str] = []
    for i in range(1, len(pages)):
        prev, cur = pages[i - 1], pages[i]
        if not prev["tables"] or not cur["tables"]:
            continue
        a, b = prev["tables"][-1], cur["tables"][0]
        if not _is_continuation(a, prev, b, cur):
            continue

        b["continued_from"] = a["table_id"]
        n_frag = _mark_fragment_row(prev, a, cur, b)
        if n_frag:
            notes.append(
                f"page {cur['page']}: 表 {b['table_id']} 续自 {a['table_id']}，"
                f"且首行有 {n_frag} 个单元格是被页边界切断的碎片（已标 table_ref.continues，"
                f"消费方需与上一页同列单元格拼接后再取值）"
            )
        else:
            notes.append(
                f"page {cur['page']}: 表 {b['table_id']} 续自 {a['table_id']}"
                f"（行边界断开，行本身完整）"
            )
    return notes
