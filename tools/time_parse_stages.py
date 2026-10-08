#!/usr/bin/env python3
"""解析阶段耗时表（D12 交付物）。

## 为什么需要它

D12 的性能目标是「3 份 20 页文本公告各 ≤90 秒」。
那条目标是**端到端**的，而端到端里包含模型调用。**解析阶段占多少**必须单独量出来，
否则无法判断瓶颈在哪、也无法在超时时判断该优化谁。

本工具把解析拆成阶段逐项计时，并给出**解析占端到端预算的比例**。

## 阶段划分

| 阶段 | 做什么 |
| --- | --- |
| `open` | 打开 PDF、逐页取字符/线/图 |
| `form` | 每页形态判定（TEXT / SCANNED / MIXED） |
| `tables` | 表格检测 + 单元格切分 + 漏检列补出 |
| `text_layer` | 单元格归属、多层表头、分栏、段落聚类、块产出 |
| `link` | 跨页续表标注 |
| `serialize` | 组装 evidence 文档并写盘 |

用法：
    python tools/time_parse_stages.py sample/D4/raw sample/D5/raw sample/D6/raw -o sample/D12/stage_timing.json
"""
from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))


def time_one(pdf_path: str) -> dict:
    from finstruct.parse import doc_form, evidence as ev, scan, table_detect as td
    from finstruct.parse import table_link as tlk, text_layer as tl

    t = {}
    t0 = time.perf_counter()
    import pdfplumber

    with pdfplumber.open(pdf_path) as pdf:
        raw_pages = list(pdf.pages)
        t["open"] = time.perf_counter() - t0

        t1 = time.perf_counter()
        import hashlib
        doc_id = ev.make_doc_id(hashlib.sha256(open(pdf_path, "rb").read()).hexdigest())
        forms = [doc_form.judge_page(p) for p in raw_pages]
        t["form"] = time.perf_counter() - t1

        # tables / text_layer / link 逐页累加（它们是逐页调用的）
        tt = tl_time = lk_time = 0.0
        pages_out = []
        for i, page in enumerate(raw_pages):
            pno = i + 1
            s = time.perf_counter()
            tables = td.detect_tables(doc_id, pno, page)
            tt += time.perf_counter() - s

            s = time.perf_counter()
            form, form_ev = forms[i]          # judge_page 返回 (form, evidence)
            if form == ev.FORM_TEXT:
                pg = tl.parse_page_text_layer(doc_id, pno, page)
            else:
                regions = scan.unreadable_regions(page)
                pg = tl.parse_page_text_layer(doc_id, pno, page, form=form,
                                              unreadable_regions=regions)
            pg["form_evidence"] = form_ev
            tl_time += time.perf_counter() - s
            pages_out.append((pg, tables, page))

        t["tables"] = tt
        t["text_layer"] = tl_time

        s = time.perf_counter()
        pages = [p for p, _t, _pg in pages_out]
        _ = tlk.link_continued_tables(pages)
        t["link"] = time.perf_counter() - s

        s = time.perf_counter()
        json.dumps({"pages": pages}, ensure_ascii=False)
        t["serialize"] = time.perf_counter() - s

        total = sum(t.values())
        t["total"] = total
        t["pages"] = len(raw_pages)
        t["ms_per_page"] = round(total * 1000 / max(1, len(raw_pages)), 2)
        for k in list(t):
            if k.endswith("_per_page") or k in ("pages", "total"):
                continue
            t[k + "_ms"] = round(t.pop(k) * 1000, 2)
        t["total_ms"] = round(total * 1000, 2)
    return t


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("dirs", nargs="+")
    ap.add_argument("-o", "--out", required=True)
    a = ap.parse_args()

    rows = []
    for d in a.dirs:
        for f in sorted(os.listdir(d)):
            if not f.endswith(".pdf"):
                continue
            p = os.path.join(d, f)
            r = time_one(p)
            r["file"] = f
            rows.append(r)
            print(f"  {f:<24} {r['pages']:>3}页 {r['total_ms']:>8.1f}ms  "
                  f"(表 {r['tables_ms']:.0f} / 文本层 {r['text_layer_ms']:.0f})")

    stages = ("open_ms", "form_ms", "tables_ms", "text_layer_ms", "link_ms", "serialize_ms")
    summary = {}
    for s in stages:
        vals = [r[s] for r in rows]
        summary[s.replace("_ms", "")] = {
            "sum_ms": round(sum(vals), 2),
            "median_ms": round(statistics.median(vals), 2),
            "max_ms": round(max(vals), 2),
            "pct_of_total": round(100 * sum(vals) / max(1e-9, sum(r["total_ms"] for r in rows)), 2),
        }
    tot = [r["total_ms"] for r in rows]
    out = {
        "built_by": "张智博", "day": "D12", "date": "2026-10-07",
        "purpose": "解析阶段耗时表：给端到端 ≤90s 目标定位瓶颈归属",
        "note": ("解析是纯本地计算、无模型调用。本表用于判断解析在端到端预算中的占比；"
                 "若占比很小，则 ≤90s 的瓶颈不在解析侧。"),
        "documents": len(rows), "pages_total": sum(r["pages"] for r in rows),
        "summary": summary,
        "totals": {
            "sum_ms": round(sum(tot), 2),
            "median_ms": round(statistics.median(tot), 2),
            "max_ms": round(max(tot), 2),
            "ms_per_page_median": round(statistics.median([r["ms_per_page"] for r in rows]), 2),
        },
        "per_document": rows,
    }
    json.dump(out, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"\n{a.out}: {len(rows)} 份 / {out['pages_total']} 页")
    print(f"  解析总耗时 中位 {out['totals']['median_ms']:.0f}ms  最大 {out['totals']['max_ms']:.0f}ms  "
          f"每页中位 {out['totals']['ms_per_page_median']:.1f}ms")
    for s, v in summary.items():
        print(f"    {s:<12} {v['pct_of_total']:>5.1f}%  中位 {v['median_ms']:>7.1f}ms  最大 {v['max_ms']:>7.1f}ms")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
