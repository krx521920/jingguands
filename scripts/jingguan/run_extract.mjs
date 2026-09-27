#!/usr/bin/env node
/**
 * 经管竞赛 · 公告事件抽取——运行入口（D1 版）
 *
 * 用法：
 *   node scripts/jingguan/run_extract.mjs --input interface/samples/pledge_sample_01.txt [--event-type pledge] [--mock]
 *
 * 环境变量：
 *   JINGGUAN_LLM_API_KEY   模型密钥（缺省回落 DEEPSEEK_API_KEY）
 *   JINGGUAN_LLM_BASE_URL  OpenAI 兼容端点，默认 https://api.deepseek.com
 *   JINGGUAN_LLM_MODEL     模型名，默认 deepseek-chat
 *
 * 输出（runs/<run_id>/）：
 *   events.json   按 interface/event-envelope.schema.json 输出的事件信封
 *   call_log.json 模型调用日志（请求、耗时、token 用量、原始返回；不含密钥）
 *
 * 规则：无密钥时必须显式 --mock 才能运行；模拟输出全链路标注 is_mock=true，
 *       不得计入真实抽取成绩。
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { basename, resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dirname, '..', '..')

const FIELD_REGISTRY = {
  pledge: ['pledgor', 'pledgee', 'pledged_shares', 'pledged_ratio', 'pledge_amount', 'start_date', 'end_date', 'purpose', 'announcement_date'],
  equity_change: ['holder', 'direction', 'shares_before', 'shares_after', 'ratio_before', 'ratio_after', 'change_shares', 'method', 'change_date'],
  bid_won: ['bidder', 'tenderer', 'project_name', 'bid_amount', 'currency', 'tax_included', 'duration', 'consortium', 'bid_date'],
}

const UNIT_HINTS = {
  pledgor: 'text', pledgee: 'text', pledged_shares: 'shares', pledged_ratio: 'percent', pledge_amount: 'cny',
  start_date: 'date', end_date: 'date', purpose: 'text', announcement_date: 'date',
  holder: 'text', direction: 'text（increase/decrease）', shares_before: 'shares', shares_after: 'shares',
  ratio_before: 'percent', ratio_after: 'percent', change_shares: 'shares', method: 'text', change_date: 'date',
  bidder: 'text', tenderer: 'text', project_name: 'text', bid_amount: 'cny', currency: 'text',
  tax_included: 'text（true/false/unknown）', duration: 'text', consortium: 'text', bid_date: 'date',
}

// ---------- 参数解析 ----------

function parseArgs(argv) {
  const args = { input: null, eventType: null, mock: false, outDir: 'runs' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--input') args.input = argv[++i]
    else if (a === '--event-type') args.eventType = argv[++i]
    else if (a === '--mock') args.mock = true
    else if (a === '--out-dir') args.outDir = argv[++i]
    else if (a === '--help' || a === '-h') { args.help = true; break }
    else { console.error(`未知参数：${a}`); process.exit(2) }
  }
  return args
}

function inferEventType(fileName) {
  if (/^pledge/i.test(fileName)) return 'pledge'
  if (/^equity_change/i.test(fileName)) return 'equity_change'
  if (/^bid_won/i.test(fileName)) return 'bid_won'
  return null
}

// ---------- Prompt ----------

function buildSystemPrompt(eventType) {
  const fields = FIELD_REGISTRY[eventType].map((f) => `- ${f}（${UNIT_HINTS[f]}）`).join('\n')
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
    '{"raw_value":"原文原样字符串或null","value":标准化数值或null,"unit":"单位","standardized":true或false,"status":"extracted|not_mentioned|unreadable|needs_review","provenance":[{"block_id":null,"page":1,"region":null,"quote":"原文子串"}],"denominator":null或"shares_held"或"total_shares","cumulative":null,"note":null}',
    '',
    '硬性规则：',
    '1. 原文未提及的字段：status="not_mentioned"，value 必须为 null——禁止填 0。',
    '2. status="extracted" 的字段必须至少给一条 provenance，quote 必须是正文的连续子串。',
    '3. 数值标准化：股→股（万股×10000）；金额→元（万元×10000，亿元×100000000）；百分比→数值（"16.67%"→16.67）；日期→"YYYY-MM-DD"。',
    '4. 换算依据不足时 standardized=false 且 status="needs_review"，不要猜测。',
    '5. 比例字段必须给 denominator："占其所持股份比例"→"shares_held"，"占总股本比例"→"total_shares"。',
    '6. 累计口径数据（如累计质押）抽取时 cumulative=true，单次口径 cumulative=false。',
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

// ---------- 模拟响应（与三份冻结样例对应） ----------

function mockModelResponse(eventType) {
  const F = (raw, value, unit, quote, extra = {}) => ({
    raw_value: raw, value, unit, standardized: true, status: 'extracted',
    provenance: [{ block_id: null, page: 1, region: null, quote }], denominator: null, cumulative: null, note: null, ...extra,
  })
  const mocks = {
    pledge: {
      events: [{
        event_id: 'E01', event_type: 'pledge', extraction_method: 'mock', notes: 'MOCK 输出——不得计入真实抽取成绩',
        fields: {
          pledgor: F('张某', '张某', 'text', '股东名称：张某'),
          pledgee: F('中国示例银行股份有限公司上海分行', '中国示例银行股份有限公司上海分行', 'text', '质权人：中国示例银行股份有限公司上海分行'),
          pledged_shares: F('20,000,000股', 20000000, 'shares', '质押股数：20,000,000股'),
          pledged_ratio: F('5.00%', 5.00, 'percent', '占公司总股本比例：5.00%', { denominator: 'total_shares', cumulative: false }),
          pledge_amount: { raw_value: null, value: null, unit: 'cny', standardized: false, status: 'not_mentioned', provenance: [], denominator: null, cumulative: null, note: null },
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
          ratio_before: F('8.00%', 8.00, 'percent', '占公司总股本的8.00%', { denominator: 'total_shares' }),
          ratio_after: F('6.00%', 6.00, 'percent', '占公司总股本的6.00%', { denominator: 'total_shares' }),
          change_shares: F('8,000,000股', 8000000, 'shares', '累计减持公司股份8,000,000股'),
          method: F('集中竞价交易减持', '集中竞价交易减持', 'text', '本次权益变动方式为集中竞价交易减持'),
          change_date: F('2026年9月24日', '2026-09-24', 'date', '2026年9月20日至2026年9月24日'),
        },
      }],
    },
    bid_won: {
      events: [{
        event_id: 'E01', event_type: 'bid_won', extraction_method: 'mock', notes: 'MOCK 输出——不得计入真实抽取成绩',
        fields: {
          bidder: F('示例建设科技股份有限公司（联合体牵头人）', '示例建设科技股份有限公司（联合体牵头人）', 'text', '公司与联合体成员某市政设计研究院组成的联合体'),
          tenderer: F('某市轨道交通集团有限公司', '某市轨道交通集团有限公司', 'text', '招标人：某市轨道交通集团有限公司'),
          project_name: F('某市轨道交通3号线土建施工总承包项目', '某市轨道交通3号线土建施工总承包项目', 'text', '中标"某市轨道交通3号线土建施工总承包项目"'),
          bid_amount: F('人民币1,258,000,000元（含税）', 1258000000, 'cny', '中标金额：人民币1,258,000,000元（含税）'),
          currency: F('人民币', 'CNY', 'text', '中标金额：人民币1,258,000,000元（含税）'),
          tax_included: F('含税', 'true', 'text', '中标金额：人民币1,258,000,000元（含税）'),
          duration: F('1,095日历天', '1,095日历天', 'text', '工期：1,095日历天'),
          consortium: F('公司牵头占约85%，某市政设计研究院占约15%', '公司牵头占约85%，某市政设计研究院占约15%', 'text', '份额约占联合体中标金额的85%'),
          bid_date: F('2026年9月24日', '2026-09-24', 'date', '中标日期：2026年9月24日'),
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

function validateEnvelope(envelope, inputText) {
  const issues = []
  if (envelope.schema_version !== undefined && envelope.schema_version !== '0.1') issues.push(`schema_version 应为 "0.1"`)
  if (!Array.isArray(envelope.events) || envelope.events.length === 0) issues.push('events 缺失或为空')
  const statusOk = new Set(['extracted', 'not_mentioned', 'unreadable', 'needs_review'])
  for (const [i, ev] of (envelope.events ?? []).entries()) {
    if (!(ev.event_type in FIELD_REGISTRY)) { issues.push(`events[${i}].event_type 非法`); continue }
    for (const [name, fv] of Object.entries(ev.fields ?? {})) {
      if (!FIELD_REGISTRY[ev.event_type].includes(name)) issues.push(`events[${i}].fields.${name} 不在注册表中`)
      if (!statusOk.has(fv.status)) issues.push(`events[${i}].fields.${name}.status 非法：${fv.status}`)
      if ((fv.status === 'not_mentioned' || fv.status === 'unreadable') && fv.value !== null) {
        issues.push(`events[${i}].fields.${name} status=${fv.status} 但 value 非 null（缺失禁止填值）`)
      }
      if (fv.status === 'extracted') {
        if (!Array.isArray(fv.provenance) || fv.provenance.length === 0) issues.push(`events[${i}].fields.${name} 无出处`)
        for (const p of fv.provenance ?? []) {
          if (!p.quote || p.quote.trim().length === 0) issues.push(`events[${i}].fields.${name} 出处缺 quote`)
          else if (!inputText.includes(p.quote)) issues.push(`events[${i}].fields.${name} 出处 quote 不是原文子串：${p.quote.slice(0, 30)}…`)
        }
      }
    }
  }
  return issues
}

// ---------- 主流程 ----------

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || !args.input) {
    console.log('用法：node scripts/jingguan/run_extract.mjs --input <公告文本文件> [--event-type pledge|equity_change|bid_won] [--mock] [--out-dir runs]')
    process.exit(args.input ? 0 : 2)
  }

  const inputPath = resolve(REPO_ROOT, args.input)
  const inputText = readFileSync(inputPath, 'utf8')
  const fileName = basename(inputPath)
  const eventType = args.eventType ?? inferEventType(fileName)
  if (!eventType || !(eventType in FIELD_REGISTRY)) {
    console.error(`无法确定事件类型：请用 --event-type 指定 pledge|equity_change|bid_won`)
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

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', 'T')
  const runId = `${stamp}-${eventType}-${Math.random().toString(16).slice(2, 6)}`
  const startedAt = new Date().toISOString()
  console.log(`[运行] run_id=${runId}`)
  console.log(`[输入] ${args.input}（事件类型 ${eventType}，${inputText.length} 字符）`)
  if (isMock) console.log('****** MOCK 模式：不调用真实模型，输出不得计入真实抽取成绩 ******')

  const t0 = Date.now()
  let call, callError = null
  try {
    call = isMock
      ? mockModelResponse(eventType)
      : await callModel({ baseURL, model, apiKey, system: buildSystemPrompt(eventType), user: inputText.slice(0, 60000) })
  } catch (err) {
    callError = err
  }
  const durationMs = Date.now() - t0

  const sha256 = createHash('sha256').update(inputText, 'utf8').digest('hex')
  const envelope = {
    schema_version: '0.1',
    run_id: runId,
    is_mock: isMock,
    source: {
      file_id: `sha256:${sha256.slice(0, 16)}`,
      file_name: fileName,
      file_sha256: sha256,
      parse_meta: { parser_version: null, page_count: 1 },
    },
    events: call ? parseModelJson(call.content).events ?? [] : [],
    run_meta: {
      entry: 'cli',
      model: isMock ? 'mock' : model,
      started_at: startedAt,
      duration_ms: durationMs,
      errors: callError ? [`模型调用失败：${callError.message}`] : [],
    },
  }

  envelope.run_meta.errors.push(...validateEnvelope(envelope, inputText))

  const outDir = resolve(REPO_ROOT, args.outDir, runId)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(resolve(outDir, 'events.json'), JSON.stringify(envelope, null, 2), 'utf8')
  const callLog = {
    run_id: runId,
    is_mock: isMock,
    endpoint: isMock ? 'mock' : `${baseURL.replace(/\/$/, '')}/chat/completions`,
    model: isMock ? 'mock' : model,
    request: {
      system_prompt: buildSystemPrompt(eventType),
      user_message_chars: inputText.length,
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
  console.log(`[完成] ${envelope.events.length} 个事件，字段状态：${JSON.stringify(statusCount)}，耗时 ${durationMs}ms`)
  console.log(`[输出] ${args.outDir}/${runId}/events.json`)
  console.log(`[日志] ${args.outDir}/${runId}/call_log.json`)
  if (envelope.run_meta.errors.length > 0) {
    console.log(`[校验] ${envelope.run_meta.errors.length} 个问题（已如实写入 run_meta.errors）：`)
    for (const e of envelope.run_meta.errors) console.log(`  - ${e}`)
  }
  if (callError) process.exit(1)
}

main().catch((err) => { console.error(err); process.exit(1) })
