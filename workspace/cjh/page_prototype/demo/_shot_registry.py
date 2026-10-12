# -*- coding: utf-8 -*-
# _shot_registry.py —— D12 指标注册表面板截图与渲染自检（可重跑）
#
# 用途不只是截图：顺带断言"未测项真的以未测态渲染"——
# 注册表后端分对了不等于页面上看得出区别，那等于没分。
import sys, os
from playwright.sync_api import sync_playwright

PORT = sys.argv[1] if len(sys.argv) > 1 else "8643"
BASE = f"http://127.0.0.1:{PORT}"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screenshots")
os.makedirs(OUT, exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
    ctx = b.new_context(viewport={"width": 1600, "height": 1100}, device_scale_factor=2)
    pg = ctx.new_page()
    errs, perrs = [], []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: perrs.append(str(e)))

    pg.goto(BASE, wait_until="networkidle", timeout=60000)
    pg.wait_for_timeout(1200)
    pg.click("#metricsBtn")
    pg.wait_for_timeout(3000)

    info = pg.evaluate("""() => ({
        cats: document.querySelectorAll('.mx-reg-cat').length,
        cat_titles: [...document.querySelectorAll('.mx-reg-cat > h3')].map(e=>e.innerText.trim()),
        rows: document.querySelectorAll('.mx-reg-table tbody tr').length,
        nc_rows: document.querySelectorAll('.mx-reg-table tr.row-nc').length,
        nc_texts: [...document.querySelectorAll('.mx-reg-table tr.row-nc td:nth-child(2)')].map(e=>e.innerText.trim()),
        nc_badges: [...document.querySelectorAll('.mx-badge.st-not_covered')].map(e=>e.innerText.trim()),
        fp_shown: (document.querySelector('.mx-reg-holder .mx-stamp')||{}).innerText||'',
        hscroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    })""")
    for k, v in info.items():
        print(k, "=", v)

    # ---- 断言：未测项必须显示"未测"字样，不得留空或显示目标值 ----
    assert info["cats"] == 4, f"类别数应为 4（准确率/覆盖率/出处/合规），实到 {info['cats']}"
    assert info["nc_rows"] >= 5, f"未测行数应 >=5，实到 {info['nc_rows']}"
    bad = [t for t in info["nc_texts"] if t != "未测"]
    assert not bad, f"未测项数值列必须写「未测」，异常：{bad}"
    assert all("未测" in b for b in info["nc_badges"]), "未测徽标文案异常"
    assert "换批即失效" in info["fp_shown"], "指纹提示未显示"
    print("断言：全部通过（未测项均以「未测」渲染，无空白、无目标值填充）")

    pg.screenshot(path=os.path.join(OUT, "14_registry_top.png"))
    pg.evaluate("""() => {
        const h = [...document.querySelectorAll('.mx-reg-cat > h3')].find(e=>e.innerText.includes('出处命中率'));
        if (h) { h.scrollIntoView({block:'start'}); window.scrollBy(0,-70); }
    }""")
    pg.wait_for_timeout(600)
    pg.screenshot(path=os.path.join(OUT, "15_registry_evidence.png"))

    print("console 错误:", len(errs), errs[:3])
    print("未捕获异常:", len(perrs), perrs[:3])
    b.close()