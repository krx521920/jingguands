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
            new = False  # 连续的居中行属于同一个标题块
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
def parse_page_text_layer(doc_id: str, page_no: int, page) -> Dict:
    """解析单页文本层，返回 page 字典（blocks 带 region 与 text_raw，tables 暂空）。"""
    chars = page.chars or []
    width, height = float(page.width), float(page.height)

    lines = cluster_lines(chars)
    raw_blocks = cluster_blocks(lines, chars)

    blocks: List[Dict] = []
    for seq, blk in enumerate(raw_blocks, start=1):
        blk_chars = [c for ln in blk["lines"] for c in ln]
        region = ev.region_of(blk_chars)
        # text      —— 可读文本，跨行处可能补空格，供模型与展示使用
        text = join_block_text(blk["lines"])
        # text_raw  —— 按阅读顺序直接拼接原始字符，不插入任何字符。
        # 全队契约要求 provenance.quote 必须是**原文子串**，所以它取 text_raw 而不是 text。
        text_raw = "".join(c["text"] for ln in blk["lines"] for c in ln)
        size = median([c.get("size") or 0.0 for c in blk_chars]) if blk_chars else None
        role = _assign_role(region, height, blk["kind"], len(blk["lines"]), text, seq - 1)
        blocks.append(
            ev.make_block(
                doc_id=doc_id,
                page=page_no,
                seq=seq,
                text=text,
                text_raw=text_raw,
                region=region,
                role=role,
                font_size=size,
                source=ev.SRC_TEXT_LAYER,
            )
        )

    return ev.make_page(
        page=page_no,
        form=ev.FORM_TEXT,
        width=width,
        height=height,
        form_evidence={},
        blocks=blocks,
        tables=[],
    )
