# demo/_shot_caliber.py —— 步骤4 口径收口后的指标页实拍
# 目的：证明「同名不同值」已消除、四张卡的目标挂载正确（上屏事实，不只是接口对账）
# 用法：先在 8643 起一份服务，再跑本脚本（解释器必须是 py311-rag 那份，有 playwright）
import sys, os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:8643")
OUT = r"D:\chenjh\code\program\jingguanpluge\jingguands\workspace\cjh\page_prototype\demo\screenshots"
os.makedirs(OUT, exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
    ctx = b.new_context(viewport={"width": 1600, "height": 1200}, device_scale_factor=2)
    pg = ctx.new_page()
    errs, perrs = [], []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: perrs.append(str(e)))

    pg.goto(BASE, wait_until="networkidle", timeout=60000)
    pg.wait_for_timeout(1200)
    pg.click("#metricsBtn")
    pg.wait_for_timeout(3500)

    # 直接读 outerHTML 再在Python 侧解析：避免在页面里写嵌套函数（易与三引号打架）
    raw = pg.eval_on_selector_all(".mx-card", "els=>els.map(e=>e.outerHTML)")
    info = {"card_count": len(raw), "rows": []}
    for h in raw:
        def grab(cls):
            i = h.find('class="' + cls)
            if i < 0:
                return ""
            j = h.find('>', i)
            k = h.find("<", j)
            return h[j + 1:k].replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").strip()
        info["rows"].append({
            "name": grab("mx-card-name"), "value": grab("mx-card-value"),
            "badge": grab("mx-badge"), "target": grab("mx-card-target"),
            "caliber": grab("mx-card-cal"), "note": grab("mx-card-cov"),
        })
    info["all_names"] = [r["name"] for r in info["rows"]]
    body = pg.eval_on_selector("#metricsList", "e=>e.innerText")
    info["bad_text"] = [l for l in body.split("\n")
                        if ("null" in l or "NaN" in l or "undefined" in l or "[object" in l)][:6]
    info["text_len"] = len(body)
    info["hscroll"] = pg.evaluate(
        "()=>document.documentElement.scrollWidth-document.documentElement.clientWidth")

    print("card_count =", info["card_count"])
    for r in info["rows"]:
        print("-" * 66)
        print("名称:", r["name"], "| 值:", r["value"].replace("\n", ""), "| 徽标:", r["badge"])
        print("目标行:", r["target"])
        print("口径:", r["caliber"][:140])
        if r["note"]:
            print("覆盖:", r["note"][:140])
    # 同名检查：同屏出现两个同名卡片即判FAIL
    dup = [n for n in set(info["all_names"]) if n and info["all_names"].count(n) > 1]
    print("=" * 66)
    print("同屏同名卡片:", dup if dup else "无")
    # ★ 渲染缺陷文本检查：null / NaN / undefined 上屏即为缺陷
    print("缺陷文本(null/NaN/undefined):", info["bad_text"] if info["bad_text"] else "无")
    print("文字区长度:", info["text_len"], " 横向溢出:", info["hscroll"])
    print("console 错误:", errs if errs else "无")
    print("page 异常:", perrs if perrs else "无")

    # 卡片区截图：元素可能不在视口内（ElementHandle.screenshot 会对不可见元素超时报错），
    # 所以改为把卡片区滚进视口后再拍整屏。
    pg.eval_on_selector(".mx-cards", "e => e.scrollIntoView({block:'center'})")
    pg.wait_for_timeout(800)
    pg.screenshot(path=os.path.join(OUT, "d24_caliber_cards.png"), full_page=False)
    print("卡片区截图: ok（滚入视口后整屏）")
    # 指标注册表区域单独拍一张（含 standardized 两项）
    reg = pg.query_selector(".mx-reg, #registryList, .mx-table")
    if reg:
        try:
            reg.screenshot(path=os.path.join(OUT, "d24_registry.png"))
            print("注册表截图: ok")
        except Exception as e:
            print("注册表截图跳过:", type(e).__name__)
    print("截图目录:", OUT)
    ctx.close()