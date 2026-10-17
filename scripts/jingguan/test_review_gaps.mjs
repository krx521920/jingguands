/** Regression checks for incomplete scoring input and conflicting notice statements. No model calls. */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { stabilizeNoticeStatus } from './lib/notice_status.mjs'
import { validateAgainstSchema } from './lib/schema_validator.mjs'
const root = resolve(import.meta.dirname, '../..')
const temp = mkdtempSync(join(tmpdir(), 'finstruct-review-gaps-'))
const original = JSON.parse(readFileSync(join(root, 'evaluation/2026-10-17-delivery-metrics/d9-report.json'), 'utf8'))
const checks = [], failures = []
function check(name, fn) {
  try { fn(); checks.push(name); console.log('PASS ' + name) }
  catch (error) { failures.push({ name, message: error.message }); console.log('FAIL ' + name + ': ' + error.message) }
}
let seq = 0
function score(report, strict = true) {
  const input = join(temp, `${++seq}.json`), output = join(temp, `${seq}-score.json`)
  writeFileSync(input, JSON.stringify(report))
  const child = spawnSync(process.execPath, ['evaluation/D9/score-rules.mjs', '--report', input, '--json', output, ...(strict ? ['--strict'] : [])], { cwd: root, encoding: 'utf8', timeout: 20000 })
  assert.equal(child.error, undefined); assert.equal(child.signal, null)
  return { exit: child.status, ...JSON.parse(readFileSync(output, 'utf8')) }
}
const clone = () => structuredClone(original)
try {
  check('complete D9 remains 20/20', () => { const r = score(original); assert.equal(r.exit, 0); assert.equal(r.pass, 20) })
  for (const [name, mutate] of [
    ['missing summands', r => { r.computed = [{ name: 'sum', sum: 1 }] }],
    ['empty summands', r => { r.computed[0].terms = [] }],
    ['non-numeric sum', r => { r.computed[0].sum = 'not-a-number' }],
    ['null sum', r => { r.computed[0].sum = null }],
    ['boolean sum', r => { r.computed[0].sum = true }],
    ['blank sum', r => { r.computed[0].sum = ' ' }],
    ['missing aggregate', r => { delete r.computed[0].aggregate_side }],
    ['invalid aggregate number', r => { r.computed[0].aggregate_side.value = 'not-a-number' }],
    ['missing term value', r => { delete r.computed[0].terms[0].value }],
    ['missing term quote', r => { delete r.computed[0].terms[0].quote }],
    ['unresolvable term document', r => { r.computed[0].terms[0].doc = 'ABSENT_DOC' }],
    ['forged aggregate quote', r => { r.computed[0].aggregate_side.quote = 'FAKE_AGGREGATE_QUOTE' }],
    ['all sides removed', r => { r.sides = [] }],
    ['one side removed', r => { r.sides.pop() }],
    ['duplicate replaces second side', r => { r.sides[1] = structuredClone(r.sides[0]) }],
    ['whitespace quote', r => { r.sides[0].quote = ' \n\t ' }],
    ['null side', r => { r.sides[0] = null }]
  ]) check(name + ' is rejected', () => {
    const doc = clone(); mutate(doc.cases.find(c => c.case_id === 'D9-RULE-005'))
    const r = score(doc); assert.equal(r.exit, 1); assert.equal(r.pass, 19); assert.equal(r.fail, 1)
  })
  for (const strict of [false, true]) check(`missing case counted separately (strict=${strict})`, () => {
    const doc = clone(); doc.cases.pop()
    const r = score(doc, strict)
    assert.equal(r.exit, strict ? 1 : 0); assert.equal(r.scored, 19); assert.equal(r.not_run, 1)
    assert.equal(r.fail, 0); assert.equal(r.pass + r.fail + r.not_run, r.cases_total)
  })
  check('nonempty whitespace-normalized source quote remains accepted', () => {
    const doc = clone(); doc.cases[0].sides[0].quote = '11, 042, 217'; assert.equal(score(doc).exit, 0)
  })
  const project = '风机设备及服务采购项目'
  const negative = { block_id: 'history', page: 1, text_raw: `截至2026年10月1日，${project}尚未取得最终的中标通知书。` }
  const positive = { block_id: 'current', page: 1, text_raw: `2026年10月5日，公司已收到${project}的正式中标通知书。` }
  function event(name = project, value = 'true') {
    return { event_id: 'E01', event_type: 'award_contract', fields: { project_name: { value: name }, formal_award_notice_received: { status: 'extracted', value, unit: 'text', standardized: true, raw_value: positive.text_raw, provenance: [{ block_id: positive.block_id, page: 1, quote: positive.text_raw }] } } }
  }
  for (const order of [[negative, positive], [positive, negative]]) check('opposed same-project statements need review regardless of block order: ' + order[0].block_id, () => {
    const e = event(), repairs = []; stabilizeNoticeStatus([e], order, repairs)
    const f = e.fields.formal_award_notice_received
    assert.equal(f.status, 'needs_review'); assert.equal(f.value, null); assert.equal(f.standardized, false)
    assert.deepEqual(new Set(f.provenance.map(p => p.block_id)), new Set(['history', 'current']))
    for (const p of f.provenance) assert(order.find(b => b.block_id === p.block_id).text_raw.includes(p.quote))
    assert(repairs.length > 0)
    const before = structuredClone(e); stabilizeNoticeStatus([e], order, repairs); assert.deepEqual(e, before)
  })
  check('same-block opposed statements need review', () => {
    const e = event(); stabilizeNoticeStatus([e], [{ ...negative, text_raw: negative.text_raw + positive.text_raw }], [])
    assert.equal(e.fields.formal_award_notice_received.status, 'needs_review')
  })
  check('affirmative statement for another project does not cancel the denial', () => {
    const e = event(project, 'false'), other = event('风阀设备及服务采购项目')
    stabilizeNoticeStatus([e, other], [negative, { ...positive, text_raw: '风阀设备及服务采购项目已收到中标通知书。' }], [])
    assert.equal(e.fields.formal_award_notice_received.value, 'false'); assert.equal(other.fields.formal_award_notice_received.value, 'true')
  })
  check('positive-only notice retains extracted result', () => {
    const e = event(), before = structuredClone(e); stabilizeNoticeStatus([e], [positive], []); assert.deepEqual(e, before)
  })
  check('review result remains a valid exportable v0.3 envelope', () => {
    const envelope = JSON.parse(readFileSync(join(root, 'workspace/cjh/page_prototype/data_unified/D6-AWD-002.json'), 'utf8'))
    const current = envelope.events[0]
    current.fields.project_name.value = project
    stabilizeNoticeStatus([current], [negative, positive], [])
    assert.equal(current.fields.formal_award_notice_received.status, 'needs_review')
    const schema = JSON.parse(readFileSync(join(root, 'interface/event-envelope.schema.json'), 'utf8'))
    assert.deepEqual(validateAgainstSchema(envelope, schema), [])
  })
  check('non-BMP text before project preserves exact source quote', () => {
    const e = event(project, 'false'), block = { ...negative, text_raw: '📌' + negative.text_raw }
    stabilizeNoticeStatus([e], [block], [])
    assert.equal(e.fields.formal_award_notice_received.provenance[0].quote, project + '尚未取得最终的中标通知书')
  })
  console.log(JSON.stringify({ passed: checks.length, failed: failures.length, failures }))
  if (failures.length) process.exitCode = 1
} finally {
  assert.equal(dirname(temp), resolve(tmpdir())); rmSync(temp, { recursive: true, force: true })
}
