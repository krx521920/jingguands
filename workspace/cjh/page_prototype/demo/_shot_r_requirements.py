#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
_shot_r_requirements.py —— 宗博文 R1–R4 的**上屏**验收

为什么必须真开浏览器断言（反造假铁律④"产出不可见"）：
   R1–R4 全部是"页面有没有把口径披露出来"的要求。JSON 里有 primary_tag、
   variant_group 不等于页面上看得见。宗会自己开页面复核，
   所以断言必须打在 DOM 文本上，而不是接口响应上。

八条断言：
   ① R2 下拉旁徽标出现锚点前 12 位（页面上真的写着 381c760fa07b）
   ② R2 质量报告页顶部出现「批次标识」块，且含 id + 日期 + 锚点
   ③ R3 数据源卡片默认屏只有当前批次一行；其他批次在折叠区里
   ④ R4 选中 P0-01 物证后，页面出现「同源变体」说明与同组成员/事件数
   ⑤ R4 下拉选项文本里带「同源变体」字样
   ⑥ R1 页面默认指标分母 = 606 / 抽取率 72.11%（权威口径实算值）
   ⑦ R3 页面上不出现旧批次数字（71.53% / 548 字段）与权威数字同屏
   ⑧ 无 [object Object] 之类渲染事故

同时输出截图供人工核对。
"""
import re
import sys
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8653"
OUT = "demo/screenshots"
ANCHOR_SHORT = "381c760fa07b"          # 宗登记锚点前 12 位

fails = []
passes = []


def check(cond, label, detail=""):
    (passes if cond else fails).append(label)
    print(("  PASS  " if cond else "  FAIL  ") + label + (("  " + detail) if detail else ""))


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1500, "height": 1100},
                            device_scale_factor=2)
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(1500)

    # ── ① R2 徽标锚点 ──────────────────────────────────────
    print("\n【1】R2：下拉旁批次徽标显示锚点")
    badge = page.inner_text("#sourceBadge") if page.locator("#sourceBadge").count() else ""
    check(ANCHOR_SHORT in badge, "R2 徽标含锚点前 12 位", badge.replace("\n", " ")[:90])
    check("authoritative" in badge, "R2 徽标含批次 id", "")

    # ── ⑤ R4 下拉选项 ──────────────────────────────────────
    print("\n【2】R4：下拉选项带同源变体标记")
    opts = page.eval_on_selector_all(
        "#datasetSel option",
        "els => els.map(e => e.textContent)",
    )
    var_opts = [o for o in opts if "同源变体" in o]
    check(len(var_opts) > 0, "R4 下拉有「同源变体」标记项",
          "%d/%d 项" % (len(var_opts), len(opts)))
    check(any("不一致" in o for o in var_opts),
          "R4 事件数不一致者在下拉里显式标出",
          next((o for o in var_opts if "不一致" in o), ""))
    groups = page.eval_on_selector_all(
        "#datasetSel optgroup", "els => els.map(e => e.label)")
    check(len(groups) >= 2 and any("当前指标口径" in g for g in groups),
          "R3 下拉每一批都有显式分组名", " | ".join(groups))

    # ── ④ R4 结果页提示条 ─────────────────────────────────
    print("\n【3】R4：选中 P0-01 物证后出现同源变体说明")
    page.select_option("#datasetSel", "wei_real_pledge_0197")
    page.wait_for_timeout(1500)
    notice = page.inner_text("#datasetNotice") if page.locator("#datasetNotice").count() else ""
    check("同源变体" in notice, "R4 提示条出现「同源变体」",
          notice.replace("\n", " ")[:110])
    check("D4-PLD-001" in notice, "R4 提示条列出同组成员 D4-PLD-001", "")
    check("事件数" in notice, "R4 提示条给出各成员事件数", "")
    page.screenshot(path=OUT + "/r4_variant_notice.png", full_page=False)

    # ── ⑥ R1 默认口径数字 ─────────────────────────────────
    print("\n【4】R1：质量报告页默认权威口径")
    page.click("#metricsBtn")
    page.wait_for_timeout(2600)
    body = page.inner_text("body")
    check("606" in body, "R1 页面上出现权威分母 606", "")
    check("72.11" in body, "R1 页面上出现权威抽取率 72.11%", "")

    # ── ② R2 批次标识块 ───────────────────────────────────
    print("\n【5】R2：质量报告页顶部批次标识块")
    ds_card = page.locator("#mxDataSource")
    check(ds_card.count() > 0, "数据源卡片已渲染", "")
    if ds_card.count():
        card_txt = ds_card.inner_text()
        check("批次标识" in card_txt, "R2 卡片含「批次标识」标题", "")
        check(ANCHOR_SHORT in card_txt, "R2 卡片含锚点前 12 位", "")
        check("2026-10-04" in card_txt, "R2 卡片含批次日期", "")
        check("已定案" in card_txt or "606" in card_txt,
              "R2 卡片含已裁决的分母口径", "")
        page.locator("#mxDataSource").screenshot(path=OUT + "/r2_batch_identity.png")

    # ── ③⑦ R3 同屏唯一批次 ───────────────────────────────
    print("\n【6】R3：不同批次数字不同屏")
    mtx = page.inner_text("#metricsView") if page.locator("#metricsView").count() else body
    # 旧批次数字：548 字段 / 71.53% —— 若与权威数字同时出现在默认屏即违规
    legacy_visible = ("548" in mtx) or ("71.53" in mtx)
    # 但折叠区里允许存在（显式命名 + 默认收起）
    details_open = page.eval_on_selector_all(
        "#metricsView details", "els => els.filter(e => e.open).length")
    check(not legacy_visible or details_open > 0,
          "R3 旧批次数字未在默认屏展开区域出现",
          "details 展开数=%d" % details_open)
    var_box = page.inner_text("#mxDataSource")
    check("同源变体登记" in var_box or "同源变体登记" in mtx,
          "R4 卡片含同源变体登记区", "")

    # ── ⑧ 渲染事故 ────────────────────────────────────────
    print("\n【7】渲染事故扫描")
    obj = re.findall(r"\[object \w+\]", body)
    check(not obj, "无 [object Object] 类渲染事故", str(obj[:3]))
    undef = re.findall(r"\bundefined\b", body)
    check(not undef, "无 undefined 泄漏到页面", str(undef[:3]))

    # ── 变体登记区展开后可见 ──────────────────────────────
    print("\n【8】R4 同源变体登记区可展开查看")
    det = page.locator("#mxDataSource details").first
    if det.count():
        det.locator("summary").click()
        page.wait_for_timeout(600)
        txt = det.inner_text()
        check("D4-PLD-001" in txt, "变体登记区含 P0-01 组成员", "")
        check("事件数不一致" in txt, "变体登记区标出事件数不一致", "")
        page.locator("#mxDataSource").screenshot(path=OUT + "/r4_variant_registry.png")
    else:
        check(False, "变体登记区存在（details 元素）", "未找到")

    page.screenshot(path=OUT + "/r_overview.png", full_page=False)
    browser.close()

print("\n" + "=" * 62)
print("PASS %d / FAIL %d" % (len(passes), len(fails)))
if fails:
    for f in fails:
        print("  FAILED: " + f)
print("=" * 62)
sys.exit(1 if fails else 0)