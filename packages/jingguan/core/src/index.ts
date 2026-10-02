/**
 * 经管竞赛核心插件：事件 JSON 接口 v0.3 的 harness 侧入口。
 *
 * v0.2（2026-09-27 晚，依据评测方反馈）：状态扩至 6 个；质押本次/累计与分母拆分为
 * 独立字段（移除 cumulative 属性）；出处支持表格证据（table_id/cell_ref）。
 * D1 范围：工具注册、信封结构校验、统一错误返回。
 * D2 计划：接入解析（DocumentIR blocks→provenance）与标准化接口，模型调用改走 ctx.llm。
 * 契约文档：interface/README.md；机器可校验版本：interface/event-envelope.schema.json。
 * v0.3：中标事件改名 award_contract；分母枚举 holder_shares/total_share_capital/net_assets/other。
 * v0.4（2026-10-02，评测方反馈"工具仍返回模拟骨架"）：mode 默认 real——委托
 * scripts/jingguan/run_extract.mjs（已验证 30 份 ×100% 的真实抽取管线，含宗 D5 冻结口径
 * 确定性规则、方标准化、块级/单元格级出处、扫描降级）；mode="mock" 保留 D1 骨架联调行为。
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 定位真实抽取 CLI（src/ 与 lib/ 两种安装形态向上查找仓库根）。 */
function resolveExtractorCli(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  let dir = here
  for (let i = 0; i < 8; i++) {
    const cand = resolve(dir, 'scripts/jingguan/run_extract.mjs')
    if (existsSync(cand)) return cand
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error('未找到 scripts/jingguan/run_extract.mjs：真实抽取 CLI 不在预期位置（应在仓库根 scripts/ 下）')
}

/** 调 CLI 抽取并读取信封；CLI 的 stdout 含 "runs/<run_id>/events.json" 行用于定位产物。 */
async function extractViaCli(documentText: string, eventType: EventType, runId: string): Promise<EventEnvelope> {
  const apiKey = process.env.JINGGUAN_LLM_API_KEY ?? process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    throw new Error('真实抽取需要模型密钥：请设置 JINGGUAN_LLM_API_KEY（或 DEEPSEEK_API_KEY），或改用 mode="mock" 联调接口结构')
  }
  const cli = resolveExtractorCli()
  const tmpDir = mkdtempSync(join(tmpdir(), 'jingguan-tool-'))
  const inputFile = join(tmpDir, `${runId}.txt`)
  writeFileSync(inputFile, documentText, 'utf8')
  try {
    const envelope = await new Promise<EventEnvelope>((resolvePromise, rejectPromise) => {
      const child = spawn(process.execPath, [cli, '--input', inputFile, '--event-type', eventType, '--out-dir', join(tmpDir, 'runs')], {
        env: process.env, stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => { child.kill(); rejectPromise(new Error('真实抽取超时（>300 秒），已终止子进程')) }, 300_000)
      child.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
      child.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
      child.on('error', (err) => { clearTimeout(timer); rejectPromise(err) })
      child.on('close', (code) => {
        clearTimeout(timer)
        const m = [...stdout.matchAll(/runs[\\/](\S+?)[\\/]events\.json/g)].pop()
        if (code !== 0 || m === undefined) {
          rejectPromise(new Error(`抽取 CLI 失败（exit=${code}）：${(stderr || stdout).split('\n').filter(Boolean).slice(-3).join(' | ').slice(0, 300)}`))
          return
        }
        try {
          resolvePromise(JSON.parse(readFileSync(join(tmpDir, 'runs', m[1], 'events.json'), 'utf8')) as EventEnvelope)
        } catch (err) {
          rejectPromise(new Error(`信封产物不可读：${String(err)}`))
        }
      })
    })
    return envelope
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

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
    direction: { unit: 'text', label: '业务方向（pledge=质押/release=解除质押，v0.4 宗裁决；质押业务默认 pledge）' },
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

/** 出处结构（v0.3 含表格证据与来源类型）。 */
export interface Provenance {
  block_id: string | null
  source_type?: 'paragraph' | 'table' | 'cell' | 'scan_region' | 'document' | null
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
  source: { file_id: string | null, file_name: string | null, file_sha256: string | null, parse_meta: { parser_version: string | null, page_count: number | null, blocks?: Array<Record<string, unknown>> | null } | null }
  events: Event[]
  run_meta: { entry: 'cli' | 'web' | 'tool', model: string | null, started_at: string, duration_ms: number | null, code_version?: string, interface_version?: string, errors: string[] }
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
        const regionWhere = `${fieldWhere}.provenance[${j}].region`
        if (left < 0 || top < 0) issues.push(`${regionWhere} 坐标为负`)
        if (left >= right) issues.push(`${regionWhere} left(${left}) ≥ right(${right})`)
        if (top >= bottom) issues.push(`${regionWhere} top(${top}) ≥ bottom(${bottom})`)
      }
    }
  })
  return issues
}

/**
 * 注册 jingguan_extract_events 工具。
 * v0.4 行为：mode 缺省 "real"——委托 scripts/jingguan/run_extract.mjs 做真实抽取
 * （模型调用＋方标准化＋宗 D5 冻结口径确定性规则＋块级/单元格级出处＋扫描降级），
 * 返回真实 v0.3 信封与结构校验问题清单；mode="mock" 返回 D1 全 not_mentioned 骨架（接口联调）。
 */
export function apply(ctx: Context, config: Config): void {
  configStrict = config.strict
  ctx.tools.register(defineTool({
    name: 'jingguan_extract_events',
    description: '从公告正文抽取结构化事件（pledge/equity_change/award_contract），返回事件 JSON 接口 v0.3 信封＋结构校验问题。'
      + 'mode="real"（默认）走真实抽取管线：模型调用＋数值/日期标准化＋出处回填（quote 锚定原文块，表格证据带 table_id/cell_ref）；'
      + '需设置 JINGGUAN_LLM_API_KEY（或 DEEPSEEK_API_KEY）。mode="mock" 返回全 not_mentioned 骨架供接口联调。',
    parameters: {
      document_text: { type: 'string', required: true, description: '公告正文文本' },
      event_type: { type: 'string', required: true, description: 'pledge | equity_change | award_contract' },
      run_id: { type: 'string', description: '调用方指定的运行 ID；缺省自动生成' },
      mode: { type: 'string', description: 'real（默认，真实抽取） | mock（骨架联调）' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          envelope: { type: 'object', description: 'v0.3 事件信封（is_mock 标注数据来源）' },
          issues: { type: 'array', items: { type: 'string' }, description: '结构校验＋管线运行问题清单' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `v0.3 信封已生成（${value.envelope.is_mock ? 'mock 骨架' : '真实抽取'}）：${value.envelope.events.length} 个事件，问题 ${value.issues.length} 条`,
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
      const mode = args.mode ?? 'real'
      if (mode !== 'real' && mode !== 'mock') {
        throw new Error(`mode 必须是 real 或 mock，实际：${mode}`)
      }
      let envelope: EventEnvelope
      if (mode === 'mock') {
        envelope = {
          schema_version: '0.3',
          run_id: runId,
          is_mock: true,
          source: { file_id: null, file_name: null, file_sha256: null, parse_meta: null },
          events: [{
            event_id: 'E01',
            event_type: args.event_type as EventType,
            fields: skeletonFields(args.event_type as EventType),
            extraction_method: 'mock',
            notes: 'mock 骨架：字段未抽取（not_mentioned），仅用于接口联调',
          }],
          run_meta: { entry: 'tool', model: null, started_at: new Date().toISOString(), duration_ms: 0, errors: [] },
        }
      } else {
        envelope = await extractViaCli(args.document_text, args.event_type as EventType, runId)
      }
      const issues = [...validateEnvelope(envelope), ...envelope.run_meta.errors]
      envelope.run_meta.errors = issues
      return { envelope, issues }
    },
  }))
}
