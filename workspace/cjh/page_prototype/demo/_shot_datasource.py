#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
_shot_datasource.py —— D20 上屏验证：数据源信息真的渲染出来了吗？

为什么必须截图断言（反造假铁律④"产出不可见"）：
   本次改动的全部价值就是"页面暴露信息源"。如果数据源卡片、批次徽标、P0-01 标注
   只存在于 JSON 里而页面上看不到，那对读者而言等于没做——
   后端跑对了不等于交付了。所以必须真开浏览器、真点页面、真断言 DOM 里出现了这些字。

四条断言：
   ① 数据集下拉里有权威批次的数据集，且下拉分组标题标明"不计入指标口径"
   ② 下拉旁的批次徽标显示了批次名 + 份数 + 目录指纹
   ③ 选中 P0-01 物证（wei_real_pledge_0197）后，页面出现 P0-01 说明文字
   ④ 质量报告页顶部出现数据源卡片，含两批对照表 + 606/615 分母分歧说明

同时输出截图供人工核对（领导习惯：截图标注 + 具体建议）。
"""
import re
import sys
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8651"
OUT = "demo/screenshots"

fails = []
passes = []


def check(cond, label, detail=""):
    (passes if cond else fails).append(label)
    print(("  PASS  " if cond else "  FAIL  ") + label + (("  " + detail) if detail else ""))


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1500, "height": 1000})
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(1200)

    print("\n【1】数据集下拉：权威批次可见 + 演示池分组标注")
    opts = page.eval_on_selector_all(
        "#datasetSel option",
        "els => els.map(e => ({v: e.value, t: e.textContent, g: e.parentElement.tagName}))",
    )
    groups = page.eval_on_selector_all(
        "#datasetSel optgroup", "els => els.map(e => e.label)"
    )
    auth_names = [o for o in opts if o["v"].startswith(("D4-PLD", "D5-EQC", "D6-AWD"))]
    demo_names = [o for o in opts if "P0-01" in (o["t"] or "") or "演示" in (o["t"] or "")]
    check(len(auth_names) >= 30, "下拉含权威批次数据集", "实得 %d 份（应 31）" % len(auth_names))
    check(len(groups) >= 1, "演示池被 optgroup 分组", "分组标题: " + " | ".join(groups))
    check(any("不计入" in g for g in groups), "分组标题写明「不计入指标口径」", " | ".join(groups))
    p001_opts = [o for o in opts if o["v"] in ("wei_real_pledge_0197", "wei_real_pledge_ce37")]
    check(len(p001_opts) == 2, "P0-01 两份物证仍在下拉（保留不删）", "实得 %d" % len(p001_opts))
    check(all("P0-01 物证" in (o["t"] or "") for o in p001_opts),
          "P0-01 物证在下拉里有显式标记", str([o["t"] for o in p001_opts]))
    titles = page.eval_on_selector_all(
        "#datasetSel option", "els => els.filter(e => e.title).map(e => e.value)"
    )
    check("wei_real_pledge_0197" in titles, "P0-01 物证的说明挂在 option.title 上")

    print("\n【2】批次徽标（常驻披露）")
    badge = page.inner_text("#sourceBadge") if page.query_selector("#sourceBadge") else ""
    check(bool(badge.strip()), "数据源徽标存在且有文字", badge.replace("\n", " ")[:120])
    check("权威" in badge, "徽标显示权威批次名")
    check(re.search(r"\d+\s*份", badge) is not None, "徽标显示份数", badge.replace("\n", " ")[:80])
    check(re.search(r"[0-9a-f]{12}", badge) is not None, "徽标显示目录指纹前12 位")

    print("\n【3】P0-01 物证选中后的页面标注")
    page.select_option("#datasetSel", "wei_real_pledge_0197")
    page.wait_for_timeout(1200)
    notice = page.inner_text("#datasetNotice") if page.query_selector("#datasetNotice") else ""
    check(bool(notice.strip()), "出现数据集来源提示条", notice.replace("\n", " ")[:100])
    check("P0-01" in notice, "提示条点名 P0-01")
    check("D4-PLD-001" in notice, "提示条指出与权威批次的对照关系")
    check("不计入" in notice, "提示条写明该数据集不计入指标口径")
    # 对照侧也要能看到
    page.select_option("#datasetSel", "D4-PLD-001")
    page.wait_for_timeout(1200)
    notice2 = page.inner_text("#datasetNotice")
    check("对照提示" in notice2 or "旧抽取" in notice2, "权威侧也说明对照关系（旧抽取 1 事件）")
    check("计入页面指标口径" in notice2, "权威侧标明计入指标口径")
    page.screenshot(path=f"{OUT}/d20_dataset_p001.png", full_page=False)

    print("\n【4】质量报告页：数据源卡片")
    page.click("#metricsBtn")
    page.wait_for_timeout(2500)
    check(page.query_selector("#mxDataSource") is not None, "数据源卡片已渲染（#mxDataSource）")
    if page.query_selector("#mxDataSource"):
        ds_text = page.inner_text("#mxDataSource")
        check("本页数字跑在哪批数据上" in ds_text, "卡片标题说明用途")
        check("权威批次" in ds_text, "卡片显示权威批次名")
        check("data_unified" in ds_text, "卡片显示权威批次目录")
        check("data/" in ds_text, "卡片同时显示演示池目录")
        check("目录指纹" in ds_text, "卡片显示目录指纹列")
        check("606" in ds_text and "615" in ds_text, "卡片并列 606/615 两种分母口径")
        check("未替领导裁定" in ds_text or "待裁决" in ds_text, "卡片明示分母口径待裁决")
        # 权威批的份数必须是 31（换源后的核心断言）
        check("31" in ds_text, "卡片显示权威口径份数 31")
        page.screenshot(path=f"{OUT}/d20_metrics_datasource.png", full_page=True)

    print("\n【5】页面上不得出现渲染 bug")
    body = page.inner_text("body")
    bad = re.findall(r"\[object \w+\]", body)
    check(not bad, "无 [object HTMLIElement] 类渲染错误", str(bad[:3]))
    check("undefined" not in body or "undefined" not in page.inner_text("#mxDataSource"),
          "数据源卡片内无 undefined")

    browser.close()

print("\n" + "=" * 62)
print("PASS %d / FAIL %d" % (len(passes), len(fails)))
if fails:
    print("失败项：")
    for f in fails:
        print("  - " + f)
print("=" * 62)
print("截图：%s/d20_dataset_p001.png、%s/d20_metrics_datasource.png" % (OUT, OUT))
sys.exit(1 if fails else 0)