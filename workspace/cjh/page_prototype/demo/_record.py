#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""D10 演示操作视频录制（陈家浩 · 2026-10-06）

按演示路线驱动页面（单文档 → D8 配对 → D9 核验 → D10 集成 → 缓存三态 →
方报告面板 → 出处链 → 案例 001/003/006 → 展开方报告五段 → 口径声明），
Playwright 录成 webm，再用 ffmpeg 转 mp4（H.264 + yuv420p）。

用法：python demo/_record.py
输出：demo/D10演示操作.mp4（中间件 demo/video/D10演示操作.webm）
"""
import os
import glob
import shutil
import subprocess
import sys

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
VID_DIR = os.path.join(HERE, "video")
BASE = os.environ.get("DEMO_BASE", "http://127.0.0.1:8643")
FFMPEG = shutil.which("ffmpeg") or r"C:\Users\cjh05\AppData\Local\Microsoft\WinGet\Links\ffmpeg.exe"


def scroll_to_text(pg, txt, block="center"):
    return pg.evaluate(
        """([txt, block]) => {
            const all = [...document.querySelectorAll('body *')]
                .filter(e => e.textContent.includes(txt) && e.offsetParent !== null);
            if (!all.length) return false;
            const deepest = all.filter(e => !all.some(o => o !== e && e.contains(o)));
            (deepest[0] || all[all.length - 1]).scrollIntoView({block});
            return true;
        }""",
        [txt, block],
    )


def scroll_to_case(pg, cid):
    return pg.evaluate(
        """(cid) => {
            const t = [...document.querySelectorAll('.pair-title')]
                .find(e => e.textContent.includes(cid));
            if (!t) return false;
            (t.closest('.pair-card') || t).scrollIntoView({block: 'start'});
            return true;
        }""",
        cid,
    )


def build_steps(pg):
    """返回 [(说明, 执行函数)] —— 全部在 Python 侧驱动 Playwright API。"""
    return [
        ("开场：单文档三栏（上传 / 抽取结果 / 证据）", lambda: pg.wait_for_timeout(2800)),

        ("真实批次 D5-EQC-001：方向徽章 + 前后股数/比例并排", lambda: (
            pg.select_option("#datasetSel", "wei_real_eqc_001"),
            pg.click("#loadBtn"),
            pg.wait_for_timeout(3200))),

        ("切到跨文档配对 D8（13 组三态）", lambda: (
            pg.click("#pairsBtn"), pg.wait_for_timeout(4000))),

        ("配对列表：上半部分", lambda: (pg.mouse.wheel(0, 1000), pg.wait_for_timeout(2200))),
        ("配对列表：下半部分", lambda: (pg.mouse.wheel(0, 1000), pg.wait_for_timeout(2400))),

        ("切到核验清单 D9（先归因后判矛盾）", lambda: (
            pg.click("#pairsBtn"), pg.wait_for_timeout(1000),
            pg.click("#verifyBtn"), pg.wait_for_timeout(4000))),

        ("核验清单：双侧证据与合计勾稽", lambda: (pg.mouse.wheel(0, 1200), pg.wait_for_timeout(2600))),

        ("切到多公告集成 D10（顶部汇总 + 缓存三态）", lambda: (
            pg.click("#verifyBtn"), pg.wait_for_timeout(1000),
            pg.click("#integrationBtn"), pg.wait_for_timeout(4600))),

        ("D10：方报告面板（需人工复核 6/10 组）",
         lambda: (scroll_to_text(pg, "方 D10 核验报告"), pg.wait_for_timeout(2600))),

        ("D10：出处链面板（重复文字组内块 2,009）",
         lambda: (scroll_to_text(pg, "出处链检查"), pg.wait_for_timeout(2800))),

        ("D10：案例 001 科创新材（同事件互证，预期=实判）",
         lambda: (scroll_to_case(pg, "D10-INT-001"), pg.wait_for_timeout(2800))),

        ("D10：案例 003 鸿路钢构（同公司同股数仍判不同事件）",
         lambda: (scroll_to_case(pg, "D10-INT-003"), pg.wait_for_timeout(3000))),

        ("D10：案例 006 扫描降级（证据不足·无法判定）",
         lambda: (scroll_to_case(pg, "D10-INT-006"), pg.wait_for_timeout(3000))),

        ("D10：展开全部 10 组方报告五段", lambda: (
            pg.evaluate("() => { document.querySelectorAll('details').forEach(d => d.open = true); }"),
            pg.wait_for_timeout(1600))),

        ("D10：计算段现场勾稽 = 8,427,900 shares",
         lambda: (scroll_to_text(pg, "share_sum"), pg.wait_for_timeout(3400))),

        ("D10：口径声明（三条不单方调和的口径）",
         lambda: (scroll_to_text(pg, "口径声明"), pg.wait_for_timeout(3600))),

        ("收尾：返回单文档视图", lambda: (
            pg.click("#integrationBtn"), pg.wait_for_timeout(2800))),
    ]


def main():
    os.makedirs(VID_DIR, exist_ok=True)
    webm = os.path.join(VID_DIR, "D10演示操作.webm")
    mp4 = os.path.join(HERE, "D10演示操作.mp4")
    for f in (webm, mp4):
        if os.path.exists(f):
            os.remove(f)

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
                  "--autoplay-policy=no-user-gesture-required"],
        )
        ctx = browser.new_context(
            viewport={"width": 1600, "height": 900},
            record_video_dir=VID_DIR,
            record_video_size={"width": 1600, "height": 900},
        )
        pg = ctx.new_page()
        pg.goto(BASE, wait_until="networkidle", timeout=45000)
        pg.wait_for_timeout(1800)

        steps = build_steps(pg)
        for i, (desc, fn) in enumerate(steps, start=1):
            print("  [%02d/%02d] %s" % (i, len(steps), desc))
            try:
                fn()
            except Exception as e:
                print("      ! %s" % str(e).split("\n")[0][:110])

        ctx.close()          # 必须先 close，视频文件才会写完
        browser.close()

    produced = None
    if os.path.exists(webm):
        produced = webm
    else:
        # Playwright 实际落盘名为 page@<hash>.webm，取最新一个
        cands = sorted(glob.glob(os.path.join(VID_DIR, "*.webm")),
                       key=lambda f: os.path.getmtime(f), reverse=True)
        if cands:
            produced = cands[0]
            shutil.move(produced, webm)
    if not produced or not os.path.exists(webm):
        print("未生成 webm，终止")
        return 1
    print("\nwebm：%.1f MB" % (os.path.getsize(webm) / 1048576.0))

    if not os.path.exists(FFMPEG):
        print("未找到 ffmpeg，仅保留 webm")
        return 0
    cmd = [FFMPEG, "-y", "-i", webm,
           "-c:v", "libx264", "-preset", "medium", "-crf", "23",
           "-pix_fmt", "yuv420p", "-movflags", "+faststart",
           "-vf", "scale=1600:-2", mp4]
    print("转码 mp4 …")
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print("转码失败：", (r.stderr or "").split("\n")[-5:])
        return 1
    print("MP4 已生成：%s（%.1f MB）" % (mp4, os.path.getsize(mp4) / 1048576.0))

    probe = subprocess.run([FFMPEG, "-i", mp4], capture_output=True, text=True)
    for ln in (probe.stderr or "").split("\n"):
        if "Duration" in ln or "Stream #0" in ln:
            print("   " + ln.strip())
    return 0


if __name__ == "__main__":
    sys.exit(main())