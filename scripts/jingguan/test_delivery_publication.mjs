/** The generated report is the same numeric source used by the page and handout. */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, rmSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
const root = resolve(import.meta.dirname, '../..')
const temp = mkdtempSync(join(tmpdir(), 'finstruct-publication-'))
try {
  const generated = spawnSync(process.execPath, ['scripts/jingguan/build_delivery_metrics.mjs', '--out-dir', temp], { cwd: root, encoding: 'utf8' })
  assert.equal(generated.status, 0, generated.stderr + generated.stdout)
  const card = JSON.parse(readFileSync(join(temp, 'metrics.json'), 'utf8'))
  const require = createRequire(import.meta.url)
  const { readDeliveryMetrics, overlayDeliveryMetrics } = require(join(root, 'workspace/cjh/page_prototype/bridge/delivery_metrics.js'))
  const page = readDeliveryMetrics(root, join(temp, 'metrics.json'))
  assert.equal(page.error, undefined)
  assert.deepEqual(page.scores, card.scores)
  const values = Object.fromEntries(card.scores.map(s => [s.key, s]))
  assert.equal(values.evidence_hit_strict.num, 432)
  assert.equal(values.evidence_hit_strict.den, 451)
  assert.equal(values.evidence_hit_strict.value, 95.79)
  assert.equal(values.evidence_hit.num, 451)
  assert.equal(values.web_cli_same_result.num, 125)
  assert.equal(values.web_cli_same_result.den, 125)
  assert.equal(values.multi_doc_conflict.num, 20)
  assert.equal(values.abstain_correct.value, null)
  assert.equal(values.field_coverage.target, null)
  assert.equal(values.field_accuracy.den, 437)
  assert.equal(values.gold_expected_field_recall.den, 438)
  assert.equal(values.perf_20page.value, 19.342)
  assert.equal(values.abstain_reviewed_correct.value, 98.61)
  const registry = overlayDeliveryMetrics([{ key: 'multi_doc_conflict', value: 100, name: 'OLD', target: 90 }, { key: 'evidence_hit', value: 100, target: 95 }], card)
  assert.equal(registry.find(m => m.key === 'multi_doc_conflict').name, values.multi_doc_conflict.name)
  assert.equal(registry.find(m => m.key === 'evidence_hit').target, null)
  assert.equal(overlayDeliveryMetrics([{ key: 'multi_doc_conflict', value: 100 }], { error: '缺失', scores: [] })[0].value, null)
  const md = readFileSync(join(temp, 'metrics.md'), 'utf8')
  for (const s of card.scores.filter(s => s.unit === '%' && s.den > 0)) {
    assert.equal(s.value, +(100 * s.num / s.den).toFixed(2), s.key)
    assert.ok(md.includes(`${s.num}/${s.den}`), s.key + ' missing from handout')
  }
  const bad = structuredClone(card); bad.scores.find(s => s.key === 'multi_doc_conflict').value = 95
  const badFile = join(temp, 'bad.json'); writeFileSync(badFile, JSON.stringify(bad))
  assert.match(readDeliveryMetrics(root, badFile).error, /百分比/)
  assert.equal(readDeliveryMetrics(root, join(temp, 'missing.json')).scores.length, 0)
  const artifact = join(temp, 'd9-score.json'), originalArtifact = readFileSync(artifact)
  writeFileSync(artifact, '{}')
  assert.match(readDeliveryMetrics(root, join(temp, 'metrics.json')).error, /验收产物已变化/)
  writeFileSync(artifact, originalArtifact)
  const fakeRoot = join(temp, 'inputs'); mkdirSync(fakeRoot)
  for (const file of Object.keys(card.input_hashes)) {
    const dest = join(fakeRoot, file); mkdirSync(dirname(dest), { recursive: true }); cpSync(join(root, file), dest)
  }
  for (const file of Object.keys(card.input_hashes)) {
    const p = join(fakeRoot, file); writeFileSync(p, readFileSync(p, 'utf8').replace(/\r?\n/g, '\r\n'))
  }
  assert.equal(readDeliveryMetrics(fakeRoot, join(temp, 'metrics.json')).error, undefined, 'line endings cannot invalidate a clone')
  const first = Object.keys(card.input_hashes)[0]; writeFileSync(join(fakeRoot, first), 'changed')
  assert.match(readDeliveryMetrics(fakeRoot, join(temp, 'metrics.json')).error, /输入已变化/)
  const view = require(join(root, 'workspace/zhangzhibo/ui_redesign/metrics_view.js'))
  assert.equal(view.state({ value: 19.99, target: 90, direction: 'lower' }), '达标')
  assert.equal(view.ratio({ value: 19.99, num: 19.99, den: 90, unit: 's' }), '历史性能实测')
  assert.equal(view.state({ value: 20, target: 90 }), '未达标')
  assert.match(view.render({ delivery_metrics: page }).body, /432\/451/)
  assert.match(view.render({ delivery_metrics: page }).body, /451\/451/)
  assert.ok(!view.render({ delivery_metrics: { error: '缺失', scores: [] }, cards: [{ name: 'STALE', value: 100 }] }).body.includes('STALE'))
  console.log(JSON.stringify({ result: 'PASS', metrics: card.scores.length, page_matches_handout: true, stale_input_rejected: true }))
} finally {
  assert.equal(dirname(temp), resolve(tmpdir())); rmSync(temp, { recursive: true, force: true })
}
