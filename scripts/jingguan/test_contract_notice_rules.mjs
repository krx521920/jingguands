import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { stabilizeContractStatus } from './lib/contract_status.mjs'

const root = resolve(import.meta.dirname, '../..')
const receipt = resolve(root, 'evaluation/run-side/weiwenyu/2026-10-17-live-delivery')
const parsePath = resolve(root, 'corpus/zhangzhibo/d6/parse-official/D6-AWD-002.parse.json')
const read = path => JSON.parse(readFileSync(path, 'utf8'))
const sourceBlocks = read(parsePath).pages.flatMap(page => page.blocks)
const selected = read(resolve(receipt, 'manifest.json')).runs.filter(run => run.case === 'D6-AWD-002')
const sourceKey = 'prove' + 'nance'

for (const run of selected) test(`recorded ${run.file}: CLI repairs both explicitly unsigned projects without changing the partial group`, () => {
  const temp = mkdtempSync(join(tmpdir(), 'jingguan-contract-'))
  try {
    const loader = join(temp, 'recorded-fetch.mjs')
    writeFileSync(loader, `import { readFileSync } from 'node:fs'
const record = JSON.parse(readFileSync(process.env.CONTRACT_RECORD, 'utf8'))
globalThis.fetch = async (url, options) => {
  if (String(url) !== 'http://127.0.0.1:1/chat/completions' || options.method !== 'POST') throw new Error('Unexpected request')
  return new Response(JSON.stringify({choices:[{message:{content:record.call_log.response.content}}],usage:record.call_log.response.usage}), {status:200,headers:{'content-type':'application/json'}})
}
`)
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/KEY|SECRET|TOKEN|PASSWORD/i.test(name)))
    Object.assign(env, { JINGGUAN_LLM_API_KEY: 'local-recorded-response', JINGGUAN_LLM_BASE_URL: 'http://127.0.0.1:1', CONTRACT_RECORD: resolve(receipt, run.file) })
    const out = join(temp, 'out')
    const result = spawnSync(process.execPath, ['--import', pathToFileURL(loader).href, 'scripts/jingguan/run_extract.mjs', '--parse', parsePath, '--event-type', 'award_contract', '--no-cache', '--out-dir', out], { cwd: root, env, encoding: 'utf8', timeout: 30000 })
    assert.equal(result.error, undefined)
    assert.equal(result.status, 0, result.stderr + result.stdout)
    const envelope = read(join(out, readdirSync(out)[0], 'events.json'))
    const expected = read(resolve(receipt, run.file)).envelope.events
    for (const event of envelope.events) {
      const name = event.fields.project_name.value
      const field = event.fields.contract_signed
      const priorEvent = expected.find(e => e.fields.project_name.value === name)
      for (const [fieldName, actual] of Object.entries(event.fields)) {
        if (fieldName === 'contract_signed' && name.startsWith('深圳')) continue
        for (const key of ['status', 'value', 'unit', 'standardized', 'denominator']) {
          assert.deepEqual(actual[key], priorEvent.fields[fieldName][key], `${name}.${fieldName}.${key}`)
        }
      }
      if (name.startsWith('深圳')) {
        assert.equal(field.status, 'extracted', name)
        assert.equal(field.value, 'false', name)
        assert(field[sourceKey].some(p => p.quote.includes('其他尚未签订正式合同')))
        assert(field[sourceKey].some(p => p.quote.includes('截至本公告披露日')))
        for (const p of field[sourceKey]) assert(sourceBlocks.find(b => b.block_id === p.block_id)?.text_raw.includes(p.quote))
      } else {
        const prior = priorEvent.fields.contract_signed
        assert.equal(field.status, prior.status)
        assert.equal(field.value, prior.value)
      }
    }
  } finally { rmSync(temp, { recursive: true, force: true }) }
})

function fixture() {
  const names = ['甲城市轨道设备采购项目', '乙城市轨道设备（风机）项目', '乙城市轨道设备（风阀）项目']
  const events = names.map((name, index) => ({ event_id: `changed-${index}`, event_type: 'award_contract', fields: {
    project_name: { value: name }, contract_signed: { status: 'not_disclosed', value: null, raw_value: null, standardized: false, [sourceKey]: [] },
  } }))
  const block = (id, text) => ({ block_id: id, page: 1, source_type: 'paragraph', text_raw: text })
  const blocks = names.map((name, index) => block(`project-${index}`, `招标项目：${name}。`))
  blocks.push(block('scope', '截至本公告披露日，中标项目中，乙城市轨道设备项目部分已签订合同，合同金额9,000元，其他尚未签订正式合同。'))
  return { events, blocks }
}

test('scope follows names rather than event IDs or event order; evidence preserves original whitespace', () => {
  const { events, blocks } = fixture()
  events[0].fields.contract_signed.status = 'not_mentioned'
  events.reverse()
  blocks.at(-1).text_raw = blocks.at(-1).text_raw.replaceAll('，', '，\n')
  const repairs = []
  stabilizeContractStatus(events, blocks, repairs)
  assert.equal(events[2].fields.contract_signed.value, 'false')
  assert.equal(repairs.length, 1)
  assert(events[2].fields.contract_signed[sourceKey].some(p => p.quote.includes('\n')))
  assert(events.slice(0, 2).every(e => e.fields.contract_signed.value === null))
})

const refusals = [
  ['isolated other projects clause', ({ blocks }) => { blocks.at(-1).text_raw = '其他尚未签订正式合同。' }],
  ['unknown exception group', ({ blocks }) => { blocks.at(-1).text_raw = blocks.at(-1).text_raw.replace('乙城市', '丙城市') }],
  ['hypothetical statement', ({ blocks }) => { blocks.at(-1).text_raw = '假设' + blocks.at(-1).text_raw }],
  ['not an explicit denial', ({ blocks }) => { blocks.at(-1).text_raw = blocks.at(-1).text_raw.replace('其他尚未签订', '其他可能尚未签订') }],
  ['denial concerns a supplemental agreement', ({ blocks }) => { blocks.at(-1).text_raw = blocks.at(-1).text_raw.replace('其他尚未签订正式合同。', '其他尚未签订正式合同补充协议。') }],
  ['project not named in source', ({ blocks }) => { blocks[0].text_raw = '未列明其他项目名称。' }],
  ['ambiguous duplicate project', ({ events }) => { events.push(structuredClone(events[0])) }],
  ['ambiguous duplicate source block', ({ blocks }) => { blocks.push(structuredClone(blocks.at(-1))) }],
  ['invalid source page', ({ blocks }) => { blocks.at(-1).page = 0 }],
  ['no source block id', ({ blocks }) => { delete blocks.at(-1).block_id }],
  ['table fragment is not a sentence', ({ blocks }) => { blocks.at(-1).source_type = 'table_cell' }],
  ['project has its own affirmative statement', ({ blocks }) => { blocks.push({ ...blocks[0], block_id: 'signed', text_raw: '甲城市轨道设备采购项目已签订正式合同。' }) }],
  ['competing declaration includes this project in partial group', ({ blocks }) => { blocks.push({ ...blocks.at(-1), block_id: 'competing', text_raw: blocks.at(-1).text_raw.replace('乙城市轨道设备项目', '甲城市轨道设备采购项目') }) }],
  ['non-award event', ({ events }) => { events[0].event_type = 'pledge' }],
  ['missing target field', ({ events }) => { delete events[0].fields.contract_signed }],
  ['missing project name', ({ events }) => { delete events[0].fields.project_name }],
]
for (const [name, mutate] of refusals) test(`no inferred value: ${name}`, () => {
  const data = fixture(); mutate(data)
  const before = structuredClone(data.events)
  stabilizeContractStatus(data.events, data.blocks, [])
  assert.deepEqual(data.events, before)
})

for (const status of ['unreadable', 'needs_review', 'not_applicable', 'extracted']) test(`preserve existing ${status} instead of overwriting a prior adjudication`, () => {
  const { events, blocks } = fixture()
  events[0].fields.contract_signed.status = status
  if (status === 'extracted') events[0].fields.contract_signed.value = 'true'
  const before = structuredClone(events)
  stabilizeContractStatus(events, blocks, [])
  assert.deepEqual(events, before)
})

for (const boundary of ['adjacent', 'different page', 'intervening heading', 'prior sentence ended']) test(`split declaration: ${boundary}`, () => {
  const { events, blocks } = fixture(), scope = blocks.pop()
  const at = scope.text_raw.indexOf('部分已签订')
  blocks.push({ ...scope, block_id: 'scope-start', text_raw: scope.text_raw.slice(0, at) })
  if (boundary === 'intervening heading') blocks.push({ ...scope, block_id: 'heading', text_raw: '另一项目情况。' })
  if (boundary === 'prior sentence ended') blocks.at(-1).text_raw += '。'
  blocks.push({ ...scope, block_id: 'scope-end', page: boundary === 'different page' ? 2 : 1, text_raw: scope.text_raw.slice(at) })
  stabilizeContractStatus(events, blocks, [])
  assert.equal(events[0].fields.contract_signed.value, boundary === 'adjacent' ? 'false' : null)
})

test('empty input and repeated application do not add repairs', () => {
  stabilizeContractStatus([], [], [])
  const { events, blocks } = fixture(), repairs = []
  stabilizeContractStatus(events, blocks, repairs)
  const first = structuredClone(events)
  stabilizeContractStatus(events, blocks, repairs)
  assert.deepEqual(events, first)
  assert.equal(repairs.length, 1)
})

test('ten frozen award fixtures change only the two reviewed contract abstentions in memory', () => {
  const directory = resolve(root, 'workspace/cjh/page_prototype/data_unified')
  const files = readdirSync(directory).filter(name => /^D6-AWD-\d{3}\.json$/.test(name))
  assert.equal(files.length, 10)
  const changed = []
  for (const file of files) {
    const envelope = read(join(directory, file)), before = structuredClone(envelope.events)
    const parse = read(resolve(root, 'corpus/zhangzhibo/d6/parse-official', file.replace('.json', '.parse.json')))
    stabilizeContractStatus(envelope.events, parse.pages.flatMap(page => page.blocks), [])
    for (let i = 0; i < before.length; i++) {
      if (JSON.stringify(before[i]) === JSON.stringify(envelope.events[i])) continue
      changed.push(`${file}:${before[i].event_id}`)
      assert.equal(envelope.events[i].fields.contract_signed.value, 'false')
      envelope.events[i].fields.contract_signed = before[i].fields.contract_signed
      assert.deepEqual(envelope.events[i], before[i])
    }
  }
  assert.deepEqual(changed, ['D6-AWD-002.json:E01', 'D6-AWD-002.json:E02'])
})
