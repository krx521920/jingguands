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

    sp = _os.path.join(ROOT, "schemas", "evidence.v0.5.json")
    if not _os.path.exists(sp):
        pytest.skip("找不到 schemas/evidence.v0.5.json")
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
    os.path.join(ROOT, "sample", "D2", "raw"),
    os.path.join(ROOT, "..", "D2张智博_三份真实公告解析", "raw"),
]
_REAL_RAW = next((p for p in _REAL_RAW_CANDIDATES if os.path.isdir(p)), _REAL_RAW_CANDIDATES[0])
REAL_CASES = ["pledge-001", "equity-change-001", "award-001"]
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
    schema = _json.load(open(os.path.join(ROOT, "schemas", "evidence.v0.5.json"), encoding="utf-8"))
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
    d = _parse_real("pledge-001")
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

    d = _parse_real("pledge-001")
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
    d = _parse_real("pledge-001")
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
    d = _parse_real("pledge-001")
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
    d = _parse_real("pledge-001")
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
    d = _parse_real("pledge-001")
    fb = [b for pg in d["pages"] for b in pg["blocks"] if b["source_type"] == "table"]
    assert not fb, f"仍有 {len(fb)} 个兜底块，首个：{fb[0]['text'][:40]!r}"
