#!/usr/bin/env python3
"""故障降级示例（D14 交付物）。

跑三种「解析会降级」的输入，把**降级前后到底发生了什么**打印成人能看懂的样子：
输出什么、丢了什么、消费方该怎么办。

这不是测试（测试在 tests/），是**给人看的演示**：现场答辩时按顺序跑一遍即可。

用法：
    python tools/demo_degrade.py            # 跑全部三例
    python tools/demo_degrade.py scan       # 只跑扫描页
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = os.path.join(ROOT, "tests", "fixtures")

CASES = {
    "scan": (os.path.join(FIX, "scanned_synthetic.pdf"),
             "扫描页：整页无字符、图片承载内容",
             "页级降级 → 1 个 scan_region 块"),
    "borderless": (os.path.join(FIX, "borderless_table.pdf"),
                   "无框表格：纯文本对齐、无边框线",
                   "表格检不出 → 内容进正文流，列语义丢失"),
    # 注意：这份 fixture 是 **5 页**（4 页文本 + 第 5 页整页扫描），
    # 属**文档级混合、按页降级**，不是"区域级降级"。
    # 我手上**没有能触发区域级降级的 fixture** —— 演示里不假装有。
    "mixed": (os.path.join(FIX, "mixed_synthetic.pdf"),
              "混合文档：4 页正文正常 + 第 5 页整页扫描",
              "文档级混合 → 只有扫描页整页降级，正文页不受影响"),
}


def show(name: str) -> int:
    path, what, how = CASES[name]
    if not os.path.exists(path):
        print(f"  ✗ 缺 fixture：{path}")
        return 1
    from finstruct.parse import parse_pdf as pp
    import io
    import contextlib
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        doc = pp.parse_pdf(path)

    print(f"\n{'='*72}\n【{name}】{what}\n{'='*72}")
    print(f"  预期降级方式：{how}\n")
    total_chars = 0
    for pg in doc["pages"]:
        ntab = len(pg.get("tables") or [])
        types = {}
        for b in pg["blocks"]:
            types[b["source_type"]] = types.get(b["source_type"], 0) + 1
            total_chars += len(b.get("text_raw") or "")
        print(f"  p{pg['page']}  form={pg.get('form')}  表 {ntab} 张  块 {len(pg['blocks'])} 个  {types}")
        for b in pg["blocks"]:
            st = b["source_type"]
            reg = b.get("region")
            reg_s = f"[{reg[0]:.0f},{reg[1]:.0f},{reg[2]:.0f},{reg[3]:.0f}]" if reg else "—"
            t = b.get("text_raw") or ""
            if st == "scan_region":
                print(f"      {st:<12} {reg_s:<26} text_raw=**空**（设计如此：它断言这块读不出字）")
                print(f"                    degraded={b.get('degraded')} "
                      f"missing_reason={b.get('missing_reason')}")
            else:
                print(f"      {st:<12} {reg_s:<26} {t[:46]!r}")
    print(f"\n  ── 消费方该怎么做 ──")
    if name == "scan":
        print("     该页所有字段 → insufficient（证据不足），**不得据空缺下任何结论**")
        print("     scan_region 的 text_raw 为空是设计如此，**不能作为 provenance.quote 的来源**")
    elif name == "borderless":
        print("     内容**没丢**（字符守恒 100%），但**没有 cell 块、没有 header_path**")
        print("     靠列名定位的字段（金额/比例/股数）**取数依据退化** → 标证据不足，不得判矛盾")
    else:
        print("     正文页正常，只有扫描页整页降级为 insufficient")
        print("     **区域级降级（页内局部不可读）本演示未覆盖** ——")
        print("     我手上没有能触发它的 fixture，不假装演示过")
    print(f"     全文可引用字符数：{total_chars}")
    return 0


def main() -> int:
    which = sys.argv[1:] or list(CASES)
    rc = 0
    for n in which:
        if n not in CASES:
            print(f"  未知：{n}（可选 {list(CASES)}）")
            rc = 1
            continue
        rc |= show(n)
    print(f"\n{'='*72}")
    print("  三例的共同点：**内容不丢，信息量降级** ——")
    print("  降级不是失败，是把「我读不出/我读不准」如实标出来，而不是编一个值。")
    print(f"{'='*72}")
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
