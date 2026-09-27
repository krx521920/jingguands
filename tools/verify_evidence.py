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


def render(pdf_path: str, parse_json: str, out_path: str, dpi: int = 110) -> str:
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
            color = ROLE_COLORS.get(b["role"], (128, 128, 128))
            dr.rectangle([x0, y0, x1, y1], outline=color, width=2)
            dr.text((x0 + 2, max(0, y0 - 11)), b["block_id"][-9:], fill=color)
        tiles.append(img)

    # 分页单独存一份：整图会把 4 页竖排成 5000+ 像素，单页更好看也更好发给别人
    from PIL import Image

    base = os.path.splitext(out_path)[0]
    page_files = []
    for pg, img in zip(doc["pages"], tiles):
        fp = f"{base}_p{pg['page']}.png"
        img.save(fp)
        page_files.append(fp)

    # 再拼一张总览，方便一眼看完
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
    parse_json, pdf_path = sys.argv[1], sys.argv[2]
    out = sys.argv[3] if len(sys.argv) > 3 else os.path.splitext(parse_json)[0] + ".evidence.png"

    d = json.load(open(parse_json, encoding="utf-8"))
    n = sum(len(p["blocks"]) for p in d["pages"])
    print(f"doc_id={d['doc']['doc_id']}  页={len(d['pages'])}  块={n}")

    _out, page_files = render(pdf_path, parse_json, out)
    print(f"总览图（4 页竖排，很长）: {out}  ({os.path.getsize(out)/1024:.0f} KB)")
    print("分页图（建议看这个）:")
    for fp in page_files:
        print(f"  {fp}  ({os.path.getsize(fp)/1024:.0f} KB)")
    print("颜色说明: 红=大标题 蓝=章节标题 绿=正文 橙=页眉 紫=页脚")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
