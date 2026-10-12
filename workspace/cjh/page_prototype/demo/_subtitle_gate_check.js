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
import sys, importlib.util, json
spec = importlib.util.spec_from_file_location("rec", r"${PP}/demo/_record_mp4.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
live = m.live_subtitles("http://127.0.0.1:8642")
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
ok(/451/.test(live.S04 || ''), 'A_L3', 'S04 证据条数现读为 451（原写死 39）');
ok(!/39 条/.test(live.S04 || ''), 'A_NOT39', 'S04 不再出现旧值 39');
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

// ── A_PROVE：注入过期数字（把 451 改回 39）⇒ 必须抛错；复原后必须通过
const sabot = runPy(`
import importlib.util, json
spec = importlib.util.spec_from_file_location("rec", r"${PP}/demo/_record_mp4.py")
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
live = m.live_subtitles("http://127.0.0.1:8642")
sab = {k: v.replace("451", "39") for k, v in live.items()}
subs = dict(sab)   # 字幕里留着过期的 39
try:
    m.assert_subtitles_match(subs, live)
    print("NO_RAISE")
except AssertionError as e:
    print("RAISED:" + str(e)[:60])
`);
ok(sabot.out.includes('RAISED') && !sabot.out.includes('NO_RAISE'), 'A_PROVE',
   '注入过期数字(451→39)后闸门必须响');

// ── 复原验证：真实 live 不动时必须仍通过
const again = runPy(HARNESS);
ok(again.out.includes('GATE_OK') && again.code === 0, 'A_RECOVER', '复原后闸门仍通过');

try { require('fs').unlinkSync(PP + '/demo/_subtitle_harness.py'); } catch (e) {}
console.log('\n' + '='.repeat(50));
console.log('  PASS ' + pass + ' / ' + 'FAIL ' + fail);
console.log('='.repeat(50));
process.exit(fail ? 1 : 0);