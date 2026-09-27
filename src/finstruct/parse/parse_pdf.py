"""解析入口：把一份 PDF 变成带出处的解析 JSON。

用法：
    python -m finstruct.parse.parse_pdf <输入.pdf> -o <输出.json>

D1 交付物就是这个：**解析 JSON 样例 + 出处结构**。
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone, timedelta

from . import evidence as ev
from . import doc_form as df
from . import text_layer as tl


def parse_pdf(pdf_path: str, on_progress=None) -> dict:
    """解析一份 PDF，返回符合 evidence 结构的字典。

    当前只走文本层通道；SCANNED / MIXED 页面会被**如实标注**并降级，
    而不是假装解析成功（团队规则：能读则带出处，不能读则明确降级）。
    """
    import pdfplumber

    sha = ev.file_sha256(pdf_path)
    doc_id = ev.make_doc_id(sha)
    file_size = os.path.getsize(pdf_path)

    pdfium_doc = None
    try:
        import pypdfium2 as pdfium

        pdfium_doc = pdfium.PdfDocument(pdf_path)
    except Exception:
        pdfium_doc = None

    pages = []
    reading_order = []
    warnings = []
    degraded = False
    degrade_reasons = []

    with pdfplumber.open(pdf_path) as pdf:
        forms = df.judge_document(pdf, pdfium_doc=pdfium_doc)
        for i, page in enumerate(pdf.pages):
            page_no = i + 1
            form = forms[i]["form"]
            form_evid = forms[i]["evidence"]

            if form == ev.FORM_TEXT:
                pg = tl.parse_page_text_layer(doc_id, page_no, page)
                pg["form_evidence"] = form_evid
            else:
                # 非文本层：D1 只做降级标注，OCR 通道是 D4 的工作
                pg = ev.make_page(
                    page=page_no,
                    form=form,
                    width=float(page.width),
                    height=float(page.height),
                    form_evidence=form_evid,
                    blocks=[],
                    tables=[],
                )
                degraded = True
                degrade_reasons.append(
                    f"page {page_no}: form={form}，D1 仅实现文本层，该页未产出块（需 OCR 通道）"
                )
                warnings.append(f"page {page_no} 为 {form}，无出处产出")

            for b in pg["blocks"]:
                reading_order.append(b["block_id"])
            pages.append(pg)

            if on_progress:
                on_progress(page_no, len(pdf.pages), form, len(pg["blocks"]))

    parsed_at = datetime.now(timezone(timedelta(hours=8))).isoformat(timespec="seconds")

    doc = ev.make_document(
        file_name=os.path.basename(pdf_path),
        sha=sha,
        page_count=len(pages),
        pages=pages,
        reading_order=reading_order,
        parsed_at=parsed_at,
        file_size=file_size,
        quality={
            "degraded": degraded,
            "degrade_reasons": degrade_reasons,
            "warnings": warnings,
        },
    )
    return doc


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="解析 PDF 并输出带出处的 JSON")
    ap.add_argument("pdf", help="输入 PDF 路径")
    ap.add_argument("-o", "--out", help="输出 JSON 路径（默认与输入同名 .parse.json）")
    ap.add_argument("--indent", type=int, default=2, help="JSON 缩进，0 表示紧凑")
    args = ap.parse_args(argv)

    out = args.out or os.path.splitext(args.pdf)[0] + ".parse.json"

    def prog(pno, total, form, nblocks):
        print(f"  p{pno}/{total}  form={form:<7} blocks={nblocks}", file=sys.stderr)

    doc = parse_pdf(args.pdf, on_progress=prog)

    check = ev.self_check(doc)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=(args.indent or None))

    d = doc["doc"]
    n_blocks = sum(len(p["blocks"]) for p in doc["pages"])
    print(f"\n文件      : {d['file_name']}")
    print(f"doc_id    : {d['doc_id']}   (由内容哈希派生，不用文件名)")
    print(f"sha256    : {d['file_sha256'][:16]}…")
    print(f"页数      : {d['page_count']}   形态: {[p['form'] for p in doc['pages']]}")
    print(f"文本块    : {n_blocks}")
    print(f"自检      : {'通过 ✓' if check['ok'] else '失败 ✗'}")
    for e in check["errors"][:10]:
        print(f"            - {e}")
    print(f"输出      : {out}")
    return 0 if check["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
