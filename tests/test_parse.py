"""解析层回归测试（D1）。

跑法：
    PYTHONPATH=src .venv/bin/python -m pytest tests/test_parse.py -v

这些用例同时是 D7/D12 需要的回归基线：改动解析代码后必须全绿，
否则说明出处结构被破坏了。
"""
from __future__ import annotations

import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from finstruct.parse import doc_form as df  # noqa: E402
from finstruct.parse import evidence as ev  # noqa: E402
from finstruct.parse import parse_pdf as pp  # noqa: E402
from finstruct.parse import text_layer as tl  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..")
# 样例 PDF 可能在 sample/ 下，也可能被放在模块根目录；两处都找，
# 找不到就 skip 并明确告知 —— 避免「静默跳过导致以为测试通过」
_CANDIDATES = [
    os.path.join(ROOT, "sample", "附件1通知.pdf"),
    os.path.join(ROOT, "附件1通知.pdf"),
]
FIXTURE = next((c for c in _CANDIDATES if os.path.exists(c)), _CANDIDATES[0])


@pytest.fixture(scope="module")
def parsed():
    if not os.path.exists(FIXTURE):
        pytest.skip("缺少测试用 PDF：附件1通知.pdf")
    return pp.parse_pdf(FIXTURE)


# ------------------------------------------------------------ 出处结构
def test_结构自检通过(parsed):
    r = ev.self_check(parsed)
    assert r["ok"], r["errors"]


def test_每个块都带source_type且取值合法(parsed):
    """评测方的证据结构要求 source_type，且要按段落/表格/单元格分层统计。"""
    for pg in parsed["pages"]:
        for b in pg["blocks"]:
            assert b["source_type"] in ZONG_SOURCE_TYPES, b["source_type"]
            if b["source_type"] == "cell":
                assert b["table_ref"] and b["table_ref"].get("cell_id"), b["block_id"]
            if b["source_type"] == "table":
                assert b["table_ref"] and b["table_ref"].get("table_id"), b["block_id"]


def test_每个块自带doc_id(parsed):
    """块要自足：被单独摘出传递时仍知道属于哪份文件（评测方要 document_id）。"""
    did = parsed["doc"]["doc_id"]
    for pg in parsed["pages"]:
        for b in pg["blocks"]:
            assert b["doc_id"] == did


def test_handoff给出三方字段对照(parsed):
    """region/quote 三家名字都不同，handoff 必须一次给全，避免下游猜。"""
    fa = parsed["handoff"]["field_aliases"]
    assert fa["region"]["wei"] == "region" and fa["region"]["zong"] == "bbox"
    assert fa["text_raw"]["wei"] == "quote" and fa["text_raw"]["zong"] == "excerpt"
    assert "document_id" in fa["doc_id"]["zong"]


def test_表格元数据与单元格块不重复存放(parsed):
    """tables[] 只留元数据；单元格内容以 source_type=cell 的块交付，用 table_ref 回指。"""
    for pg in parsed["pages"]:
        for t in pg["tables"]:
            assert "cells" not in t, "tables[] 不应重复存放单元格内容"
        cell_blocks = [b for b in pg["blocks"] if b["source_type"] == "cell"]
        tids = {t["table_id"] for t in pg["tables"]}
        for b in cell_blocks:
            assert b["table_ref"]["table_id"] in tids


def test_每个块都有合法region(parsed):
    for pg in parsed["pages"]:
        for b in pg["blocks"]:
            box = b["region"]
            assert len(box) == 4
            assert box[0] <= box[2] and box[1] <= box[3], f"{b['block_id']} region 顺序错误"
            # 坐标必须落在页面内
            assert -1 <= box[0] and box[2] <= pg["width"] + 1
            assert -1 <= box[1] and box[3] <= pg["height"] + 1


def test_block_id唯一(parsed):
    ids = [b["block_id"] for pg in parsed["pages"] for b in pg["blocks"]]
    assert len(ids) == len(set(ids))


def test_reading_order与块集合一致(parsed):
    ids = {b["block_id"] for pg in parsed["pages"] for b in pg["blocks"]}
    assert set(parsed["reading_order"]) == ids


def test_doc_id由内容哈希派生(parsed):
    """D10 防同名串证据：doc_id 必须来自 sha256，不能来自文件名。"""
    sha = parsed["doc"]["file_sha256"]
    assert parsed["doc"]["doc_id"] == "d" + sha[:8]
    assert parsed["doc"]["doc_id"] not in parsed["doc"]["file_name"]


def test_同一文件重复解析doc_id不变(parsed):
    again = pp.parse_pdf(FIXTURE)
    assert again["doc"]["doc_id"] == parsed["doc"]["doc_id"]
    ids1 = [b["block_id"] for pg in parsed["pages"] for b in pg["blocks"]]
    ids2 = [b["block_id"] for pg in again["pages"] for b in pg["blocks"]]
    assert ids1 == ids2, "同一文件重复解析，block_id 必须稳定"


# ------------------------------------------------------------ 形态判定
def test_文本pdf判定为TEXT(parsed):
    assert all(p["form"] == "TEXT" for p in parsed["pages"]), \
        [p["form"] for p in parsed["pages"]]


def test_形态判据被留痕(parsed):
    for p in parsed["pages"]:
        e = p["form_evidence"]
        assert e["rule"], "必须记录命中了哪条规则"
        assert "text_chars" in e and "thresholds" in e


# ------------------------------------------------------------ 段落切分
def test_不会整页粘成一个块(parsed):
    """回归 D1 踩到的坑：纯按行距切段落，中文公文会整页粘成一块。

    实测附件1通知.pdf 每页应切出多个块；若退化到每页 1 块，说明
    首行缩进那条判据失效了（典型原因是版心用众数估计，缩进行反成众数）。
    """
    for pg in parsed["pages"]:
        assert len(pg["blocks"]) >= 5, \
            f"第{pg['page']}页只有 {len(pg['blocks'])} 块，段落切分可能已失效"


def test_识别出章节标题(parsed):
    roles = [b["role"] for pg in parsed["pages"] for b in pg["blocks"]]
    assert "SECTION" in roles, "应识别出「一、」「(一)」这类章节标题"
    assert roles.count("TITLE") == 1, "整份通知只有 1 个居中大标题"


def test_章节标题不误标正文(parsed):
    """编号段落（如「1.数据结构化提取。从…」）不能被误标成章节标题。"""
    for pg in parsed["pages"]:
        for b in pg["blocks"]:
            if b["role"] == "SECTION":
                assert len(b["text"]) <= tl.SECTION_MAX_CHARS


# ------------------------------------------------------------ 出处自洽
def test_出处自洽_region里装的就是声称的文字(parsed):
    """核心用例：把 region 内的字符重新取出来拼一遍，必须与 block.text 一致。

    这是下游能按坐标高亮的前提。若这条挂了，抽取层的锚定和展示层的高亮
    全都会歪，而且不会报错——是最危险的一类问题。
    """
    import pdfplumber

    def norm(s):
        return "".join(s.split())

    bad = []
    with pdfplumber.open(FIXTURE) as pdf:
        for pg in parsed["pages"]:
            chars = pdf.pages[pg["page"] - 1].chars or []
            for b in pg["blocks"]:
                x0, y0, x1, y1 = b["region"]
                inside = [
                    c for c in chars
                    if x0 - 0.5 <= (c["x0"] + c["x1"]) / 2 <= x1 + 0.5
                    and y0 - 0.5 <= (c["top"] + c["bottom"]) / 2 <= y1 + 0.5
                ]
                rebuilt = tl.join_block_text(tl.cluster_lines(inside))
                if norm(rebuilt) != norm(b["text"]):
                    bad.append((b["block_id"], b["text"][:40], rebuilt[:40]))
    assert not bad, f"出处不自洽的块：{bad[:3]}"


# ------------------------------------------------------------ 降级
def test_非文本页如实降级不伪装成功():
    """D4 的边界要求：读不到就明确降级，不能假装解析成功。

    这里构造一个只有 1 个字符的迷你 PDF，应被判为非 TEXT 且不产出块。
    """
    # 用形态判定函数直接验证规则 3（水印文本 + 大图 → SCANNED）
    class FakePage:
        width = 595.0
        height = 842.0
        chars = [{"x0": 10, "x1": 20, "top": 10, "bottom": 20, "text": "x", "size": 10}]
        images = [{"x0": 0, "top": 0, "x1": 595, "bottom": 842}]

    form, evid = df.judge_page(FakePage())
    assert form in (ev.FORM_SCANNED, ev.FORM_MIXED)
    assert form != ev.FORM_TEXT
    assert evid["rule"] is not None


# ------------------------------------------------------------ 与全队契约对齐（v0.2 新增）
# 契约：interface/event-envelope.schema.json v0.1（魏文宇，D1 冻结）
# 这一组用例把「对齐」变成可执行的断言，避免以后有人改回去
CONTRACT_SOURCE_KEYS = {"file_id", "file_name", "file_sha256", "parse_meta"}
# D2 起契约的 parse_meta 增加了 blocks（魏文宇按 D1 夜的对齐报告修好）
CONTRACT_PARSE_META_KEYS = {"parser_version", "page_count", "blocks"}
# 评测方的证据结构（evaluation/D1/schemas/evidence.schema.json）
ZONG_SOURCE_TYPES = {"paragraph", "table", "cell", "scan_region", "document"}


def test_file_id形态符合契约(parsed):
    """契约里 source.file_id 的格式是 sha256:<hex>。"""
    fid = parsed["doc"]["file_id"]
    assert fid.startswith("sha256:"), fid
    assert fid == "sha256:" + parsed["doc"]["file_sha256"]


def test_坐标系被显式声明(parsed):
    """契约的 region 没声明坐标语义，解析侧必须自己声明清楚，
    否则陈家浩渲染高亮时按错的原点/单位算，框会整体偏移。"""
    cs = parsed["doc"]["coord_system"]
    assert cs["unit"] == "pdf_point"
    assert cs["origin"] == "top_left"
    assert cs["field"] == "region"
    assert cs["order"] == ["left", "top", "right", "bottom"]


def test_text_raw保证是原文子串(parsed):
    """契约的硬要求：provenance.quote 必须是原文子串，禁止事后按数字反搜。

    所以每个块都要给 text_raw —— 按阅读顺序直接拼接原始字符、不插入任何字符。
    这里把整页的原始字符流拼出来，逐个验证 text_raw 是它的子串。
    """
    import pdfplumber

    with pdfplumber.open(FIXTURE) as pdf:
        for pg in parsed["pages"]:
            page_raw = "".join(c["text"] for c in (pdf.pages[pg["page"] - 1].chars or []))
            for b in pg["blocks"]:
                raw = b["text_raw"]
                assert raw, f"{b['block_id']} 缺 text_raw"
                assert raw in page_raw, f"{b['block_id']} 的 text_raw 不是原文子串"
                # text 允许在跨行处补空格，但去掉全部空白后两者必须逐字相同
                assert "".join(b["text"].split()) == "".join(raw.split()), \
                    f"{b['block_id']} 的 text 与 text_raw 去空白后不一致"


def test_region内重建的原始字符等于text_raw(parsed):
    """region 与 text_raw 必须彼此对应：按 region 取字符拼出来，应等于 text_raw。"""
    import pdfplumber

    with pdfplumber.open(FIXTURE) as pdf:
        for pg in parsed["pages"]:
            chars = pdf.pages[pg["page"] - 1].chars or []
            for b in pg["blocks"]:
                x0, y0, x1, y1 = b["region"]
                inside = [
                    c for c in chars
                    if x0 - 0.5 <= (c["x0"] + c["x1"]) / 2 <= x1 + 0.5
                    and y0 - 0.5 <= (c["top"] + c["bottom"]) / 2 <= y1 + 0.5
                ]
                rebuilt = "".join(
                    ch["text"] for line in tl.cluster_lines(inside) for ch in line
                )
                assert "".join(rebuilt.split()) == "".join(b["text_raw"].split()), \
                    f"{b['block_id']} region 与 text_raw 不对应"


def test_handoff_source严格符合契约字段集(parsed):
    """handoff.source 是要原样拷进事件信封的，字段集必须与契约完全一致。

    契约对 source 设了 additionalProperties:false，多一个字段就会校验失败。
    """
    src = parsed["handoff"]["source"]
    assert set(src.keys()) <= CONTRACT_SOURCE_KEYS, set(src.keys()) - CONTRACT_SOURCE_KEYS
    assert "file_name" in src          # 契约唯一必填项
    assert set(src["parse_meta"].keys()) <= CONTRACT_PARSE_META_KEYS, \
        set(src["parse_meta"].keys()) - CONTRACT_PARSE_META_KEYS


def test_handoff的parse_meta含契约要求的blocks(parsed):
    """契约 interface/README.md 第四节要求解析侧在 parse_meta 里提供 blocks。

    D1 时他的 schema 对 parse_meta 设了 additionalProperties:false 且没有 blocks，
    填了会导致校验失败，所以当时故意没填并反馈了；D2 他已修好（blocks: array|null），
    本用例随之放开，锁住「必须提供且字段齐全」。
    """
    pm = parsed["handoff"]["source"]["parse_meta"]
    assert "blocks" in pm, "契约要求 parse_meta 提供 blocks"
    blocks = pm["blocks"]
    assert isinstance(blocks, list) and blocks
    n_pages_blocks = sum(len(p["blocks"]) for p in parsed["pages"])
    assert len(blocks) == n_pages_blocks, "精简副本的块数应与 pages[].blocks[] 一致"
    need = {"block_id", "page", "role", "text", "text_raw", "region"}
    assert need <= set(blocks[0].keys()), need - set(blocks[0].keys())
    # 与 pages[] 里的规范形式必须对得上
    canonical = {b["block_id"]: b for p in parsed["pages"] for b in p["blocks"]}
    for b in blocks[:5]:
        assert b["region"] == canonical[b["block_id"]]["region"]
        assert b["text_raw"] == canonical[b["block_id"]]["text_raw"]


def test_handoff给出了provenance的取法(parsed):
    """抽取层组装 provenance 时不该猜字段名，handoff 里直接给出映射。"""
    m = parsed["handoff"]["provenance_from_block"]
    assert m["region"] == "block.region"
    assert m["quote"] == "block.text_raw"   # 用 text_raw 而不是 text，保证是原文子串
    assert m["block_id"] == "block.block_id"


def test_输出严格符合JSON_Schema(parsed):
    """用 schemas/evidence.v0.2.json 做真正的 schema 校验。

    团队指标要求「输出格式合规率 100%」，这条用例就是它的自动化版本。
    需要 jsonschema；未安装时 skip 而不是静默通过。
    """
    jsonschema = pytest.importorskip("jsonschema")
    import json as _json
    import os as _os

    sp = _os.path.join(ROOT, "schemas", "evidence.v0.8.json")
    if not _os.path.exists(sp):
        pytest.skip("找不到 schemas/evidence.v0.8.json")
    schema = _json.load(open(sp, encoding="utf-8"))
    errs = sorted(
        jsonschema.Draft202012Validator(schema).iter_errors(parsed),
        key=lambda e: list(e.path),
    )
    assert not errs, [f"/{'/'.join(map(str,e.path))}: {e.message}" for e in errs[:5]]


def test_text与text_raw在跨行西文处分叉():
    """text_raw 存在的必要性证明。

    真实公告里链接、邮箱常被换行拆开。join_block_text 为可读性会在跨行处补空格，
    于是 text 会多出一个空格、把链接拆断；text_raw 保持连续，才是原文子串。

    注意：附件1通知.pdf 这份样例里 71 个块的 text 与 text_raw 恰好完全相同，
    没有触发这个分叉——所以必须有本用例兜底，否则字段可能形同虚设。
    """
    l1 = [{"text": "报名链接为:https://app.cufe", "x0": 0, "x1": 100, "top": 0, "bottom": 10, "size": 10}]
    l2 = [{"text": ".edu.cn/scenes/Aljc9u", "x0": 0, "x1": 100, "top": 12, "bottom": 22, "size": 10}]
    text = tl.join_block_text([l1, l2])
    raw = "".join(c["text"] for ln in [l1, l2] for c in ln)

    assert text != raw, "跨行西文处 text 应插入空格、与 text_raw 分叉"
    assert text == "报名链接为:https://app.cufe .edu.cn/scenes/Aljc9u"
    assert raw == "报名链接为:https://app.cufe.edu.cn/scenes/Aljc9u"
    # 关键：raw 是连续原文，text 不是 —— 所以 quote 必须取 text_raw
    assert "https://app.cufe .edu" not in raw


# ============================================================
# 真实公告回归（D2 补）
#
# 为什么必须加这一组：D2 新写了 table_detect 与「字符归属唯一所有者」的整套逻辑，
# 改动量很大，但上面所有用例跑的都是 D1 那份**无表格**的竞赛通知 ——
# 等于表格这条代码路径一行回归保护都没有。改一下聚类容差就可能悄悄
# 破坏三份真实公告的解析，而 pytest 全绿。
#
# 三份 PDF 不入库（团队规则：不二次分发原始文件）。跑过
# D2张智博_三份真实公告解析/fetch_samples.py 的人会自动获得这份保护；
# 没有文件时整组 skip，模块仍保持自包含。
# ============================================================
# 两个可能的位置：仓库内的 sample/D2/raw（clone 后），或本地工作目录（开发时）
_REAL_RAW_CANDIDATES = [
    os.path.join(ROOT, "sample", "D3", "raw"),
    os.path.join(ROOT, "sample", "D2", "raw"),
    os.path.join(ROOT, "..", "D2张智博_三份真实公告解析", "raw"),
]
_REAL_RAW = next((p for p in _REAL_RAW_CANDIDATES if os.path.isdir(p)), _REAL_RAW_CANDIDATES[0])
# D3 主交付：5 份真实质押公告（命名对齐宗博文 evaluation/D3 的 case_id）
REAL_CASES = ["D3-PLD-001", "D3-PLD-002", "D3-PLD-003", "D3-PLD-004", "D3-PLD-005"]
# 另两类事件的附加样例
EXTRA_CASES = ["equity-change-001", "award-001"]
_REAL_CACHE = {}


def _real_pdf(name):
    return os.path.join(_REAL_RAW, name + ".pdf")


def _parse_real(name):
    if name not in _REAL_CACHE:
        pdf = _real_pdf(name)
        if not os.path.exists(pdf):
            pytest.skip(f"缺少 {pdf}；先跑 D2张智博_三份真实公告解析/fetch_samples.py")
        _REAL_CACHE[name] = pp.parse_pdf(pdf)
    return _REAL_CACHE[name]


def _page_coverage(parsed, pdf_path):
    """按 region 统计每页字符的覆盖与重叠，并把重叠按块类型分类。

    返回 {page: {"uncovered","kinds","fatal"}}，fatal 只统计 paragraph×paragraph，
    因为表格是交错排布，块的外接矩形天然会互相压住，属几何假象。
    """
    import pdfplumber

    out = {}
    with pdfplumber.open(pdf_path) as pdf:
        for pg in parsed["pages"]:
            chars = pdf.pages[pg["page"] - 1].chars or []
            if pg.get("form") != "TEXT":
                out[pg["page"]] = {"uncovered": 0, "kinds": {}, "fatal": 0, "skipped": True}
                continue
            cover = []
            for ch in chars:
                cx = (ch["x0"] + ch["x1"]) / 2
                cy = (ch["top"] + ch["bottom"]) / 2
                owners = []
                for b in pg["blocks"]:
                    x0, y0, x1, y1 = b["region"]
                    if x0 - 0.5 <= cx <= x1 + 0.5 and y0 - 0.5 <= cy <= y1 + 0.5:
                        owners.append(b["source_type"])
                cover.append(owners)
            kinds = {}
            for owners in cover:
                if len(owners) > 1:
                    k = tuple(sorted(set(owners)))
                    kinds[k] = kinds.get(k, 0) + 1
            fatal = sum(n for k, n in kinds.items()
                        if k == ("paragraph",) or (len(k) == 1 and k[0] == "paragraph"))
            out[pg["page"]] = {
                "uncovered": sum(1 for o in cover if not o),
                "kinds": kinds,
                "fatal": fatal,
            }
    return out


@pytest.mark.parametrize("name", REAL_CASES)
def test_真实公告_自检通过(name):
    d = _parse_real(name)
    r = ev.self_check(d)
    assert r["ok"], r["errors"]


@pytest.mark.parametrize("name", REAL_CASES)
def test_真实公告_严格符合schema(name):
    jsonschema = pytest.importorskip("jsonschema")
    import json as _json

    d = _parse_real(name)
    schema = _json.load(open(os.path.join(ROOT, "schemas", "evidence.v0.8.json"), encoding="utf-8"))
    errs = sorted(jsonschema.Draft202012Validator(schema).iter_errors(d), key=lambda e: list(e.path))
    assert not errs, [f"/{'/'.join(map(str,e.path))}: {e.message}" for e in errs[:5]]


@pytest.mark.parametrize("name", REAL_CASES)
def test_真实公告_不丢字且无段落重叠(name):
    """D2 修的核心缺陷：表格多行表头让块区域互相压住。

    判据：① 不能有字符没进任何块（丢字）
          ② 不能有 paragraph×paragraph 重叠（那才是真的聚类 bug）
    cell 与 table 之间的外接矩形交叠是表格交错排布导致的几何假象，不算失败。
    """
    d = _parse_real(name)
    cov = _page_coverage(d, _real_pdf(name))
    for page, c in cov.items():
        if c.get("skipped"):
            continue
        assert c["uncovered"] == 0, f"{name} p{page}: 有 {c['uncovered']} 个字符未进任何块"
        assert c["fatal"] == 0, f"{name} p{page}: 段落×段落重叠 {c['fatal']} 字 —— 聚类退化了"


@pytest.mark.parametrize("name", REAL_CASES)
def test_真实公告_block_id稳定(name):
    """同一文件重复解析，block_id 序列必须完全一致（含表格单元格块）。"""
    d1 = _parse_real(name)
    d2 = pp.parse_pdf(_real_pdf(name))
    a = [b["block_id"] for p in d1["pages"] for b in p["blocks"]]
    b = [b["block_id"] for p in d2["pages"] for b in p["blocks"]]
    assert a == b


@pytest.mark.parametrize("name", REAL_CASES)
def test_真实公告_source_type齐全(name):
    d = _parse_real(name)
    for pg in d["pages"]:
        for b in pg["blocks"]:
            assert b["source_type"] in ZONG_SOURCE_TYPES
            if b["source_type"] == "cell":
                assert b["table_ref"].get("cell_id"), b["block_id"]


def test_真实公告_表格被检出且单元格独立成块():
    """pledge-001 含股权质押情况表，必须检出表格并产出 cell 块。

    这是评测方点名要确认的「表格定位能力」的自动化版本。
    """
    d = _parse_real("D3-PLD-001")
    tables = [t for pg in d["pages"] for t in pg["tables"]]
    cells = [b for pg in d["pages"] for b in pg["blocks"] if b["source_type"] == "cell"]
    assert tables, "未检出任何表格"
    assert cells, "未产出任何单元格块"
    # 每个 cell 块都要回指一张真实存在的表
    tids = {t["table_id"] for t in tables}
    for b in cells:
        assert b["table_ref"]["table_id"] in tids
        assert b["table_ref"]["row"] is not None and b["table_ref"]["col"] is not None


def test_表格单元格的cell_ref可用且唯一():
    """cell_ref 要能直接拷进全队契约的 provenance.cell_ref。

    魏文宇的 run_extract.mjs 读的是 block.table_ref.cell_ref（不是 cell_id）。
    这里锁三件事：
      ① 每个 cell 块都带 cell_ref，格式 r<行>c<列>（1 基）；
      ② **同一张表内 cell_ref 唯一** —— 合并单元格曾让它撞车（实测 53 个单元格
         只推出 20 个唯一 ref），根因是用 pdfplumber 重叠的 t.rows 边界判行号；
      ③ cell_id 仍然唯一，作为内部回溯键。
    """
    import re

    d = _parse_real("D3-PLD-001")
    seen_per_table = {}
    for pg in d["pages"]:
        for b in pg["blocks"]:
            if b["source_type"] != "cell":
                continue
            ref = b["table_ref"]
            assert ref.get("cell_ref"), f"{b['block_id']} 缺 cell_ref"
            assert re.fullmatch(r"r\d+c\d+", ref["cell_ref"]), ref["cell_ref"]
            assert ref.get("cell_id"), f"{b['block_id']} 缺 cell_id"
            key = (ref["table_id"], ref["cell_ref"])
            assert key not in seen_per_table, \
                f"{ref['table_id']} 内 cell_ref {ref['cell_ref']} 撞车（{seen_per_table[key]} 与 {b['block_id']}）"
            seen_per_table[key] = b["block_id"]
            # row/col 与 cell_ref 必须自洽（cell_ref 是 1 基）
            assert ref["cell_ref"] == f"r{ref['row'] + 1}c{ref['col'] + 1}"


# ------------------------------------------------------------ D3：质押表多层表头
def test_多层表头拼出完整列名():
    """质押表的多行表头必须逐级拼成完整列名。

    pledge-001 p1 表2 的 r1 里，「已质押股份情况」是一个跨 2 列的合并单元格，
    r2 才是它的两个子列。抽取层如果只拿到子列名，就分不清「占已质押股份比例（%）」
    与「占未质押股份比例（%）」分别属于哪一组。
    """
    d = _parse_real("D3-PLD-001")
    paths = set()
    for pg in d["pages"]:
        for b in pg["blocks"]:
            if b["source_type"] == "cell":
                hp = b["table_ref"].get("header_path")
                if hp:
                    paths.add(hp)

    assert any(p.startswith("已质押股份情况/") for p in paths), paths
    assert any(p.startswith("未质押股份情况/") for p in paths), paths
    # 叶子名必须真的挂在上级后面，而不是只有叶子名
    assert not any(p == "占已质押股份比例（%）" for p in paths), "子列名没有带上上级前缀"


def test_合并单元格的跨度被算出():
    """「已质押股份情况」必须标成 colspan=2，否则拼不出子列的归属。"""
    d = _parse_real("D3-PLD-001")
    spans = [
        b["table_ref"].get("colspan")
        for pg in d["pages"]
        for b in pg["blocks"]
        if b["source_type"] == "cell" and b["text"].strip() == "已质押股份情况"
    ]
    assert spans, "没找到「已质押股份情况」这个合并表头单元格"
    assert max(spans) == 2, f"应跨 2 列，实际 {spans}"


def test_cell_id全文档唯一():
    """cell_id 撞车曾让整块表头掉进乱序兜底块。

    pledge-001 p1 有两张表，各自从 c001 编号：t002 覆盖了 t001 的 c001–c035，
    导致 t001 第 1–8 列的字符全部认领失败。现要求 cell_id 带 table_id 前缀、全文档唯一。
    """
    d = _parse_real("D3-PLD-001")
    seen = {}
    for pg in d["pages"]:
        for b in pg["blocks"]:
            if b["source_type"] != "cell":
                continue
            cid = b["table_ref"]["cell_id"]
            assert cid not in seen, f"cell_id 撞车：{cid}（{seen[cid]} 与 {b['block_id']}）"
            seen[cid] = b["block_id"]
    # 同一页多张表时最容易暴露，单独确认一下确实有多表
    p1_tables = {b["table_ref"]["table_id"] for b in d["pages"][0]["blocks"] if b["source_type"] == "cell"}
    assert len(p1_tables) >= 2, f"p1 应有多张表，实际 {p1_tables}"


def test_表格内字符全部归属单元格不再掉进兜底块():
    """cell_id 撞车的症状是表内字符掉进 source_type=table 的乱序兜底块。

    修好后 pledge-001 三张表应全部落到单元格里，兜底块为 0。
    """
    d = _parse_real("D3-PLD-001")
    fb = [b for pg in d["pages"] for b in pg["blocks"] if b["source_type"] == "table"]
    assert not fb, f"仍有 {len(fb)} 个兜底块，首个：{fb[0]['text'][:40]!r}"


# ------------------------------------------------------------ 团队硬规则：禁止事后按数字搜索补出处
def test_同页内相同文字必须得到不同出处():
    """证明出处不是事后按值反查出来的。

    「拿字段值回文档里搜第一次出现」这种反查法有个必然特征：
    **相同的值会指向同一个位置**。

    而解析时生成的 region 来自字符本身，所以**同一页内文字相同必然位置不同**。
    这里用文档里真实重复出现的文字来验 —— 若有一组相同文字拿到了同一个 region，
    就说明 region 不是从字符位置来的。

    注意判据限定在**同一页内**：页眉这类文字会在每页以完全相同的坐标重复
    （实测 equity_change 的「证券代码：688105…」在 p2 与 p3 的 region 一模一样，
    这是正确的版面事实，不是反查）。跨页比会把这种情况误判。
    """
    total = 0
    for name in REAL_CASES + EXTRA_CASES:
        d = _parse_real(name)
        for pg in d["pages"]:
            by_text = {}
            for b in pg["blocks"]:
                t = b["text"].strip()
                if len(t) < 2:
                    continue
                r = tuple(b["region"])
                if t in by_text:
                    total += 1
                    assert by_text[t] != r, (
                        f"{name} p{pg['page']}: 相同文字 {t[:24]!r} 得到同一个 region {r} "
                        f"—— 说明 region 不是从字符位置来的"
                    )
                else:
                    by_text[t] = r
    # 样本太少这条测试就没说服力，直接失败而不是静默通过
    assert total >= 10, f"同页重复文字的样本只有 {total} 组，不足以支撑这条判据"


def test_出处覆盖全部块不得按需生成():
    """反查法只会给它抽到的字段产生出处；解析法对**每个**块统一产生。

    所以「100% 覆盖」是"出处在解析阶段统一生成"的结构性证据：
    三份公告里没有任何一个块缺 region。
    """
    for name in REAL_CASES + EXTRA_CASES:
        d = _parse_real(name)
        n = 0
        for pg in d["pages"]:
            for b in pg["blocks"]:
                n += 1
                assert b.get("region") and len(b["region"]) == 4, f"{b['block_id']} 缺 region"
                # region 必须落在页面范围内
                x0, y0, x1, y1 = b["region"]
                assert 0 <= x0 < x1 <= pg["width"] + 1, f"{b['block_id']} region 越出页宽"
                assert 0 <= y0 < y1 <= pg["height"] + 1, f"{b['block_id']} region 越出页高"
        assert n > 0


# ------------------------------------------------------------ D3：跨页续表
def test_跨页续表被标注且碎片能拼回完整值():
    """表格跨页断开时必须标注，否则会得到错值。

    pledge-001 的股东名称被页边界切成两半：
      上一页末行 r4c1 = 「山东省国际信托股份」
      下一页首行 r1c1 = 「有限公司－山东信托·传字6364号财富传承财产信托」
    只取下半截当股东名称就是错的。这里验两件事：
      ① 续表有 continued_from，碎片单元格有 continues 指回上一页同列；
      ② 两半拼起来确实是完整名称。
    """
    d = _parse_real("D3-PLD-001")
    cont = [t for pg in d["pages"] for t in pg["tables"] if t.get("continued_from")]
    assert cont, "pledge-001 的表格跨页断开，应检出续表"

    by_id = {b["block_id"]: b for pg in d["pages"] for b in pg["blocks"]}
    frag = [
        b
        for pg in d["pages"]
        for b in pg["blocks"]
        if (b.get("table_ref") or {}).get("continues")
    ]
    assert frag, "续页首行是被页边界切断的碎片，应标 continues"

    for b in frag:
        src = by_id[b["table_ref"]["continues"]["block_id"]]
        assert src["table_ref"]["col"] == b["table_ref"]["col"], "拼回的原格必须在同一列"
        joined = src["text"] + b["text"]
        assert "山东省国际信托股份有限公司" in joined, f"拼接结果不对：{joined!r}"


def test_行边界断开的不误标碎片():
    """equity-change-001 也有跨页续表，但断在行边界上，单元格没被切断。

    续表要认出来（continued_from），碎片标注则不能乱加 ——
    否则消费方会把两个独立的值错误地拼在一起。
    """
    d = _parse_real("equity-change-001")
    cont = [t for pg in d["pages"] for t in pg["tables"] if t.get("continued_from")]
    assert cont, "equity-change-001 也应检出续表"
    frag = [
        b
        for pg in d["pages"]
        for b in pg["blocks"]
        if (b.get("table_ref") or {}).get("continues")
    ]
    assert not frag, f"行边界断开不该标碎片，却有 {len(frag)} 个"


# ------------------------------------------------------------ D3：分栏检测
TWoCOL_FIXTURE = os.path.join(ROOT, "tests", "fixtures", "twocol_synthetic.pdf")


def _parse_twocol():
    if not os.path.exists(TWoCOL_FIXTURE):
        pytest.skip("缺 tests/fixtures/twocol_synthetic.pdf")
    return pp.parse_pdf(TWoCOL_FIXTURE)


def test_双栏页面被检出并给出各栏范围():
    """合成的双栏 fixture 必须检出 2 栏，且栏范围合理（不与页边距混淆）。"""
    d = _parse_twocol()
    pg = d["pages"][0]
    cols_ = pg["columns"]
    assert len(cols_) == 2, f"应检出 2 栏，实际 {cols_}"
    (a0, a1), (b0, b1) = cols_
    assert a1 < b0, "两栏应有先后且不重叠"
    # 每栏至少占文本区的 25%，否则是把页边距当成了栏
    assert (a1 - a0) > 0.25 * pg["width"]
    assert (b1 - b0) > 0.25 * pg["width"]


def test_双栏阅读顺序_整幅优先再逐栏():
    """整幅的标题/元信息要排在两栏正文之前，而不是被按栏切成两半。

    实测踩过的坑：把「某某股份有限公司关于股东股份质押的公告」按栏缝拦腰截断，
    变成「某某股份有限公司关」+「股东股份质押的公告」两块，分散在两次读里。
    """
    d = _parse_twocol()
    pg = d["pages"][0]
    texts = [b["text"] for b in pg["blocks"]]

    full = [i for i, b in enumerate(pg["blocks"]) if not _block_in_one_column(b, pg["columns"])]
    assert full, "应有横跨栏缝的整幅块（标题、元信息）"
    first_part = [i for i, b in enumerate(pg["blocks"]) if _block_in_one_column(b, pg["columns"])]
    assert max(full) < min(first_part), "整幅块应排在分栏正文之前"

    # 左右栏各自成块，且顺序是先左后右
    left = [i for i in first_part if pg["blocks"][i]["region"][0] < pg["columns"][1][0]]
    right = [i for i in first_part if pg["blocks"][i]["region"][0] >= pg["columns"][1][0]]
    assert left and right, "左右栏都应有块"
    assert max(left) < min(right), "阅读顺序应先读完左栏再读右栏"


def test_双栏不出现块内左右栏交错():
    """不分栏阅读的直接症状就是块横跨两栏、文本交错。

    用**结构**判据而不是关键词：块要么完全落在某一栏内，要么整幅跨过中缝，
    不允许「只横跨一半」。
    （一开始我用「文本里同时出现『左栏』『右栏』」当判据，结果误报了 ——
    左栏正文里本来就有「详见右栏表格说明」这句话。判据得看几何，不能看词。）
    """
    d = _parse_twocol()
    for pg in d["pages"]:
        cols_ = pg["columns"]
        if not cols_:
            continue
        gut0, gut1 = cols_[0][1], cols_[1][0]
        for b in pg["blocks"]:
            r = b["region"]
            inside = any(r[0] >= c0 - 1 and r[2] <= c1 + 1 for c0, c1 in cols_)
            crosses = r[0] < gut0 and r[2] > gut1
            assert inside or crosses, (
                f"块横跨栏缝却又不整幅（既不在任一栏内，也没跨过中缝）："
                f"x={r[0]:.0f}–{r[2]:.0f} 文本={b['text'][:40]!r}"
            )


def test_双栏左右栏内容没有互相渗入():
    """右栏独有的数字不能出现在左栏的块里（反之亦然）。

    用数字而不是措辞：数字不会因为正文语义而自然出现，判据才成立。
    """
    d = _parse_twocol()
    pg = d["pages"][0]
    cols_ = pg["columns"]
    if not cols_:
        pytest.skip("fixture 未检分栏")
    left_text = "".join(
        b["text"] for b in pg["blocks"] if b["region"][0] >= cols_[0][0] - 1 and b["region"][2] <= cols_[0][1] + 1
    )
    right_text = "".join(
        b["text"] for b in pg["blocks"] if b["region"][0] >= cols_[1][0] - 1 and b["region"][2] <= cols_[1][1] + 1
    )
    assert "50,350,000" in right_text, "右栏独有的数字没出现在右栏块里"
    assert "50,350,000" not in left_text, "右栏内容渗进了左栏块"


def _block_in_one_column(block, columns_) -> bool:
    r = block["region"]
    for c0, c1 in columns_:
        if r[0] >= c0 - 1 and r[2] <= c1 + 1:
            return True
    return False


def test_单栏文档不误报分栏():
    """反例同样要锁：四份真实单栏文档必须全部 columns 为空。

    分栏检测最大的风险是**误报** —— 居中标题会留下大片 x 空白、
    表格的列间距更是天然一堆空白带。实测按整页扫描时 pledge-001 p1
    会报出 3 条假栏缝（153–203 / 218–340 / 342–432）。

    要求它们在**逐块内容上零变化**：一旦误切，块序与文本都会变。
    """
    for name in REAL_CASES + EXTRA_CASES:
        d = _parse_real(name)
        for pg in d["pages"]:
            assert pg["columns"] == [], f"{name} p{pg['page']} 误报分栏 {pg['columns']}"
    # D1 的竞赛通知同样是单栏
    d = pp.parse_pdf(FIXTURE)
    for pg in d["pages"]:
        assert pg["columns"] == [], f"附件1通知 p{pg['page']} 误报分栏 {pg['columns']}"


def test_落款页不被误判为分栏():
    """稀疏页面的误报防线。

    D3-PLD-003 第 3 页是落款页：只有 7 行、91 个字符（两条附件说明 + 右对齐的
    署名与日期 + 页码）。右对齐内容在左侧留下大片空白，而行数少时
    「干净比例 ≥60%」极易被满足 —— 实测被切成 4 栏
    [[90,175],[295,300],[325,361],[373,512]]。

    两道护栏：
      ① 页面至少 8 个文本行才考虑分栏（MIN_TEXT_ROWS）
      ② 每一栏必须有实质内容（字符数 ≥30 且占比 ≥15%）
    """
    d = _parse_real("D3-PLD-003")
    for pg in d["pages"]:
        assert pg["columns"] == [], f"D3-PLD-003 p{pg['page']} 误报分栏 {pg['columns']}"


def test_真双栏仍能检出_护栏没有过度收紧():
    """护栏不能把真分栏也挡掉 —— 这是上一条的反向约束。

    合成双栏 fixture 只有 14 行，是最接近护栏边界的正例；
    如果哪天 MIN_TEXT_ROWS 调大到 15，这条会失败，提示正例已失效。
    """
    d = _parse_twocol()
    assert len(d["pages"][0]["columns"]) == 2


# ------------------------------------------------------------ D4：扫描件降级区域
SCANNED_FIXTURE = os.path.join(ROOT, "tests", "fixtures", "scanned_synthetic.pdf")
MIXED_FIXTURE = os.path.join(ROOT, "tests", "fixtures", "mixed_synthetic.pdf")


def _parse_maybe(path):
    if not os.path.exists(path):
        pytest.skip(f"缺 {path}")
    return pp.parse_pdf(path)


def test_纯扫描页产出带坐标的降级区域():
    """D4 核心：不可读区域要**带坐标**标出来。

    只写一句"这页读不了"是不够的 —— 展示层拿不到区域，就没法在页面上把
    那块框出来告诉用户"这里读不出字"。所以必须有 source_type=scan_region
    的块，带 region / degraded / missing_reason。
    """
    d = _parse_maybe(SCANNED_FIXTURE)
    pg = d["pages"][0]
    assert pg["form"] == "SCANNED"
    sc = [b for b in pg["blocks"] if b["source_type"] == "scan_region"]
    assert sc, "扫描页应产出 scan_region 降级块"
    for b in sc:
        r = b["region"]
        assert len(r) == 4 and r[2] > r[0] and r[3] > r[1], f"区域非法：{r}"
        assert b["degraded"] is True
        assert b["missing_reason"] == "NOT_PARSED"
        # 区域要覆盖页面主体，而不是一个零大小的占位
        assert (r[2] - r[0]) > 0.5 * pg["width"]
        assert (r[3] - r[1]) > 0.5 * pg["height"]


def test_扫描区域的块不带文本():
    """scan_region 断言的是"这块读不出字"，所以它不能有文本。

    这不是遗漏而是语义：强制它有 text_raw 会诱导实现去编一个占位串，
    反而破坏「quote 必须是原文子串」的保证。它也因此不能作为 provenance.quote 的来源。
    """
    d = _parse_maybe(SCANNED_FIXTURE)
    for pg in d["pages"]:
        for b in pg["blocks"]:
            if b["source_type"] == "scan_region":
                assert b["text"] == "", f"{b['block_id']} 不该有 text"
                assert b["text_raw"] == "", f"{b['block_id']} 不该有 text_raw"


def test_OCR入口存在且明确不可用():
    """降级路径必须是**显式**的：入口在，但如实返回不可用。

    这样「尝试识别 → 失败则降级」这条链路现在就完整，D5+ 接真实通道时
    只替换 scan.try_ocr 一个函数，调用方不用改。
    """
    from finstruct.parse import scan
    assert scan.ocr_available() is False
    assert scan.OCR_CHANNEL_ID == "none"
    # 入口签名可用；返回 None 表示不可用，调用方据此走降级而不是当成空文本
    assert scan.try_ocr(None) is None


def test_混合页的扫描部分被标降级而文本部分保留():
    """混合文档：文本页照常解析，扫描页标降级区域。"""
    d = _parse_maybe(MIXED_FIXTURE)
    forms = [p["form"] for p in d["pages"]]
    assert "TEXT" in forms and "SCANNED" in forms, forms
    text_pages = [p for p in d["pages"] if p["form"] == "TEXT"]
    scan_pages = [p for p in d["pages"] if p["form"] != "TEXT"]
    assert all(len(p["blocks"]) > 0 for p in text_pages), "文本页不该为空"
    for p in scan_pages:
        assert any(b["source_type"] == "scan_region" for b in p["blocks"])


def test_稀疏落款页的可读文本不再被丢弃():
    """诚实降级 = 标注读不了的部分，而不是丢弃读得了的部分。

    equity-change-001 p4 是落款页：只有 43 个字符（证券代码、日期、页码），
    形态判定为 MIXED。早期实现对非 TEXT 页一律产出空块，把这 43 个字全扔了。
    D4 起：能读的照常产出，读不了的才标降级区域。
    """
    d = _parse_real("equity-change-001")
    sparse = [p for p in d["pages"] if p["form"] != "TEXT"]
    assert sparse, "equity-change-001 应有一页非 TEXT"
    for p in sparse:
        assert len(p["blocks"]) > 0, f"p{p['page']} 的可读文本被丢弃了"
        texts = "".join(b["text"] for b in p["blocks"])
        # 落款页上的关键内容应当出现
        assert "证券代码" in texts or "2026" in texts, f"p{p['page']} 内容缺失：{texts[:60]!r}"
