import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { stabilizeNoticeStatus } from './lib/notice_status.mjs'

const root = resolve(import.meta.dirname, '../..')
const parse = JSON.parse(readFileSync(resolve(root, 'corpus/zhangzhibo/d6/parse-official/D6-AWD-002.parse.json'), 'utf8'))
const blocks = parse.pages.flatMap(p => p.blocks)
const original = JSON.parse(readFileSync(resolve(root, 'workspace/cjh/page_prototype/data_unified/D6-AWD-002.json'), 'utf8'))
for (const status of ['not_mentioned', 'not_disclosed', 'extracted']) {
  const events = structuredClone(original.events)
  events.reverse().forEach((e, i) => {
    e.event_id = `renamed-${i}`
    Object.assign(e.fields.formal_award_notice_received, { status, value: status === 'extracted' ? 'false' : null })
  })
  const repairs = []
  stabilizeNoticeStatus(events, blocks, repairs)
  for (const event of events) {
    const f = event.fields.formal_award_notice_received
    const targeted = event.fields.project_name.value.includes('风机设备及服务采购')
    assert.equal(f.status, targeted ? 'extracted' : 'not_mentioned')
    assert.equal(f.value, targeted ? 'false' : null)
    if (targeted) {
      assert.equal(f.provenance.length, 1)
      const block = blocks.find(b => b.block_id === f.provenance[0].block_id)
      assert(block.text_raw.includes(f.provenance[0].quote))
      assert(f.provenance[0].quote.includes('风机设备'))
    } else assert.deepEqual(f.provenance, [])
  }
  assert(repairs.length > 0)
}
function event(status, value = null) {
  return { event_type: 'award_contract', fields: { project_name: { value: '甲项目' }, formal_award_notice_received: { status, value, raw_value: null, provenance: [] } } }
}
for (const status of ['not_mentioned', 'not_disclosed']) {
  const e = event(status)
  stabilizeNoticeStatus([e], [{ text_raw: '甲项目中标金额一千万元。' }], [])
  assert.equal(e.fields.formal_award_notice_received.status, 'not_mentioned')
}
for (const text of ['甲项目已收到中标通知书。', '甲项目中标通知书收取情况不予披露。', '甲项目尚未收到中标通知书。']) {
  const e = event('not_disclosed')
  const before = structuredClone(e)
  stabilizeNoticeStatus([e], [{ text_raw: text }], [])
  assert.deepEqual(e, before, '有明确通知书叙述的单项目材料交由原抽取结果判定')
}
for (const status of ['unreadable', 'needs_review', 'not_applicable']) {
  const e = event(status)
  stabilizeNoticeStatus([e], [{ text_raw: '甲项目中标。' }], [])
  assert.equal(e.fields.formal_award_notice_received.status, status)
}
{
  const events = [event('extracted', 'false'), event('extracted', 'true')]
  events[0].fields.project_name.value = '甲公司设备采购项目'
  events[1].fields.project_name.value = '乙公司设备采购项目'
  stabilizeNoticeStatus(events, [{ block_id: 'b1', page: 1, text_raw: '甲公司设备采购项目尚未取得最终的中标通知书，乙公司设备采购项目已取得中标通知书。' }], [])
  assert.equal(events[1].fields.formal_award_notice_received.value, 'true', '同一块内另一项目的肯定句不得清除')
}
console.log('PASS notice status: 12 project-scoped fields + 9 controls; no event IDs or case IDs used')
