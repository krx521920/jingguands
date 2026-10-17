const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createResolver, enrichCorroboration, memberSources, controlledCases } = require('../../cjh/page_prototype/bridge/review_evidence.js');
const view = require('./review_view.js');
const root = path.resolve(__dirname, '../../..');
const data = path.join(root, 'workspace/cjh/page_prototype/data');
const datasetFor = id => /^D5-EQC-\d{3}$/.test(id) ? 'wei_real_eqc_' + id.slice(-3) : null;
const read = name => JSON.parse(fs.readFileSync(path.join(data, name + '.json'), 'utf8'));
const selector = { entity: '蔚文绪', field: 'shares_before', value: 14722917, quote: '14,722,917' };
const key = 'prove' + 'nance';
const fixture = read('wei_real_eqc_001');
const report = JSON.parse(fs.readFileSync(path.join(data, 'pairs/b_report.json'), 'utf8'));
const aggregate = report.results.find(r => r.group_id === 'D8-PAIR-002').consistency.corroborations[0];
const resolver = createResolver(read, datasetFor);

for (const [name, mutate] of [
  ['empty quotation', env => { env.events[0].fields.shares_before[key][0].quote = ' '; }],
  ['foreign block', env => { env.events[0].fields.shares_before[key][0].block_id = 'wrong'; }],
  ['wrong page', env => { env.events[0].fields.shares_before[key][0].page = 99; }],
  ['wrong value', env => { env.events[0].fields.shares_before.value = 7; }],
  ['wrong holder', env => { env.events[0].fields.holder.value = '另一个股东'; }],
  ['wrong quote', env => { env.events[0].fields.shares_before[key][0].quote = 'invented'; }],
  ['duplicate event identity', env => { env.events.push({ ...structuredClone(env.events[0]), event_id: 'duplicate' }); }],
  ['duplicate block identity', env => { env.source.parse_meta.blocks.push(structuredClone(env.source.parse_meta.blocks.find(b => b.block_id === env.events[0].fields.shares_before[key][0].block_id))); }],
  ['unreadable field', env => { env.events[0].fields.shares_before.status = 'unreadable'; }],
]) test(`source rejects ${name}`, () => {
  const env = structuredClone(fixture); mutate(env);
  const source = createResolver(() => env, datasetFor)('D5-EQC-001', selector);
  assert.equal(source.source_verified, false);
  assert.doesNotMatch(view.sourceCard(source, 'A'), /data-source=/);
});

test('unmapped, missing and unreadable envelopes do not invent sources', () => {
  assert.equal(resolver('missing', selector).source_verified, false);
  const missing = () => { throw Error('missing'); };
  assert.equal(createResolver(missing, datasetFor)('D5-EQC-001', selector).source_verified, false);
  assert.deepEqual(memberSources('missing', null, resolver, read, datasetFor), []);
  assert.deepEqual(memberSources('D5-EQC-001', null, resolver, missing, datasetFor), []);
  assert.deepEqual(memberSources('D5-EQC-001', null, resolver, () => ({ events: [] }), datasetFor), []);
});

for (const [name, mutate] of [
  ['missing addend', c => c.parts.pop()],
  ['duplicate addend', c => { c.parts.push(c.parts[0]); c.aggregate.value += c.parts[0].value; }],
  ['missing aggregate', c => { c.aggregate = null; }],
  ['non-numeric addend', c => { c.parts[0].value = '3680700'; }],
  ['infinite amount', c => { c.aggregate.value = Infinity; }],
  ['empty parts', c => { c.parts = []; }],
]) test(`aggregate cannot pass with ${name}`, () => {
  const c = structuredClone(aggregate); mutate(c);
  const enriched = enrichCorroboration(c, resolver);
  assert.equal(enriched.evidence_complete, false);
  const html = view.verify({ pairs: [{ group_id: 'broken', corroborations: [enriched] }] });
  assert.match(html, /证据待复核/); assert.doesNotMatch(html, /合计勾稽一致/);
});

test('aggregate requires common units and all exact source bindings', () => {
  const wrongUnit = (id, select) => ({ ...resolver(id, select), unit: id === 'D5-EQC-003' ? 'yuan' : 'shares' });
  assert.equal(enrichCorroboration(aggregate, wrongUnit).evidence_complete, false);
  const missingQuote = (id, select) => ({ ...resolver(id, select), source_verified: false });
  assert.equal(enrichCorroboration(aggregate, missingQuote).evidence_complete, false);
});
test('ordinary evidence cannot use duplicated document or absent original quote', () => {
  const c = report.results[0].consistency.corroborations[0];
  assert.equal(enrichCorroboration({ ...c, docs: [c.docs[0], c.docs[0]] }, resolver).evidence_complete, false);
  assert.equal(enrichCorroboration({ ...c, quotes: [] }, resolver).evidence_complete, false);
});
test('source dialog escapes quotes and block text, and refuses an unverified source', () => {
  const s = { ...resolver('D5-EQC-001', selector), quote: '<img src=x onerror=alert(1)>', block_text: 'before <img src=x onerror=alert(1)> after' };
  const html = view.sourceDetail(s);
  assert.match(html, /<mark>&lt;img/); assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(view.sourceCard(s, 'A'), /<img/);
  assert.match(view.sourceDetail(null), /无法定位原文/);
});
test('controlled fixtures reject changed inputs and reports instead of serving stale results', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'finstruct-review-sealed-'));
  try {
    const files = ['evaluation/2026-10-17-delivery-metrics/metrics.json', 'evaluation/2026-10-17-delivery-metrics/d9-report.json', 'evaluation/D9/cases/rules-cases.dev.json'];
    for (const file of files) { const dest = path.join(temp, file); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(path.join(root, file), dest); }
    const sealed = controlledCases(temp);
    // 2026-10-17 受控段为全集（019 restated＋020 conflict）——按 case_id 取数，不依赖顺序
    assert.equal(sealed.length, 2);
    assert.equal(sealed.find(c => c.case_id === 'D9-RULE-019').verdict, 'restated');
    assert.equal(sealed.find(c => c.case_id === 'D9-RULE-020').difference, 200000);
    for (const file of files.slice(1)) {
      fs.appendFileSync(path.join(temp, file), ' ');
      assert.throws(() => controlledCases(temp), /已变化/);
      fs.copyFileSync(path.join(root, file), path.join(temp, file));
    }
  } finally { assert.equal(path.dirname(temp), path.resolve(os.tmpdir())); fs.rmSync(temp, { recursive: true, force: true }); }
});
