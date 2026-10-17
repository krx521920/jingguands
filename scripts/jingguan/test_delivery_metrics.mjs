/** Delivery scoring regressions use copied inputs; frozen evidence is never changed. */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, rmSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { runInNewContext } from 'node:vm'
import { createRequire } from 'node:module'

const root = resolve(import.meta.dirname, '../..')
const temp = mkdtempSync(join(tmpdir(), 'finstruct-metrics-'))
const failures = []
const checks = []
const json = p => JSON.parse(readFileSync(p, 'utf8'))
function run(script, args = [], cwd = root) {
  const r = spawnSync(process.execPath, [resolve(root, script), ...args], { cwd, encoding: 'utf8' })
  if (r.error) throw r.error
  return r
}
function check(name, fn) {
  try { fn(); checks.push(name); console.log('PASS ' + name) }
  catch (error) { failures.push({ name, error: error.message }); console.log('FAIL ' + name + ': ' + error.message) }
}
try {
  const report = join(temp, 'report.json')
  const generated = run('scripts/jingguan/run_d9_rules.mjs', ['--verify-blocks', 'evaluation/D11/firsttest-envelopes', '--out', report])
  assert.equal(generated.status, 0, generated.stderr + generated.stdout)
  const original = json(report)
  const score = (doc, name) => {
    const input = join(temp, name + '.json'), output = join(temp, name + '-score.json')
    writeFileSync(input, JSON.stringify(doc))
    const r = run('evaluation/D9/score-rules.mjs', ['--report', input, '--strict', '--json', output])
    return { exit: r.status, result: json(output) }
  }
  check('real D9 report passes 20/20', () => {
    const r = score(original, 'clean'); assert.equal(r.exit, 0); assert.equal(r.result.pass, 20)
  })
  for (const [name, mutate, reason] of [
    ['fabricated quote', r => { r.sides[0].quote = 'FABRICATED_QUOTE_123456789' }, 'QUOTE_NOT_IN_BLOCK'],
    ['wrong sum', r => { r.computed[0].sum = Number(r.computed[0].sum) + 1 }, 'COMPUTED_SUM_MISMATCH'],
    ['dangling block', r => { r.sides[0].block_id = 'ABSENT_BLOCK' }, 'DANGLING_BLOCK_ID'],
  ]) check(name + ' must fail', () => {
    const changed = structuredClone(original); mutate(changed.cases.find(c => c.case_id === 'D9-RULE-005'))
    const r = score(changed, name.replaceAll(' ', '-'))
    assert.equal(r.exit, 1, 'invalid report was accepted')
    assert.ok(r.result.rows.some(row => row.notes?.some(note => note.startsWith(reason))))
  })
  const inputs = ['D11/firsttest-envelopes', 'D11/results/single-doc-firsttest.json', 'D11/results/crossdoc-firsttest-score.json', 'D11/results/d8-firsttest-score.json', 'D11/results/d9-v02-score.json', 'D10/results/score-weiwenyu-bundle.json', 'D12/results-zong-independent.json', 'D12/results-C-byte-verification.json']
  for (const file of inputs) {
    const dest = join(temp, 'evaluation', file); mkdirSync(dirname(dest), { recursive: true })
    cpSync(join(root, 'evaluation', file), dest, { recursive: true })
  }
  const changedScore = join(temp, 'evaluation/D11/results/d9-v02-score.json')
  const inputScore = json(changedScore); inputScore.pass = 19; inputScore.fail = 1
  writeFileSync(changedScore, JSON.stringify(inputScore))
  check('scorecard calculates 19/20 as 95%', () => {
    const output = join(temp, 'scorecard.json')
    const r = run('evaluation/2026-10-12-scorecard/build-scorecard.mjs', ['--json', output], temp)
    assert.equal(r.status, 0, r.stderr)
    assert.equal(json(output).scores.find(s => s.key === 'multi_doc_conflict').value, 95)
  })
  check('UI distinguishes pass, no target and unmeasured', () => {
    const source = readFileSync(join(root, 'workspace/zhangzhibo/ui_redesign/app.js'), 'utf8')
    const functionText = source.slice(source.indexOf('function renderMetrics(d)'), source.indexOf('/* ═══════════ 序章数字'))
    const elements = new Map(); const get = id => { if (!elements.has(id)) elements.set(id, { innerHTML: '' }); return elements.get(id) }
    const context = { esc: s => String(s ?? '—'), $: get, countUps() {}, document: { getElementById: get } }
    try { context.MetricsView = createRequire(import.meta.url)(join(root, 'workspace/zhangzhibo/ui_redesign/metrics_view.js')) } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e }
    runInNewContext(functionText + '\nthis.render = renderMetrics', context)
    context.render({ cards: [
      { key: 'a', name: '达标样例', value: 95.79, num: 432, den: 451, unit: '%', target: 95, status: 'pass' },
      { key: 'b', name: '描述性指标', value: 72.11, num: 437, den: 606, unit: '%', target: null, status: 'no_target' },
      { key: 'c', name: '未测样例', value: null, num: null, den: null, unit: '%', target: 98, status: 'unverified' }
    ] })
    const html = [...elements.values()].map(x => x.innerHTML).join('\n')
    assert.ok(html.includes('432/451'), 'numerator and denominator must be visible')
    assert.ok(html.includes('未测'), 'missing evidence must be shown as unmeasured')
    assert.ok(!html.includes('未达'), 'pass/no-target/unmeasured are not failures')
    assert.ok(!html.includes('目标 —'), 'no-target must not render a fake target')
  })
  check('zero-denominator scorecard cannot retain 100%', () => {
    inputScore.pass = 0; inputScore.cases_total = 0
    writeFileSync(changedScore, JSON.stringify(inputScore))
    const output = join(temp, 'zero.json')
    assert.equal(run('evaluation/2026-10-12-scorecard/build-scorecard.mjs', ['--json', output], temp).status, 0)
    assert.equal(json(output).scores.find(s => s.key === 'multi_doc_conflict').value, null)
  })
  console.log(JSON.stringify({ passed: checks.length, failed: failures.length, failures }))
  if (failures.length) process.exitCode = 1
} finally {
  assert.equal(dirname(temp), resolve(tmpdir()))
  rmSync(temp, { recursive: true, force: true })
}
