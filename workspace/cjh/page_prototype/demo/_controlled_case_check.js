// 守卫：受控矛盾用例 D9-020 已接入且不得污染真实数据（2026-10-17 F-UI-02，方验收录屏阻断项）
// 缺陷原状：D9-020（5,000,000 vs 5,200,000 差 200,000）不在 /api/pairs 与 /api/verify 里 ⇒ 页面无该案例。
// 数据源：宗 evaluation/D9/cases/rules-cases.dev.json（C2 私有检出，blob 与 zongbowen@e4eed7dd4 一致）。
// 判据：
//   CT_N        受控用例段存在且条数 ≥ 2（019 restated / 020 conflict）
//   CT_020      D9-RULE-020 存在且 expected_verdict=conflict
//   CT_QUOTE    双侧 quote 均带「（受控构造）」标签（不得伪装成真实公告原文）
//   CT_NOPDF    ★ 受控件 block_id 是夹具锚（synth-*）⇒ page 必须 null，no_real_pdf=true —— **不得伪造真实页码**
//   CT_DELTA    机检 |5,200,000 − 5,000,000| = 200,000（方手工复核一致）
//   CT_ISOLATE  ★ 原公开 13 组配对未被污染：pairs 仍 13 条，且不含任何 SYNTH-/受控件
//   CT_MISS     数据源缺失时**如实报不可用**（unavailable_reason）——绝不凭空造受控数据
// 依赖：服务在跑
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
      let b = ''; resp.on('data', d => b += d);
      resp.on('end', () => { try { res({ status: resp.statusCode, json: JSON.parse(b) }); } catch (e) { res({ status: resp.statusCode, json: null }); } });
    });
    r.on('error', e => res({ status: 0, json: null, error: e.code || e.message }));
    r.on('timeout', () => { r.destroy(); res({ status: 0, json: null, error: 'timeout' }); });
  });
}

(async () => {
  // ── CT_MISS：数据源缺失时必须如实报不可用（源码级：写了 try/catch + unavailable_reason）
  const src = fs.readFileSync(path.join(PP, 'server.js'), 'utf8');
  const ctrlSeg = src.slice(src.indexOf('受控核验视图'), src.indexOf('受控核验视图') + 2600);
  ok(/unavailable_reason/.test(ctrlSeg) && /throw new Error/.test(ctrlSeg),
    'CT_MISS', '受控段：文件缺失即 throw + 回传 unavailable_reason（不凭空造数据）');
  ok(/page: null/.test(ctrlSeg) && /绝不伪造真实页码/.test(ctrlSeg),
    'CT_MISS', '受控段：page 硬编码 null 且注释声明不伪造真实页码');

  const r = await get('/api/verify');
  if (r.status !== 200 || !r.json) {
    ok(false, 'CT_FATAL', '/api/verify 不可达（status=' + r.status + ' ' + (r.error || '') + '）');
    console.log('=== 汇总 === PASS ' + pass + ' / FAIL ' + fail);
    process.exit(1);
  }
  const ct = r.json.controlled || {};
  const cases = ct.cases || [];
  if (!cases.length) {
    // 数据源在另一台机器缺失 ⇒ 不是缺陷，是不可用（如实记录，不算 FAIL）
    console.log('[SKIP] 受控段为空，unavailable_reason = ' + (ct.unavailable_reason || '(none)'));
    ok(!!ct.unavailable_reason, 'CT_MISS', '受控数据源缺失时给出了不可用原因（本机 evaluation/ 为 C2 私有检出）');
    console.log('=== 汇总 === PASS ' + pass + ' / FAIL ' + fail);
    process.exit(fail ? 1 : 0);
  }

  ok(cases.length >= 2, 'CT_N', '受控用例条数 = ' + cases.length + '（019/020）');
  const c20 = cases.find(c => c.case_id === 'D9-RULE-020');
  ok(!!c20 && c20.expected_verdict === 'conflict', 'CT_020',
    'D9-RULE-020 存在且 verdict = ' + (c20 && c20.expected_verdict));

  if (c20) {
    const sides = c20.sides || [];
    ok(sides.length === 2 && sides.every(s => /受控构造/.test(String(s.quote || ''))), 'CT_QUOTE',
      '双侧 quote 均带「（受控构造）」标签');
    ok(sides.every(s => s.page === null) && c20.no_real_pdf === true, 'CT_NOPDF',
      '★ 受控件 page 全为 null 且 no_real_pdf=true（不得伪造真实 PDF 页码）');
    ok(sides.every(s => s.is_fixture_anchor === true), 'CT_NOPDF',
      '双侧 block_id 识别为夹具锚（synth-c / synth-d）');
    const dc = c20.delta_check || {};
    ok(dc.delta === 200000, 'CT_DELTA',
      '机检差额 = ' + dc.delta + '（方手工复核 5,200,000 − 5,000,000 = 200,000）');
    console.log('       · A = ' + (sides[0] && sides[0].value) + ' / B = ' + (sides[1] && sides[1].value));
  }

  // ── CT_ISOLATE：原 13 组不得被受控件污染
  const pairs = r.json.pairs || [];
  ok(pairs.length === 13, 'CT_ISOLATE', '原公开配对仍 13 条（实际 ' + pairs.length + '）');
  const polluted = JSON.stringify(pairs).match(/SYNTH-CTRL|受控构造|synth-[a-d]/g);
  ok(!polluted, 'CT_ISOLATE', '13 组配对中不含任何受控件（命中 ' + (polluted ? polluted.length : 0) + ' 处）');

  console.log('=== 汇总 === PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})();
