import sys, os, time
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8643"
OUT = r"D:\chenjh\code\program\jingguanpluge\jingguands\workspace\cjh\page_prototype\demo\screenshots"
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

    # 校验关键元素是否渲染
    info = pg.evaluate("""() => ({
        cards: document.querySelectorAll('.mx-card').length,
        svgs: document.querySelectorAll('#metricsList svg').length,
        tables: document.querySelectorAll('.mx-table').length,
        text_len: (document.querySelector('#metricsList')||{innerText:''}).innerText.length,
        values: [...document.querySelectorAll('.mx-card-value')].map(e=>e.innerText.replace(/\\n/g,'')),
        names: [...document.querySelectorAll('.mx-card-name')].map(e=>e.innerText),
        badges: [...document.querySelectorAll('.mx-badge')].map(e=>e.innerText),
        hscroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        sections: [...document.querySelectorAll('.mx-sec h3')].map(e=>e.innerText)
    })""")
    for k, v in info.items():
        print(k, "=", v)

    pg.screenshot(path=os.path.join(OUT, "11_metrics_top.png"))
    # 滚到 parser 对比图
    ok = pg.evaluate("""() => {
        const h = [...document.querySelectorAll('.mx-sec h3')].find(e=>e.innerText.includes('解析器版本对比'));
        if (h) { h.scrollIntoView({block:'start'}); window.scrollBy(0,-70); return true; }
        return false;
    }""")
    pg.wait_for_timeout(600)
    pg.screenshot(path=os.path.join(OUT, "12_metrics_parser_compare.png"))
    # 滚到覆盖范围声明
    pg.evaluate("""() => {
        const h = [...document.querySelectorAll('.mx-sec h3')].find(e=>e.innerText.includes('覆盖范围'));
        if (h) { h.scrollIntoView({block:'start'}); window.scrollBy(0,-70); }
    }""")
    pg.wait_for_timeout(600)
    pg.screenshot(path=os.path.join(OUT, "13_metrics_coverage.png"))
    print("parser 图定位:", ok)
    print("console 错误:", len(errs), errs[:3])
    print("未捕获异常:", len(perrs), perrs[:3])
    b.close()