"""出处自洽性检查：块的 region 里装的是不是它声称的那段字。

这是「出处是否正确」最直接的可自动化验证。真实公告上跑出来的结果表明，
**表格是这套判据的主要敌人**——见下方「已知问题」。

## 三条判据

1. **区域重建一致**：按 `region` 把字符重新取出来拼一遍，必须等于 `block.text`。
2. **原始字符一致**：同样重建出来的原始字符，必须等于 `block.text_raw`。
3. **字符守恒**：整页的字符必须被各块**恰好覆盖一次**——既不重叠（算两次），
   也不遗漏（静默丢字）。

## 为什么没有「text_raw 必须是原文子串」这一条（重要）

D1 夜曾加过一条判据：`text_raw` 必须是整页原始字符流的子串。**这条判据是错的**，
它把 `award.pdf` 的 90.3%、`equity_disclaimer` 的 92.1% 判成失败，但那些块其实没问题。

原因是：**PDF 内容流的字符顺序不等于阅读顺序。** 实测 `award.pdf` 第 1 页标题块，
前 6 个字在内容流中的位置是 [80, 81, 63, 64, 84, 85] —— 完全不是递增的。也就是说
`武汉华康世纪…` 这几个字在 PDF 内部是乱序写入的。**内容流顺序对「原文」没有意义，
按 x 坐标排出来的阅读顺序才有意义。**

所以「原文子串」这个说法对 PDF 派生文本是有歧义的。契约里 `quote` 要防的是
**编造**，而防编造的正确做法是：quote 必须能对应到某个具体 `block` 的 `text_raw`
（结构上已经强制了），而不是去跟内容流比子串。

## 已知问题（D2 实测，真实公告）

`pledge.pdf`（含股权质押情况表）区域重建一致率只有 **81.8%**：表格里同一行的
多个单元格被当成一个「块」，而块级 region 覆盖了整行，重新按 region 取字符时
会因为字符中心落在边界内外而多取/少取，重聚类后行分组也变了。

**根因是没有表格处理。** 正确解法是表格走 **cell 级出处**（`make_table_cell`
结构 D1 已定义好，`table_ref` 字段已预留），而不是用整行的块级 region。
这是 D3/D4 的工作。

用法：
    python tools/check_evidence.py <parse.json> <源.pdf>
"""
from __future__ import annotations

import collections
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))

from finstruct.parse import text_layer as tl  # noqa: E402


def chars_in_region(chars, region, pad=0.05):
    """取出中心落在 region 内的字符。

    pad 只用来吸收浮点噪声，**不能大到跨进邻格**。原值 0.5pt 会把隔壁单元格
    压在边界上的字符（实测 D5-EQC-004 p9 的 `）`：中心 224.2，本格边界 224.6，
    相差 0.4pt）算进本格，造成假阳性。一个汉字宽约 12pt，0.05pt 已足够吸收噪声。
    """
    """取中心点落在 region 内的字符。"""
    x0, y0, x1, y1 = region
    out = []
    for c in chars:
        cx = (c["x0"] + c["x1"]) / 2
        cy = (c["top"] + c["bottom"]) / 2
        if x0 - pad <= cx <= x1 + pad and y0 - pad <= cy <= y1 + pad:
            out.append(c)
    return out


def _in_region(region, char) -> bool:
    x0, y0, x1, y1 = region
    cx = (char["x0"] + char["x1"]) / 2
    cy = (char["top"] + char["bottom"]) / 2
    return x0 - 0.5 <= cx <= x1 + 0.5 and y0 - 0.5 <= cy <= y1 + 0.5


def norm(s: str) -> str:
    return "".join(s.split())


def check(parse_json: str, pdf_path: str) -> int:
    import pdfplumber

    doc = json.load(open(parse_json, encoding="utf-8"))
    total = ok = 0
    problems = []
    conservation = []   # 每页的字符守恒结果

    with pdfplumber.open(pdf_path) as pdf:
        for pg in doc["pages"]:
            page = pdf.pages[pg["page"] - 1]
            chars = page.chars or []
            # 非 TEXT 页：**块照样要校验**（D4 起这类页面也会产出可读文本块与
            # scan_region 降级块），只有字符守恒不适用 —— 扫描页本来就没有文本层，
            # 拿"字符覆盖"去要求它没有意义。
            counts_conservation = pg.get("form") == "TEXT"
            skipped_note = (
                None if counts_conservation
                else f"form={pg.get('form')}，不做字符守恒（无文本层）"
            )

            # ---- 判据 3：字符守恒。以字符在 chars 列表中的下标为身份
            cover = [0] * len(chars) if counts_conservation else None
            index_of = {id(c): i for i, c in enumerate(chars)}

            for b in pg["blocks"]:
                # scan_region：断言"这块读不出字"。它**不认领任何字符**，
                # 所以既不参与区域重建（本来就没有文本），也不参与字符守恒
                # （否则图片区域内的字符会被算成被覆盖两次）。
                if b.get("source_type") == "scan_region":
                    total += 1
                    if b.get("text_raw") or b.get("text"):
                        problems.append({
                            "block_id": b["block_id"], "page": pg["page"],
                            "claimed": b["text"][:60], "in_region": "（scan_region 不该有文本）",
                            "n_chars_in_region": 0,
                        })
                    else:
                        ok += 1
                    continue
                total += 1
                inside = chars_in_region(chars, b["region"])
                if cover is not None:
                    for c in inside:
                        i = index_of.get(id(c))
                        if i is not None:
                            cover[i] += 1

                # ---- 判据 1 & 2
                lines = tl.cluster_lines(inside)
                rebuilt = tl.join_block_text(lines)
                rebuilt_raw = "".join(c["text"] for ln in lines for c in ln)
                claimed_raw = b.get("text_raw", b["text"])
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

            uncovered = sum(1 for v in cover if v == 0) if cover is not None else 0
            overlapped = sum(1 for v in cover if v > 1) if cover is not None else 0

            # 重叠按"涉事块的类型组合"分开统计 —— 性质完全不同：
            #   paragraph×paragraph：聚类把不该合并的行并了，是真 bug。
            #   cell/table 之类：表格是交错排布，块的外接矩形天然会互相压住，
            #                    属于几何假象，只要字符归属是唯一的就是正常的。
            kinds = collections.Counter()
            for i, v in enumerate(cover or []):
                if v > 1:
                    owners = [b["source_type"] for b in pg["blocks"]
                              if _in_region(b["region"], chars[i])]
                    kinds[tuple(sorted(set(owners)))] += 1

            bad_kinds = {k: n for k, n in kinds.items()
                         if k == ("paragraph",) or len(k) == 1 and k[0] == "paragraph"}
            conservation.append(
                {
                    "page": pg["page"],
                    "chars": len(chars),
                    "uncovered": uncovered,
                    "overlapped": overlapped,
                    "kinds": dict(kinds),
                    "fatal_overlap": sum(bad_kinds.values()),
                    "ok": uncovered == 0 and not bad_kinds,
                    "skipped": skipped_note,
                }
            )

    rate = ok / total if total else 0.0
    print(f"块总数                : {total}")
    print(f"区域重建一致          : {ok}/{total} = {rate:.1%}  （含 scan_region 的空文本断言）")
    print()
    print("字符覆盖（每页字符应被各块覆盖；重叠按性质区分）:")
    cons_ok = 0
    for c in conservation:
        mark = "✓" if c["ok"] else "✗"
        if c["ok"]:
            cons_ok += 1
        extra = ""
        if c["overlapped"]:
            desc = ", ".join(f"{'+'.join(k)}×{v}" for k, v in c["kinds"].items())
            extra = f"  重叠 {c['overlapped']}（{desc}）"
            if not c["fatal_overlap"]:
                extra += " ← 表格交错导致的外接矩形交叠，非逻辑重叠"
        skip = c.get("skipped")
        if skip:
            print(f"  – p{c['page']}: 字符 {c['chars']:>4}  跳过（{skip}）")
        else:
            print(f"  {mark} p{c['page']}: 字符 {c['chars']:>4}  未覆盖 {c['uncovered']:>3}{extra}")
    print(f"  达标页 {cons_ok}/{len(conservation)}（判据：无丢字，且无段落×段落重叠）")

    if problems:
        print(f"\n区域重建不一致的块（{len(problems)} 个，最多显示 8 个）:")
        for p in problems[:8]:
            print(f"  {p['block_id']}  region 内字符数={p['n_chars_in_region']}")
            print(f"    声称: {p['claimed']!r}")
            print(f"    实取: {p['in_region']!r}")

    all_ok = rate == 1.0 and cons_ok == len(conservation)
    return 0 if all_ok else 1


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    return check(sys.argv[1], sys.argv[2])


if __name__ == "__main__":
    raise SystemExit(main())
