// 守卫：MP4 字幕闸门必须真的会响（反证：把 live 数字改掉 → 门必须抛错）
// 判据三条：
//   A_READ  字幕数字能从 /api/metrics 现读（含 S04 的证据条数）
//   A_GATE  live 为空 ⇒ 必须抛错（拒绝用写死文案录制）
//   A_PROVE 注入过期数字 ⇒ 必须抛错；复原后必须通过
const { execFileSync, spawnSync } = require('child_process');
const path = require('path');
const PP = 'D:/chenjh/code/program/jingguanpluge/jingguands/workspace/cjh/page_prototype';
const PY = 'C:/Users/cjh05/.workbuddy/binaries/python/envs/py311-rag/Scripts/python.exe';
let pass = 0, fail = 0;
function ok(c, id, msg) {
  if (c) { pass++; console.log('[PASS] ' + id + ' · ' + msg); }
  else { fail++; console.log('[FAIL] ' + id + ' · ' + msg); }
}
// 用 python 直接跑闸门，避免 playwright 依赖（--check 分支不截帧，但 import playwright 在模块顶层）
const HARNESS = `
import sys, importlib.util, json, urllib.request
spec = importlib.util.spec_from_file_location("rec", r"${PP}/demo/_record_mp4.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
B = "http://127.0.0.1:8642"
live = m.live_subtitles(B)
# 同源对照：直接问接口"画面会显示的那个数"是多少
with urllib.request.urlopen(B + "/api/datasets", timeout=20) as r:
    first = (json.loads(r.read().decode("utf-8")).get("datasets") or [None])[0]
with urllib.request.urlopen(B + "/api/result?dataset=" + first, timeout=60) as r:
    one = json.loads(r.read().decode("utf-8"))
print("ONS=" + json.dumps({"first": first, "n": len(one.get("evidences") or [])}, ensure_ascii=False))
print("LIVE=" + json.dumps(live, ensure_ascii=False))
subs = dict(m.SUBTITLES); subs.update(live)
m.assert_subtitles_match(subs, live)
print("GATE_OK")
`;
function runPy(code) {
  const f = PP + '/demo/_subtitle_harness.py';
  require('fs').writeFileSync(f, code, 'utf8');
  const r = spawnSync(PY, [f], { encoding: 'utf8', timeout: 120000 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

// ── A_READ
const h = runPy(HARNESS);
const mLive = h.out.match(/LIVE=(\{.*\})/);
const live = mLive ? JSON.parse(mLive[1]) : {};
console.log('  live =', JSON.stringify(live, null, 0));
ok(Object.keys(live).length >= 3, 'A_READ', '现读镜次数 = ' + Object.keys(live).length + '（>=3）');

// ★ A_SAME：S04 字幕的证据条数必须等于「同屏画面会显示的那个数」。
//   画面（首页卡片 summaryEvidence）取的是 **单份** data.evidences.length，
//   所以字幕也必须取单份 —— 两边读同一接口实算，不是硬编码 39 或 451。
//   这条正是 2026-10-11 消灭"同屏两套数"的判据：字幕与画面必须同源。
const mOns = h.out.match(/ONS=(\{.*\})/);
const ons = mOns ? JSON.parse(mOns[1]) : { first: '', n: -1 };
const FIRST = ons.first;
const onScreen = String(ons.n);
const inSub = (live.S04 || '').match(/原文证据 (\d+) 条/);
ok(!!inSub, 'A_HASNUM', 'S04 字幕带证据条数：' + (live.S04 || '').slice(0, 44));
ok(inSub && inSub[1] === onScreen, 'A_SAME',
   'S04 字幕 ' + (inSub ? inSub[1] : '?') + ' == 同屏画面 ' + onScreen + '（单份口径，同源实算）');
ok(!/451/.test(live.S04 || ''), 'A_NOTALL',
   'S04 不再用权威批全量 451（本镜画面里没有这个数）');
ok(live.S04 && FIRST && live.S04.includes(FIRST), 'A_NAMEDS', 'S04 标明当前数据集名 ' + FIRST);
ok(h.out.includes('GATE_OK') && h.code === 0, 'A_PASS', '正常路径闸门通过');

// ── A_GATE：live 空 ⇒ 必须抛错
const empty = runPy(`
import importlib.util
spec = importlib.util.spec_from_file_location("rec", r"${PP}/demo/_record_mp4.py")
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
try:
    m.assert_subtitles_match({}, {})
    print("NO_RAISE")
except AssertionError as e:
    print("RAISED:" + str(e))
`);
ok(empty.out.includes('RAISED') && !empty.out.includes('NO_RAISE'), 'A_GATE',
   'live 为空必须抛错（拒绝用写死文案录制）');

// ── A_PROVE：注入"与画面不一致的数"⇒ 必须抛错；复原后必须通过
//   注入的是**另一种口径**（把单份数替换成权威批全量 451）—— 这正是
//   2026-10-12 录出来那版的真实错误形态，不是编出来的假结构。
const sabot = runPy(`
import importlib.util, json, re
spec = importlib.util.spec_from_file_location("rec", r"${PP}/demo/_record_mp4.py")
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
live = m.live_subtitles("http://127.0.0.1:8642")
# 模拟"字幕报了全量 451、画面是单份"的错（Python 用 re.sub，不是 JS 的 /re/）
sab = {k: (re.sub(r"\\d+ 条", "451 条", v) if k == "S04" else v) for k, v in live.items()}
subs = dict(sab)
print("SAB=" + sab.get("S04","")[:60])
try:
    m.assert_subtitles_match(subs, live)
    print("NO_RAISE")
except AssertionError as e:
    print("RAISED:" + str(e)[:80])
`);
ok(sabot.out.includes('RAISED') && !sabot.out.includes('NO_RAISE'), 'A_PROVE',
   '注入跨口径数字(单份→全量451)后闸门必须响'
   + (sabot.out.includes('RAISED') ? '' : '  ⟪实跑输出: ' + sabot.out.trim().slice(0, 160).replace(/\n/g, ' | ') + '⟫'));

// ── 复原验证：真实 live 不动时必须仍通过
const again = runPy(HARNESS);
ok(again.out.includes('GATE_OK') && again.code === 0, 'A_RECOVER', '复原后闸门仍通过');

try { require('fs').unlinkSync(PP + '/demo/_subtitle_harness.py'); } catch (e) {}
console.log('\n' + '='.repeat(50));
console.log('  PASS ' + pass + ' / ' + 'FAIL ' + fail);
console.log('='.repeat(50));
process.exit(fail ? 1 : 0);