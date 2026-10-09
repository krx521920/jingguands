#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""把demo/screenshots/*.png 合成为一份带图注的 PDF 演示图集（陈家浩 · 2026-10-06）

依赖：Pillow（已装）。字体优先微软雅黑/黑体，找不到回退 PIL 默认位图字体。
输出：demo/D10演示图集.pdf（A4 横向，每屏一页 + 标题 + 图注 + 页码）
"""
import glob
import json
import os

from PIL import Image, ImageDraw, ImageFont, features

# 本机 PIL 的插件注册表是懒加载的，save() 前必须 init()，否则报 KeyError: 'JPEG'
if "JPEG" not in Image.SAVE:
    Image.init()

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, "screenshots")
OUT_PDF = os.path.join(HERE, "D10演示图集.pdf")

# A4 横向 300dpi
PAGE_W, PAGE_H = 3508, 2480
MARGIN = 110
BG = (255, 255, 255)
INK = (24, 32, 44)
SUB = (86, 100, 118)
LINE = (206, 214, 224)
ACCENT = (0, 102, 204)

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
    r"C:\Windows\Fonts\simsun.ttc",
    r"C:\Windows\Fonts\arial.ttf",
]


def load_font(size, bold=False):
    for path in ([FONT_CANDIDATES[1]] if bold else []) + FONT_CANDIDATES:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


def wrap_cn(draw, text, font, max_w):
    """按像素宽度换行，兼容中英混排（英文按空格断词）。"""
    lines, cur = [], ""
    for ch in text:
        if ch == "\n":
            lines.append(cur)
            cur = ""
            continue
        trial = cur + ch
        if draw.textlength(trial, font=font) > max_w and cur:
            # 英文回退到最后一个空格，避免词中间断开
            if ch.isascii() and ch != " " and " " in cur.strip():
                cut = cur.rfind(" ")
                if cut > 0 and len(cur) - cut < 24:
                    lines.append(cur[:cut])
                    cur = cur[cut + 1:] + ch
                    continue
            lines.append(cur)
            cur = ch
        else:
            cur = trial
    if cur:
        lines.append(cur)
    return lines


def main():
    man_path = os.path.join(SHOTS, "manifest.json")
    if not os.path.exists(man_path):
        raise SystemExit("缺manifest.json，请先跑 demo/_capture.py")
    with open(man_path, encoding="utf-8") as f:
        man = json.load(f)

    f_title = load_font(96, bold=True)
    f_sub = load_font(46)
    f_body = load_font(38)
    f_cap = load_font(34)
    f_pageno = load_font(30)

    scenes = [s for s in man["scenes"] if os.path.exists(os.path.join(SHOTS, s["file"]))]
    pages = []

    # ---------- 封面 ----------
    cv = Image.new("RGB", (PAGE_W, PAGE_H), BG)
    d = ImageDraw.Draw(cv)
    d.rectangle([0, 0, PAGE_W, 18], fill=ACCENT)
    y = 760
    for line in ["D10 多公告集成", "演示图集与口径说明"]:
        d.text((MARGIN + 60, y), line, font=f_title, fill=INK)
        y += 150
    d.text((MARGIN + 60, y + 30), "公告事件提取与核验 · 展示层（workspace/cjh/page_prototype）",
           font=f_sub, fill=SUB)
    y += 160
    meta = [
        "截图时间：%s" % man.get("captured_at", "-"),
        "页面来源：%s（本地零依赖服务器，四视图互斥切换）" % man.get("base", "-"),
        "图集页数：%d 屏（每屏一页，含图注）" % (len(scenes) + 1),
        "覆盖演示：单文档三栏 / D5 股权变动 / D8 跨文档配对 / D9 核验清单 /",
        "D10 多公告集成（缓存三态 · 10 组案例 · 方报告五段 · 出处链）",
    ]
    for m in meta:
        for ln in wrap_cn(d, m, f_body, PAGE_W - 2 * MARGIN - 120):
            d.text((MARGIN + 60, y), ln, font=f_body, fill=SUB)
            y += 56
    y += 60
    d.rectangle([MARGIN + 60, y, MARGIN + 66, y + 210], fill=ACCENT)
    for ln in ["三条不单方调和的口径，已如实上屏：",
               "① 方标 requires_review 6/10 组 vs 宗 --strict 10/10 PASS（后者只校验必填完整性）",
               "② Web/CLI 一致性两套口径：魏给 true（同文件消费） vs 方边界声明「未在本次独立验证」",
               "③ 互证计数三处不同：宗预期 9 / 魏实判 10 / 方规则级 items 中 corroboration 类 3 条"]:
        for l2 in wrap_cn(d, ln, f_cap, PAGE_W - 2 * MARGIN - 200):
            d.text((MARGIN + 90, y), l2, font=f_cap, fill=INK)
            y += 48
        y += 8
    d.text((MARGIN + 60, PAGE_H - 160), "陈家浩 · 2026-10-06", font=f_cap, fill=SUB)
    pages.append(cv)

    # ---------- 每屏一页 ----------
    for i, s in enumerate(scenes, start=1):
        im = Image.open(os.path.join(SHOTS, s["file"])).convert("RGB")
        pv = Image.new("RGB", (PAGE_W, PAGE_H), BG)
        pd = ImageDraw.Draw(pv)
        pd.rectangle([0, 0, PAGE_W, 12], fill=ACCENT)

        # 页眉
        head_h = 200
        pd.text((MARGIN, 60), "%02d· %s" % (i, s["title"]), font=f_sub, fill=INK)
        pd.text((PAGE_W - MARGIN - 460, 78),
                "%s · %s" % (s["file"], s.get("viewport", "")),
                font=f_cap, fill=SUB)
        pd.line([MARGIN, head_h - 14, PAGE_W - MARGIN, head_h - 14], fill=LINE, width=3)

        # 图片按可用区域等比缩放
        avail_w = PAGE_W - 2 * MARGIN
        avail_h = PAGE_H - head_h - 250
        ratio = min(avail_w / im.width, avail_h / im.height)
        nw, nh = int(im.width * ratio), int(im.height * ratio)
        im2 = im.resize((nw, nh), Image.LANCZOS)
        px = (PAGE_W - nw) // 2
        py = head_h + (avail_h - nh) // 2
        pv.paste(im2, (px, py))
        pd.rectangle([px - 2, py - 2, px + nw + 1, py + nh + 1], outline=LINE, width=2)

        # 图注
        cy = head_h + avail_h + 34
        pd.line([MARGIN, cy - 16, PAGE_W - MARGIN, cy - 16], fill=LINE, width=2)
        notes = NOTE_BY_FILE.get(s["file"], [])
        for ln in notes[:4]:
            for l2 in wrap_cn(pd, "· " + ln, f_cap, PAGE_W - 2 * MARGIN - 260):
                pd.text((MARGIN, cy), l2, font=f_cap, fill=INK)
                cy += 44
            cy += 4
        pd.text((PAGE_W - MARGIN - 200, PAGE_H - 120), "%d / %d" % (i, len(scenes)),
                font=f_pageno, fill=SUB)
        pages.append(pv)

    pages[0].save(OUT_PDF, save_all=True, append_images=pages[1:], resolution=300.0)
    print("PDF 已生成：%s（%d 页，%.1f MB）"
          % (OUT_PDF, len(pages), os.path.getsize(OUT_PDF) / 1048576.0))


# 逐屏图注（与 demo/使用演示.md 的演示 13/14/15 对应）
NOTE_BY_FILE = {
    "00_main_three_column.png": [
        "四视图互斥切换入口在顶栏右侧：核验清单 D9 / 跨文档配对 D8 / 多公告集成 D10。",
        "左栏上传与数据集选择、中栏抽取结果、右栏证据；结果与证据逐条可点进原信���片段。",
        "顶部横幅提示当前为模拟数据且含机构接口返回，不计入真实成绩。",
    ],
    "01_equity_change_real.png": [
        "真实批次 D5-EQC-001：增持方向徽章、前后股数与前后比例并排、denominator 口径提示。",
        "接入方冲突码 DIRECTION_MISMATCH / RATIO_DIRECTION_CONFLICT，冲突项以警示条单独提示。",
        "证据展开可验：每字段带出处 block / 页 / 区域 / 原文片段。",
    ],
    "02_pairs_d8.png": [
        "13 组跨文档配对：双栏成员对比，双侧 issuer_code / notice_number / 哈希与本地原文锚点并排。",
        "三态徽章严格区分：related「同事件互证」绿 / unrelated「不同事件」灰 / unknown「证据不足·无法判定」黄。",
        "D8-PAIR-013（unknown）渲染为「证据不足」，绝不归入「不同事件」——这是 D8 质疑②的修复点。",
    ],
    "03_verify_d9.png": [
        "核验清单视图：每条发现先归因（方的 message 加粗在前）后给判定码，避免把判定当事实。",
        "双侧证据行：互证点 A|B 引文并排；合计勾稽形态以分项 chip 之和对照合计。",
        "方 sidecar 发现聚合 + 张 provenance 出处富化 + 魏 B consistency.corroborations 整条透传。",
    ],
    "04_integration_top_cache.png": [
        "D10 顶部汇总：10 组案例（宗 10 组）· 三态分布 related 2 / unrelated 6 / unknown 2 · 预期一致 9/10。",
        "方报告面板显式标注需人工复核 6/10 组（003/006/007/008/009/010），与宗 --strict 10/10 PASS 并列。",
        "缓存一致性三态面板：冷启动 0 命中/31 未命中 → 缓存重放 31/0（3.6 秒）→ 清缓存重跑 0/31，gold 437/437。",
    ],
    "05b_provenance_chain.png": [
        "出处链面板（张）：四段检查（文件哈希 / doc_id 派生 / 页码区域 / 原文片段）+ 同名串证据风险量化。",
        "重复文字组内块 2,009（EQC-002 最重 484 块 / 116 跨页组）——同名串必须带 block_id，这是 D7 弱锚定的量化依据。",
        "覆盖缺口 3 条如实上屏（张侧本地无解析包），属覆盖不全而非链检不通过，缺口成员不代填。",
    ],
    "06_case_006_unknown.png": [
        "D10-INT-006 扫描降级参与：判黄「证据不足·无法判定」——unknown 不进矛盾比较，不与 related/unrelated 混算。",
        "成员级链检徽章：五段全过显示 ✔哈希 ✔doc_id ✔页码 ✔区域 ✔原文；缺口成员则显示「本次不做链检（如实留空，不代填）」。",
        "缓存三项徽章与方报告五段折叠区在每组卡片底部一致呈现。",
    ],
    "07_case_001.png": [
        "D10-INT-001 科创新材三份同事件互证：预期 related + 互证9 + 合计勾稽，与实判「同事件互证」一致 ✔。",
        "必填七项徽章全绿：input_sha256[] / run_id / code_version / schema_version / records / diff_list / report{...}。",
        "成员逐条列出 run_id、事件数、缓存命中徽章与「真实」标记（is_mock=false），证明非模拟数据。",
    ],
    "08_case_003_006_010.png": [
        "D10-INT-003 鸿路钢构：同公司且同持股数 249,519,764，仍判灰「不同事件」——同主体不等于同事件。",
        "紧随其后的 004 质押触发跨类型 / 005 同类型零误报基线，均为 related→unrelated 的一致判定。",
        "黄色提示行区分两件事：「出处链覆盖缺口：该成员本地无解析包」属覆盖不全，不等于链检不通过。",
    ],
    "09_fang_report_five_sections.png": [
        "方报告五段：差异明细 7 条（双侧取值并排，如 shares_after 11,042,217 vs 11,042,217）+ 计算 2 条 + 边界 3 条。",
        "计算段可现场勾稽：3,680,700 + 2,975,600 + 430,000 + 1,341,600 = 8,427,900 shares，两条规则互为交叉验证。",
        "逐成员缓存核对三项徽章 + 链路 trace（model_called=false / input_mutated=false，未调模型、未改输入）。",
    ],
    "10_caliber_statement.png": [
        "口径声明上屏：徽章列为页面为便于比对而做的三态词映射，原文一并显示，映射不替代原文。",
        "预期未含三态词者显示「—（不可验）」，不计入不一致；张侧链检 ✘ 仅表示该成员本地无解析包。",
        "结论：页面如实呈现四方交付物，口径冲突并列显示而不做单方调和，待合流会裁决。",
    ],
}


if __name__ == "__main__":
    main()