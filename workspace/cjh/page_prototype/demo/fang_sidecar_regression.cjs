// 运行：node demo/fang_sidecar_regression.cjs <方分支仓库根目录>（Node.js 24，无依赖、离线）
// 真实公开数据只读；反例均在内存修改，不能计入真实抽取成绩。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const bridge = require('../bridge/upstream_bridge.js');
const root = path.resolve(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'data', name), 'utf8'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
function pair(name = 'wei_real_eqc_002') {
  return { ...read(name + '.json'), check_report: read(name + '.check.json') };
}
function rejected(input) {
  const before = JSON.stringify(input);
  const result = bridge.toContract(input);
  assert.equal(result.view.check_report, null);
  assert.ok(result.view.bridge.notes.some(n => n.includes('CHECK_REPORT_BINDING_MISMATCH')));
  assert.ok(!JSON.stringify(result.envelope).includes('[方核验'));
  assert.ok(!('__check_report' in result.envelope));
  assert.equal(JSON.stringify(input), before);
}
(async () => {
  const fangRoot = path.resolve(process.argv[2] || path.join(root, '../../..'));
  const { checkEquityEnvelope } = await import(pathToFileURL(path.join(fangRoot, 'src_D5/equity_check_D5.ts')).href);
  const files = fs.readdirSync(path.join(root, 'data')).filter(n => /^wei_real_eqc_\d+\.check\.json$/.test(n));
  assert.equal(files.length, 10, '本回归基线应包含 10 份公开 sidecar');
  for (const file of files) check(file, () => {
    const input = pair(file.replace('.check.json', ''));
    const before = JSON.stringify(input);
    const report = input.check_report;
    const raw = structuredClone(input); delete raw.check_report;
    const generated = checkEquityEnvelope(raw);
    const ids = raw.events.map((e, i) => [e.event_id, i]);
    assert.deepEqual(generated.events.map(e => [e.event_id, e.event_index]), ids);
    assert.deepEqual(report.events.map(e => [e.event_id, e.event_index]), ids);
    const result = bridge.toContract(input);
    assert.deepEqual(result.envelope.events.map(e => e.event_id), raw.events.map(e => e.event_id));
    assert.deepEqual(result.view.check_report, report);
    assert.ok(result.contract_validation.ok);
    assert.ok(!('__check_report' in result.envelope));
    assert.ok(!('check_report' in result.envelope));
    assert.equal(JSON.stringify(input), before);
  });
  check('非连续编号按原编号及位置关联，结论不串人', () => {
    const input = pair();
    assert.deepEqual(input.events.map(e => e.event_id), ['E01', 'E03', 'E05']);
    input.check_report.events.forEach((e, i) => {
      e.findings = [{ code: 'SYNTHETIC_ROW_' + i, severity: 'review', fields: [], message: '仅回归' }];
    });
    const result = bridge.toContract(input);
    result.envelope.events.forEach((e, i) => {
      const text = JSON.stringify(e);
      assert.ok(text.includes('SYNTHETIC_ROW_' + i));
      for (let j = 0; j < 3; j++) if (j !== i) assert.ok(!text.includes('SYNTHETIC_ROW_' + j));
    });
  });
  check('报告行顺序可变，但 event_index 必须指向原信封', () => {
    const input = pair(); input.check_report.events.reverse();
    assert.deepEqual(bridge.toContract(input).view.check_report, input.check_report);
  });
  const cases = [
    ['连续重编号导致 E03 撞号', a => a.check_report.events.forEach((e, i) => { e.event_id = 'E0' + (i + 1); })],
    ['仅第二行编号冲突', a => { a.check_report.events[1].event_id = 'E02'; }],
    ['缺 event_id 不按位置猜', a => { delete a.check_report.events[0].event_id; }],
    ['缺 event_index 不按编号猜', a => { delete a.check_report.events[0].event_index; }],
    ['重复位置', a => { a.check_report.events[1].event_index = 0; }],
    ['越界位置', a => { a.check_report.events[1].event_index = 99; }],
    ['字符串位置', a => { a.check_report.events[1].event_index = '1'; }],
    ['信封重复编号', a => { a.events[1].event_id = 'E01'; }],
    ['事件减少', a => { a.check_report.events.pop(); }],
    ['报告事件格式错', a => { a.check_report.events = {}; }],
    ['报告空行', a => { a.check_report.events[0] = null; }],
    ['跨运行', a => { a.check_report.run_id = 'other-run'; }],
    ['缺运行编号', a => { delete a.check_report.run_id; }],
    ['跨来源', a => { a.check_report.source.file_sha256 = '0'.repeat(64); }],
    ['缺来源', a => { delete a.check_report.source; }],
  ];
  for (const [name, mutate] of cases) check(name, () => { const a = pair(); mutate(a); rejected(a); });
  check('无报告时正常输出，F1 视图位为 null', () => {
    const a = pair(); delete a.check_report;
    const result = bridge.toContract(a);
    assert.equal(result.view.check_report, null);
    assert.ok(result.contract_validation.ok);
    assert.ok(!result.view.bridge.notes.some(n => n.includes('CHECK_REPORT_BINDING_MISMATCH')));
  });
  console.log(`PASS ${passed} / FAIL 0; 10 份公开数据 + ${passed - 10} 组内存边界回归；未调用模型。`);
})().catch(error => { console.error(error); process.exitCode = 1; });
