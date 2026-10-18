/** Source integrity and denominator regressions; all mutations use a private copied corpus. */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, cpSync, rmSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
const root = resolve(import.meta.dirname, '../..'), temp = mkdtempSync(join(tmpdir(), 'finstruct-source-tests-'))
const json = file => JSON.parse(readFileSync(file, 'utf8'))
const overlay = 'evaluation/2026-10-18-closure/gold-corrections-v1.4.json'
const checks = [], failures = []
function check(name, fn) { try { fn(); checks.push(name); console.log('PASS ' + name) } catch (e) { failures.push({ name, error: e.message }); console.log('FAIL ' + name + ': ' + e.message) } }
function run(script, args = [], cwd = temp) { return spawnSync(process.execPath, [join(root, script), ...args], { cwd, encoding: 'utf8' }) }
function copy(file) { const dest = join(temp, file); mkdirSync(dirname(dest), { recursive: true }); cpSync(join(root, file), dest, { recursive: true }) }
function score() { const file = join(temp, 'score.json'); const r = run('evaluation/2026-10-12-scorecard/build-scorecard.mjs', ['--json', file]); return { ...r, data: r.status === 0 ? json(file) : null } }
try {
  for (const file of ['evaluation/D11/firsttest-envelopes', 'evaluation/D11/results', 'evaluation/D10/results', 'evaluation/D12/results-zong-independent.json', 'evaluation/D12/results-C-byte-verification.json', 'evaluation/D4/dev/gold', 'evaluation/D5/dev/gold', 'evaluation/D6/dev/gold', 'evaluation/2026-10-15-caliber', 'evaluation/2026-10-17-gold-review', 'evaluation/2026-10-18-closure', 'corpus/zhangzhibo', 'runs/batch-20261008T150554/batch_report.json', 'runs/batch-20261008T150658/batch_report.json']) copy(file)
  const result = score(); assert.equal(result.status, 0, result.stderr)
  const metrics = Object.fromEntries(result.data.scores.map(s => [s.key, s]))
  check('accuracy uses filled 437; recall uses Gold 436', () => {
    assert.deepEqual([metrics.field_accuracy.num, metrics.field_accuracy.den, metrics.field_accuracy.value], [434, 437, 99.31])
    assert.deepEqual([metrics.gold_expected_field_recall.num, metrics.gold_expected_field_recall.den], [434, 436])
  })
  check('performance derives 19.342 seconds from recorded timings', () => { assert.equal(metrics.perf_20page.value, 19.342); assert.match(metrics.perf_20page.note, /不含 PDF|不含PDF/) })
  check('reviewed abstentions expose 153/155 with no pending reviews and 14 scan items excluded', () => {
    const m = metrics.abstain_reviewed_correct; assert.ok(m); assert.deepEqual([m.num, m.den, m.value], [153, 155, 98.71]); assert.match(m.note, /169.*169/); assert.match(m.note, /11/); assert.match(m.note, /14/)
  })
  const original = readFileSync(join(temp, overlay))
  const performancePath = join(temp, 'runs/batch-20261008T150554/batch_report.json'), originalPerformance = readFileSync(performancePath)
  for (const [name, mutate] of [
    ['missing slowest performance sample', d => { d.results = d.results.filter(r => r.case !== 'D5-EQC-002') }],
    ['duplicate performance run', d => { d.results[1].run_id = d.results[0].run_id }],
    ['timing summary inconsistent with rows', d => { d.timing.slowest_ms-- }],
  ]) check(name + ' is rejected', () => { try { const d = JSON.parse(originalPerformance); mutate(d); writeFileSync(performancePath, JSON.stringify(d)); assert.notEqual(score().status, 0) } finally { writeFileSync(performancePath, originalPerformance) } })
  const goldPath = join(temp, 'evaluation/D6/dev/gold/D6-AWD-001.envelope.json'), originalGold = readFileSync(goldPath)
  for (const [name, mutate] of [
    ['empty Gold fields', g => { g.events[0].fields = {} }],
    ['duplicate Gold event ID', g => { g.events.push(structuredClone(g.events[0])) }],
    ['missing registered Gold field', g => { delete g.events[0].fields.bidder }],
    ['unknown Gold field', g => { g.events[0].fields.invented = g.events[0].fields.bidder }],
    ['unknown Gold status', g => { g.events[0].fields.bidder.status = 'invented' }],
    ['extracted Gold without value', g => { g.events[0].fields.bidder.value = null; g.events[0].fields.bidder.raw_value = null }],
    ['non-valued Gold with value', g => { g.events[0].fields.bidder.status = 'not_mentioned' }],
  ]) check(name + ' is rejected', () => { try { const g = JSON.parse(originalGold); mutate(g); writeFileSync(goldPath, JSON.stringify(g)); assert.notEqual(score().status, 0) } finally { writeFileSync(goldPath, originalGold) } })
  check('duplicate review row cannot raise the reviewed correct count', () => {
    const file = join(temp, 'evaluation/2026-10-17-gold-review/弃权复核-第二批69条-20261017.csv'), original = readFileSync(file, 'utf8')
    try { const rows = original.trim().split(/\r?\n/); rows[2] = rows[1]; writeFileSync(file, rows.join('\n') + '\n'); assert.notEqual(score().status, 0) } finally { writeFileSync(file, original) }
  })
  check('explicit second-batch event cannot be reviewed repeatedly', () => {
    const file = join(temp, 'evaluation/2026-10-17-gold-review/弃权复核-第二批69条-20261017.csv'), original = readFileSync(file, 'utf8')
    try { writeFileSync(file, original.replaceAll('"D6-AWD-002","","consortium_members"', '"D6-AWD-002","E01","consortium_members"')); assert.notEqual(score().status, 0) } finally { writeFileSync(file, original) }
  })
  check('wrong value reduces precision without changing the recall view', () => {
    try {
      const d = JSON.parse(originalGold); d.events[0].fields.tenderer.value = '独立错值对照主体'; writeFileSync(goldPath, JSON.stringify(d))
      const r = score(); assert.equal(r.status, 0, r.stderr)
      const recall = r.data.scores.find(s => s.key === 'gold_expected_field_recall'), caliber = r.data.caliber.coverage_caliber.find(s => s.key === 'gold_expected_field_recall')
      assert.equal(caliber.num, recall.num); assert.equal(recall.num, 434); assert.equal(r.data.scores.find(s => s.key === 'field_accuracy').num, 433)
    } finally { writeFileSync(goldPath, originalGold) }
  })
  check('ratio denominator mismatch reduces precision but preserves recall', () => {
    const file = join(temp, 'evaluation/D5/dev/gold/D5-EQC-001.envelope.json'), original = readFileSync(file)
    try {
      const d = JSON.parse(original); d.events[0].fields.ratio_before.denominator = 'holder_shares'; writeFileSync(file, JSON.stringify(d))
      const r = score(); assert.equal(r.status, 0, r.stderr)
      assert.equal(r.data.scores.find(s => s.key === 'field_accuracy').num, 433)
      assert.equal(r.data.scores.find(s => s.key === 'gold_expected_field_recall').num, 434)
    } finally { writeFileSync(file, original) }
  })
  for (const [name, change] of [
    ['malformed required Gold', () => writeFileSync(join(temp, overlay), '{bad')],
    ['missing required Gold', () => rmSync(join(temp, overlay))],
    ['unknown Gold target', () => { const d = JSON.parse(original); d.corrections[0].event_id = 'ABSENT'; writeFileSync(join(temp, overlay), JSON.stringify(d)) }],
    ['duplicate Gold correction', () => { const d = JSON.parse(original); d.corrections.push(d.corrections[0]); writeFileSync(join(temp, overlay), JSON.stringify(d)) }],
    ['incorrect Gold from value', () => { const d = JSON.parse(original); d.corrections[0].from = 'true'; writeFileSync(join(temp, overlay), JSON.stringify(d)) }],
  ]) check(name + ' stops generation', () => { try { change(); const r = score(); assert.notEqual(r.status, 0, 'invalid Gold was accepted') } finally { writeFileSync(join(temp, overlay), original) } })
  check('all zero denominators are unmeasured', () => {
    const file = join(temp, 'evaluation/D11/results/d9-v02-score.json'), original = readFileSync(file), d = JSON.parse(original)
    try { d.pass = 0; d.cases_total = 0; writeFileSync(file, JSON.stringify(d)); const r = score(); assert.equal(r.status, 0, r.stderr); assert.equal(r.data.scores.find(s => s.key === 'multi_doc_conflict').value, null) } finally { writeFileSync(file, original) }
  })
  const generated = join(temp, 'shared'); const r = run('scripts/jingguan/build_delivery_metrics.mjs', ['--out-dir', generated], root)
  assert.equal(r.status, 0, r.stderr)
  const shared = json(join(generated, 'metrics.json'))
  check('historical extraction timing cannot pass the PDF-to-page target', () => {
    assert.equal(shared.scores.find(s => s.key === 'perf_20page').target, null)
    const endToEnd = shared.scores.find(s => s.key === 'perf_end_to_end'); assert.ok(endToEnd); assert.equal(endToEnd.value, 5.84); assert.equal(endToEnd.target, 90)
  })
  const require = createRequire(import.meta.url), { readDeliveryMetrics, overlayDeliveryMetrics } = require(join(root, 'workspace/cjh/page_prototype/bridge/delivery_metrics.js'))
  for (const file of Object.keys(shared.input_hashes)) copy(file)
  for (const folder of ['evaluation/D6/dev/gold', 'evaluation/D11/firsttest-envelopes']) check('new input invalidates scorecard: ' + folder, () => {
    const file = join(temp, folder, 'unexpected.envelope.json')
    try { writeFileSync(file, '{}'); assert.match(readDeliveryMetrics(temp, join(generated, 'metrics.json')).error || '', /输入集合已变化/) } finally { rmSync(file) }
  })
  check('Gold, review rows, performance logs are fingerprinted', () => { for (const file of [overlay, 'evaluation/2026-10-15-caliber/gold-corrections-v1.1.json', 'evaluation/D6/dev/gold/D6-AWD-002.envelope.json', 'evaluation/2026-10-17-gold-review/弃权复核-第二批69条-20261017.csv', 'runs/batch-20261008T150554/batch_report.json']) assert.ok(shared.input_hashes[file], file) })
  check('modified Gold rejects stale displayed metrics', () => { try { writeFileSync(join(temp, overlay), '{}'); assert.match(readDeliveryMetrics(temp, join(generated, 'metrics.json')).error || '', /输入已变化/) } finally { writeFileSync(join(temp, overlay), original) } })
  check('shared accuracy and reviewed abstentions preserve semantics', () => { assert.equal(shared.scores.find(s => s.key === 'field_accuracy').den, 437); assert.equal(shared.scores.find(s => s.key === 'abstain_reviewed_correct')?.den, 155) })
  check('registry receives the additional reviewed metric', () => { assert.equal(overlayDeliveryMetrics([], shared).find(s => s.key === 'abstain_reviewed_correct')?.value, 98.71) })
  console.log(JSON.stringify({ passed: checks.length, failed: failures.length, failures }))
  if (failures.length) process.exitCode = 1
} finally { assert.equal(dirname(temp), resolve(tmpdir())); rmSync(temp, { recursive: true, force: true }) }
