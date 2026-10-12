# _shot_parity.py —— D12 抽取引擎面板截图（Playwright，本机唯一可用路径）
# 截三张：① 页头引擎状态（未接通 live）② D10 缓存面板的 Web/CLI 未覆盖区
# ③ 接通假 CLI 后的 pass 态（证明面板能显示真对照结果）
# 用法：DEMO_BASE=http://127.0.0.1:8643 python demo/_shot_parity.py
import os
import sys
import time
from playwright.sync_api import sync_playwright

BASE = os.environ.get("DEMO_BASE", "http://127.0.0.1:8643")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screenshots")
os.makedirs(OUT, exist_ok=True)


def shot_parity(pg, path):
    pg.click("#integrationBtn")
    pg.wait_for_timeout(2600)
    #滚到缓存面板里的 Web/CLI 对照区
    pg.evaluate("""() => {
        const h = Array.from(document.querySelectorAll('h3')).find(x => x.textContent.includes('Web/CLI 独立对照'));
        if (h) h.scrollIntoView({ block: 'start' });
    }""")
    pg.wait_for_timeout(700)
    pg.screenshot(path=path)


def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1600, "height": 1050})
        pg = ctx.new_page()
        pg.goto(BASE, wait_until="networkidle", timeout=45000)
        pg.wait_for_timeout(1500)

        # ① 页头引擎状态
        pg.screenshot(path=os.path.join(OUT, "P1_页头引擎状态.png"))

        # ② D10 缓存面板 Web/CLI 未覆盖
        shot_parity(pg, os.path.join(OUT, "P2_WebCLI未覆盖.png"))

        ctx.close()
        b.close()
    print("OK ->", OUT)


if __name__ == "__main__":
    main()
