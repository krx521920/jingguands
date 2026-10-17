import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { stabilizeNoticeStatus } from '../../../../scripts/jingguan/lib/notice_status.mjs'
const root = resolve(import.meta.dirname, '../../../..')
const read = name => JSON.parse(readFileSync(resolve(import.meta.dirname, name), 'utf8'))
const manifest = read('manifest.json'), ids = new Set(), records = []
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
for (const [file, expected] of Object.entries(manifest.source_hashes)) assert.equal(hash(readFileSync(resolve(root, file))), expected)
function key(e) {
  const fields = { pledge: ['pledgor', 'pledgee', 'direction'], equity_change: ['holder', 'direction'], award_contract: ['bidder', 'project_name'] }[e.event_type]
  return [e.event_type, ...fields.map(n => e.fields[n]?.value)].join('|')
}
function rows(envelope) {
  const output = {}
  for (const event of envelope.events) {
    const name = key(event); assert(!(name in output), 'duplicate business key')
    output[name] = Object.fromEntries(Object.entries(event.fields).map(([n, f]) => [n, Object.fromEntries(['status', 'value', 'unit', 'standardized', 'denominator'].map(k => [k, f[k]]))]))
  }
  return output
}
let anchors = 0
for (const item of manifest.runs) {
  const bytes = readFileSync(resolve(import.meta.dirname, item.file))
  assert.equal(hash(bytes), item.sha256)
  const record = JSON.parse(bytes), { envelope: env, call_log: log } = record
  assert(!ids.has(env.run_id)); ids.add(env.run_id)
  assert.equal(env.run_id, log.run_id); assert.equal(env.is_mock, false); assert.equal(log.is_mock, false)
  assert.equal(log.endpoint, 'https://api.deepseek.com/chat/completions')
  assert.equal(log.cache.enabled, false); assert.equal(log.error, null); assert.deepEqual(env.run_meta.errors, [])
  const blocks = env.source.parse_meta.blocks, index = new Map(blocks.map(b => [b.block_id, b]))
  for (const event of env.events) for (const f of Object.values(event.fields)) for (const p of f.provenance) {
    assert(p.quote && index.get(p.block_id)?.text_raw.includes(p.quote)); anchors++
  }
  const updated = structuredClone(env.events)
  stabilizeNoticeStatus(updated, blocks, [])
  assert.deepEqual(rows({ events: updated }), rows(env), 'final guarded rule retains actual cold-run outputs')
  records.push(record)
}
assert.equal(records.length, 8)
assert.equal(records.filter(r => r.channel === 'web').length, 3)
let fields = 0
for (const web of records.filter(r => r.channel === 'web')) {
  const cli = records.find(r => r.channel === 'cli' && r.case === web.case)
  assert(cli); assert.equal(web.envelope.source.file_sha256, cli.envelope.source.file_sha256)
  assert.deepEqual(rows(web.envelope), rows(cli.envelope)); fields += Object.values(rows(web.envelope)).reduce((n, x) => n + Object.keys(x).length, 0)
}
assert.equal(fields, 125)
const repeated = records.filter(r => r.channel === 'cli' && r.case === 'D6-AWD-002')
assert.equal(repeated.length, 3)
for (const record of repeated) assert.deepEqual(rows(record.envelope), rows(repeated[0].envelope))
console.log(JSON.stringify({ runs: records.length, web_cli_fields_same: fields, web_cli_fields_total: fields, strict_anchors: anchors, cold_award_runs: repeated.length, result: 'PASS' }))
