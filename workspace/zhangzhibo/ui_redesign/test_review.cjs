const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repo = path.resolve(__dirname, '../../..');
let child, exited, base, pairs, verify;
before(async () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/KEY|SECRET|TOKEN|PASSWORD/i.test(k)));
  child = fork(path.join(repo, 'workspace/cjh/page_prototype/server.js'), [], { env: { ...env, PORT: '0', ENGINE: 'file' }, silent: true });
  exited = once(child, 'exit');
  child.stdout.resume(); child.stderr.resume();
  const [ready] = await once(child, 'message', { signal: AbortSignal.timeout(10000) });
  base = `http://127.0.0.1:${ready.port}`;
  [pairs, verify] = await Promise.all(['/api/pairs', '/api/verify'].map(async p => {
    const response = await fetch(base + p, { signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 200); return response.json();
  }));
});
after(async () => { if (child && child.exitCode === null) child.kill(); if (exited) await exited; });

function render(name, data) {
  const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  const code = app.slice(app.indexOf('function renderPairs('), app.indexOf('function renderIntegration('));
  const nodes = {};
  const context = {
    $: key => nodes[key] ||= {}, document: { querySelector: () => null }, countUps() {},
    esc: s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    FIELD_TEXT: { change_shares: '变动股数' }, SEV_TEXT: {}, REL_TEXT: { related: ['同一事件', 'same'], unrelated: ['不同事件', 'diff'], unknown: ['证据不足', 'unknown'] },
    ReviewView: fs.existsSync(path.join(__dirname, 'review_view.js')) ? require('./review_view.js') : undefined,
  };
  vm.createContext(context); vm.runInContext(code, context); context[name](data);
  return nodes[name === 'renderPairs' ? '#pairsList' : '#verifyList'].innerHTML;
}

test('aggregate includes four verified addends and the separate total source', () => {
  const c = verify.pairs.find(p => p.group_id === 'D8-PAIR-002').corroborations[0];
  assert.equal(c.evidence_complete, true);
  assert.equal(c.parts.length, 4);
  for (const side of [...c.parts, c.aggregate]) {
    assert.equal(side.source.source_verified, true);
    assert.ok(side.source.block_text.includes(side.source.quote));
    assert.ok(side.source.dataset && side.source.event_id && side.source.field && side.source.page);
  }
  assert.equal(c.parts.reduce((n, s) => n + s.value, 0), c.aggregate.value);
  assert.equal(c.aggregate.source.case_id, 'D5-EQC-003');
});
test('ordinary corroboration sources preserve the selected holder, field and exact quote', () => {
  const c = verify.pairs.find(p => p.group_id === 'D8-PAIR-001').corroborations[0];
  assert.equal(c.sources.length, 2);
  assert.deepEqual(c.sources.map(s => [s.entity, s.field, s.quote, s.page]), [
    ['蔚文绪', 'shares_before', '14,722,917', 10], ['蔚文绪', 'shares_before', '14,722,917', 18],
  ]);
});
test('controlled conflict is separate from the thirteen real pair groups', () => {
  assert.equal(pairs.groups.length, 13); assert.equal(verify.pairs.length, 13);
  // 2026-10-17 陈 M-12 语义（宗验收口径）：受控段为全集（019 restated＋020 conflict），独立成段不混入 13 组
  assert.equal(verify.controlled_cases.length, 2);
  const c19 = verify.controlled_cases.find(c => c.case_id === 'D9-RULE-019');
  assert.equal(c19.expected_verdict, 'restated'); assert.equal(c19.verdict, 'restated'); assert.equal(c19.no_real_pdf, true);
  const c = verify.controlled_cases.find(c => c.case_id === 'D9-RULE-020');
  assert.equal(c.synthetic_controlled, true); assert.equal(c.verdict, 'conflict');
  assert.equal(c.difference, 200000); assert.equal(c.pairing_tested, false);
  assert.deepEqual(c.sides.map(s => s.value), [5000000, 5200000]);
  for (const cs of verify.controlled_cases) for (const side of cs.sides) { assert.equal(side.page, null); assert.equal(side.block_verified, null); assert.match(side.quote, /受控构造/); }
});
test('pair sources reference field evidence and unreadable member remains unavailable', () => {
  const known = pairs.groups.find(g => g.group_id === 'D8-PAIR-001');
  assert.ok(known.members.every(m => m.sources.some(s => s.source_verified && s.field === 'shares_before')));
  const scan = pairs.groups.find(g => g.group_id === 'D8-PAIR-013');
  assert.deepEqual(scan.members[0].sources, []); assert.equal(scan.b.predicted_relation, 'unknown');
});
test('aggregate rendering shows calculation and source controls without verbatim-equality claims', () => {
  const html = render('renderVerify', verify);
  assert.match(html, /合计勾稽一致/); assert.match(html, /3,680,700/); assert.match(html, /2,975,600/);
  assert.match(html, /430,000/); assert.match(html, /1,341,600/); assert.match(html, /8,427,900/);
  assert.match(html, /data-source=/); assert.doesNotMatch(html, /两份公告逐字一致/);
});
test('controlled conflict is visibly labelled with premise and no PDF claims', () => {
  const html = render('renderVerify', verify);
  assert.match(html, /D9-RULE-020/); assert.match(html, /受控构造/); assert.match(html, /200,000/);
  assert.match(html, /已设定同事件/); assert.match(html, /无真实 PDF/);
});
test('pair copy describes saved public development results and manual rerun', () => {
  const html = render('renderPairs', pairs);
  assert.match(html, /公开开发配对/); assert.match(html, /已有结果回放/);
  assert.match(html, /补齐证据并重新运行后复核/); assert.doesNotMatch(html, /封存配对清单|自动重判/);
  assert.match(html, /data-source=/);
});
test('source-free corroboration never renders a successful evidence verdict', () => {
  const data = { summary: {}, findings: [], pairs: [{ group_id: 'missing', corroborations: [{ field: 'change_shares', entity: '<img onerror=x>', value: 99, docs: ['a', 'b'], quotes: ['', ''] }] }] };
  const html = render('renderVerify', data);
  assert.match(html, /证据待复核/); assert.doesNotMatch(html, /✓|<img/);
});

test('source field navigation activates an existing chapter and the exact event row', async () => {
  const s = verify.pairs.find(p => p.group_id === 'D8-PAIR-002').corroborations[0].aggregate.source;
  const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  const code = app.slice(app.indexOf('async function openSourceField('), app.indexOf('ReviewView.bind(document'));
  let chapter, scrolled = false, selected = false;
  const row = { dataset: { event: s.event_id, fn: s.field }, classList: { add: () => { selected = true; } }, scrollIntoView: () => { scrolled = true; } };
  const evidence = { ...s, evidence_id: 'selected-source' };
  const result = { events: [{ event_id: s.event_id, fields: { [s.field]: { evidence_ids: ['selected-source'] } } }], evidences: [evidence] };
  const context = { wsClose() {}, toastShow() {}, loadDataset: async name => { assert.equal(name, s.dataset); return result; },
    evIds: f => f.evidence_ids || [], $: () => ({}), activate: name => { chapter = name; },
    document: { querySelectorAll: selector => selector === 'tr.frow' ? [row] : [] } };
  vm.createContext(context); vm.runInContext(code, context); await context.openSourceField(s);
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.ok(html.includes(`id="view-${chapter}"`), 'field navigation must activate a real chapter');
  assert.equal(selected, true); assert.equal(scrolled, true);
});

test('saved review copy matches the owner-local user-visible expectation', () => {
  const sample = { ...verify, findings: [], pairs: verify.pairs.filter(p => p.group_id === 'D8-PAIR-002') };
  const text = render('renderVerify', sample).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() + '\n';
  assert.equal(text, fs.readFileSync(path.join(__dirname, 'tests/expected/review.txt'), 'utf8'));
});
