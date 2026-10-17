// 守卫：受控矛盾用例已接入且不得污染真实数据（2026-10-17 F-UI-02，方验收录屏阻断项）
// 原版作者：陈家浩（cjh-workspace@87912aab）；2026-10-17 由魏按重构后的 server/bridge 形状适配移植，
//   断言语义（CT_* 判据）全保留；CT_MISS 的源级检查对象从 server.js「受控核验视图」段
//   改为 bridge/review_evidence.js 的 controlledCases（重构后受控段迁至 bridge）。
// 数据源：宗 evaluation/D9/cases/rules-cases.dev.json（经 metrics.json input_hashes sha256 封存校验）。
// 判据：
//   CT_N        受控用例段存在且条数 ≥ 2（019 restated / 020 conflict）
//   CT_019      D9-RULE-019 存在且 expected_verdict=restated
//   CT_020      D9-RULE-020 存在且 verdict=conflict
//   CT_QUOTE    双侧 quote 均带「（受控构造）」标签（不得伪装成真实公告原文）
//   CT_NOPDF    受控件 block_id 是夹具锚（synth-*）⇒ page 必须 null，no_real_pdf=true——不得伪造真实页码
//   CT_DELTA    机检 |5,200,000 − 5,000,000| = 200,000（方手工复核一致）
//   CT_ISOLATE  原公开 13 组配对未被污染：pairs 仍 13 条，且不含任何 SYNTH-/受控件
//   CT_MISS     数据源缺失/封存不符时如实报不可用（controlled_error）——绝不凭空造受控数据
// 依赖：服务在跑（node server.js → 8642）
const http = require('http');
const fs = require('fs');
const path = require('path');
const BASE = 'http://127.0.0.1:8642';
const PP = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, id, msg) {
  if (c) { pass++; console.log('[PASS] ' + id + ' · ' + msg); }
  else { fail++; console.log('[FAIL] ' + id + ' · ' + msg); }
}
function get(p) {
  return new Promise(res => {
    const r = http.get(BASE + p, { timeout: 15000 }, resp => {
      let b = '';
      resp.on('data', d => b += d);
      resp.on('end', () => { try { res({ status: resp.statusCode, json: JSON.parse(b) }); } catch (e) { res({ status: resp.statusCode, json: null }); } });
    });
    r.on('error', e => res({ status: 0, json: null, error: e.code || e.message }));
    r.on('timeout', () => { r.destroy(); res({ status: 0, json: null, error: 'timeout' }); });
  });
}

(async () => {
  // ── CT_MISS（源级）：bridge 侧受控段必须 throw-on-mismatch + page 恒 null + 不伪造声明
  const src = fs.readFileSync(path.join(PP, 'bridge/review_evidence.js'), 'utf8');
  const seg = src.slice(src.indexOf('function controlledCases'));
  ok(/throw new Error/.test(seg) && /绝不伪造页码/.test(seg),
    'CT_MISS', 'controlledCases：数据缺失/封存不符即 throw（server 捕获回传 controlled_error，不凭空造数据）');
  ok(/page: null/.test(seg),
    'CT_MISS', 'controlledCases：受控件 page 硬编码 null（不伪造真实页码）');

  const r = await get('/api/verify');
  if (r.status !== 200 || !r.json) {
    ok(false, 'CT_FATAL', '/api/verify 不可达（status=' + r.status + ' ' + (r.error || '') + '）');
    console.log('=== 汇总 === PASS ' + pass + ' / FAIL ' + fail);
    process.exit(1);
  }
  const cc = r.json.controlled_cases || [];
  ok(r.json.controlled_error == null, 'CT_AVAIL', 'controlled_error=null（受控段可用）');
  ok(Array.isArray(cc) && cc.length >= 2, 'CT_N', '受控用例段条数=' + cc.length + '（019 restated／020 conflict）');

  const c19 = cc.find(c => c.case_id === 'D9-RULE-019');
  const c20 = cc.find(c => c.case_id === 'D9-RULE-020');
  ok(!!c19 && c19.expected_verdict === 'restated' && c19.verdict === 'restated',
    'CT_019', 'D9-RULE-019 存在且 restated（更正声明类，difference=' + (c19 ? c19.difference : 'n/a') + '）');
  ok(!!c20 && c20.verdict === 'conflict', 'CT_020', 'D9-RULE-020 存在且 verdict=conflict');

  ok(cc.every(c => (c.sides || []).every(s => String(s.quote || '').includes('（受控构造）'))),
    'CT_QUOTE', '双侧 quote 均带「（受控构造）」标签');
  ok(cc.every(c => c.no_real_pdf === true && (c.sides || []).every(s => s.page === null && /^synth-/i.test(String(s.block_id || '')))),
    'CT_NOPDF', '夹具锚（synth-*）⇒ page 全 null 且 no_real_pdf=true（不伪造页码）');

  ok(!!c20 && c20.difference === 200000 && c20.delta_check && c20.delta_check.delta === 200000 && c20.delta_check.ok === true,
    'CT_DELTA', '机检 |5,200,000 − 5,000,000| = 200,000');

  const pairs = r.json.pairs || [];
  ok(pairs.length === 13 && !JSON.stringify(pairs).includes('SYNTH-') && pairs.every(p => p.group_id && !/RULE-/.test(p.group_id)),
    'CT_ISOLATE', '原公开 13 组配对未被污染（pairs=' + pairs.length + '，无受控件混入）');

  console.log('=== 汇总 === PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail > 0 ? 1 : 0);
})();
