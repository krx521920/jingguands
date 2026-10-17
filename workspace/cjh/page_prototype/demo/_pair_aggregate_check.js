// 守卫：跨文档「合计勾稽」互证不得空引文（2026-10-17 F-UI-01，方验收录屏阻断项）
// 原版作者：陈家浩（cjh-workspace@87912aab）；2026-10-17 由魏按重构后的 server/bridge 形状适配移植，
//   断言语义（AG_* 判据）全保留，锚点与取数改为当前 /api/verify 实际结构。
// 缺陷原状：`D8-PAIR-002` 的 `group_total_matches_sum` 条目没有 docs/kind_label，
//   页码富化走空数组 ⇒ 引文数值全空却按普通互证渲染。
// 判据：
//   AG_DOCS    合计条目必须带 docs（≥2 份）
//   AG_LABEL   kind_label 必须是「合计勾稽一致」——不得称逐字一致（数值勾稽 ≠ 文字相等）
//   AG_AGG     合计侧必须有真实原文 quote
//   AG_PARTS   各加数必须有真实原文 quote＋页码＋block（当前实测 b00004/b00011/b00025/b00032@p10）
//   AG_SUM     机检：加数之和 == 合计值（8,427,900）
//   AG_ANCHOR  加数锚点落在记录的块上——交叉验证，不是自说自话
//   AG_PROVE   源级反证：bridge/review_evidence.js 的 enrichCorroboration 必须含 docs/kind_label/sum_check 注入
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
  // ── AG_PROVE：源级反证（enrichCorroboration 若被回退掉 docs/kind_label 注入，本守卫必须 FAIL）
  const src = fs.readFileSync(path.join(PP, 'bridge/review_evidence.js'), 'utf8');
  ok(/kind_label:\s*'合计勾稽一致'/.test(src) && /sum_check:/.test(src) && /docs,\s*\n/.test(src),
    'AG_PROVE', 'bridge/review_evidence.js 注入 docs/kind_label/sum_check（回退即 FAIL）');

  const r = await get('/api/verify');
  if (r.status !== 200 || !r.json) {
    ok(false, 'AG_FATAL', '/api/verify 不可达（status=' + r.status + ' ' + (r.error || '') + '）——先起 node server.js');
    console.log('=== 汇总 === PASS ' + pass + ' / FAIL ' + fail);
    process.exit(1);
  }
  const pair = (r.json.pairs || []).find(p => p.group_id === 'D8-PAIR-002');
  ok(!!pair, 'AG_PAIR', '/api/verify 含 D8-PAIR-002');
  if (!pair) { console.log('=== 汇总 === PASS ' + pass + ' / FAIL ' + fail); process.exit(1); }

  const c = (pair.corroborations || []).find(x => x.kind === 'group_total_matches_sum');
  ok(!!c, 'AG_KIND', '含 group_total_matches_sum 合计条目');
  if (!c) { console.log('=== 汇总 === PASS ' + pass + ' / FAIL ' + fail); process.exit(1); }

  ok(Array.isArray(c.docs) && c.docs.length >= 2, 'AG_DOCS',
    '合计条目带 docs（原缺失）=' + JSON.stringify(c.docs));
  ok(c.kind_label === '合计勾稽一致', 'AG_LABEL',
    'kind_label = ' + JSON.stringify(c.kind_label) + '（不得为逐字一致）');

  const agg = c.aggregate || {};
  ok(!!(agg.source && typeof agg.source.quote === 'string' && agg.source.quote.trim().length > 0),
    'AG_AGG', '合计侧带真实原文 quote（缺引文不得以数值充作原文）');

  const parts = c.parts || [];
  ok(parts.length >= 4 && parts.every(p => p.source && typeof p.source.quote === 'string' && p.source.quote.trim()
    && Number.isInteger(p.source.page) && p.source.block_id),
    'AG_PARTS', '各加数带 quote＋页码＋block（' + parts.length + ' 个加数）');

  const sum = parts.reduce((s, p) => s + p.value, 0);
  ok(sum === agg.value && c.sum_check && c.sum_check.ok === true,
    'AG_SUM', '机检 加数之和(' + sum + ') == 合计(' + agg.value + ') 且 sum_check.ok');

  const anchors = new Set(parts.map(p => String(p.source.block_id)));
  const recorded = ['b00004', 'b00011', 'b00025', 'b00032'];
  ok(recorded.every(b => [...anchors].some(a => a.endsWith(b))),
    'AG_ANCHOR', '加数锚点落在方记录的块上（' + recorded.map(b => b).join('/') + '）');

  console.log('=== 汇总 === PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail > 0 ? 1 : 0);
})();
