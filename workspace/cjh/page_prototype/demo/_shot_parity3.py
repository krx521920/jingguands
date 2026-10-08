# _shot_parity3.py —— D12 实际对照三层面板：截图 + 渲染自检（可重跑）
#
# 断言不止于"截图成功"：必须验证「不能证明什么」这句真的上屏了。
# 后端把措辞分开印了，页面上被 CSS 吞掉 / 漏渲染 = 等于没分开——
# 那正是 D10 web_cli_same_result 造假的复现路径。
import sys, os
from playwright.sync_api import sync_playwright

PORT = sys.argv[1] if len(sys.argv) > 1 else "18777"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "demo", "screenshots")

JS = """() => {
  const cards = [...document.querySelectorAll('.mx-parity-card')];
  return {
    cards: cards.length,
    tones: cards.map(c => (c.className.match(/tone-(\\w+)/) || [])[1]),
    keys: cards.map(c => (c.querySelector('.mx-parity-key') || {}).textContent),
    proves: cards.map(c => (c.querySelector('.mx-parity-scope .ok') || {}).textContent || ''),
    notProves: cards.map(c => (c.querySelector('.mx-parity-scope .no') || {}).textContent || ''),
    snc: !!document.querySelector('.mx-parity-snc'),
    sncText: ((document.querySelector('.mx-parity-snc-h') || {}).textContent) || '',
    regCats: document.querySelectorAll('.mx-reg-cat').length,
    regRows: document.querySelectorAll('.mx-reg-table tbody tr').length,
    ncRows: document.querySelectorAll('.mx-reg-table tr.row-nc').length,
  };
}"""

fails = []
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1360, "height": 1100})
    errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type() == "error" else None)
    pg.on("pageerror", lambda e: errs.append("PAGEERROR: " + str(e)))
    pg.goto(f"http://127.0.0.1:{PORT}/", wait_until="networkidle")
    # D17：先等 boot() 把导航按钮接上再点。领导 UI 重设计后 boot() 里多了
    # loadEngineMeta() 异步请求，早点击会打空。
    pg.wait_for_selector("#metricsBtn", state="attached", timeout=30000)
    pg.wait_for_timeout(400)
    pg.click("#metricsBtn")
    # ★ D17 关键修正：领导 UI 重设计把「实际对照三层」收进了默认折叠的
    #   <details>（summary="详细对照与历史统计 · 展开查看来源与限制"）。
    #   Playwright 的 visible 判定要求祖先 <details> 处于 open ⇒ 之前一直
    #   "89× locator resolved to 3 elements" 却仍超时。**这是守卫过时，不是页面缺陷。**
    #   正确做法：先断言折叠态存在（确认设计意图），再展开，再断言卡片。
    pg.wait_for_selector(".mx-parity-card", state="attached", timeout=45000)
    fold = pg.evaluate("""() => {
      const d = document.querySelector('.mx-parity-card')?.closest('details');
      return d ? { open: d.open, summary: d.querySelector('summary')?.textContent.trim().slice(0,40) } : null;
    }""")
    if fold and not fold["open"]:
        print("FOLDED: 对照三层默认折叠 =", fold["summary"], "→ 守卫代为展开")
        pg.evaluate("""() => { document.querySelectorAll('.mx-parity-card').forEach(c => {
            const d = c.closest('details'); if (d) d.open = true; }); }""")
        pg.wait_for_timeout(400)
    pg.wait_for_selector(".mx-parity-card", state="visible", timeout=30000)
    pg.wait_for_timeout(800)
    info = pg.evaluate(JS)
    print("PANEL:", info["cards"], "cards | tones", info["tones"], "| keys", info["keys"])
    for i in range(info["cards"]):
        if not info["proves"][i] or not info["notProves"][i]:
            fails.append(f"{info['keys'][i]} 缺「证明/不证明」文案")
    # ★ 语义断言：L3 的"不证明"必须明确否定抽取一致性
    try:
        i3 = info["keys"].index("L3")
        if "不证明抽取一致性" not in info["notProves"][i3]:
            fails.append("L3 未证明句未否定『抽取一致性』：" + info["notProves"][i3][:60])
    except ValueError:
        fails.append("未找到 L3 卡")
    if not info["snc"]:
        fails.append("『仍未测』区块缺失")
    # ★ D17：把"对照三层默认折叠"这个设计意图锁住。
    #   领导 UI 重设计把它收进 <details> 默认收起（这是对的：明细默认不刷屏）。
    #   此处断言"折叠容器存在且带说明文字"—— 防止以后有人误删折叠层或丢掉引导文案。
    if fold is None:
        fails.append("对照三层的 <details> 折叠层消失了（若改为常显，请同步改本守卫）")
    elif not fold.get("summary"):
        fails.append("折叠层缺 summary 引导文案")
    print("SNC:", info["sncText"])
    print("REGISTRY:", info["regCats"], "类 /", info["regRows"], "行 / 未测", info["ncRows"], "行")
    ov = pg.evaluate("() => document.documentElement.scrollWidth > window.innerWidth + 2")
    if ov:
        fails.append("出现横向溢出")
    # ★ 字符串化事故自查：对象被直接拼进 textContent 会渲染成 [object HTMLIElement]
    obj = pg.evaluate("""() => {
      const t = document.querySelector('.mx-parity-sec').innerText;
      const m = t.match(/\\[object [A-Za-z]+\\]/g);
      return m ? [...new Set(m)] : [];
    }""")
    if obj:
        fails.append("面板内出现未渲染对象：" + ", ".join(obj))
    os.makedirs(OUT, exist_ok=True)
    pg.screenshot(path=os.path.join(OUT, "15_parity_layers.png"), full_page=True)
    pg.screenshot(path=os.path.join(OUT, "15_parity_layers_top.png"))
    print("CONSOLE ERRORS:", errs[:5] if errs else "none")
    b.close()

print("\n==== 自检结果 ====")
if fails:
    for f in fails:
        print("FAIL:", f)
    sys.exit(1)
print("PASS: 3 层渲染 / 证明-不证明成对上屏 / 仍未测区块在位 / 无横向溢出")