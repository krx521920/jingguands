"""逐页文档形态判定：TEXT / SCANNED / MIXED。

**关键设计：逐页判定，不按整份文档判定。**
一份 PDF 常常「前几页有文本层、附页是扫描件」，整份文档级的判定必然导致部分页面解析失败。

判定规则直接照抄项目计划书 4.2 节，四条依次判断：
  1) text_chars >= 80 且 text_area_r >= 0.02                      → TEXT
  2) text_chars <  20 且 img_area_r >= 0.5 且 ink_ratio >= 0.01   → SCANNED
  3) text_chars >= 20 但 text_area_r < 0.02 且 img_area_r >= 0.3  → SCANNED（文本层是水印/页眉）
  4) 其余                                                          → MIXED

命中哪条规则会写进 form_evidence.rule，这样 D11 首测出错时能立刻定位到判据，
而不是只看到一个结论。
"""
from __future__ import annotations

from typing import Dict, List, Optional, Tuple

from . import evidence as ev

# 判定阈值（计划书 4.2 节）
TEXT_CHARS_MIN = 80
TEXT_AREA_R_MIN = 0.02
SCANNED_CHARS_MAX = 20
IMG_AREA_R_MIN = 0.5
INK_RATIO_MIN = 0.01
WATERMARK_IMG_AREA_R_MIN = 0.3


def ink_ratio(pdfium_doc, page_index: int, dpi: int = 100, threshold: int = 200) -> Optional[float]:
    """渲染页面后估算前景（墨迹）像素占比。

    只在需要区分 SCANNED / MIXED 时才调用——它要渲染页面，比较慢；
    纯文本页不付这个代价。取不到就返回 None，**不编造数值**。
    """
    try:
        import pypdfium2 as pdfium

        page = pdfium_doc[page_index]
        img = page.render(scale=dpi / 72).to_pil().convert("L")
        # 缩到宽 400 以内再统计，速度够快且判定精度足够
        w = min(img.width, 400) or 1
        h = max(1, int(img.height * w / max(1, img.width)))
        small = img.resize((w, h))
        px = small.load()
        dark = 0
        for y in range(h):
            for x in range(w):
                if px[x, y] < threshold:
                    dark += 1
        return round(dark / max(1, w * h), 4)
    except Exception:
        return None


def judge_page(page, pdfium_doc=None, page_index: int = 0) -> Tuple[str, Dict]:
    """判定单页形态，返回 (form, form_evidence)。"""
    width, height = float(page.width), float(page.height)

    chars = page.chars or []
    text_chars = len(chars)
    text_area_r = ev.area_ratio(
        [[c["x0"], c["top"], c["x1"], c["bottom"]] for c in chars], width, height
    )
    img_area_r = ev.area_ratio(
        [[im["x0"], im["top"], im["x1"], im["bottom"]] for im in (page.images or [])],
        width, height,
    )

    evid = {
        "text_chars": text_chars,
        "text_area_ratio": round(text_area_r, 4),
        "image_area_ratio": round(img_area_r, 4),
        "ink_ratio": None,
        "rule": None,
        "thresholds": {
            "text_chars_min": TEXT_CHARS_MIN,
            "text_area_ratio_min": TEXT_AREA_R_MIN,
            "scanned_chars_max": SCANNED_CHARS_MAX,
            "image_area_ratio_min": IMG_AREA_R_MIN,
            "watermark_image_area_ratio_min": WATERMARK_IMG_AREA_R_MIN,
            "ink_ratio_min": INK_RATIO_MIN,
        },
    }

    # 规则 1：成片的文本层
    if text_chars >= TEXT_CHARS_MIN and text_area_r >= TEXT_AREA_R_MIN:
        evid["rule"] = "R1_text_layer"
        return ev.FORM_TEXT, evid

    # 规则 2：几乎无文本 + 大图 → 扫描件（需 ink_ratio 佐证）
    if text_chars < SCANNED_CHARS_MAX and img_area_r >= IMG_AREA_R_MIN:
        ir = ink_ratio(pdfium_doc, page_index) if pdfium_doc is not None else None
        evid["ink_ratio"] = ir
        if ir is None or ir >= INK_RATIO_MIN:
            evid["rule"] = "R2_no_text_big_image_ink"
            return ev.FORM_SCANNED, evid
        evid["rule"] = "R2_rejected_blank_image"
        return ev.FORM_MIXED, evid

    # 规则 3：有零星文本但不成片（水印/页眉）+ 大图 → 扫描件
    if text_chars >= SCANNED_CHARS_MAX and text_area_r < TEXT_AREA_R_MIN and img_area_r >= WATERMARK_IMG_AREA_R_MIN:
        evid["rule"] = "R3_watermark_text_big_image"
        return ev.FORM_SCANNED, evid

    # 规则 4：其余都算混合，两条通道都跑
    evid["rule"] = "R4_fallback_mixed"
    return ev.FORM_MIXED, evid


def judge_document(pdf, pdfium_doc=None) -> List[Dict]:
    """逐页判定，返回每页的 {page, form, evidence}。"""
    out = []
    for i, page in enumerate(pdf.pages):
        form, evid = judge_page(page, pdfium_doc=pdfium_doc, page_index=i)
        out.append({"page": i + 1, "form": form, "evidence": evid})
    return out
