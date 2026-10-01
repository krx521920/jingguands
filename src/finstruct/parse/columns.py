"""分栏检测（gutter 检测 + 按栏切分阅读顺序）。

## 问题

中文年报/招股书常用双栏排版。若按「单栏自上而下」读，左右栏会逐行交错 ——
得到的是乱序句子。D1 起这是已知边界，一直欠着。

## 难点：居中的标题也会留下大片 x 空白

最直觉的做法是「整页扫一遍，某段 x 没有任何字符就是栏缝」。**这会误判**：
单栏页面上居中的标题、短行，同样会在两侧留下大片 x 空白。

更糟的是**表格**：一张 11 列的质押表天然有很多列间空白带。
实测 pledge-001 第 1 页按整页扫描会报出 3 条假栏缝（153–203 / 218–340 / 342–432）。

## 两条判据

1. **按文本行统计，不按整页统计。** 栏缝要在**绝大多数文本行**里都是空的。
   居中标题只占 1 行，正文行横跨该 x → 干净比例很低 → 不会被当成栏缝。

2. **先排除表格内的字符。** 页级分栏缝只作用于**正文流**；表格内部有它自己的
   列坐标，由 table_detect 处理。排除后 pledge-001 的三条假栏缝全部消失。

实测：两份栏 fixture 检出栏缝 (284, 312)；四份单栏文档共 14 页，零误报。

## 边界

- 若某张表**横跨**栏缝，说明版面不是干净的双栏（表格是整幅的），此时不切栏
  并给出警告 —— 否则表格单元格会与两栏正文交错，阅读顺序更难解释。
- 只处理竖向栏缝，不处理同一栏内的嵌套分栏。
"""
from __future__ import annotations

from typing import Dict, List, Optional, Sequence, Tuple

# 栏缝最小宽度（pt）。双栏排版的栏间距通常 ≥ 一个汉字的宽度。
MIN_GUTTER_PT = 12.0

# 栏缝必须在这么多比例的文本行里是空的。居中标题只占少数行，所以不会误判。
MIN_CLEAN_RATIO = 0.6

# 栏缝位置限定在文本区中部，避免把页面左右页边距当成栏缝。
GUTTER_MID_LO = 0.2
GUTTER_MID_HI = 0.8

# 把字符聚成文本行的 y 容差
ROW_TOL = 3.0

# 页面至少要有这么多文本行才考虑分栏。
# 落款页这类稀疏页面（署名、日期、页码，实测 D3-PLD-003 p3 只有 7 行 91 字）
# 右对齐内容会在左侧留下大片空白，行数少时"干净比例"极易被满足而误判成栏缝。
MIN_TEXT_ROWS = 8

# 每一栏至少要有的字符数，以及占正文流的比例。
# 栏缝切出来的必须是**两栏都有实质内容**的版面；否则只是某些行右对齐留下的空白。
MIN_COL_CHARS = 30
MIN_COL_SHARE = 0.15

# x 方向扫描步长（pt）
SCAN_STEP = 1.0


def _text_rows(chars: Sequence[Dict]) -> List[List[Dict]]:
    """把字符按 top 聚成文本行。"""
    rows: List[Dict] = []
    for c in sorted(chars, key=lambda c: (c["top"], c["x0"])):
        for r in rows:
            if abs(r["top"] - c["top"]) <= ROW_TOL:
                r["chars"].append(c)
                break
        else:
            rows.append({"top": c["top"], "chars": [c]})
    return [r["chars"] for r in rows]


def find_gutters(flow_chars: Sequence[Dict]) -> List[Tuple[float, float]]:
    """在正文流字符里找栏缝，返回 x 区间列表。

    调用方**必须先把表格内的字符排除掉**（见本模块文档）。
    """
    if len(flow_chars) < 20:
        return []
    rows = _text_rows(flow_chars)
    if len(rows) < MIN_TEXT_ROWS:
        return []

    x0 = min(c["x0"] for c in flow_chars)
    x1 = max(c["x1"] for c in flow_chars)
    n = int((x1 - x0) / SCAN_STEP)
    if n < 10:
        return []

    clean = [0] * n
    for row in rows:
        cover = bytearray(n)
        for c in row:
            a = max(0, int((c["x0"] - x0) / SCAN_STEP))
            b = min(n - 1, int((c["x1"] - x0) / SCAN_STEP))
            for k in range(a, b + 1):
                cover[k] = 1
        for k in range(n):
            if not cover[k]:
                clean[k] += 1

    span = x1 - x0
    need = MIN_CLEAN_RATIO * len(rows)
    out: List[Tuple[float, float]] = []
    start: Optional[int] = None
    for k in range(n + 1):
        ok = k < n and clean[k] >= need
        if ok:
            if start is None:
                start = k
            continue
        if start is None:
            continue
        width = (k - start) * SCAN_STEP
        lo = x0 + start * SCAN_STEP
        hi = x0 + k * SCAN_STEP
        # 位置要在文本区中部
        if width >= MIN_GUTTER_PT and GUTTER_MID_LO * span < (lo - x0) and (hi - x0) < GUTTER_MID_HI * span:
            out.append((lo, hi))
        start = None
    return out


def _col_chars(flow_chars: Sequence[Dict], lo: float, hi: float) -> int:
    return sum(1 for c in flow_chars if lo <= (c["x0"] + c["x1"]) / 2 < hi)


def split_columns(flow_chars: Sequence[Dict]) -> List[Tuple[float, float]]:
    """返回各栏的 x 范围（按阅读顺序，左到右）。单栏时返回空列表。

    切出来之后还要**逐栏验收**：每栏都必须有实质内容（字符数够、占比够）。
    否则右对齐的落款、居中的短行都会切出「一栏有字、其余栏几乎空」的假分栏。
    """
    gutters = find_gutters(flow_chars)
    if not gutters:
        return []
    x0 = min(c["x0"] for c in flow_chars)
    x1 = max(c["x1"] for c in flow_chars)
    cols: List[Tuple[float, float]] = []
    left = x0
    for g0, g1 in gutters:
        if g0 > left:
            cols.append((left, g0))
        left = g1
    if x1 > left:
        cols.append((left, x1))
    if len(cols) < 2:
        return []

    total = len(flow_chars)
    for lo, hi in cols:
        n = _col_chars(flow_chars, lo, hi)
        if n < MIN_COL_CHARS or n < MIN_COL_SHARE * total:
            return []  # 有栏是空的 → 不是真分栏
    return cols


def table_straddles_gutter(tables: Sequence[Dict], gutters: Sequence[Tuple[float, float]]) -> Optional[str]:
    """有表格横跨栏缝时返回该表 id —— 表示版面不是干净的双栏，不应切栏。

    表格是整幅元素：跨越栏缝说明该页的排版不是「左右两栏平行」，
    硬切会让表格单元格与两栏正文交错，阅读顺序更不可解释。
    """
    for t in tables:
        tx0, tx1 = t["region"][0], t["region"][2]
        for g0, g1 in gutters:
            if tx0 < g0 and tx1 > g1:
                return t["table_id"]
    return None


def column_of(block_region: Sequence[float], gutters: Sequence[Tuple[float, float]]) -> int:
    """按块的**左边界**判断它属于第几栏（0 基）。

    用左边界而不是中心点：横跨栏缝的整幅元素（标题、居中元信息）中心点会落在
    栏缝里、归属不定；而它们的左边界总在第一栏，且位置在最上方，
    自然被最先读到 —— 这正是整幅元素应有的阅读位置。
    """
    left = block_region[0]
    n = 0
    for g0, _g1 in gutters:
        if left >= g0:
            n += 1
    return n


# ---------------------------------------------------------------- 整幅行与分栏定位
# 关于 D5 剩余问题的线索（2026-10-01，已试错一次并回退）
#   D5-EQC-005/007 各有一页出现**段落×段落重叠**（89 / 135 字符），同源：
#   那是一张三栏定义表（术语 | 指 | 释义），分栏只切出 1 条缝（切成两栏）。
#   失败块的外接矩形横跨两栏（如实测 007 p4 的 [80.3, 504.0]），
#   而它的文本只含左栏内容 —— 说明有右栏字符被并进了左栏的块。
#
#   试过的改法：把 line_is_full_width 从「有任何一个字符碰到栏缝就算整幅」
#   改成「行内最大空隙 < 8pt 才算整幅」（即要求整行是一个连续文本 run）。
#   方向合理，但**破坏了既有正确行为**：D4-PLD-010 输出变化，
#   且 D5 出现未覆盖字符（test_补格后每个字符都有块覆盖 失败）。已回退。
#   说明跨栏字符的归属还有别的路径，不是 line_is_full_width 一个判据能定的。
#   已推进一层（2026-10-01）：打印失败块发现 ——
#     · 块的 text_raw 正好是**左栏的 106 字**，拆分本身是对的；
#     · 但 region 宽到 x=80.3–504.0，把右栏 163 字也框了进来。
#   即：**块的内容对，region 算宽了**。而 region 是 region_of(块自己的字符)，
#   所以块自己的字符里确实有落在右栏的。
#
#   下一个可疑点：_flow_blocks 把**整幅行放进 bucket[(band, 0)]** ——
#   与第 0 栏共用同一个桶，于是整幅行会和第 0 栏的内容一起进 cluster_blocks。
#   整幅行的字符横跨全宽，一旦与栏内内容聚成一块，块的 bbox 就会被撑满整页。
#   下一步：确认失败块里是否混进了整幅行的字符；若是，给整幅行单独一个桶键
#   （例如 (band, -1)），让它不与任何栏混聚。


def line_is_full_width(line_chars: Sequence[Dict], gutters: Sequence[Tuple[float, float]]) -> bool:
    """这一行是不是**整幅**（跨栏缝且中缝里有字符）。

    这是区分两种情况的唯一依据：
      · 整幅标题：字符连续铺过中缝 → 中缝里有字符 → True
      · 同一 y 上的左右两栏各行：中缝里必然没有字符（栏缝就是这么定义的）→ False

    不区分的话，整幅标题会被按栏拦腰截断 —— 实测「某某股份有限公司关于股东股份质押的
    公告」被切成「某某股份有限公司关」+「股东股份质押的公告」，读起来是断的。
    """
    for g0, g1 in gutters:
        for c in line_chars:
            if c["x1"] > g0 and c["x0"] < g1:
                return True
    return False


def locate(lines: Sequence[Sequence[Dict]], gutters: Sequence[Tuple[float, float]]) -> List[Tuple[int, int]]:
    """给每一行算出 (band, column)。

    band 由**整幅行**分隔：每遇到一个整幅行就换新的一段。整幅行自己独占一段。
    这样阅读顺序变成「先读整幅的标题/元信息，再逐栏读正文」，
    而不是把标题按栏切开、让左右两半分散在两次读里。
    """
    out: List[Tuple[int, int]] = []
    band = 0
    for ln in lines:
        if line_is_full_width(ln, gutters):
            out.append((band, 0))
            band += 1
        else:
            out.append((band, column_of(_line_region(ln), gutters)))
    return out


def _line_region(line_chars: Sequence[Dict]) -> List[float]:
    return [
        min(c["x0"] for c in line_chars),
        min(c["top"] for c in line_chars),
        max(c["x1"] for c in line_chars),
        max(c["bottom"] for c in line_chars),
    ]


def split_line_by_gutter(line_chars: Sequence[Dict], gutters: Sequence[Tuple[float, float]]) -> List[List[Dict]]:
    """把一行按栏缝拆成各栏的字符列表（左到右）。

    为什么必须拆行而不是按行归属：全局聚类出来的「一行」在同一 y 上同时含左右栏的字符。
    若把整行归给某一栏，另一栏的字符就被一起带走了 —— 实测两份栏 fixture 的正文
    因此被并成一块，读出来是「左栏前半 右栏前半 左栏后半」交错的。

    整幅行（中缝里有字符）不能拆，调用方先用 `line_is_full_width` 判掉。
    """
    if not gutters:
        return [list(line_chars)]
    bounds: List[Tuple[float, float]] = []
    prev = float("-inf")
    for g0, g1 in gutters:
        bounds.append((prev, g0))
        prev = g1
    bounds.append((prev, float("inf")))

    parts: List[List[Dict]] = [[] for _ in bounds]
    for c in line_chars:
        mid = (c["x0"] + c["x1"]) / 2
        for i, (lo, hi) in enumerate(bounds):
            if lo <= mid < hi:
                parts[i].append(c)
                break
    return parts


def full_width_tops(lines: Sequence[Sequence[Dict]], gutters: Sequence[Tuple[float, float]]) -> List[float]:
    """整幅行的 top 列表（升序）——它们把页面切成若干水平段。"""
    tops = [min(c["top"] for c in ln) for ln in lines if line_is_full_width(ln, gutters)]
    return sorted(tops)


def band_at(y: float, fw_tops: Sequence[float], tol: float = 1e-6) -> int:
    """某个 y 落在第几段（0 基）：它上方有几条整幅行就属于第几段。

    正文块与表格单元格都用这一个函数算段号，保证两者的排序键**同构**
    —— 否则元组长度不同，Python 逐元素比较会按第一个元素（段号 vs top）
    排序，把整类块挤到最前或最后。
    """
    n = 0
    for t in fw_tops:
        if y > t + tol:
            n += 1
        else:
            break
    return n
