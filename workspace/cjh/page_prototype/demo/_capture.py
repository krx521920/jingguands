#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""D10 演示截图脚本（陈家浩 · 2026-10-06）

按 demo/使用演示.md 的演示 13/14/15 顺序驱动本地 8643 服务截图。
每个场景：可选前置动作（点击视图按钮 / 选数据集 / 展开折叠区 / 滚动定位），再整页截图。

用法：python demo/_capture.py [输出目录]
依赖：playwright（chromium 已安装），本地 server.js 需在 8643 端口运行。
"""
import json
import os
import sys
import time

from playwright.sync_api import sync_playwright

BASE = os.environ.get("DEMO_BASE", "http://127.0.0.1:8643")
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "screenshots")

# 场景表：id / 文件名 / 标题 / 前置动作 / 是否整页
SCENES = [
    {
        "id": "00",
        "name": "单文档三栏（默认视图 · D3真实闭环）",
        "file": "00_main_three_column.png",
        "viewport": [1600, 1000],
        "full": False,
    },
    {
        "id": "01",
        "name": "单文档 · D5 股权变动真实批次（方向徽章 + 前后值并排 + 冲突提示）",
        "file": "01_equity_change_real.png",
        "viewport": [1600, 1100],
        "full": True,
        "actions": [
            {"type": "select", "selector": "#datasetSel", "value": "wei_real_eqc_001"},
            {"type": "click", "selector": "#loadBtn"},
            {"type": "wait", "ms": 1400},
        ],
    },
    {
        "id": "02",
        "name": "跨文档配对 D8（13 组三态 · PAIR-013 证据不足）",
        "file": "02_pairs_d8.png",
        "viewport": [1600, 1150],
        "full": True,
        "actions": [{"type": "click", "selector": "#pairsBtn"}, {"type": "wait", "ms": 1800}],
    },
    {
        "id": "03",
        "name": "核验清单 D9（先归因后判矛盾 + 双侧证据）",
        "file": "03_verify_d9.png",
        "viewport": [1600, 1150],
        "full": True,
        "actions": [
            {"type": "click", "selector": "#pairsBtn"},   # 从 D8 返回
            {"type": "wait", "ms": 700},
            {"type": "click", "selector": "#verifyBtn"},
            {"type": "wait", "ms": 1800},
        ],
    },
    {
        "id": "04",
        "name": "D10 多公告集成 · 顶部汇总 + 缓存一致性三态",
        "file": "04_integration_top_cache.png",
        "viewport": [1600, 1200],
        "full": False,
        "actions": [
            {"type": "click", "selector": "#verifyBtn"},   # 从 D9 返回
            {"type": "wait", "ms": 700},
            {"type": "click", "selector": "#integrationBtn"},
            {"type": "wait", "ms": 2200},
        ],
    },
    {
        "id": "05b",
        "name": "D10 出处链面板（张 · 齐全 7/10 · 重复文字组 2,009 块 · 覆盖缺口 3 条）",
        "file": "05b_provenance_chain.png",
        "viewport": [1600, 1150],
        "full": False,
        "actions": [
            {"type": "click", "selector": "#integrationBtn"},
            {"type": "wait", "ms": 2200},
            {"type": "scroll_to_text", "text": "出处链检查"},
        ],
    },
    {
        "id": "06",
        "name": "D10 案例 006 扫描降级参与（证据不足·无法判定，不进矛盾比较）",
        "file": "06_case_006_unknown.png",
        "viewport": [1600, 1200],
        "full": False,
        "actions": [
            {"type": "click", "selector": "#integrationBtn"},
            {"type": "wait", "ms": 2200},
            {"type": "scroll_to_case", "text": "D10-INT-006"},
        ],
    },
    {
        "id": "07",
        "name": "D10 案例 001 科创新材（同事件互证 · 预期 vs 实判一致）",
        "file": "07_case_001.png",
        "viewport": [1600, 1300],
        "full": False,
        "actions": [
            {"type": "click", "selector": "#integrationBtn"},
            {"type": "wait", "ms": 2200},
            {"type": "scroll_to_case", "text": "D10-INT-001"},
        ],
    },
    {
        "id": "08",
        "name": "D10 案例 003 鸿路钢构（同公司同股数仍判不同事件）+ 006/010 证据不足",
        "file": "08_case_003_006_010.png",
        "viewport": [1600, 1300],
        "full": False,
        "actions": [
            {"type": "click", "selector": "#integrationBtn"},
            {"type": "wait", "ms": 2200},
            {"type": "scroll_to_case", "text": "D10-INT-003"},
        ],
    },
    {
        "id": "09",
        "name": "D10 方报告五段（差异明细 + 计算段勾稽 + 边界声明）",
        "file": "09_fang_report_five_sections.png",
        "viewport": [1600, 1350],
        "full": False,
        "actions": [
            {"type": "click", "selector": "#integrationBtn"},
            {"type": "wait", "ms": 2200},
            {"type": "click_all", "selector": "方报告五段"},
            {"type": "wait", "ms": 1200},
            {"type": "scroll_to_text", "text": "share_sum"},
        ],
    },
    {
        "id": "10",
        "name": "D10 口径声明（三处不单方调和的口径如实上屏）",
        "file": "10_caliber_statement.png",
        "viewport": [1600, 1200],
        "full": False,
        "actions": [
            {"type": "click", "selector": "#integrationBtn"},
            {"type": "wait", "ms": 2200},
            {"type": "scroll_to_text", "text": "口径声明"},
        ],
    },
]


def run_actions(pg, actions):
    for a in actions or []:
        t = a["type"]
        if t == "click":
            try:
                pg.click(a["selector"], timeout=12000)
            except Exception as e:
                print("    ! click 失败 %s: %s" % (a["selector"], str(e).split("\n")[0][:80]))
        elif t == "select":
            try:
                pg.select_option(a["selector"], a["value"], timeout=12000)
            except Exception as e:
                print("    ! select 失败 %s: %s" % (a["selector"], str(e).split("\n")[0][:80]))
        elif t == "wait":
            pg.wait_for_timeout(a["ms"])
        elif t == "scroll_to_case":
            # 精确定位案例卡片：.pair-title 内含 case_id（避免命中「覆盖缺口」里的同名提示）
            ok = pg.evaluate(
                """(cid) => {
                    const t = [...document.querySelectorAll('.pair-title')]
                        .find(e => e.textContent.includes(cid));
                    if (!t) return false;
                    const card = t.closest('.pair-card') || t;
                    card.scrollIntoView({block: 'start'});
                    window.scrollBy(0, -24);
                    return true;
                }""",
                a["text"],
            )
            if not ok:
                print("    ! 未找到案例卡片：%s" % a["text"])
            pg.wait_for_timeout(750)
        elif t == "scroll_to_text":
            # 取「最深匹配节点」：父容器通常也含该文本，直接取第一个会滚到页根
            ok = pg.evaluate(
                """(txt) => {
                    const all = [...document.querySelectorAll('body *')]
                        .filter(e => e.textContent.includes(txt)
                                 && e.offsetParent !== null);   // 跳过未渲染/hidden
                    if (!all.length) return false;
                    // 最深 = 没有子元素也含该文本
                    const deepest = all.filter(e => !all.some(o => o !== e && e.contains(o)));
                    const el = deepest[0] || all[all.length - 1];
                    el.scrollIntoView({block: 'center'});
                    return true;
                }""",
                a["text"],
            )
            if not ok:
                print("    ! 未找到文本：%s" % a["text"])
            pg.wait_for_timeout(700)
        elif t == "click_all":
            try:
                cnt = pg.evaluate(
                    """(sel) => {
                        const els = [...document.querySelectorAll('summary')]
                            .filter(e => e.textContent.includes(sel.trim()));
                        els.forEach(e => e.click());
                        return els.length;
                    }""",
                    a["selector"],
                )
                print("    · 展开 %d 个折叠区（%s）" % (cnt, a["selector"]))
            except Exception as e:
                print("    ! click_all 失败: %s" % str(e).split("\n")[0][:80])


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = []
    errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--font-render-hinting=none"],
        )
        for sc in SCENES:
            w, h = sc["viewport"]
            ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=2)
            pg = ctx.new_page()
            console = []
            pg.on("console", lambda m: console.append("%s: %s" % (m.type, m.text)))
            pg.on("pageerror", lambda e: console.append("pageerror: %s" % e))

            try:
                pg.goto(BASE, wait_until="networkidle", timeout=45000)
                pg.wait_for_timeout(1000)
                run_actions(pg, sc.get("actions"))
                path = os.path.join(OUT, sc["file"])
                pg.screenshot(path=path, full_page=sc.get("full", False))
                size = os.path.getsize(path)
                errs = [c for c in console if c.startswith("error") or c.startswith("pageerror")]
                manifest.append({
                    "id": sc["id"],
                    "file": sc["file"],
                    "title": sc["name"],
                    "viewport": "%dx%d" % (w, h),
                    "full_page": sc.get("full", False),
                    "bytes": size,
                    "console_errors": errs,
                })
                print("  [%s] %-44s %6.1f KB%s"
                      % (sc["id"], sc["file"], size / 1024.0,
                         "  ⚠ %d console err" % len(errs) if errs else ""))
                if errs:
                    errors.append(sc["file"])
                    for e in errs[:3]:
                        print("       %s" % e[:150])
            except Exception as e:
                print("  [%s] 失败：%s" % (sc["id"], str(e).split("\n")[0][:120]))
                errors.append(sc["id"] + " FAILED")
            finally:
                ctx.close()
        browser.close()

    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump({"base": BASE, "captured_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                   "scenes": manifest, "errors": errors}, f, ensure_ascii=False, indent=1)
    print("\n共 %d 张截图，%d 个问题；清单：%s"
          % (len(manifest), len(errors), os.path.join(OUT, "manifest.json")))


if __name__ == "__main__":
    main()