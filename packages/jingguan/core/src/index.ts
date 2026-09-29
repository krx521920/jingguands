/**
 * 经管竞赛核心插件：事件 JSON 接口 v0.3 的 harness 侧入口。
 *
 * v0.2（2026-09-27 晚，依据评测方反馈）：状态扩至 6 个；质押本次/累计与分母拆分为
 * 独立字段（移除 cumulative 属性）；出处支持表格证据（table_id/cell_ref）。
 * D1 范围：工具注册、信封结构校验、统一错误返回。
 * D2 计划：接入解析（DocumentIR blocks→provenance）与标准化接口，模型调用改走 ctx.llm。
 * 契约文档：interface/README.md；机器可校验版本：interface/event-envelope.schema.json。
 * v0.3：中标事件改名 award_contract；分母枚举 holder_shares/total_share_capital/net_assets/other。
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

/** Stable Loader identity. */
export const name = 'jingguan-core'

/** 插件配置。 */
export interface Config {
  /** 严格模式：事件中出现注册表之外的字段名时报错。 */
  strict: boolean
}

/** Validated config. */
export const Config: z<Config> = z.object({
  strict: z.boolean().default(true),
})

/** Services used. */
export const inject = ['tools']

/** 事件类型（v0.2 冻结）。 */
export type EventType = 'pledge' | 'equity_change' | 'award_contract'

/** 字段值状态（v0.2，6 个）：除 extracted/needs_review 外 value 必须为 null。 */
export type FieldStatus = 'extracted' | 'not_disclosed' | 'not_applicable' | 'not_mentioned' | 'unreadable' | 'needs_review'

/** 字段注册表条目。 */
export interface FieldSpec {
  unit: 'shares' | 'cny' | 'percent' | 'date' | 'date_range' | 'text' | 'count'
  label: string
  /** 比例字段的固定分母（v0.2 起由字段名决定，注册表同步声明）。 */
  fixedDenominator?: 'holder_shares' | 'total_share_capital'
  /** 分母按原文判定的比例字段。 */
  requiresDenominator?: boolean
}

/** v0.2 冻结的字段注册表（与 interface/README.md 第五节保持一致）。 */
export const FIELD_REGISTRY: Record<EventType, Record<string, FieldSpec>> = {
  pledge: {
    pledgor: { unit: 'text', label: '质押人' },
    pledgee: { unit: 'text', label: '质权人' },
    pledged_shares_this_time: { unit: 'shares', label: '本次质押股数' },
    pledged_shares_cumulative: { unit: 'shares', label: '累计质押股数' },
    pledged_ratio_this_time_of_held: { unit: 'percent', label: '本次质押占其所持股份比例', fixedDenominator: 'holder_shares' },
    pledged_ratio_this_time_of_total: { unit: 'percent', label: '本次质押占公司总股本比例', fixedDenominator: 'total_share_capital' },
    pledged_ratio_cumulative_of_held: { unit: 'percent', label: '累计质押占其所持股份比例', fixedDenominator: 'holder_shares' },
    pledged_ratio_cumulative_of_total: { unit: 'percent', label: '累计质押占公司总股本比例', fixedDenominator: 'total_share_capital' },
    pledge_amount: { unit: 'cny', label: '质押金额' },
    start_date: { unit: 'date', label: '质押起始日' },
    end_date: { unit: 'date', label: '质押到期日' },
    purpose: { unit: 'text', label: '资金用途' },
    announcement_date: { unit: 'date', label: '公告日期' },
  },
  equity_change: {
    holder: { unit: 'text', label: '变动股东' },
    direction: { unit: 'text', label: '变动方向' },
    shares_before: { unit: 'shares', label: '变动前持股' },
    shares_after: { unit: 'shares', label: '变动后持股' },
    ratio_before: { unit: 'percent', label: '变动前比例', requiresDenominator: true },
    ratio_after: { unit: 'percent', label: '变动后比例', requiresDenominator: true },
    change_shares: { unit: 'shares', label: '变动股数' },
    method: { unit: 'text', label: '变动方式' },
    change_date: { unit: 'date_range', label: '变动期间（ISO区间 start/end）' },
  },
  award_contract: {
    bidder: { unit: 'text', label: '中标人' },
    tenderer: { unit: 'text', label: '招标人' },
    project_name: { unit: 'text', label: '项目名称' },
    bid_amount: { unit: 'cny', label: '中标金额' },
    currency: { unit: 'text', label: '币种' },
    tax_included: { unit: 'text', label: '是否含税' },
    duration: { unit: 'text', label: '工期' },
    consortium_members: { unit: 'text', label: '联合体成员名单' },
    consortium_shares: { unit: 'text', label: '联合体份额' },
    bid_date: { unit: 'date', label: '中标日期' },
    contract_signed: { unit: 'text', label: '是否已签署合同（true/false/not_disclosed）' },
    formal_award_notice_received: { unit: 'text', label: '是否收到正式中标通知书（true/false/not_disclosed）' },
    price_adjustment_status: { unit: 'text', label: '调价条款（fixed/adjustable/not_disclosed）' },
    recognized_revenue: { unit: 'cny', label: '当期确认收入' },
  },
}

/** 出处结构（v0.2 含表格证据）。 */
export interface Provenance {
  block_id: string | null
  page: number
  region: number[] | null
  table_id: string | null
  cell_ref: string | null
  quote: string
}

/** 任意字段值结构（见 interface/README.md FieldValue；v0.2 无 cumulative）。 */
export interface FieldValue {
  raw_value: string | null
  value: number | string | boolean | null
  unit: FieldSpec['unit']
  standardized?: boolean
  status: FieldStatus
  provenance: Provenance[]
  denominator?: 'holder_shares' | 'total_share_capital' | 'net_assets' | 'other' | null
  note?: string | null
}

/** 单个事件。 */
export interface Event {
  event_id: string
  event_type: EventType
  fields: Record<string, FieldValue>
  extraction_method?: 'model' | 'rule' | 'hybrid' | 'mock'
  notes?: string | null
}

/** 输出信封（v0.2）。 */
export interface EventEnvelope {
  schema_version: '0.3'
  run_id: string
  is_mock: boolean
  source: { file_id: string | null, file_name: string | null, file_sha256: string | null, parse_meta: { parser_version: string | null, page_count: number | null } | null }
  events: Event[]
  run_meta: { entry: 'cli' | 'web' | 'tool', model: string | null, started_at: string, duration_ms: number | null, errors: string[] }
}

/** 按注册表生成全 not_mentioned 的字段骨架（模型/规则抽取的起始容器）。 */
export function skeletonFields(eventType: EventType): Record<string, FieldValue> {
  const fields: Record<string, FieldValue> = {}
  for (const [fieldName, spec] of Object.entries(FIELD_REGISTRY[eventType])) {
    fields[fieldName] = {
      raw_value: null,
      value: null,
      unit: spec.unit,
      standardized: false,
      status: 'not_mentioned',
      provenance: [],
      denominator: spec.fixedDenominator ?? (spec.requiresDenominator === true ? null : undefined),
      note: null,
    }
  }
  return fields
}

/** strict 开关供 validateEnvelope 使用（模块级，D2 改为随调用传入）。 */
let configStrict = true

/** 结构校验：返回问题清单（空数组＝合规）。问题如实上报，不静默修正。 */
export function validateEnvelope(envelope: EventEnvelope): string[] {
  const issues: string[] = []
  if (envelope.schema_version !== '0.3') issues.push(`schema_version 应为 "0.3"，实际 ${JSON.stringify(envelope.schema_version)}`)
  if (!Array.isArray(envelope.events)) issues.push('events 必须是数组')
  const eventTypes = Object.keys(FIELD_REGISTRY) as EventType[]
  const nullValueStatuses = new Set<FieldStatus>(['not_disclosed', 'not_applicable', 'not_mentioned', 'unreadable'])
  envelope.events.forEach((event, index) => {
    const where = `events[${index}]`
    if (!eventTypes.includes(event.event_type)) {
      issues.push(`${where}.event_type 非法：${String(event.event_type)}`)
      return
    }
    if (!/^E[0-9]+$/.test(event.event_id)) issues.push(`${where}.event_id 非法：${String(event.event_id)}（应形如 E01）`)
    for (const [fieldName, value] of Object.entries(event.fields)) {
      const fieldWhere = `${where}.fields.${fieldName}`
      if (configStrict && !(fieldName in FIELD_REGISTRY[event.event_type])) {
        issues.push(`${fieldWhere} 不在 ${event.event_type} 注册表中`)
        continue
      }
      if (nullValueStatuses.has(value.status) && value.value !== null) {
        issues.push(`${fieldWhere} status=${value.status} 但 value 非 null（缺失禁止填值，0 也不行）`)
      }
      if (value.status === 'extracted') {
        if (value.provenance.length === 0) issues.push(`${fieldWhere} status=extracted 但无出处`)
        else if (!value.provenance.some((p) => p.quote.trim().length > 0)) issues.push(`${fieldWhere} 出处缺 quote`)
      }
      for (const [j, p] of value.provenance.entries()) {
        if (p.region === null || p.region === undefined) continue
        const [left, top, right, bottom] = p.region
        const where = `${fieldWhere}.provenance[${j}].region`
        if (left < 0 || top < 0) issues.push(`${where} 坐标为负`)
        if (left >= right) issues.push(`${where} left(${left}) ≥ right(${right})`)
        if (top >= bottom) issues.push(`${where} top(${top}) ≥ bottom(${bottom})`)
      }
    }
  })
  return issues
}

/**
 * 注册 jingguan_extract_events 工具。
 * D1 行为：按事件类型返回全 not_mentioned 的 v0.2 信封骨架并做结构校验，
 * 供会话内联调接口契约；真实模型抽取自 D2 起接入。
 */
export function apply(ctx: Context, config: Config): void {
  configStrict = config.strict
  ctx.tools.register(defineTool({
    name: 'jingguan_extract_events',
    description: '按事件 JSON 接口 v0.3 生成公告事件的信封骨架并校验结构。'
      + '输入公告文本与事件类型（pledge/equity_change/award_contract），返回注册表全字段的 not_mentioned 骨架；'
      + '字段抽取与模型调用自 D2 版本接入。',
    parameters: {
      document_text: { type: 'string', required: true, description: '公告正文文本（D1 为纯文本，D2 起支持解析块）' },
      event_type: { type: 'string', required: true, description: 'pledge | equity_change | award_contract' },
      run_id: { type: 'string', description: '调用方指定的运行 ID；缺省自动生成' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          envelope: { type: 'object', description: 'v0.3 事件信封' },
          issues: { type: 'array', items: { type: 'string' }, description: '结构校验问题清单' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `v0.3 信封骨架已生成：${value.envelope.events.length} 个事件，校验问题 ${value.issues.length} 条`,
      }],
    },
    async execute(args) {
      const eventTypes = Object.keys(FIELD_REGISTRY) as EventType[]
      if (!eventTypes.includes(args.event_type as EventType)) {
        throw new Error(`event_type 必须是 ${eventTypes.join(' / ')} 之一，实际：${args.event_type}`)
      }
      if (args.document_text.trim().length === 0) {
        throw new Error('document_text 不能为空')
      }
      const runId = args.run_id ?? `tool-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`
      const envelope: EventEnvelope = {
        schema_version: '0.3',
        run_id: runId,
        is_mock: true,
        source: { file_id: null, file_name: null, file_sha256: null, parse_meta: null },
        events: [{
          event_id: 'E01',
          event_type: args.event_type as EventType,
          fields: skeletonFields(args.event_type as EventType),
          extraction_method: 'mock',
          notes: 'D1 骨架：字段尚未抽取（not_mentioned），仅用于接口联调',
        }],
        run_meta: { entry: 'tool', model: null, started_at: new Date().toISOString(), duration_ms: 0, errors: [] },
      }
      const issues = validateEnvelope(envelope)
      envelope.run_meta.errors = issues
      return { envelope, issues }
    },
  }))
}
