// 守卫：跨文档「合计勾稽」互证不得空引文（2026-10-17 F-UI-01，方验收录屏阻断项）
// 缺陷原状：`D8-PAIR-002` 的 `group_total_matches_sum` 条目**没有 `docs` 字段**（只有 aggregate/parts），
//   handleVerify 的页码富化走 `(c.docs || [])` ⇒ 空数组 ⇒ 新版页面按普通互证（docs/quotes）渲染
//   ⇒ **A/B 引文与数值全空，却打勾「两份公告逐字一致」**。
// 判据：
//   AG_DOCS    合计条目必须带 docs（原来缺失的那个字段）
//   AG_LABEL   kind_label 必须是「合计勾稽一致」——**不得称逐字一致**（数值勾稽 ≠ 文字相等）
//   AG_AGG     合计侧必须有真实原文 quote（缺引文不得以数值充作原文）
//   AG_PARTS   四个加数各自必须有真实原文 quote + 页码 + block
//   AG_SUM     机检：加数之和 == 合计值（方手工复核 3,680,700+2,975,600+430,000+1,341,600 = 8,427,900）
//   AG_ANCHOR  加数锚点须落在方记录的块上（b00004/b00011/b00025/b00032）——交叉验证，不是自说自话
//   AG_PROVE   反证：把合计分支去掉（不补 docs）⇒ 本守卫必须 FAIL
// 依赖：服务在跑（批跑器统一保证）
const http = require('http');
const BASE = 'http://127.0.0.1:8642';
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

  const agg = (c.aggregate || {}).anchor || {};
  ok(!!agg.quote && !!agg.page, 'AG_AGG',
    '合计侧真实原文引文：' + (agg.doc || '?') + ' p' + (agg.page || '?') + ' ' + (agg.block_id || '?') +
    '（缺引文不得以数值充作原文）');

  const parts = c.parts || [];
  ok(parts.length === 4, 'AG_PARTS', '加数条目数 = ' + parts.length + '（期望 4）');
  const allQuoted = parts.every(p => p.anchor && p.anchor.quote && p.anchor.page && p.anchor.block_id);
  ok(allQuoted, 'AG_PARTS', '四个加数各有真实原文引文＋页码＋block');
  for (const p of parts) {
    console.log('       · ' + p.entity + ' ' + p.value + ' → p' + (p.anchor && p.anchor.page) +
      ' ' + (p.anchor && p.anchor.block_id) + ' quote=' + JSON.stringify((p.anchor && p.anchor.quote) || ''));
  }

  const sc = c.sum_check || {};
  ok(sc.ok === true, 'AG_SUM',
    '机检 ' + sc.parts_sum + ' == ' + sc.aggregate_value + ' ⇒ ok=' + sc.ok + '（方手工复核 8,427,900）');

  // 交叉验证：方记录四个加数落在 D5-EQC-001 第10页 b00004/b00011/b00025/b00032
  const expectBlocks = ['d9d5be14f_p010_b00004', 'd9d5be14f_p010_b00011', 'd9d5be14f_p010_b00025', 'd9d5be14f_p010_b00032'];
  const gotBlocks = parts.map(p => p.anchor && p.anchor.block_id);
  ok(expectBlocks.every(b => gotBlocks.includes(b)), 'AG_ANCHOR',
    '加数锚点与方记录的块一致（交叉验证）：' + gotBlocks.join(' / '));

  // ── AG_NOFAKE：全量扫描——任何互证点的引文都不得是"数值本身"（缺引文不得以数值充作原文）
  //    这是 F-UI-01 的硬纪律，做成机器判据而不是靠人盯。
  const fakes = [];
  for (const p of r.json.pairs || []) {
    for (const cb of p.corroborations || []) {
      const sides = [cb.aggregate && cb.aggregate.anchor].concat((cb.parts || []).map(x => x && x.anchor));
      for (const s of sides) {
        if (!s || !s.quote) continue;
        const q = String(s.quote).replace(/[,\s]/g, '');
        // 引文若"恰好等于"某个数值，说明拿数字冒充原文（真实引文一定带上下文文字）
        const vals = [cb.aggregate && cb.aggregate.value].concat((cb.parts || []).map(x => x && x.value));
        if (vals.some(v => v != null && q === String(v))) fakes.push(p.group_id + ':' + (s.doc || '?'));
      }
    }
  }
  ok(fakes.length === 0, 'AG_NOFAKE', '全量互证无"数值冒充引文"（命中 ' + fakes.length + ' 条' + (fakes.length ? '：' + fakes.slice(0, 3).join('、') : '') + '）');

  console.log('=== 汇总 === PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})();
