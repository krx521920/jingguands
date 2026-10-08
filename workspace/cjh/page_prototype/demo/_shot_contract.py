# _shot_contract.py —— 契约校验的「后端真跑 + 前端不暴露」双向自检（可重跑）
#
# 【2026-10-08 领导裁定后的改造】原文是「页头契约徽标上屏 + 截图断言」，
#   裁定为「前端用户不需要了解这个接口返回值」⇒ 页头徽标已撤除。
#   但**后端校验一行都没删** —— 删了就等于"跑过但没人知道"，那正是 D10 同款问题。
#
# 【断言怎么改才不是"空跑即通过"】
#   反造假铁律：任何"无差异即通过"的判定，必须先断言"确实跑过"。所以本脚本：
#     A 组（后端）：真调GET /api/contract，逐个数据集断言两层校验真的执行了
#       —— 用「注入违规信封 → 断言 error_count 真的涨」证明校验器不是恒返回 0。
#     B 组（前端）：断言页头**确实没有**契约徽标，且页面正常渲染没被破坏
#       （撤徽标不能顺手把页面搞坏，这也是一种"产出不可见"）。
import sys, os, json
import urllib.request
from playwright.sync_api import sync_playwright

PORT = sys.argv[1] if len(sys.argv) > 1 else "18801"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "demo", "screenshots")
os.makedirs(OUT, exist_ok=True)
BASE = f"http://127.0.0.1:{PORT}"

fail = 0
cases_run = 0
def ok(cond, label, detail=""):
    global fail, cases_run
    cases_run += 1
    if cond:
        print(f"  [PASS] {label}" + (f"  —— {detail}" if detail else ""))
    else:
        fail += 1
        print(f"  [FAIL] {label}" + (f"  —— {detail}" if detail else ""))

def get_json(path):
    with urllib.request.urlopen(BASE + path, timeout=15) as r:
        return json.loads(r.read().decode("utf-8"))

# ─────────────────────────────────────────────
# A 组：后端契约校验真跑（不上屏，但必须有据可查）
# ─────────────────────────────────────────────
print("【A】后端 /api/contract 真跑（校验证据保留在接口层）")
CONTRACT_DATASETS = [
    ("share_change", "我方 mock股权变动样例（本轮已对齐 v0.3，应零违规）"),
    ("wei_multi_event_test", "我方 mock 测试文件（已脱钩，应零违规）"),
    ("wei_real_eqc_001", "魏真实股权变动5 事件"),
    ("wei_real_PLD001_3ev", "魏真实质押 3 事件"),
    ("wei_real_awd_003", "魏真实中标 3 事件（含万元换算）"),
]
checked = 0
errors_seen = 0
for ds, why in CONTRACT_DATASETS:
    try:
        r = get_json(f"/api/contract?dataset={ds}")
    except Exception as e:
        ok(False, f"A/{ds} 接口可达", str(e)[:80])
        continue
    checked += 1
    cv = r.get("validation") or {}
    env = r.get("envelope") or {}
    ok(env.get("schema_version") is not None, f"A/{ds} 返回信封本体（非空壳）",
       f"schema_version={env.get('schema_version')} events={len(env.get('events') or [])}")
    ok("ok" in cv and "error_count" in cv and "layers" in cv,
       f"A/{ds} 两层校验结果结构完整", f"schema={cv.get('layers', {}).get('schema')} 注册表={cv.get('layers', {}).get('registry')}")
    ok(cv.get("ok") is True, f"A/{ds} 契约零违规", f"error_count={cv.get('error_count')}")
    ok((r.get("registry_source") or "").find("registry.mjs") != -1,
       f"A/{ds} 校验器读的是注册表真源（非手抄副本）", r.get("registry_source"))
    errors_seen += cv.get("error_count") or 0
    print(f"         └ {why}")

# ★ 防造假：必须真的逐个跑过，且校验器会对违规报错（下面用注入验证）
ok(checked == len(CONTRACT_DATASETS), "★ 全部目标数据集都真调过（非空跑）",
   f"{checked}/{len(CONTRACT_DATASETS)}")
ok(errors_seen == 0, "★ 五份数据集合计零违规", f"errors={errors_seen}")

print("\n【A2】★ 校验器不是恒返回 0（用违规信封反证）")
# 直接跑 demo/_validator_not_constant.js：它对 6 类违规信封逐个断言"必须报错"，
# 并带一份合法信封作对照（防止"永远报错"那种反向造假）。
# 为什么单独成文件：把注入逻辑塞进 python 的 os.system 会被 shell 引号吃掉，
#   那样断言就成了"跑没跑不知道"，正是要防的那类假通过。
import subprocess
node_exe = "node"
r2 = subprocess.run([node_exe, os.path.join(ROOT, "demo", "_validator_not_constant.js")],
                    capture_output=True, text=True, cwd=ROOT)
print("".join("         " + l + "\n" for l in r2.stdout.strip().splitlines()))
ok(r2.returncode == 0, "★ 校验器对 6 类违规全部报错、对合法信封放行（反证非恒真）",
   f"exit={r2.returncode}")
ok("判据有效" in r2.stdout, "★ 反证脚本自身给出「判据有效」结论", r2.stdout.strip().splitlines()[-1] if r2.stdout else "")

# ─────────────────────────────────────────────
# B 组：前端确实不暴露契约信息，且页面未因此损坏
# ─────────────────────────────────────────────
print("\n【B】前端不暴露契约信息（领导裁定）+ 页面未损坏")
JS = """() => {
  const b = document.getElementById('contractBadge');
  return {
    exists: !!b,
    visible: !!(b && b.getClientRects().length),
    bodyText: document.body.innerText || '',
    hasEvents: document.querySelectorAll('.ev-card, .evrow, .event-card').length,
    bodyLen: document.body.innerText.length,
    objectLeak: /\\[object \\w+\\]/.test(document.body.innerText),
  };
}"""

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1600, "height": 1100})
    errors = []
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append(str(e)))

    pg.goto(f"{BASE}/?dataset=wei_real_eqc_001", wait_until="networkidle")
    pg.wait_for_timeout(900)
    r1 = pg.evaluate(JS)
    pg.screenshot(path=os.path.join(OUT, "contract_not_exposed.png"), full_page=False)

    ok(not r1["exists"], "★ 页头不存在契约徽标元素（前端不暴露）")
    ok("契约合规" not in r1["bodyText"] and "契约违规" not in r1["bodyText"],
       "★ 页面正文不含契约合规结论（用户不需要看到）")
    ok("错误填充" not in r1["bodyText"], "★ 页面正文不含错误填充审计详情")
    # 撤徽标不能顺手把页面搞坏
    ok(r1["hasEvents"] > 0, "★ 事件卡片仍正常渲染（撤徽标未损坏页面）",
       f"{r1['hasEvents']} 个")
    ok(r1["bodyLen"] > 500, "★ 页面正文未变空", f"{r1['bodyLen']} 字符")
    ok(not r1["objectLeak"], "无 [object X] 渲染泄漏")
    ok(not errors, "零控制台错误", "; ".join(errors[:3]))

    b.close()

print("\n" + "=" * 60)
print(f"cases_run={cases_run}  " + ("全部通过" if fail == 0 else f"失败 {fail} 项"))
print("后端：校验保留且可查（/api/contract）｜前端：不暴露契约结论（领导裁定）")
print("=" * 60)
sys.exit(1 if fail or cases_run == 0 else 0)
