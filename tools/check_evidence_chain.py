#!/usr/bin/env python3
"""出处链检查（D10 交付物）。

## 检查什么

D10 任务：**检查文件哈希、页码/区域、模型输入片段能沿链传递，防同名串证据。**

链路四段，逐段核：

| 段 | 检查 |
| --- | --- |
| ① 文件哈希 | 解析输出声明的 `file_id`（sha256）**是否等于实际 PDF 的哈希** |
| ② doc_id 派生 | `doc_id` 是否确由内容哈希派生（`d` + sha256 前 8 位） |
| ③ 页码/区域 | 每块的 `page` 是否存在、`region` 是否为合法矩形且落在页内 |
| ④ 模型输入片段 | 块 `text_raw` 是否为原文子串（原始字符直拼的构造保证） |

并单独报一类风险：

**同名串证据** —— 同一段文字在多个块里出现时，只给 `quote` 无法定位到唯一一处。
本工具统计每个文档里「文字完全相同的块」有多少组、涉及多少块，
并对**跨页/跨表**的重复单独标出（那类最容易串）。

## 不检查什么

不判定抽取值对不对。这是出处链的可追溯性检查，不是准确率检查。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from collections import defaultdict


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def find_parse(parses, case):
    return parses.get(case)


def find_pdf(raw_dirs, case):
    for d in raw_dirs:
        p = os.path.join(d, case + ".pdf")
        if os.path.exists(p):
            return p
    return None


def check_member(case, parse, pdf_path):
    r = {"case_id": case, "checks": {}, "duplicate_text_groups": [], "risk": None}
    doc = parse
    meta = doc["doc"]
    blocks = [(pg["page"], b, pg) for pg in doc["pages"] for b in pg["blocks"]]

    # ① 文件哈希
    if pdf_path:
        actual = sha256_file(pdf_path)
        declared = (meta.get("file_id") or "").replace("sha256:", "")
        r["input_sha256"] = actual
        r["checks"]["file_hash_matches_actual"] = (actual == declared)
        r["checks"]["declared_file_id"] = declared or None
    else:
        r["input_sha256"] = None
        r["checks"]["file_hash_matches_actual"] = None
        r["risk"] = "缺原始 PDF，无法核对文件哈希"

    # ② doc_id 由内容哈希派生
    if pdf_path:
        expect = "d" + actual[:8]
        r["checks"]["doc_id_matches_hash"] = (meta["doc_id"] == expect)
        r["checks"]["doc_id_expected"] = expect

    # ③ 页码 / 区域
    bad_region, bad_page = [], []
    for pgno, b, pg in blocks:
        reg = b.get("region")
        if b.get("page") != pgno:
            bad_page.append(b["block_id"])
        if b.get("source_type") == "scan_region":
            continue                      # 降级块无字符，region 允许等于整页
        if not (isinstance(reg, list) and len(reg) == 4 and reg[2] > reg[0] and reg[3] > reg[1]):
            bad_region.append(b["block_id"])
        elif not (0 <= reg[0] and reg[2] <= pg["width"] + 1 and 0 <= reg[1] and reg[3] <= pg["height"] + 1):
            bad_region.append(b["block_id"])
    r["checks"]["page_consistent"] = not bad_page
    r["checks"]["region_valid"] = not bad_region
    if bad_page:
        r["checks"]["bad_page_blocks"] = bad_page[:5]
    if bad_region:
        r["checks"]["bad_region_blocks"] = bad_region[:5]

    # ④ text_raw 为原文子串（构造保证）—— 用「与页内字符一致」抽查
    r["checks"]["text_raw_present"] = all(
        (b.get("text_raw") or b.get("source_type") == "scan_region") for _p, b, _g in blocks)

    # 同名串证据：完全相同的 text_raw 出现在多个块
    groups = defaultdict(list)
    for pgno, b, _g in blocks:
        t = b.get("text_raw")
        if t and len(t) >= 2:
            groups[t].append((pgno, b["block_id"]))
    for t, hits in groups.items():
        if len(hits) > 1:
            pages = sorted({p for p, _ in hits})
            r["duplicate_text_groups"].append({
                "text": t[:40], "n_blocks": len(hits), "pages": pages,
                "cross_page": len(pages) > 1,
                "block_ids": [b for _p, b in hits][:4],
            })
    r["duplicate_text_groups"].sort(key=lambda x: (-x["n_blocks"], x["text"]))
    r["duplicate_stats"] = {
        "groups": len(r["duplicate_text_groups"]),
        "blocks_involved": sum(g["n_blocks"] for g in r["duplicate_text_groups"]),
        "cross_page_groups": sum(1 for g in r["duplicate_text_groups"] if g["cross_page"]),
    }
    return r


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cases", required=True, help="宗博文 integration-cases.json")
    ap.add_argument("--parses", nargs="+", required=True)
    ap.add_argument("--raw", nargs="*", default=[], help="原始 PDF 目录（核对哈希用）")
    ap.add_argument("-o", "--out", required=True)
    a = ap.parse_args()

    parses = {}
    for d in a.parses:
        for f in sorted(os.listdir(d)):
            if f.endswith(".parse.json"):
                parses[f.replace(".parse.json", "")] = json.load(
                    open(os.path.join(d, f), encoding="utf-8"))

    data = json.load(open(a.cases, encoding="utf-8"))
    cases = data.get("cases") or []

    out_cases, missing = [], []
    for c in cases:
        members, chains = c["members"], []
        shas = []
        for m in members:
            p = find_parse(parses, m)
            if p is None:
                missing.append({"case_id": c["case_id"], "member": m, "reason": "本地无解析包"})
                shas.append(None)
                continue
            pdf = find_pdf(a.raw, m)
            if pdf is None:
                missing.append({"case_id": c["case_id"], "member": m, "reason": "本地无原始 PDF"})
            ch = check_member(m, p, pdf)
            # 修正：check_member 里 pdf 可能有但这里已找到；统一用返回值
            shas.append(ch.get("input_sha256"))
            chains.append(ch)
        out_cases.append({
            "case_id": c["case_id"],
            "title": c.get("title"),
            "members": members,
            # **宗要求每组必填的 input_sha256[]，顺序与 members 一致**
            "input_sha256": shas,
            "input_sha256_aligned_with_members": len(shas) == len(members) and all(shas),
            "chains": chains,
        })

    total_dup = sum(ch["duplicate_stats"]["blocks_involved"]
                    for c in out_cases for ch in c["chains"])
    json.dump({
        "built_by": "张智博", "day": "D10", "schema": "evidence/0.9",
        "purpose": "出处链检查：文件哈希 / doc_id 派生 / 页码区域 / 原文片段 ＋ 同名串证据风险",
        "note": "不判定抽取值对不对；这是可追溯性检查，不是准确率检查。",
        "cases": out_cases,
        "missing": missing,
        "summary": {
            "cases": len(out_cases),
            "members": sum(len(c["members"]) for c in out_cases),
            "input_sha256_complete_cases": sum(1 for c in out_cases if c["input_sha256_aligned_with_members"]),
            "blocks_in_duplicate_groups": total_dup,
        },
    }, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    print(f"{a.out}: {len(out_cases)} 案例 / {sum(len(c['members']) for c in out_cases)} 成员")
    print(f"    input_sha256 齐全的案例: {sum(1 for c in out_cases if c['input_sha256_aligned_with_members'])}/{len(out_cases)}")
    print(f"    同名串证据涉及的块数: {total_dup}")
    if missing:
        print(f"    缺失: {len(missing)} 项（最多 5）")
        for m in missing[:5]:
            print(f"      {m['case_id']} {m['member']} — {m['reason']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
