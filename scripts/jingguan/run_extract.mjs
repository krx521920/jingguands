#!/usr/bin/env node
/**
 * 经管竞赛 · 公告事件抽取——运行入口（v0.3：award_contract＋四值分母＋date_range）
 *
 * 变更史：v0.2 状态枚举6个/质押字段拆分/table-cell出处；v0.3 事件改名与分母枚举、
 * date_range、联合体拆分、出处基线断言（详见 interface/README.md 第八节）。
 *
 * 用法：
 *   node scripts/jingguan/run_extract.mjs --input interface/samples/pledge_sample_01.txt [--event-type pledge] [--mock]
 *
 * 环境变量：
 *   JINGGUAN_LLM_API_KEY   模型密钥（缺省回落 DEEPSEEK_API_KEY）
 *   JINGGUAN_LLM_BASE_URL  OpenAI 兼容端点，默认 https://api.deepseek.com
 *   JINGGUAN_LLM_MODEL     模型名，默认 deepseek-chat
 *
 * 输出（runs/<run_id>/）：events.json（v0.3 信封）＋ call_log.json（调用日志，不含密钥）
 * 规则：无密钥必须显式 --mock；模拟输出全程 is_mock=true，不得计入真实抽取成绩。
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { validateAgainstSchema } from './lib/schema_validator.mjs'
import { FIELD_REGISTRY, checkRegistry } from './lib/registry.mjs'
import { normalizeFieldValue } from './lib/fang_normalize.mjs'
import { checkProvenance, checkPageBounds } from './lib/checks.mjs'

const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const SCHEMA = JSON.parse(readFileSync(resolve(REPO_ROOT, 'interface', 'event-envelope.schema.json'), 'utf8'))

// ---------- 参数解析 ----------

function parseArgs(argv) {
  const args = { input: null, eventType: null, mock: false, outDir: 'runs', parse: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--input') args.input = argv[++i]
    else if (a === '--event-type') args.eventType = argv[++i]
    else if (a === '--mock') args.mock = true
    else if (a === '--out-dir') args.outDir = argv[++i]
    else if (a === '--parse') args.parse = argv[++i]
    else if (a === '--help' || a === '-h') { args.help = true; break }
    else { console.error(`未知参数：${a}`); process.exit(2) }
  }
  return args
}

/** 载入张智博结构（evidence/0.2）的解析 JSON，建立块索引与标注文本。 */
function loadParseDoc(parsePath) {
  const doc = JSON.parse(readFileSync(resolve(REPO_ROOT, parsePath), 'utf8'))
  const blockIndex = new Map()
  for (const page of doc.pages ?? []) {
    for (const block of page.blocks ?? []) blockIndex.set(block.block_id, block)
  }
  const ordered = (doc.reading_order ?? []).map((id) => blockIndex.get(id)).filter(Boolean)
  const blocks = ordered.length > 0 ? ordered : [...blockIndex.values()]
  // 表格单元格行带表头前缀（张智博 evidence/0.7 的 header_path，多层表头已拼全），
  // 模型按列语义取值，实现"质押表字段绑定"而非按数字猜
  const annotated = blocks.map((b) => {
    const hp = b.header_path ?? b.table_ref?.header_path
    return hp ? `[${b.block_id}|表头:${hp}] ${b.text_raw}` : `[${b.block_id}] ${b.text_raw}`
  }).join('\n')
  const joinedRaw = blocks.map((b) => b.text_raw).join('\n')
  const pageDims = new Map((doc.pages ?? []).map((pg) => [pg.page, { width: pg.width, height: pg.height }]))
  return { doc, blockIndex, blocks, annotated, joinedRaw, pageDims }
}

function inferEventType(fileName) {
  if (/pledge/i.test(fileName)) return 'pledge'
  if (/equity_change|equity/i.test(fileName)) return 'equity_change'
  if (/award_contract|award/i.test(fileName)) return 'award_contract'
  return null
}

// ---------- Prompt ----------

function buildSystemPrompt(eventType, parseMode) {
  const fields = Object.entries(FIELD_REGISTRY[eventType]).map(([f, spec]) => {
    const den = spec.fixedDenominator !== undefined
      ? `，denominator 固定为 "${spec.fixedDenominator}"`
      : (spec.requiresDenominator === true ? '，denominator 按原文判定（holder_shares/total_share_capital/net_assets/other）' : '')
    return `- ${f}（${spec.unit}${den}，${spec.label}）`
  }).join('\n')
  return [
    '你是上市公司公告事件抽取器。从用户给出的公告正文中抽取一个事件，严格输出 JSON，不要输出任何其他文字。',
    '',
    `事件类型：${eventType}`,
    '需要抽取的字段（只允许这些字段名）：',
    fields,
    '',
    '输出 JSON 结构（events 数组放一个事件对象）：',
    '{"events":[{"event_id":"E01","event_type":"' + eventType + '","fields":{...},"extraction_method":"model","notes":null}]}',
    '',
    '每个字段的值必须是：',
    '{"raw_value":"原文原样字符串或null","value":标量(数字/字符串/布尔)或null——禁止对象和数组,"unit":"单位","standardized":true或false,"status":"六个状态之一","provenance":[{"block_id":null,"page":1,"region":null,"table_id":null,"cell_ref":null,"source_type":null,"quote":"原文子串"}],"denominator":null或"holder_shares"或"total_share_capital"或"net_assets"或"other","note":null}',
    '',
    '状态语义（严格按此判定）：',
    '- extracted：原文有值且已抽取。原文显式写 0 也是 extracted 且 value=0。',
    '- not_disclosed：原文明说"未披露/不适用/无法提供"，不要推断，value 必须为 null。',
    '- not_applicable：该字段结构性不适用于本事件（如非联合体中标时 consortium 不适用），value 必须为 null。',
    '- not_mentioned：原文压根没有提到该字段，value 必须为 null。',
    '- unreadable：扫描件/图片/模糊无法读取，value 必须为 null。',
    '- needs_review：疑似有值但不确定（如扫描模糊、换算依据不足），可有候选值。',
    '',
    '硬性规则：',
    '1. 除 extracted 和 needs_review 外，其余状态 value 一律为 null——禁止把缺失填成 0。',
    '2. status="extracted" 必须至少一条出处；quote 必须是正文连续子串；表格取值时填 table_id/cell_ref（纯文本出处保持 null）。',
    '3. 数值标准化：股→股（万股×10000）；金额→元（万元×10000，亿元×100000000）；百分比→数值（"16.67%"→16.67）；日期→"YYYY-MM-DD"。',
    '4. unit 必须用固定枚举，按此映射：股数→"shares"；金额→"cny"；比例→"percent"；日期→"date"；计数→"count"；其余一切（人名/公司名/用途/方式/名称/工期原文等文本）→"text"。禁止写"股""元""%""日历天"等原文字样，禁止 null。',
    '5. 换算依据不足时 standardized=false 且 status="needs_review"，不要猜测。',
    '6. 本次/累计是不同字段，各自独立抽取；比例字段的 denominator 按字段定义填，不要混用口径。denominator 枚举：holder_shares（占该股东所持股份）/ total_share_capital（占公司总股本）/ net_assets（占净资产）/ other（其他，须在 note 说明）。',
    '7. 日期区间（unit=date_range 的字段，如 change_date）：必须 unit="date_range"，value 必须是 ISO 区间字符串 "起始日/结束日"（如 "2026-09-20/2026-09-24"），status=extracted——区间是原文明确给出的值。禁止把 value 写成 {start,end} 对象，禁止用 unit="date" 装区间。',
    '8. 主体字段（pledgor/pledgee/holder/bidder/tenderer）必须取公告中指明该角色的名称：有完整注册名称取全名；公告用“某公司”“某能源集团”等简称指称时，也必须照原文简称抽取（extracted），不得因是简称而标 not_mentioned，也不得拼接“股东”等原文没有的词。',
    '9. 日期规则：单日值直接 unit="date"＋"YYYY-MM-DD"；仅当字段本身是起止区间（如质押期限、变动期间）才用 date_range，同日起止不算区间。若原文给的是条件性描述而非日期（如"申请解除质押登记日""至本公告披露日"）：status=needs_review、unit 保持字段规定的日期单位、value=null、raw_value 保留原文——不要编造日期，也不要把 unit 改成 text。',
    '10. 联合体判定：公告没有联合体→consortium_members 和 consortium_shares 都 not_applicable；有联合体→consortium_members=extracted（名单）；份额没写→consortium_shares=not_mentioned；份额写了→extracted。',
    ...(parseMode ? [
      '11. 【解析块模式】正文按块给出，每行格式为 [block_id] 文本；表格单元格行为 [block_id|表头:列名] 值——必须按表头理解单元格含义再抽取。provenance 必须给出 quote 所在块的 block_id。',
      '12. quote 必须是单个块内 text_raw 的连续子串，禁止跨块拼接；不得事后按数字反搜。',
    ] : []),
  ].join('\n')
}

// ---------- 模型调用 ----------

async function callModel({ baseURL, model, apiKey, system, user, signal }) {
  const url = `${baseURL.replace(/\/$/, '')}/chat/completions`
  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
  }
  const doFetch = async (payload) => fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
    signal,
  })
  const started = Date.now()
  let res = await doFetch(body)
  let retriesWithoutResponseFormat = false
  if (!res.ok) {
    const text = await res.text()
    // 部分网关不支持 response_format，去掉重试一次
    if (text.includes('response_format')) {
      retriesWithoutResponseFormat = true
      const { response_format: _drop, ...rest } = body
      res = await doFetch(rest)
    } else {
      throw Object.assign(new Error(`模型调用失败 HTTP ${res.status}：${text.slice(0, 500)}`), { httpStatus: res.status, body: text })
    }
  }
  const durationMs = Date.now() - started
  if (!res.ok) {
    const text = await res.text()
    throw Object.assign(new Error(`模型调用失败 HTTP ${res.status}：${text.slice(0, 500)}`), { httpStatus: res.status, body: text })
  }
  const json = await res.json()
  return {
    content: json.choices?.[0]?.message?.content ?? null,
    usage: json.usage ?? null,
    durationMs,
    httpStatus: res.status,
    retriesWithoutResponseFormat,
  }
}

// ---------- 模拟响应（与三份冻结样例对应，v0.3 字段） ----------

function mockModelResponse(eventType) {
  const F = (raw, value, unit, quote, extra = {}) => ({
    raw_value: raw, value, unit, standardized: true, status: 'extracted',
    provenance: [{ block_id: null, page: 1, region: null, table_id: null, cell_ref: null, source_type: null, quote }], denominator: null, note: null, ...extra,
  })
  const N = (unit, status = 'not_mentioned') => ({
    raw_value: null, value: null, unit, standardized: false, status, provenance: [], denominator: null, note: null,
  })
  const mocks = {
    pledge: {
      events: [{
        event_id: 'E01', event_type: 'pledge', extraction_method: 'mock', notes: 'MOCK 输出——不得计入真实抽取成绩',
        fields: {
          pledgor: F('张某', '张某', 'text', '股东名称：张某'),
          pledgee: F('中国示例银行股份有限公司上海分行', '中国示例银行股份有限公司上海分行', 'text', '质权人：中国示例银行股份有限公司上海分行'),
          pledged_shares_this_time: F('20,000,000股', 20000000, 'shares', '质押股数：20,000,000股'),
          pledged_shares_cumulative: F('70,000,000股', 70000000, 'shares', '累计质押股份70,000,000股'),
          pledged_ratio_this_time_of_held: F('16.67%', 16.67, 'percent', '占其所持股份比例：16.67%', { denominator: 'holder_shares' }),
          pledged_ratio_this_time_of_total: F('5.00%', 5.00, 'percent', '占公司总股本比例：5.00%', { denominator: 'total_share_capital' }),
          pledged_ratio_cumulative_of_held: F('58.33%', 58.33, 'percent', '占其所持股份总数的58.33%', { denominator: 'holder_shares' }),
          pledged_ratio_cumulative_of_total: F('17.50%', 17.50, 'percent', '占公司总股本的17.50%', { denominator: 'total_share_capital' }),
          pledge_amount: N('cny'),
          start_date: F('2026年9月24日', '2026-09-24', 'date', '质押起始日：2026年9月24日'),
          end_date: F('2027年9月23日', '2027-09-23', 'date', '质押到期日：2027年9月23日'),
          purpose: F('补充流动资金', '补充流动资金', 'text', '质押融资资金用途：补充流动资金'),
          announcement_date: F('2026年9月26日', '2026-09-26', 'date', '2026年9月26日'),
        },
      }],
    },
    equity_change: {
      events: [{
        event_id: 'E01', event_type: 'equity_change', extraction_method: 'mock', notes: 'MOCK 输出——不得计入真实抽取成绩',
        fields: {
          holder: F('李某', '李某', 'text', '信息披露义务人：李某'),
          direction: F('减持', 'decrease', 'text', '股份变动性质：减持'),
          shares_before: F('32,000,000股', 32000000, 'shares', '持有公司股份32,000,000股，占公司总股本的8.00%'),
          shares_after: F('24,000,000股', 24000000, 'shares', '持有公司股份24,000,000股，占公司总股本的6.00%'),
          ratio_before: F('8.00%', 8.00, 'percent', '占公司总股本的8.00%', { denominator: 'total_share_capital' }),
          ratio_after: F('6.00%', 6.00, 'percent', '占公司总股本的6.00%', { denominator: 'total_share_capital' }),
          change_shares: F('8,000,000股', 8000000, 'shares', '累计减持公司股份8,000,000股'),
          method: F('集中竞价交易减持', '集中竞价交易减持', 'text', '本次权益变动方式为集中竞价交易减持'),
          change_date: { raw_value: '2026年9月20日至2026年9月24日', value: '2026-09-20/2026-09-24', unit: 'date_range', standardized: true, status: 'extracted', provenance: [{ block_id: null, page: 1, region: null, table_id: null, cell_ref: null, quote: '2026年9月20日至2026年9月24日' }], denominator: null, note: null },
        },
      }],
    },
    award_contract: {
      events: [{
        event_id: 'E01', event_type: 'award_contract', extraction_method: 'mock', notes: 'MOCK 输出——不得计入真实抽取成绩',
        fields: {
          bidder: F('示例建设科技股份有限公司（联合体牵头人）', '示例建设科技股份有限公司（联合体牵头人）', 'text', '公司与联合体成员某市政设计研究院组成的联合体'),
          tenderer: F('某市轨道交通集团有限公司', '某市轨道交通集团有限公司', 'text', '招标人：某市轨道交通集团有限公司'),
          project_name: F('某市轨道交通3号线土建施工总承包项目', '某市轨道交通3号线土建施工总承包项目', 'text', '中标"某市轨道交通3号线土建施工总承包项目"'),
          bid_amount: F('人民币1,258,000,000元（含税）', 1258000000, 'cny', '中标金额：人民币1,258,000,000元（含税）'),
          currency: F('人民币', 'CNY', 'text', '中标金额：人民币1,258,000,000元（含税）'),
          tax_included: F('含税', 'true', 'text', '中标金额：人民币1,258,000,000元（含税）'),
          duration: F('1,095日历天', '1,095日历天', 'text', '工期：1,095日历天'),
          consortium_members: F('公司与联合体成员某市政设计研究院组成的联合体', '公司与联合体成员某市政设计研究院组成的联合体', 'text', '公司与联合体成员某市政设计研究院组成的联合体'),
          consortium_shares: F('公司牵头占约85%，某市政设计研究院占约15%', '公司牵头占约85%，某市政设计研究院占约15%', 'text', '份额约占联合体中标金额的85%'),
          bid_date: F('2026年9月24日', '2026-09-24', 'date', '中标日期：2026年9月24日'),
          formal_award_notice_received: F('收到《中标通知书》', 'true', 'text', '收到招标人某市轨道交通集团有限公司发出的《中标通知书》'),
          contract_signed: N('text'),
          price_adjustment_status: N('text'),
          recognized_revenue: N('cny'),
        },
      }],
    },
  }
  return { content: JSON.stringify(mocks[eventType]), usage: null, durationMs: 0, httpStatus: null, retriesWithoutResponseFormat: false }
}

// ---------- 解析与校验 ----------

function parseModelJson(content) {
  let text = content.trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) text = fence[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('模型返回中找不到 JSON 对象')
  return JSON.parse(text.slice(start, end + 1))
}

/** 机器契约校验（Schema v0.3＋注册表强制＋出处基线）＋语义校验（quote 命中原文、状态-取值规则）。 */
function validateEnvelope(envelope, inputText) {
  const issues = [
    ...validateAgainstSchema(envelope, SCHEMA, SCHEMA).map((s) => `[schema] ${s}`),
    ...checkRegistry(envelope),
    ...checkProvenance(envelope),
  ]
  const nullValueOk = new Set(['not_disclosed', 'not_applicable', 'not_mentioned', 'unreadable'])
  for (const [i, ev] of (envelope.events ?? []).entries()) {
    for (const [name, fv] of Object.entries(ev.fields ?? {})) {
      if (nullValueOk.has(fv.status) && fv.value !== null) {
        issues.push(`[语义] events[${i}].fields.${name} status=${fv.status} 但 value 非 null（缺失禁止填值）`)
      }
      if (fv.status === 'extracted') {
        if (!Array.isArray(fv.provenance) || fv.provenance.length === 0) issues.push(`[语义] events[${i}].fields.${name} 无出处`)
        for (const p of fv.provenance ?? []) {
          if (!p.quote || p.quote.trim().length === 0) issues.push(`[语义] events[${i}].fields.${name} 出处缺 quote`)
          else if (!inputText.includes(p.quote)) issues.push(`[语义] events[${i}].fields.${name} 出处 quote 不是原文子串：${p.quote.slice(0, 30)}…`)
        }
      }
    }
  }
  return issues
}

/** 解析块模式出处回填：按 block_id 从解析结果填 page/region/table；真实模式缺 block_id 记错，mock 允许按 quote 定位块。 */
function backfillProvenance(events, blockIndex, isMock, errors) {
  events.forEach((ev, i) => {
    for (const [name, fv] of Object.entries(ev.fields ?? {})) {
      fv.provenance?.forEach((p, pi) => {
        let block = p.block_id ? blockIndex.get(p.block_id) : undefined
        if (block === undefined && isMock && p.quote) {
          for (const b of blockIndex.values()) {
            if (b.text_raw.includes(p.quote)) { block = b; break }
          }
          if (block !== undefined) p.block_id = block.block_id
        }
        if (block === undefined) {
          errors.push(`[解析] events[${i}].fields.${name}.provenance[${pi}]: block_id "${p.block_id ?? ''}" 不在解析结果中`)
          return
        }
        p.page = block.page
        p.region = block.region ?? null
        p.table_id = block.table_ref?.table_id ?? null
        p.cell_ref = block.table_ref?.cell_ref ?? null
        p.source_type = block.source_type ?? null
        if (p.quote && !block.text_raw.includes(p.quote)) {
          errors.push(`[解析] events[${i}].fields.${name}.provenance[${pi}]: quote 不是块 ${block.block_id} text_raw 的子串`)
        }
      })
    }
  })
}

// ---------- 主流程 ----------

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || (!args.input && !args.parse)) {
    console.log('用法：node scripts/jingguan/run_extract.mjs --input <公告文本文件> [--parse <evidence/0.2 解析JSON>] [--event-type pledge|equity_change|award_contract] [--mock] [--out-dir runs]')
    process.exit(args.input || args.parse ? 0 : 2)
  }

  // 解析块模式（D2）：消费张智博 evidence/0.2 结构；纯文本模式与 D1 相同
  const parseDoc = args.parse ? loadParseDoc(args.parse) : null
  const inputText = parseDoc ? parseDoc.joinedRaw : readFileSync(resolve(REPO_ROOT, args.input), 'utf8')
  const modelInput = parseDoc ? parseDoc.annotated : inputText
  const fileName = parseDoc ? (parseDoc.doc.doc?.file_name ?? basename(args.parse)) : basename(resolve(REPO_ROOT, args.input))
  const eventType = args.eventType ?? inferEventType(fileName)
  if (!eventType || !(eventType in FIELD_REGISTRY)) {
    console.error('无法确定事件类型：请用 --event-type 指定 pledge|equity_change|award_contract')
    process.exit(2)
  }

  const apiKey = process.env.JINGGUAN_LLM_API_KEY || process.env.DEEPSEEK_API_KEY || ''
  const baseURL = process.env.JINGGUAN_LLM_BASE_URL || 'https://api.deepseek.com'
  const model = process.env.JINGGUAN_LLM_MODEL || 'deepseek-chat'
  const isMock = args.mock

  if (!isMock && !apiKey) {
    console.error('缺少模型密钥：请设置 JINGGUAN_LLM_API_KEY（或 DEEPSEEK_API_KEY）。\n' +
      '只想联调接口结构时，可显式加 --mock（输出会全程标注 MOCK，不计入真实抽取成绩）。')
    process.exit(2)
  }

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')
  const runId = `${stamp}-${eventType}-${Math.random().toString(16).slice(2, 6)}`
  const startedAt = new Date().toISOString()
  console.log(`[运行] run_id=${runId} 模式=${parseDoc ? '解析块（evidence/0.2）' : '纯文本'}`)
  console.log(`[输入] ${args.parse ?? args.input}（事件类型 ${eventType}，${inputText.length} 字符${parseDoc ? `，${parseDoc.blocks.length} 块` : ''}）`)
  if (isMock) console.log('****** MOCK 模式：不调用真实模型，输出不得计入真实抽取成绩 ******')

  const t0 = Date.now()
  let call, callError = null
  try {
    call = isMock
      ? mockModelResponse(eventType)
      : await callModel({ baseURL, model, apiKey, system: buildSystemPrompt(eventType, parseDoc !== null), user: modelInput.slice(0, 60000) })
  } catch (err) {
    callError = err
  }
  const durationMs = Date.now() - t0

  // ---- D2 事件后处理：块级出处回填 ＋ 数值标准化（方的 normalize 移植） ----
  const events = call ? parseModelJson(call.content).events ?? [] : []
  const postErrors = []
  // 前置清洗：模型偶发输出 null/非对象字段（违反契约），剔除并记错，保证后续阶段不崩
  for (const ev of events) {
    for (const [name, fv] of Object.entries(ev.fields ?? {})) {
      if (fv === null || typeof fv !== 'object') {
        postErrors.push(`[schema前置] 字段 ${name} 值非对象（${JSON.stringify(fv)}），已剔除`)
        delete ev.fields[name]
      }
    }
  }
  if (parseDoc !== null) backfillProvenance(events, parseDoc.blockIndex, isMock, postErrors)
  let normalizedCount = 0
  for (const ev of events) {
    for (const [name, fv] of Object.entries(ev.fields ?? {})) {
      const err = normalizeFieldValue(name, fv)
      if (err !== null) postErrors.push(err)
      else if (fv.standardized === true) normalizedCount++
    }
  }

  const handoff = parseDoc?.doc?.handoff
  const sha256 = parseDoc
    ? (handoff?.source?.file_sha256 ?? createHash('sha256').update(inputText, 'utf8').digest('hex'))
    : createHash('sha256').update(inputText, 'utf8').digest('hex')
  const envelope = {
    schema_version: '0.3',
    run_id: runId,
    is_mock: isMock,
    source: parseDoc
      ? {
          file_id: handoff?.source?.file_id ?? `sha256:${sha256.slice(0, 16)}`,
          file_name: fileName,
          file_sha256: sha256,
          parse_meta: handoff?.source?.parse_meta ?? {
            parser_version: null,
            page_count: parseDoc.doc.doc?.page_count ?? 1,
            blocks: null,
          },
        }
      : {
          file_id: `sha256:${sha256.slice(0, 16)}`,
          file_name: fileName,
          file_sha256: sha256,
          parse_meta: { parser_version: null, page_count: 1, blocks: null },
        },
    events,
    run_meta: {
      entry: 'cli',
      model: isMock ? 'mock' : model,
      started_at: startedAt,
      duration_ms: durationMs,
      errors: callError ? [`模型调用失败：${callError.message}`] : [],
    },
  }

  envelope.run_meta.errors.push(...postErrors, ...validateEnvelope(envelope, inputText), ...(parseDoc ? checkPageBounds(envelope, parseDoc.pageDims) : []))

  const outDir = resolve(REPO_ROOT, args.outDir, runId)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(resolve(outDir, 'events.json'), JSON.stringify(envelope, null, 2), 'utf8')
  const callLog = {
    run_id: runId,
    is_mock: isMock,
    endpoint: isMock ? 'mock' : `${baseURL.replace(/\/$/, '')}/chat/completions`,
    model: isMock ? 'mock' : model,
    request: {
      system_prompt: buildSystemPrompt(eventType, parseDoc !== null),
      user_message_chars: modelInput.length,
      mode: parseDoc !== null ? 'parse-blocks' : 'raw-text',
      temperature: 0,
      response_format: { type: 'json_object' },
    },
    response: call ? { content: call.content, usage: call.usage, http_status: call.httpStatus, dropped_response_format: call.retriesWithoutResponseFormat } : null,
    error: callError ? String(callError.message) : null,
    timing: { total_ms: durationMs, call_ms: call?.durationMs ?? null },
    created_at: startedAt,
  }
  writeFileSync(resolve(outDir, 'call_log.json'), JSON.stringify(callLog, null, 2), 'utf8')

  // 汇总
  const statusCount = {}
  for (const ev of envelope.events) for (const fv of Object.values(ev.fields)) statusCount[fv.status] = (statusCount[fv.status] ?? 0) + 1
  console.log(`[完成] schema v${envelope.schema_version}，${envelope.events.length} 个事件，字段状态：${JSON.stringify(statusCount)}，标准化 ${normalizedCount} 项，耗时 ${durationMs}ms`)
  console.log(`[输出] ${args.outDir}/${runId}/events.json`)
  console.log(`[日志] ${args.outDir}/${runId}/call_log.json`)
  if (envelope.run_meta.errors.length > 0) {
    console.log(`[校验] ${envelope.run_meta.errors.length} 个问题（已如实写入 run_meta.errors）：`)
    for (const e of envelope.run_meta.errors) console.log(`  - ${e}`)
  }
  if (callError) process.exit(1)
}

main().catch((err) => { console.error(err); process.exit(1) })
