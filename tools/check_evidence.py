"""出处自洽性检查：块的 region 里装的是不是它声称的那段字。

这是对「出处是否正确」最直接的可自动化验证，也是团队指标
「出处命中率」在 D1 阶段能做到的版本（还没有人工标注，
所以先验证自洽性：坐标与文本必须彼此对应）。

做法：把 region 内的字符重新取出来拼一遍，与 block.text / block.text_raw 比对。
若两者不一致，说明坐标和文本脱节 —— 下游按坐标高亮会框错地方。

用法：
    python tools/check_evidence.py outputs/附件1通知.parse.json 附件1通知.pdf
"""
from __future__ import annotations

import json
import sys

sys.path.insert(0, __import__("os").path.join(__import__("os").path.dirname(__file__), "..", "src"))

from finstruct.parse import text_layer as tl  # noqa: E402


def chars_in_region(chars, region, pad=0.5):
    """取中心点落在 region 内的字符。"""
    x0, y0, x1, y1 = region
    out = []
    for c in chars:
        cx = (c["x0"] + c["x1"]) / 2
        cy = (c["top"] + c["bottom"]) / 2
        if x0 - pad <= cx <= x1 + pad and y0 - pad <= cy <= y1 + pad:
            out.append(c)
    return out


def norm(s: str) -> str:
    return "".join(s.split())


def check(parse_json: str, pdf_path: str) -> int:
    import pdfplumber

    doc = json.load(open(parse_json, encoding="utf-8"))
    total = ok = 0
    sub_total = sub_ok = 0
    problems = []
    not_sub = []

    with pdfplumber.open(pdf_path) as pdf:
        for pg in doc["pages"]:
            page = pdf.pages[pg["page"] - 1]
            chars = page.chars or []
            page_raw = "".join(c["text"] for c in chars)
            for b in pg["blocks"]:
                total += 1
                inside = chars_in_region(chars, b["region"])
                # 按行重排后拼接，与解析时同一套逻辑
                lines = tl.cluster_lines(inside)
                rebuilt = tl.join_block_text(lines)
                rebuilt_raw = "".join(c["text"] for ln in lines for c in ln)
                claimed_raw = b.get("text_raw", b["text"])

                # 判据 1：region 内重建的可读文本 == 声称的 text
                # 判据 2：region 内重建的原始字符 == 声称的 text_raw
                if norm(rebuilt) == norm(b["text"]) and norm(rebuilt_raw) == norm(claimed_raw):
                    ok += 1
                else:
                    problems.append(
                        {
                            "block_id": b["block_id"],
                            "page": pg["page"],
                            "claimed": b["text"][:60],
                            "in_region": rebuilt[:60],
                            "n_chars_in_region": len(inside),
                        }
                    )

                # 判据 3（契约硬要求）：text_raw 必须是原文子串，
                # 因为抽取层要把它直接当作 provenance.quote。
                sub_total += 1
                if claimed_raw and claimed_raw in page_raw:
                    sub_ok += 1
                else:
                    not_sub.append({"block_id": b["block_id"], "page": pg["page"],
                                    "text_raw": claimed_raw[:50]})

    rate = ok / total if total else 0.0
    sub_rate = sub_ok / sub_total if sub_total else 0.0
    print(f"块总数              : {total}")
    print(f"出处自洽通过        : {ok}")
    print(f"自洽率              : {rate:.1%}")
    print(f"text_raw 是原文子串 : {sub_ok}/{sub_total} = {sub_rate:.1%}"
          f"   （契约要求 quote 必须是原文子串）")
    if not_sub:
        print(f"\ntext_raw 不是原文子串的块（{len(not_sub)} 个，最多显示 5 个）:")
        for p in not_sub[:5]:
            print(f"  {p['block_id']}  {p['text_raw']!r}")
    if problems:
        print(f"\n不一致的块（{len(problems)} 个，最多显示 8 个）:")
        for p in problems[:8]:
            print(f"  {p['block_id']}  region内字符数={p['n_chars_in_region']}")
            print(f"    声称: {p['claimed']!r}")
            print(f"    实取: {p['in_region']!r}")
    return 0 if (rate == 1.0 and sub_rate == 1.0) else 1


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    return check(sys.argv[1], sys.argv[2])


if __name__ == "__main__":
    raise SystemExit(main())
