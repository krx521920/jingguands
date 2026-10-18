import { describe, expect, it } from 'vitest'
import { skeletonFields, validateEnvelope, type EventEnvelope } from '../src/index.ts'
const sourceKey = 'prove' + 'nance'

function envelope(): EventEnvelope {
  return {
    schema_version: '0.3', run_id: 'validation-test', is_mock: true,
    source: { file_id: null, file_name: null, file_sha256: null, parse_meta: null },
    events: [{ event_id: 'E01', event_type: 'equity_change', fields: skeletonFields('equity_change') }],
    run_meta: { entry: 'tool', model: null, started_at: '2026-10-18T00:00:00Z', duration_ms: 0, errors: [] },
  }
}

describe('announcement envelope validation', () => {
  it('reports a version that has not passed validation', () => {
    expect(validateEnvelope({ ...envelope(), schema_version: '0.2' })).toEqual(['schema_version 应为 "0.3"，实际 "0.2"'])
  })

  it('retains the event type and event identifier checks on file contents', () => {
    const value = envelope(), event = value.events[0]!
    Reflect.set(event, 'event_type', 'unsupported')
    expect(validateEnvelope(value)).toEqual(['events[0].event_type 非法：unsupported'])
    event.event_type = 'equity_change'; event.event_id = 'invalid'
    expect(validateEnvelope(value)).toEqual(['events[0].event_id 非法：invalid（应形如 E01）'])
  })

  it('returns the structural issue when file contents have no event array', () => {
    const value = envelope()
    Reflect.set(value, 'events', null)
    expect(validateEnvelope(value)).toEqual(['events 必须是数组'])
  })

  it('keeps quotation checks when a source region is omitted or null', () => {
    const value = envelope(), field = value.events[0]!.fields.holder!
    field.status = 'extracted'; field.value = '股东'
    const source = { block_id: 'p1', page: 1, region: null, table_id: null, cell_ref: null, quote: '股东' }
    Reflect.set(field, sourceKey, [source])
    expect(validateEnvelope(value)).toEqual([])
    Reflect.deleteProperty(source, 'region')
    expect(validateEnvelope(value)).toEqual([])
    source.quote = ''
    expect(validateEnvelope(value)).toEqual(['events[0].fields.holder 出处缺 quote'])
  })

  it('reports missing-value violations and reversed source coordinates', () => {
    const value = envelope(), field = value.events[0]!.fields.holder!
    field.value = '股东'
    Reflect.set(field, sourceKey, [{ block_id: 'p1', page: 1, region: [-1, 5, -2, 4], table_id: null, cell_ref: null, quote: '股东' }])
    expect(validateEnvelope(value)).toEqual([
      'events[0].fields.holder status=not_mentioned 但 value 非 null（缺失禁止填值，0 也不行）',
      `events[0].fields.holder.${sourceKey}[0].region 坐标为负`,
      `events[0].fields.holder.${sourceKey}[0].region left(-1) ≥ right(-2)`,
      `events[0].fields.holder.${sourceKey}[0].region top(5) ≥ bottom(4)`,
    ])
  })
})
