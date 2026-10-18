"""扫描件降级路径。

D4 任务：「增加扫描件识别入口或明确无法读取，**失败降级区域**」。

## 本模块做两件事

1. **OCR 入口**（`try_ocr`）—— 目前明确返回「不可用」，而不是静默失败。
   D5+ 接真实通道时只替换这一个函数，调用方不用改。这样做是为了让
   「尝试识别 → 失败则降级」这条路径**现在就是完整的**，而不是等 OCR 到位才存在。

2. **不可读区域 → 带坐标的降级块**（`source_type="scan_region"`）。
   展示层据此能在页面上把「这块读不了」框出来，而不是只能说「这页读不了」。

## 一个必须说清的语义

`scan_region` 块 **`text_raw` 为空**，这是正确的：它断言的是「这块读不出字」，
本来就没有可引用的原文。所以它：

- **不能**作为 `provenance.quote` 的来源（契约要求 quote 必须非空原文子串）
- **不参与**字符守恒统计（它不认领任何字符，只是标注一段不可读区域）

## 与「稀疏文本页」的区别（实测踩到过）

`equity-change-001` p4 只有 43 个字符（证券代码、日期、署名），被形态判定为 MIXED。
但它**不是扫描件** —— 那些字是可读的，只是太少。早期实现对非 TEXT 页一律丢弃，
把这 43 个字全扔了。

**诚实降级 = 标注读不了的部分，而不是丢弃读得了的部分。** 所以本模块只对
**真正没有文本层、靠图片承载内容**的区域标注降级；稀疏但有字的页面照常解析。
"""
from __future__ import annotations

from typing import Dict, List, Optional, Sequence

# 图片面积占页面比例低于此值的不当"不可读区域"（小图标、装饰线、Logo 水印不算）。
# 扫描页的整页图像面积占比接近 1；页眉的小 Logo 只有千分之几。
MIN_IMAGE_AREA_RATIO = 0.25

# OCR 通道的可用性。D4 只留入口，不接真实引擎 —— 团队计划的完成标准是
# 「扫描样例可失败但必须明确降级，另行统计」，所以此刻返回不可用是符合验收的。
OCR_CHANNEL_ID = "none"


def ocr_available() -> bool:
    """当前有没有可用的 OCR 通道。"""
    return False


def try_ocr(page) -> Optional[str]:
    """尝试识别一页的扫描内容。

    返回 None 表示通道不可用 —— **调用方据此走降级路径，而不是把 None 当成空文本**。
    D5+ 接入真实通道时替换本函数即可（Windows 系统 OCR / rapidocr / 视觉大模型）。
    """
    return None


def unreadable_regions(page) -> List[List[float]]:
    """返回页面上**真正不可读**的区域（[left, top, right, bottom]）。

    判据是「页面内容靠图片承载」，而不是「页面被判定为非 TEXT」：
    后者会把稀疏但有字的落款页也算进来，而那些字是读得出来的。
    """
    pw = float(page.width) or 1.0
    ph = float(page.height) or 1.0
    page_area = pw * ph
    out: List[List[float]] = []
    for img in page.images or []:
        x0, y0, x1, y1 = img["x0"], img["top"], img["x1"], img["bottom"]
        ratio = max(0.0, (x1 - x0)) * max(0.0, (y1 - y0)) / page_area
        if ratio < MIN_IMAGE_AREA_RATIO:
            continue
        out.append([round(x0, 2), round(y0, 2), round(x1, 2), round(y1, 2)])
    return out


def describe(form: str, regions: Sequence[Sequence[float]], n_chars: int, ocr_tried: bool) -> str:
    """写进 `quality.degrade_reasons` 的一句话 —— 必须说清「为什么降级」和「降了什么」。"""
    if regions:
        return (
            f"page form={form}：检出 {len(regions)} 块不可读区域（图片承载内容），"
            f"已产出 source_type=scan_region 的降级块并带坐标；OCR 通道当前不可用"
            f"（{OCR_CHANNEL_ID}），未产出文字"
        )
    if ocr_tried:
        return f"page form={form}：OCR 通道尝试失败，页面无可产出块（已如实降级）"
    return (
        f"page form={form}：该页文本层稀疏（{n_chars} 字符），已按可读部分产出块；"
        f"未检出图片承载的不可读区域，故没有可标注的降级区域"
    )
