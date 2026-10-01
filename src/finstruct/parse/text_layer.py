"""文本层解析：从电子版 PDF 抠出字符 → 聚成行 → 切段落 → 排阅读顺序。

为什么不能用「行距」切段落
--------------------------
中文公文（以及多数上市公司公告）的**行距是完全均匀的**，段落之间不加空行，
靠「首行缩进」区分段落。实测附件1通知.pdf：29 行的行距全部落在 11.17–13.20 之间，
段落边界处的行距只比普通行距多 0.2pt —— 纯按竖直间距切段落，整页会粘成一块，
区域级出处就退化成「整页一个框」，下游没法用。

所以本文件用三个信号联合切段：
  1. **首行缩进**：某行左边界比正文左边距缩进超过约一个字符宽 → 新段落开始
  2. **居中行**：左右留白对称且两侧都明显 → 居中块（通常是标题），单独成块
  3. **行距突增**：行距超过中位行距的 1.8 倍 → 新段落（兼容用空行分段的文档）

D1 范围说明（诚实标注能力边界）
--------------------------------
- 阅读顺序实现的是**单栏自上而下**，够用于 D1 的文本公告。
- **分栏检测（gutter 投影）尚未实现**，多栏排版会把左右栏交错读。这是 D2/D4 的工作。
- 表格重建不在本文件（见 table_rebuild，D3/D4）。
- 章节标题（一、二、(一)、1. 等）的语义识别尚未实现，目前统一标 BODY，
  只有居中标题块标 TITLE。

出处原则（团队 D3 硬要求）
--------------------------
块的 region 由它包含的字符**当场合并**得出，不是事后按文本搜索定位。
"""
from __future__ import annotations

from collections import Counter
from statistics import median
from typing import Dict, List, Optional, Tuple

from . import columns as cols
from . import evidence as ev

# 行聚类容差：以字符高度为基准，避免不同字号文档用死阈值
LINE_TOL_RATIO = 0.6
# 首行缩进阈值：以字符宽度为基准
INDENT_RATIO = 1.0
INDENT_MIN = 4.0
# 居中判定容差：左右留白差小于这个值就算居中
CENTER_TOL_RATIO = 2.0
# 行距突增阈值
GAP_BREAK_RATIO = 1.8
# 字符间横向间隙超过字号的这个比例，视为一个空格
SPACE_GAP_RATIO = 0.3
# 页眉页脚区域：页面上下各 8%
MARGIN_RATIO = 0.08


# ------------------------------------------------------------------ 行聚类
def cluster_lines(chars: List[Dict]) -> List[List[Dict]]:
    """把字符聚成行，行内按 x 排序，整页按 top 排序。

    容差取字高中位数的固定比例而不是写死 3pt —— 同一份 PDF 里标题和正文的
    字号可能差一倍，死阈值会把标题行拆散。
    """
    if not chars:
        return []
    heights = [c["bottom"] - c["top"] for c in chars if c["bottom"] > c["top"]]
    tol = (median(heights) if heights else 10.0) * LINE_TOL_RATIO

    lines: List[List[Dict]] = []
    cur: List[Dict] = []
    cur_top: Optional[float] = None
    for c in sorted(chars, key=lambda c: (round(c["top"], 1), c["x0"])):
        if cur_top is None or abs(c["top"] - cur_top) <= tol:
            cur.append(c)
            cur_top = c["top"] if cur_top is None else min(cur_top, c["top"])
        else:
            lines.append(cur)
            cur = [c]
            cur_top = c["top"]
    if cur:
        lines.append(cur)

    for ln in lines:
        ln.sort(key=lambda c: c["x0"])
    lines.sort(key=lambda ln: min(c["top"] for c in ln))
    return lines


def line_text(chars: List[Dict]) -> str:
    """把一行字符拼成文本。

    中文公告里字符通常紧贴，而西文单词之间有空隙。规则：
    相邻字符横向间隙超过字号的一定比例时插入一个空格，否则直接相接。
    """
    if not chars:
        return ""
    parts = [chars[0]["text"]]
    for prev, cur in zip(chars, chars[1:]):
        gap = cur["x0"] - prev["x1"]
        size = max(prev.get("size") or 0.0, cur.get("size") or 0.0) or 10.0
        if gap > size * SPACE_GAP_RATIO:
            parts.append(" ")
        parts.append(cur["text"])
    return "".join(parts).strip()


def _is_word_char(ch: str) -> bool:
    return bool(ch) and (ch.isascii() and (ch.isalnum() or ch in "%-./@:_"))


def join_block_text(lines: List[List[Dict]]) -> str:
    """把块内多行拼成连续文本。

    行与行之间：若前一行末尾与后一行开头都是西文单词字符，补一个空格；
    否则直接相接（中文换行不需要空格）。
    """
    out = ""
    for ln in lines:
        t = line_text(ln)
        if not t:
            continue
        if out and _is_word_char(out[-1]) and _is_word_char(t[0]):
            out += " "
        out += t
    return out


# ------------------------------------------------------------------ 版面度量
def _median_char_width(chars: List[Dict]) -> float:
    ws = [c["x1"] - c["x0"] for c in chars if c["x1"] > c["x0"]]
    return median(ws) if ws else 10.0


def _page_margins(lines: List[List[Dict]]) -> Tuple[float, float]:
    """估计正文的左右版心边界。

    **不能用众数。** 实测第 3 页：x0 的分布是 {111.0: 15, 90.0: 14}，
    缩进行反而成了众数，于是版心被估成 111，导致该页所有段落首行的
    「缩进量」都变成 0，整页粘成一个块。

    改用「长行」估计：一行如果占满版心宽度，它一定是正文行，
    左边界必然贴版心。短行（标题、居中的行）不参与估计。
    这样无论缩进行有多少，版心都能被正确找到。
    """
    if not lines:
        return 0.0, 0.0
    widths = [max(c["x1"] for c in ln) - min(c["x0"] for c in ln) for ln in lines]
    wmax = max(widths) if widths else 0.0
    long_lines = [ln for ln, w in zip(lines, widths) if wmax > 0 and w >= 0.8 * wmax]
    if long_lines:
        L = min(min(c["x0"] for c in ln) for ln in long_lines)
        R = max(max(c["x1"] for c in ln) for ln in long_lines)
        return L, R
    # 回退：整页没有长行（例如全是短行的表格页），退回众数
    x0s = Counter(round(min(c["x0"] for c in ln), 1) for ln in lines)
    x1s = Counter(round(max(c["x1"] for c in ln), 1) for ln in lines)
    return x0s.most_common(1)[0][0], x1s.most_common(1)[0][0]


def _classify(lines, L, R, char_w) -> List[str]:
    """逐行判定类型：'CENTER'（居中块）或 'LEFT'（靠左正文）。

    居中的判据是**左右留白对称**，不是「行短」——
    短行不等于居中（例如「各普通高等学校:」是左对齐的）。
    """
    indent_thr = max(INDENT_MIN, char_w * INDENT_RATIO)
    center_tol = char_w * CENTER_TOL_RATIO
    kinds = []
    for ln in lines:
        x0 = min(c["x0"] for c in ln)
        x1 = max(c["x1"] for c in ln)
        left_pad, right_pad = x0 - L, R - x1
        centered = left_pad > indent_thr and abs(left_pad - right_pad) <= center_tol
        kinds.append("CENTER" if centered else "LEFT")
    return kinds


# ------------------------------------------------------------------ 段落切分
def cluster_blocks(lines: List[List[Dict]], chars: List[Dict]) -> List[Dict]:
    """把行切成段落块。

    返回 [{lines: [...], kind: 'LEFT'|'CENTER', indent: bool}, ...]
    """
    if not lines:
        return []

    L, R = _page_margins(lines)
    char_w = _median_char_width(chars)
    indent_thr = max(INDENT_MIN, char_w * INDENT_RATIO)
    kinds = _classify(lines, L, R, char_w)

    gaps = []
    for prev, cur in zip(lines, lines[1:]):
        gaps.append(min(c["top"] for c in cur) - max(c["bottom"] for c in prev))
    med_gap = median(gaps) if gaps else 0.0
    gap_break = med_gap * GAP_BREAK_RATIO if med_gap > 0 else 1e9

    blocks: List[Dict] = []
    cur_lines = [lines[0]]
    cur_kind = kinds[0]
    cur_indented = (min(c["x0"] for c in lines[0]) - L) > indent_thr

    for i in range(1, len(lines)):
        ln, kind = lines[i], kinds[i]
        gap = min(c["top"] for c in ln) - max(c["bottom"] for c in lines[i - 1])
        x0 = min(c["x0"] for c in ln)

        if kind != cur_kind:
            new = True
        elif kind == "CENTER":
            # 居中行**也要看间距**。多行居中标题的行距是正常的，gap 远小于
            # gap_break，自然仍会连成一块；而页码这类远离正文的居中元素必须断开。
            # 原先是 new = False（无条件合并），导致页面底部的页码被并进正文段落 ——
            # 实测 D3-PLD-002 p1 的 b00037 因此把 region 从 y632 拉到 y808，
            # 白装进整片表格表头，区域重建一致率掉到 98.9%。
            new = gap > gap_break
        else:
            new = (x0 - L) > indent_thr or gap > gap_break

        if new:
            blocks.append({"lines": cur_lines, "kind": cur_kind, "indent": cur_indented})
            cur_lines, cur_kind = [ln], kind
            cur_indented = (x0 - L) > indent_thr
        else:
            cur_lines.append(ln)
    blocks.append({"lines": cur_lines, "kind": cur_kind, "indent": cur_indented})
    return blocks


# ------------------------------------------------------------------ 角色
# 章节标题模式：只认中文公文里最稳的两种编号，避免误伤编号段落。
# 「1.xxx」这类不启用——正文里也常用，容易误判（例如「1.数据结构化提取。从……」）
_SECTION_PATTERNS = (
    r"^[一二三四五六七八九十]+、",
    r"^[（(][一二三四五六七八九十]+[)）]",
)
SECTION_MAX_CHARS = 40


def _looks_like_section(text: str, n_lines: int) -> bool:
    """判断一个块是不是章节标题。

    条件从严：**必须单行**且**不超过 40 字**且匹配中文编号模式。
    宁可漏标，也不要把正文段落误标成标题——下游按 role 分流时，
    误标的代价比漏标高。
    """
    import re

    if n_lines != 1:
        return False
    t = text.strip()
    if not t or len(t) > SECTION_MAX_CHARS:
        return False
    return any(re.match(p, t) for p in _SECTION_PATTERNS)


def _assign_role(region, page_h, kind, n_lines, text, index) -> str:
    """给块分配角色。页眉页脚按页面上下边缘 8% 判定（计划书 4.3 节）。"""
    if region[1] <= page_h * MARGIN_RATIO:
        return ev.ROLE_HEADER
    if region[3] >= page_h * (1 - MARGIN_RATIO):
        return ev.ROLE_FOOTER
    # 只有居中的块才判为标题；之前用「首块且字号最大」会把整页正文误判成标题
    if kind == "CENTER" and index == 0:
        return ev.ROLE_TITLE
    if _looks_like_section(text, n_lines):
        return ev.ROLE_SECTION
    return ev.ROLE_BODY


# ------------------------------------------------------------------ 单页解析
def parse_page_text_layer(
    doc_id: str,
    page_no: int,
    page,
    form: str = None,
    unreadable_regions: Optional[List[List[float]]] = None,
) -> Dict:
    """解析单页：把每个字符恰好分配给一个所有者，再按所有者产出块。

    `unreadable_regions` 是**不可读区域**（扫描件里靠图片承载内容的部分）。
    它们会被产成 `source_type=scan_region` 的降级块 —— 带坐标、`degraded=True`、
    `missing_reason=NOT_PARSED`、`text_raw` 为空。展示层据此能框出「这块读不了」，
    而不是只能说「这页读不了」。


    ## 为什么改成"所有者"模型

    D1 的做法是「全页字符一起聚类成块」。在真实公告的表格上这会坏：
    行聚类容差会把相邻两行并成一行，块的 bbox 互相压住。实测 pledge.pdf 第 1 页
    的股权质押情况表，68 个字符被两个以上的块重复覆盖，区域重建一致率从 100%
    掉到 81.8%（`01_b00034` y=660.0–673.4 与 `01_b00035` y=665.9–679.2 重叠 7.5pt）。

    现在改成：**表格单元格先占位，剩下的字符才走段落聚类。**
    单元格之间不重叠（pdfplumber 的 cells 平铺整张表），flow 字符是它的补集，
    因此"每个字符恰好被一个块拥有"是构造保证的，不再依赖容差调参。

    ## source_type 的取法（对齐评测方的证据结构）

    - 落在已检测表格单元格里的 → `cell`，并带 `table_ref={table_id,row,col}`
    - 其余正文 → `paragraph`
    - 走 OCR 通道的（D4 起）→ `scan_region`
    """
    from . import table_detect as td

    chars = page.chars or []
    width, height = float(page.width), float(page.height)

    tables = td.detect_tables(doc_id, page_no, page)

    # ---- 1) 表格单元格先占位
    cell_owner: Dict[int, str] = {}            # char 下标 -> cell_id
    cell_index: Dict[str, Dict] = {}           # cell_id -> 单元格字典
    for tb in tables:
        for cell in tb["_cells"]:
            cell_index[cell["cell_id"]] = cell
    for idx, ch in enumerate(chars):
        cx = (ch["x0"] + ch["x1"]) / 2
        cy = (ch["top"] + ch["bottom"]) / 2
        for cid, cell in cell_index.items():
            x0, y0, x1, y1 = cell["box"]
            if x0 <= cx <= x1 and y0 <= cy <= y1:
                cell_owner[idx] = cid
                break

    # ---- 1a) 补齐 pdfplumber 漏检的单元格
    #   pdfplumber 的单元格检测依赖绘制线，竖线缺失时**整列会漏**。
    #   实测 D5-EQC-007 p1：它报 6 行×5 列却只给出 20 格 —— 「序号」列与「通讯地址」列
    #   的第 2–6 行共 10 格没检出来。这些格里的字符于是掉进正文流，
    #   多个单元格的文字被混成一行（'信息披露红豆集团有限江苏省无锡市锡山区东…'）。
    #   修法：用**网格带**（相异行/列边界）为落空的位置补出单元格几何，
    #   且只补**确实有字符落进去**的位置，避免造出一堆空格子。
    for tb in tables:
        row_edges = tb.get("_row_edges") or []
        col_edges = tb.get("_col_edges") or []
        if not row_edges or not col_edges:
            continue
        occupied = {(c["row"], c["col"]): c for c in tb["_cells"]}
        rx0, ry0, rx1, ry1 = tb["region"]
        pending: Dict[tuple, list] = {}
        for idx, ch in enumerate(chars):
            if idx in cell_owner:
                continue
            cx = (ch["x0"] + ch["x1"]) / 2
            cy = (ch["top"] + ch["bottom"]) / 2
            if not (rx0 <= cx <= rx1 and ry0 <= cy <= ry1):
                continue
            r = next((i for i, (e0, e1) in enumerate(row_edges) if e0 <= cy <= e1), None)
            c = next((i for i, (e0, e1) in enumerate(col_edges) if e0 <= cx <= e1), None)
            if r is None or c is None:
                continue
            existing = occupied.get((r, c))
            if existing is not None:
                # 该格有单元格却没认领：字符中心在网格位上、却落在 pdfplumber 检出的
                # 格子矩形之外（它的矩形可能比网格带窄）。
                # **只补认领是不够的**：块的 region 仍是那个窄矩形，装不下这个字符，
                # 于是字符变成"有主但不在任何 region 内" —— 表现为丢字。
                # 实测 D5-EQC-007 p1 因此有 81 个字符未被覆盖。
                # 不变量：**块的 region 必须容纳它自己的字符**。
                cell_owner[idx] = existing["cell_id"]
                bx0, by0, bx1, by1 = existing["box"]
                if not (bx0 <= cx <= bx1 and by0 <= cy <= by1):
                    existing["box"] = [
                        round(min(bx0, ch["x0"]), 2),
                        round(min(by0, ch["top"]), 2),
                        round(max(bx1, ch["x1"]), 2),
                        round(max(by1, ch["bottom"]), 2),
                    ]
                continue
            pending.setdefault((r, c), []).append(idx)

        next_ord = len(tb["_cells"]) + 1
        for (r, c), idxs in sorted(pending.items()):
            box = [col_edges[c][0], row_edges[r][0], col_edges[c][1], row_edges[r][1]]
            cell = {
                "table_id": tb["table_id"],
                "box": [round(v, 2) for v in box],
                "row": r,
                "col": c,
                "rowspan": 1,
                "colspan": 1,
                # 补出来的单元格同样要全局唯一 —— cell_id 撞车会让同名字符认领失败
                "cell_id": f"{tb['table_id']}_c{next_ord:03d}",
                "cell_ref": f"r{r + 1}c{c + 1}",
                "covers": None,
                "_synthesized": True,   # 用于统计：这些是绘制线缺失处补出来的
            }
            next_ord += 1
            tb["_cells"].append(cell)
            # **必须同步登记进 cell_index**：它是第 1 步按当时的 _cells 建的，
            # 漏登记会让下游 cell_index[cid] 抛 KeyError，整份文档解析失败。
            cell_index[cell["cell_id"]] = cell
            occupied[(r, c)] = cell
            for idx in idxs:
                cell_owner[idx] = cell["cell_id"]

    # 按单元格分组字符。**必须在 1a 之后** —— 1a 会往 cell_owner 里补认领
    # （漏检单元格的字符），在它之前分组会把那些字符整个漏掉：
    # 它们有主、却进不了任何单元格的文本，于是没有任何块覆盖它们 —— 表现为丢字。
    # 实测 D5-EQC-007 p1 因此有 81 个字符未被覆盖。
    # 这个顺序问题存在已久，但 1a 是后加的、此前的文档恰好没有"补认领"的情况，所以从未暴露。
    grouped: Dict[str, list] = {}
    for idx, cid in cell_owner.items():
        grouped.setdefault(cid, []).append(chars[idx])

    # ---- 1b) 单元格文本 + 多层表头
    # 文本要对**所有**单元格算（含空的）：表头识别与 header_path 拼接都要读表头
    # 单元格的文字，而表头单元格不一定会产出块。
    cell_texts: Dict[str, str] = {}
    for cid in cell_index:
        cs = grouped.get(cid) or []
        cell_texts[cid] = join_block_text(cluster_lines(cs)) if cs else ""

    table_headers: Dict[str, Dict[str, Optional[str]]] = {}
    for tb in tables:
        tid = tb["table_id"]
        cells_t = tb["_cells"]
        grid_texts = {(c["row"], c["col"]): cell_texts.get(c["cell_id"], "") for c in cells_t}
        n_header = td.detect_header_rows(grid_texts, tb.get("n_rows") or 0, tb.get("n_cols") or 0)
        tb["header_rows"] = n_header
        table_headers[tid] = td.build_header_paths(cells_t, grid_texts, n_header)

    # ---- 2) 单元格块
    blocks: List[Dict] = []
    for cid, cs in grouped.items():
        cell = cell_index[cid]
        x0, y0, x1, y1 = cell["box"]
        region = [round(x0, 2), round(y0, 2), round(x1, 2), round(y1, 2)]
        lines = cluster_lines(cs)
        blocks.append(
            {
                "_sort": (region[1], region[0]),
                "_kw": dict(
                    text=join_block_text(lines),
                    text_raw="".join(x["text"] for ln in lines for x in ln),
                    region=region,
                    source_type=ev.KIND_CELL,
                    table_ref={
                        "table_id": cell["table_id"],
                        "cell_id": cid,
                        # 魏文宇的 run_extract.mjs 读的是 cell_ref（不是 cell_id），
                        # 少了这个字段他的链路会把表格出处静默丢成 null
                        "cell_ref": cell["cell_ref"],
                        "row": cell["row"],
                        "col": cell["col"],
                        "rowspan": cell.get("rowspan"),
                        "colspan": cell.get("colspan"),
                        # 合并单元格覆盖的其它位置。消费方据此把「股东名称」这类
                        # 跨行共享的值应用到被覆盖的每一行，不必自己推行列网格。
                        "covers": cell.get("covers"),
                        # 多层表头拼出的完整列名。抽取层靠它区分同名子列
                        #（「已质押」与「未质押」两组下都有「占…比例（%）」）
                        "header_path": table_headers.get(cell["table_id"], {}).get(cid),
                    },
                    role=ev.ROLE_BODY,
                ),
            }
        )

    # ---- 2b) 兜底：落在表格区域内、但不在任何单元格里的字符（多行表头常见）
    #      按最近的行边界分组，标 source_type="table"。若放任它们走段落聚类，
    #      会与其它块产生区域重叠（实测 pledge.pdf 第 1 页表头 21 个字符被重复覆盖）。
    in_table_fallback: Dict[tuple, list] = {}
    flow_left: List[Dict] = []
    table_of_char: Dict[int, str] = {}
    for tb in tables:
        rx0, ry0, rx1, ry1 = tb["region"]
        for idx, ch in enumerate(chars):
            if idx in cell_owner:
                continue
            cx = (ch["x0"] + ch["x1"]) / 2
            cy = (ch["top"] + ch["bottom"]) / 2
            if rx0 <= cx <= rx1 and ry0 <= cy <= ry1:
                table_of_char[idx] = tb["table_id"]

    for idx, ch in enumerate(chars):
        if idx in cell_owner:
            continue
        tid = table_of_char.get(idx)
        if tid is None:
            flow_left.append(ch)
            continue
        tb = next(x for x in tables if x["table_id"] == tid)
        cy = (ch["top"] + ch["bottom"]) / 2
        cx = (ch["x0"] + ch["x1"]) / 2

        def _band(edges, v):
            best, bestd = 0, float("inf")
            for i, (e0, e1) in enumerate(edges):
                d = 0.0 if e0 <= v <= e1 else min(abs(v - e0), abs(v - e1))
                if d < bestd:
                    bestd, best = d, i
            return best

        # **必须按 (行, 列) 一起分组**，不能只按行。
        # 实测 D5-EQC-007 p7：只按行分组时，一个兜底块同时装进「序号」列与
        # 「其他国家居留权情况」列（中间六列的字符属于别的单元格），
        # 它的外接矩形因此横跨整张表、吞进其它单元格的字符 ——
        # 区域重建判据直接失败。按列分开后每组的外接矩形只覆盖一格宽度。
        br = _band(tb.get("_row_edges") or [], cy)
        bc = _band(tb.get("_col_edges") or [], cx)
        in_table_fallback.setdefault((tid, br, bc), []).append(ch)

    for (tid, r, _c), cs in in_table_fallback.items():
        region = ev.region_of(cs)
        lines = cluster_lines(cs)
        # 标 degraded：这些字符散落在表格行内、不在任何检出单元格里（多行表头 + 纵向
        # 合并时常见），按最近行边界兜底分组后**文本可能是乱序的**。
        # 交出去是为了不丢字（字符守恒），但下游不应把它们当作可靠的行级引文。
        # D3 的多层表头还原会把这一类消掉。
        blocks.append(
            {
                "_sort": (region[1], region[0]),
                "_kw": dict(
                    text=join_block_text(lines),
                    text_raw="".join(x["text"] for ln in lines for x in ln),
                    region=region,
                    source_type=ev.KIND_TABLE,
                    table_ref={"table_id": tid, "row": r},
                    role=ev.ROLE_BODY,
                    degraded=True,
                    missing_reason=ev.MISSING_DEGRADED,
                ),
            }
        )

    # ---- 3) 分栏检测 → 按栏分别聚类正文
    # 必须**分栏聚类行**：整页一起聚类会把同一 y 上的左右栏并成一行，
    # 得到「左栏前半句右栏前半句」这种交错文本。
    flow_chars = flow_left
    gutters = cols.find_gutters(flow_chars)
    warned_straddle = None
    if gutters:
        warned_straddle = cols.table_straddles_gutter(tables, gutters)
        if warned_straddle:
            # 表格横跨栏缝 → 版面不是干净双栏，不切，否则表格与两栏正文交错
            gutters = []

    spans = cols.split_columns(flow_chars) if gutters else []
    fw_tops = cols.full_width_tops(cluster_lines(flow_chars), gutters) if gutters else []
    blocks.extend(_flow_blocks(flow_chars, height, gutters=gutters, fw_tops=fw_tops))
    column_spans = [[round(a, 2), round(b, 2)] for a, b in spans]

    # ---- 3b) 不可读区域 → 带坐标的降级块（在排序之前加入，一起分配 block_id）
    for r in unreadable_regions or []:
        blocks.append(
            {
                "_sort": (0, 0, r[1], r[0]),
                "_kw": dict(
                    # text/text_raw 为空是**正确**的：scan_region 断言的是"这块读不出字"，
                    # 本来就没有可引用的原文。因此它不能作为 provenance.quote 的来源，
                    # 也不参与字符守恒统计（它不认领任何字符）。
                    text="",
                    text_raw="",
                    region=[round(v, 2) for v in r],
                    source_type=ev.KIND_SCAN_REGION,
                    role=ev.ROLE_BODY,
                    degraded=True,
                    missing_reason=ev.MISSING_NOT_PARSED,
                ),
            }
        )

    # ---- 4) 表格单元格与正文块用**同构**的排序键 (段, 栏, 上, 左)
    for b in blocks:
        if len(b["_sort"]) == 4:
            continue  # 正文块已在 _flow_blocks 里给好
        region = b["_kw"]["region"]
        col = cols.column_of(region, gutters) if gutters else 0
        band = cols.band_at(region[1], fw_tops) if gutters else 0
        b["_sort"] = (band, col) + tuple(b["_sort"])
    blocks.sort(key=lambda b: b["_sort"])
    out: List[Dict] = []
    for seq, b in enumerate(blocks, start=1):
        out.append(ev.make_block(doc_id=doc_id, page=page_no, seq=seq, **b["_kw"]))

    page_tables = [
        {
            "table_id": t["table_id"],
            "page": page_no,
            "region": t["region"],
            "n_rows": t["n_rows"],
            "n_cols": t["n_cols"],
            # 跨页续表由 table_link 在文档级填（需要上一页的上下文），这里先占位
            "continued_from": None,
        }
        for t in tables
    ]

    return ev.make_page(
        page=page_no,
        form=form or ev.FORM_TEXT,
        width=width,
        height=height,
        form_evidence={},
        blocks=out,
        tables=page_tables,
        columns=column_spans,
    )


def _flow_blocks(flow_chars: List[Dict], page_h: float, gutters=None, fw_tops=None) -> List[Dict]:
    """把表格之外的字符聚类成块。

    单栏时就是 D1 的原逻辑；多栏时先按**整幅行**把页面切成水平段，
    再在每段内按栏分组各自聚类 —— 这样同一 y 上的左右栏不会被并成一行，
    整幅的标题也不会被按栏拦腰截断。
    """
    lines = cluster_lines(flow_chars)
    if not lines:
        return []

    if gutters:
        # 整幅行独占一段（不拆）；可分行的行**按栏拆开**再归组
        bucket: Dict[tuple, List[List[Dict]]] = {}
        for ln in lines:
            y = min(c["top"] for c in ln)
            band = cols.band_at(y, fw_tops or [])
            if cols.line_is_full_width(ln, gutters):
                bucket.setdefault((band, 0), []).append(ln)
                continue
            for ci, part in enumerate(cols.split_line_by_gutter(ln, gutters)):
                if part:
                    bucket.setdefault((band, ci), []).append(part)
        # 按 (段, 栏) 排序 —— 阅读顺序：整幅元素 → 第 1 栏到底 → 第 2 栏
        groups = sorted(bucket.items())
    else:
        groups = [((0, 0), lines)]

    out: List[Dict] = []
    bi = 0
    for (band, col), glines in groups:
        gchars = [c for ln in glines for c in ln]
        for blk in cluster_blocks(glines, gchars):
            blk_chars = [c for ln in blk["lines"] for c in ln]
            region = ev.region_of(blk_chars)
            text = join_block_text(blk["lines"])
            text_raw = "".join(c["text"] for ln in blk["lines"] for c in ln)
            size = median([c.get("size") or 0.0 for c in blk_chars]) if blk_chars else None
            # 传真实下标 bi：_assign_role 靠它判断"是不是本页第一个居中块"，
            # 硬编码 0 会把所有居中块都判成 TITLE（曾被回归用例抓到）
            role = _assign_role(region, page_h, blk["kind"], len(blk["lines"]), text, bi)
            bi += 1
            out.append(
                {
                    "_sort": (band, col, region[1], region[0]),
                    "_kw": dict(
                        text=text,
                        text_raw=text_raw,
                        region=region,
                        source_type=ev.KIND_PARAGRAPH,
                        role=role,
                        font_size=size,
                    ),
                }
            )
    return out
