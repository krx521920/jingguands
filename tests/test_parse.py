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
CONTRACT_PARSE_META_KEYS = {"parser_version", "page_count"}


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


def test_handoff不含blocks以避开契约自相矛盾(parsed):
    """回归用例：契约 interface/README.md 第四节说 parse_meta 由解析侧填
    parser_version / page_count / blocks，但 event-envelope.schema.json 对
    parse_meta 设了 additionalProperties:false 且只允许前两个字段。

    我们按 schema 走（不含 blocks），否则抽取层一校验就挂。
    这个矛盾已作为对齐项反馈；等他改 schema 后本用例再放开。
    """
    assert "blocks" not in parsed["handoff"]["source"]["parse_meta"]
    assert any("blocks" in w for w in parsed["handoff"]["warnings"])


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

    sp = _os.path.join(ROOT, "schemas", "evidence.v0.2.json")
    if not _os.path.exists(sp):
        pytest.skip("找不到 schemas/evidence.v0.2.json")
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
