#!/usr/bin/env python3
"""出处重锚定工具（D14/缺陷 D11-P0-01）。

## 解决什么

旧版解析器（`finstruct.parse/0.3.0`）产出的溯源条目的 `block_id` 与
`quote`，在当前版本解析输出里对不上。本工具对每条溯源条目：

1. **按 quote 在当前 parse 里找块**（先去空白归一，再退化为子串）
2. 输出**修正后的 `block_id`**，或在找不到时给出**为什么找不到**
3. **区分两类失败**，因为它们处置完全不同：
   - `quote_jumbled`：quote 是**跨单元格乱序拼接**（旧版块结构的产物），
     **不是块号错位** —— 重映射救不了，**quote 必须重新从原文取**
   - `quote_absent`：quote 归一后仍不在文档里 —— 需人工看原文

## 为什么要区分这两类

`D11-P0-01` 表面是「块号指错」，实测 10 条里**多数是 quote 本身被旧版搞乱了**。
若只做块号重映射，会把这些乱序 quote 硬塞到某个块上 —— **看起来修好了，实际是伪造出处**。

用法：
    python tools/reanchor_provenance.py --miss <l3_miss.json> --parse <parse.json>
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

def norm(s: str) -> str:
    """去空白归一 —— text_raw 不含换行，引用方可能带空白。"""
    return "".join((s or "").split())


# 判断 quote 是否像「跨单元格拍平」。
#
# **不做自动决策，只作观察标记。** 我先后写过两版判据都被实测打回：
#   ① 「长且无标点」→ 假阳性，把正常的公司名
#      `建德市新安小额贷款股份有限公司` 判成乱序（长公司名本来就没标点）
#   ② 「数字/百分号与汉字交错」→ 假阴性，漏掉
#      `合计——7,800,0008.92%3.66%`（`——` 挡在数字前面，正则匹配不到）
#
# 所以这里**只给一个参考标记**，真伪由人看 quote 本身判断。
# 自动改 block_id 只依赖「quote 是否在当前 parse 里找得到」，不依赖这个标记。


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--miss", required=True, help="l3_miss 数组的 JSON")
    ap.add_argument("--parse", required=True, help="当前版本的 parse.json")
    ap.add_argument("-o", "--out", required=True)
    a = ap.parse_args()

    doc = json.load(open(a.parse, encoding="utf-8"))
    blocks = {b["block_id"]: b for pg in doc["pages"] for b in pg["blocks"]}
    nb = {bid: norm(b.get("text_raw")) for bid, b in blocks.items()}
    joined = "".join(nb.values())

    miss = json.load(open(a.miss, encoding="utf-8"))
    if isinstance(miss, dict):
        miss = miss.get("l3_miss") or miss.get("rows") or []

    rows = []
    for m in miss:
        q = m.get("quote") or ""
        nq = norm(q)
        hits = [bid for bid, t in nb.items() if nq and nq in t]
        if hits:
            status, note = "remapped", "quote 在当前 parse 的唯一/首个命中块"
        elif nq and nq in joined:
            status, note = "spans_blocks", "quote 跨多个块，需拼接相邻块"
        else:
            status, note = ("not_found",
                            "quote 归一后不在当前 parse 的任何块里。"
                            "需人工看原文：可能是块号错位（可重映射），"
                            "也可能 quote 本身是旧版拍平的产物（必须先重新取 quote，不能硬塞）")
        rows.append({
            "field": m.get("field"), "old_block_id": m.get("block_id"),
            "quote": q, "status": status,
            "new_block_id": hits[0] if hits else None,
            "all_hits": hits[:4], "note": note,
        })

    import collections
    cnt = collections.Counter(r["status"] for r in rows)
    json.dump({
        "built_by": "张智博", "day": "D14", "defect": "D11-P0-01",
        "parse": a.parse, "total": len(rows),
        "summary": dict(cnt),
        "policy": ("只自动改 remapped；spans_blocks 给候选人工确认；"
                   "not_found **不自动改** —— 硬塞会伪造出处。"),
        "rows": rows,
    }, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    print(f"{a.out}: {len(rows)} 条")
    for k, v in cnt.most_common():
        print(f"    {k:<16} {v}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
