"""把解析出的 region 画回页面图 —— 出处是否正确的可视验证。

用途：D1 合流时给魏文宇（抽取）和陈家浩（展示）看的证据。
如果框和文字对不上，说明坐标错了，下游的高亮和锚定全都会歪。

用法：
    python tools/verify_evidence.py outputs/附件1通知.parse.json 附件1通知.pdf
"""
from __future__ import annotations

import json
import os
import sys

ROLE_COLORS = {
    "TITLE": (214, 39, 40),      # 红
    "SECTION": (31, 119, 180),   # 蓝
    "BODY": (44, 160, 44),       # 绿
    "HEADER": (255, 127, 14),    # 橙
    "FOOTER": (148, 103, 189),   # 紫
    "FOOTNOTE": (140, 86, 75),
}

# source_type 优先于 role 上色：表格单元格必须与普通正文区分开，
# 否则这张图证明不了"表格定位能力"（评测方点名要确认的那件事）。
TYPE_COLORS = {
    "cell": (199, 21, 133),        # 品红：表格单元格
    "table": (255, 140, 0),        # 深橙：表格内未归入单元格的兜底块
    "scan_region": (128, 128, 128),  # 灰：扫描件区域
    "document": (100, 100, 100),
}


def color_of(block):
    st = block.get("source_type", "paragraph")
    if st in TYPE_COLORS:
        return TYPE_COLORS[st]
    return ROLE_COLORS.get(block.get("role"), (128, 128, 128))


def label_of(block):
    st = block.get("source_type", "paragraph")
    tail = block["block_id"].rsplit("_", 1)[-1]
    if st == "cell":
        ref = block.get("table_ref") or {}
        return f"{tail} {ref.get('cell_id','?')}"
    if st == "table":
        return f"{tail} tbl"
    return tail


def render(pdf_path: str, parse_json: str, out_path: str, dpi: int = 110,
           overview: bool = True):
    import pypdfium2 as pdfium
    from PIL import ImageDraw

    doc = json.load(open(parse_json, encoding="utf-8"))
    src = pdfium.PdfDocument(pdf_path)

    scale = dpi / 72.0
    tiles = []
    for pg in doc["pages"]:
        page = src[pg["page"] - 1]
        img = page.render(scale=scale).to_pil().convert("RGB")
        dr = ImageDraw.Draw(img)
        for b in pg["blocks"]:
            x0, y0, x1, y1 = [v * scale for v in b["region"]]
            color = color_of(b)
            dr.rectangle([x0, y0, x1, y1], outline=color, width=2)
            dr.text((x0 + 2, max(0, y0 - 11)), label_of(b), fill=color)
        tiles.append(img)

    # 分页单独存一份：整图会把 4 页竖排成 5000+ 像素，单页更好看也更好发给别人
    from PIL import Image

    base = os.path.splitext(out_path)[0]
    page_files = []
    for pg, img in zip(doc["pages"], tiles):
        fp = f"{base}_p{pg['page']}.png"
        img.save(fp)
        page_files.append(fp)

    if overview:
        # 总览图：所有页竖排拼一张。页数多时会很长，仓库里可以不出（--no-overview）
        W = max(t.width for t in tiles)
        H = sum(t.height for t in tiles)
        out = Image.new("RGB", (W, H), "white")
        y = 0
        for t in tiles:
            out.paste(t, (0, y))
            y += t.height
        out.save(out_path)
    return out_path, page_files


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    import argparse

    ap = argparse.ArgumentParser(description="把解析出的 region 画回页面图")
    ap.add_argument("parse_json")
    ap.add_argument("pdf")
    ap.add_argument("-o", "--out")
    ap.add_argument("--dpi", type=int, default=110, help="渲染 DPI，越小文件越小（默认 110）")
    ap.add_argument("--no-overview", action="store_true", help="不生成多页拼合的总览图")
    a = ap.parse_args()
    parse_json, pdf_path = a.parse_json, a.pdf
    out = a.out or os.path.splitext(parse_json)[0] + ".evidence.png"

    d = json.load(open(parse_json, encoding="utf-8"))
    n = sum(len(p["blocks"]) for p in d["pages"])
    print(f"doc_id={d['doc']['doc_id']}  页={len(d['pages'])}  块={n}")

    _out, page_files = render(pdf_path, parse_json, out, dpi=a.dpi, overview=not a.no_overview)
    if not a.no_overview and os.path.exists(out):
        print(f"总览图（多页竖排，很长）: {out}  ({os.path.getsize(out)/1024:.0f} KB)")
    print("分页图（建议看这个）:")
    for fp in page_files:
        print(f"  {fp}  ({os.path.getsize(fp)/1024:.0f} KB)")
    print("颜色说明（source_type 优先）:")
    print("  品红=表格单元格(cell)  深橙=表格兜底(table)  灰=扫描区域")
    print("  其余按 role：红=大标题  蓝=章节标题  绿=正文  橙=页眉  紫=页脚")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
