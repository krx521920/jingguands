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
import { execSync } from 'node:child_process'
import { validateAgainstSchema } from './lib/schema_validator.mjs'
import { FIELD_REGISTRY, checkRegistry } from './lib/registry.mjs'
import { normalizeFieldValue } from './lib/fang_normalize.mjs'
import { checkProvenance, checkPageBounds, checkEquityDirection } from './lib/checks.mjs'

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
    else if (a === '--cache-dir' || a === '--no-cache') { i += a === '--cache-dir' ? 1 : 0 } // D10 缓存参数：值由 cacheSetupFromCli 直接读 argv
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

// W1（宗 2026-10-07 待办）：信封内嵌块改为全保真投影——handoff 的 parse_meta.blocks 是
// 六键简约版（无 source_type/table_ref/header_path），方 D7 信封侧归因 71 处 UNIT_MISSING
// 误判即源于此。三键直接随信封下发后，下游不再必须回原始解析文件才能判锚。
function projectBlocks(blocks) {
  return blocks.map((b) => ({
    block_id: b.block_id, page: b.page, role: b.role,
    text: b.text, text_raw: b.text_raw, region: b.region,
    source_type: b.source_type ?? null,
    table_ref: b.table_ref ?? null,
    header_path: b.header_path ?? b.table_ref?.header_path ?? null,
  }))
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
    '输出 JSON 结构（events 数组放全部事件——通常 1 个；多笔质押时每个（质押人×质权人）组合一个事件）：',
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
    '3. 数值标准化：股→股（万股×10000）；金额→元（万元×10000，亿元×100000000）；百分比→数值（"16.67%"→16.67）；日期→"YYYY-MM-DD"。raw_value 必须原样保留原文"数值＋单位"完整形式（如"364.00万股""2.4亿元"），禁止只抄数字丢弃单位字样——丢单位会导致量级错误。change_shares 一律用绝对值（非负数）——方向由 direction 字段表达（decrease=减少），不要在数值里再加负号。',
    '4. unit 必须用固定枚举，按此映射：股数→"shares"；金额→"cny"；比例→"percent"；日期→"date"；计数→"count"；其余一切（人名/公司名/用途/方式/名称/工期原文等文本）→"text"。禁止写"股""元""%""日历天"等原文字样，禁止 null。规范值：currency 必须写 "CNY"（原文"人民币"也写 "CNY"）；tax_included/contract_signed/formal_award_notice_received 必须写字符串 "true"/"false"/"not_disclosed"（原文"含税"→"true"、"不含税"→"false"；禁止布尔值）；price_adjustment_status 用 "fixed"/"adjustable"/"not_disclosed"。注意：原文未披露时这些字段 status="not_disclosed" 且 value=null——"not_disclosed" 是状态枚举，永远不是 value 的取值。',
    '5. 换算依据不足时 standardized=false 且 status="needs_review"，不要猜测。',
    '6. 本次/累计是不同字段，各自独立抽取；比例字段的 denominator 按字段定义填，不要混用口径。denominator 枚举：holder_shares（占该股东所持股份）/ total_share_capital（占公司总股本）/ net_assets（占净资产）/ other（其他，须在 note 说明）。',
    '7. 日期区间（unit=date_range 的字段，如 change_date）：必须 unit="date_range"，value 必须是 ISO 区间字符串 "起始日/结束日"（如 "2026-09-20/2026-09-24"），status=extracted——区间是原文明确给出的值。禁止把 value 写成 {start,end} 对象，禁止用 unit="date" 装区间。',
    '8. 主体字段（pledgor/pledgee/holder/bidder/tenderer）：股权变动类（holder）优先用封面"信息披露义务人：X"给出的法定全称，正文只有简称且封面有全称时必须用全称；质押类（pledgor/pledgee）与中标类跟锚定句写法——原文出现"某某有限公司简称某某集团"式简称标注时用简称（如 gold：兰石集团）。禁止虚构原文没有的名称或定义句式。一致行动人口径（D5 冻结口径）：原文以"X及其一致行动人"合并披露持股数量/比例（群体口径数字）时，holder 写"牵头主体全称及其一致行动人"，股数用群体数字；原文逐人列表披露变动（每人一行前后股数）时按人各建事件，holder 用该人名称——"本次权益变动前后持股情况"表内每一行主体（含"及相关各方"表中的受让方增持行）都各建事件；只有不在变动披露表内、仅在协议描述中出现的交易对手才不建事件（他们另发公告）。method 用规范标签：协议转让/公开征集协议转让/司法拍卖被动减持/集中竞价交易/集中竞价及大宗交易/可转债转股被动稀释——保留全部限定词（公开征集/被动/减持/稀释不得丢弃），raw_value 保留完整原文表述。',
    '9. 日期规则：单日值直接 unit="date"＋"YYYY-MM-DD"；仅当字段本身是起止区间（如质押期限、变动期间）才用 date_range，同日起止不算区间。若原文给的是条件性描述而非日期（如"申请解除质押登记日""至本公告披露日"）：status=needs_review、unit 保持字段规定的日期单位、value=null、raw_value 保留原文——不要编造日期，也不要把 unit 改成 text。解除质押（direction=release）事件的日期同样按原文：公告明确给了解除/起始日期就抽取，只字未提才 not_mentioned——不要预设"解除必无日期"。股权变动的 change_date 用权益变动的生效/完成日（如"X日完成过户登记手续"的日期），不是拍卖成交日/竞价窗口等中间过程日；原文没有给完成日期时，用权益变动发生日（协议签署日等明确给出的日历日期）兜底；原文以条件性时间字段（"办理完毕…之日"）界定变动时间的置 needs_review；报告书/公告自身的签署日期永远不是 change_date；原文明确"权益变动时间/变动期间"区间时用该区间。变动前后持股数量相等（如可转债转股被动稀释"不涉及持股数量的变化"）时，shares_before 和 shares_after 都必须照实分别填同一数值——相等不等于缺失，禁止因"没变"写 not_mentioned。',
    '10. 联合体判定：公告没有联合体→consortium_members 和 consortium_shares 都 not_applicable；有联合体→consortium_members=extracted（名单）；份额没写→consortium_shares=not_mentioned；份额写了→extracted。direction 的 quote 必须至少 4 个字（如"本次增持股份""通过集中竞价减持"），不要只写"增持"或"减持"一个两字词——太短无法定位唯一出处。中标类口径：招标方信息因商业机密豁免披露时 tenderer=not_disclosed（"某知名企业"类匿名描述不是招标方名称）；duration 填含"工期/服务期"的核心分句（如"总建设工期24个月"），不要整段照抄条款。',
    '11. 多事件：一份公告可含多个事件——质押按（质押人×质权人×业务方向）组合各建一个事件，event_id 依次 E01/E02/E03…；表格中每组新的[质押数量+质权人+起始日]即为一个新事件，股东名称跨行共享时后续行沿用同一质押人；"合计"行不是事件、禁止抽取；累计质押情况（累计股数/累计占比）对每个事件相同就分别填入。direction 字段（v0.4）：普通质押填 "pledge"；"已解除质押/办理解除质押业务"为独立事件填 "release"——同一（质押人×质权人）先押后解时是两个事件，各带各自 direction。direction 的 quote 用原文中的短词即可（"质押"或"解除质押"），不要引长句。release 事件的 pledged_shares_this_time 取"本次将X股办理了质押解除手续/解除了X股"句中的股数——锚定解除句本身，不要取其他句子的数字；"其中Y股办理了…"的"其中"句是总数的组成部分，禁止据此另立事件或拆分总量。股权变动的事件粒度：变动表逐行给出各主体自身的变动数（增减股数列）时按行拆分为独立事件（含受让方增持行，"总股本/实际控制人持股/合计"行除外）；变动数只在群体层面披露（如"信息披露义务人合计持有…本次权益变动后合计持有…""X及其一致行动人的持股数量由…减少至"）时只建一个聚合事件——holder 用"牵头主体全称及其一致行动人"或文中列名的全体信息披露义务人，数字用群体合计；即使附表按成员逐行列示持股数量也不拆分。',
    ...(parseMode ? [
      '12. 【解析块模式】正文按块给出，每行格式为 [block_id] 文本；表格单元格行为 [block_id|表头:列名] 值——必须按表头理解单元格含义再抽取。provenance 必须给出 quote 所在块的 block_id。',
      '13. quote 必须是单个块内 text_raw 的连续子串，禁止跨块拼接；不得事后按数字反搜。quote 与 block_id 必须对应——引用的块文本里必须实际包含该 quote（direction 等短词引哪块就填哪块的 block_id）。',
    ] : []),
  ].join('\n')
}

// ---------- 模型调用 ----------

// 模型调用缓存（D10）：temperature=0 下同 model+system+user 的调用可确定性重放。
// --cache-dir <dir>｜env JINGGUAN_CACHE_DIR 开启；--no-cache｜env JINGGUAN_NO_CACHE 强制旁路（清缓存重跑用）。
// 命中：不调 API，call_log 记 cache_hit=true；未命中：调 API 后写缓存。缓存文件含 model 校验防错配。
const CACHE = { dir: null, enabled: false, hits: 0, misses: 0, writes: 0 }
function cacheKeyOf(model, system, user) {
  return createHash('sha256').update(`${model}\u0000${system}\u0000${user}`).digest('hex')
}
function cacheSetupFromCli(argv) {
  const dirIx = argv.indexOf('--cache-dir')
  const dir = dirIx > 0 ? argv[dirIx + 1] : process.env.JINGGUAN_CACHE_DIR
  const noCache = argv.includes('--no-cache') || process.env.JINGGUAN_NO_CACHE === '1'
  if (dir && !noCache) {
    CACHE.dir = resolve(REPO_ROOT, dir)
    CACHE.enabled = true
    mkdirSync(CACHE.dir, { recursive: true })
  }
}
function cacheRead(key, model) {
  if (!CACHE.enabled) return null
  const p = resolve(CACHE.dir, `${key}.json`)
  try {
    const j = JSON.parse(readFileSync(p, 'utf8'))
    if (j.model !== model) return null // 防错配：模型不同视为未命中
    CACHE.hits++
    return { content: j.content, usage: j.usage, durationMs: 0, realDurationMs: j.durationMs, httpStatus: j.httpStatus, retriesWithoutResponseFormat: false, cache_hit: true, cache_key: key }
  } catch { return null }
}
function cacheWrite(key, model, result) {
  if (!CACHE.enabled) return
  CACHE.writes++
  const p = resolve(CACHE.dir, `${key}.json`)
  writeFileSync(p, JSON.stringify({ model, content: result.content, usage: result.usage, durationMs: result.durationMs, httpStatus: result.httpStatus, cached_at: new Date().toISOString() }, null, 1), 'utf8')
}

async function callModel({ baseURL, model, apiKey, system, user, signal }) {
  const key = cacheKeyOf(model, system, user)
  if (CACHE.enabled) {
    const hit = cacheRead(key, model)
    if (hit !== null) return hit
    CACHE.misses++
  }
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
  const doFetch = async (payload, attempt = 1) => {
    // D12：单次调用 180 秒超时（AbortSignal 与外部 signal 合并）；超时/网络错误重试一次
    const timeoutSignal = AbortSignal.timeout(180_000)
    const sig = signal !== undefined ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
    try {
      return await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(payload),
        signal: sig,
      })
    } catch (err) {
      if (attempt === 1 && (err?.name === 'TimeoutError' || err?.name === 'AbortError' || err?.code === 'ECONNRESET' || err?.code === 'ETIMEDOUT' || err?.code === 'ECONNREFUSED')) {
        console.log(`[重试] 模型调用${err?.name === 'TimeoutError' ? '超时' : '网络错误'}（${String(err?.message ?? err).slice(0, 80)}）——重试 1/1`)
        return doFetch(payload, 2)
      }
      throw Object.assign(new Error(`模型调用失败（${err?.name ?? '网络'}）：${String(err?.message ?? err).slice(0, 300)}`), { cause: err })
    }
  }
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
  const out = {
    content: json.choices?.[0]?.message?.content ?? null,
    usage: json.usage ?? null,
    durationMs,
    httpStatus: res.status,
    retriesWithoutResponseFormat,
    cache_hit: false,
    cache_key: key,
  }
  cacheWrite(key, model, out)
  return out
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
          direction: F('质押', 'pledge', 'text', '部分股份质押'),
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
    ...checkEquityDirection(envelope),
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

/** 去空白归一（跨块拼接比较用）。 */
const normWs = (s) => String(s).replace(/\s+/g, '')

/** 从原文文本中取出"归一化后等于 target"的原始子串（保留原样空白）；找不到返回 null。 */
function extractOrig(text, normTarget) {
  let ti = 0
  for (let start = 0; start < text.length; start++) {
    if (/\s/.test(text[start])) continue
    let i = start, ti2 = 0
    while (i < text.length && ti2 < normTarget.length) {
      if (/\s/.test(text[i])) { i++; continue }
      if (text[i] !== normTarget[ti2]) break
      i++; ti2++
    }
    if (ti2 === normTarget.length) return text.slice(start, i)
  }
  return null
}

/**
 * 跨块 quote 贪心分段（v0.4，修 award-001 长项目名跨块）：
 * 长标题被解析切成多块时，模型给出的整段 quote 不在任何单块内——
 * 按阅读顺序把 quote 拆成逐块片段（每段各自是所属块 text_raw 的原样子串），
 * 返回分段数组；覆盖不全返回 null（调用方按原逻辑报错）。
 */
function splitQuoteAcrossBlocks(quote, blocks, maxSegs = 4) {
  let remaining = normWs(quote)
  const segs = []
  for (const b of blocks) {
    if (remaining.length === 0 || segs.length >= maxSegs) break
    const nb = normWs(b.text_raw)
    if (nb.length === 0) continue
    let k = Math.min(remaining.length, nb.length)
    while (k >= 2 && !nb.includes(remaining.slice(0, k))) k--
    if (k < 2) continue
    const orig = extractOrig(b.text_raw, remaining.slice(0, k))
    if (orig === null) continue
    segs.push({ block: b, quote: orig })
    remaining = remaining.slice(k)
  }
  return remaining.length === 0 ? segs : null
}

/** 解析块模式出处回填：按 block_id 从解析结果填 page/region/table；真实模式缺 block_id 记错，mock 允许按 quote 定位块。 */
/** 出处修复：省略号 quote 截为原文子串；引用块不含 quote 时按最长前缀在同页/全库唯一块重锚。文本模式只做截取。 */
function repairQuotes(events, parseDoc, inputText, repairs) {
  const fullText = parseDoc ? parseDoc.joinedRaw : inputText
  events.forEach((ev, i) => {
    for (const [name, fv] of Object.entries(ev.fields ?? {})) {
      fv.provenance?.forEach((p, pi) => {
        if (typeof p.quote !== 'string' || p.quote.length < 2) return
        // 短 quote（2-5 字，如 direction="质押"）：引用块不含时按"事件一致性"重锚——
        // 同事件其他字段已锚定的块中含该词者（方向词与股数/主体通常同块）
        if (parseDoc !== null && p.quote.length < 6) {
          const cited = p.block_id ? parseDoc.blockIndex.get(p.block_id) : undefined
          if (cited && cited.text_raw.includes(p.quote)) return
          const siblingBlocks = new Set()
          for (const [, sf] of Object.entries(ev.fields ?? {})) {
            if (sf === fv) continue
            for (const sp of sf.provenance ?? []) if (sp.block_id) siblingBlocks.add(sp.block_id)
          }
          for (const bid of siblingBlocks) {
            const blk = parseDoc.blockIndex.get(bid)
            if (blk && blk.text_raw.includes(p.quote)) {
              repairs.push(`[出处修复] events[${i}].fields.${name}.provenance[${pi}]: 短 quote 未命中引用块，按事件一致性重锚至 ${bid}（${p.quote}）`)
              p.block_id = blk.block_id
              p.page = blk.page
              p.region = blk.region ?? null
              p.table_id = blk.table_ref?.table_id ?? null
              p.cell_ref = blk.table_ref?.cell_ref ?? null
              p.source_type = blk.source_type ?? null
              return
            }
          }
          // 兜底：事件内容评分重锚——含该词的块中，选同时含本事件主体名/股数原文者（唯一最高分才动）
          const ownerVal = String(ev.fields?.pledgor?.value ?? ev.fields?.holder?.value ?? ev.fields?.bidder?.value ?? '')
          const sharesRaw = String(ev.fields?.pledged_shares_this_time?.raw_value ?? ev.fields?.shares_before?.raw_value ?? '').replace(/[^\d,]/g, '')
          let best = null, bestScore = 0, tie = false
          for (const blk of parseDoc.blocks) {
            if (!blk.text_raw || !blk.text_raw.includes(p.quote)) continue
            let score = 1
            if (ownerVal.length >= 2 && blk.text_raw.includes(ownerVal)) score += 2
            if (sharesRaw.length >= 3 && blk.text_raw.includes(sharesRaw)) score += 2
            if ((blk.header_path ?? '').includes(p.quote)) score += 1
            // 动词语境：质押/解除质押类方向词锚向交易句本身（"…质押给…""办理…质押…"）
            if (/质押给|办理.{0,6}质押|质押业务|解除质押/.test(blk.text_raw)) score += 2
            if (score > bestScore) { bestScore = score; best = blk; tie = false }
            else if (score === bestScore && best !== null) tie = true
          }
          if (best !== null && !tie && bestScore >= 3) {
            repairs.push(`[出处修复] events[${i}].fields.${name}.provenance[${pi}]: 短 quote 按事件内容评分重锚至 ${best.block_id}（${p.quote}，score=${bestScore}）`)
            p.block_id = best.block_id
            p.page = best.page
            p.region = best.region ?? null
            p.table_id = best.table_ref?.table_id ?? null
            p.cell_ref = best.table_ref?.cell_ref ?? null
            p.source_type = best.source_type ?? null
          }
          return
        }
        if (typeof p.quote !== 'string' || p.quote.length < 6) return
        if (parseDoc === null) {
          // 文本模式：quote 只须是全文子串——省略号截为最长原文前缀；换行断词（"占\n其"）按去空白索引回映
          if (fullText.includes(p.quote)) return
          const stripped = fullText.replace(/\s+/g, '')
          const origIdx = []
          for (let k = 0; k < fullText.length; k++) if (!/\s/.test(fullText[k])) origIdx.push(k)
          const parts = p.quote.split(/…|\.\.\.|⋯/).map((s) => s.trim()).filter((s) => s.length >= 3)
          for (const t of parts) {
            for (let len = t.length; len >= 3; len--) {
              const seg = t.slice(0, len)
              if (fullText.includes(seg)) {
                repairs.push(`[出处修复] events[${i}].fields.${name}: quote 含省略号/非原文，已截为原文子串（${seg.slice(0, 20)}…）`)
                p.quote = seg
                return
              }
              const sIdx = stripped.indexOf(seg)
              if (sIdx !== -1 && origIdx[sIdx + seg.length - 1] !== undefined) {
                const quote2 = fullText.slice(origIdx[sIdx], origIdx[sIdx + seg.length - 1] + 1)
                if (quote2.replace(/\s+/g, '') === seg) {
                  repairs.push(`[出处修复] events[${i}].fields.${name}: quote 跨换行断词，已回映为原文连续子串（${seg.slice(0, 16)}…）`)
                  p.quote = quote2
                  return
                }
              }
            }
          }
          return
        }
        const cited = p.block_id ? parseDoc.blockIndex.get(p.block_id) : undefined
        if (cited && cited.text_raw.includes(p.quote)) return
        const allBlocks = parseDoc.blocks
        // 候选：省略号分段 + 完整/去首字符前缀（块可能从词中间断开，如"露了《…"缺"披"）
        const tries = []
        for (const part of p.quote.split(/…|\.\.\.|⋯/).map((s) => s.trim()).filter((s) => s.length >= 8)) {
          for (let s = 0; s <= 4 && part.length - s >= 8; s++) {
            const base = part.slice(s)
            for (let len = base.length; len >= 8; len--) tries.push(base.slice(0, len))
          }
        }
        if (tries.length === 0) return
        const scopes = cited ? [allBlocks.filter((b) => b.page === cited.page), allBlocks] : [allBlocks]
        for (const scope of scopes) {
          for (const t of tries) {
            const hits = scope.filter((b) => b.text_raw && b.text_raw.includes(t))
            if (hits.length === 1) {
              const b = hits[0]
              repairs.push(`[出处修复] events[${i}].fields.${name}.provenance[${pi}]: quote 未命中引用块${cited ? ` ${cited.block_id}` : ''}，按前缀唯一命中重锚至 ${b.block_id}（${t.slice(0, 20)}…）`)
              p.block_id = b.block_id
              p.page = b.page
              p.region = b.region ?? null
              p.table_id = b.table_ref?.table_id ?? null
              p.cell_ref = b.table_ref?.cell_ref ?? null
              p.source_type = b.source_type ?? null
              p.quote = t
              return
            }
          }
        }
        // 跨块重锚（D11 缺陷②修复）：quote 前缀在前块、后缀在引用块（如 AWD-002 工程名跨
        // p001/p002 边界）——按最长后缀唯一命中重锚（后缀≥8 字），quote 改为块内后缀段。
        for (let len = p.quote.length; len >= 8; len--) {
          const suffix = p.quote.slice(-len)
          const hits = allBlocks.filter((b) => b.text_raw && b.text_raw.includes(suffix))
          if (hits.length === 1) {
            const b = hits[0]
            repairs.push(`[出处修复] events[${i}].fields.${name}.provenance[${pi}]: quote 跨块（前缀在他块），按最长后缀唯一命中重锚至 ${b.block_id}（${suffix.slice(0, 20)}…）`)
            p.block_id = b.block_id
            p.page = b.page
            p.region = b.region ?? null
            p.table_id = b.table_ref?.table_id ?? null
            p.cell_ref = b.table_ref?.cell_ref ?? null
            p.source_type = b.source_type ?? null
            p.quote = suffix
            return
          }
        }
      })
    }
  })
}

function backfillProvenance(events, blockIndex, isMock, errors, orderedBlocks, repairs = []) {
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
          // v0.4 修复：模型偶发写错块 ID 的页段（p001 vs p002）——若"仅页段不同"的块中
          // 恰有一个包含 quote，则按 quote 确定性地修复（记警告，不静默）
          if (p.block_id && p.quote) {
            const m = String(p.block_id).match(/^(.*)_p\d+_(b\d+)$/)
            if (m !== null) {
              const candidates = orderedBlocks?.filter((b) => b.block_id.endsWith('_' + m[2]) && b.block_id !== p.block_id && b.text_raw.includes(p.quote)) ?? []
              if (candidates.length === 1) {
                block = candidates[0]
                repairs.push(`[解析·修复] events[${i}].fields.${name}.provenance[${pi}]: 块 "${p.block_id}" 不存在，按 quote 唯一命中修复为 "${block.block_id}"（页段笔误）`)
                p.block_id = block.block_id
              }
            }
          }
        }
        if (block === undefined) {
          errors.push(`[解析] events[${i}].fields.${name}.provenance[${pi}]: block_id "${p.block_id ?? ''}" 不在解析结果中`)
          return
        }
        if (p.quote && !block.text_raw.includes(p.quote)) {
          // v0.4：先试跨块分段（长标题被切成多块的常见场景），成功则替换为逐块出处。
          // 单段重锚仅在 quote 全文唯一出现于一个块时允许（防短词贪心锚到标题块）
          const segs = orderedBlocks ? splitQuoteAcrossBlocks(p.quote, orderedBlocks) : null
          const nq = normWs(p.quote)
          const uniqueHit = segs !== null && segs.length === 1
            ? orderedBlocks.filter((b) => normWs(b.text_raw).includes(nq)).length === 1
            : false
          if (segs !== null && (segs.length > 1 || uniqueHit)) {
            const replacement = segs.map((s) => ({
              block_id: s.block.block_id, page: s.block.page, region: s.block.region ?? null,
              table_id: s.block.table_ref?.table_id ?? null, cell_ref: s.block.table_ref?.cell_ref ?? null,
              source_type: s.block.source_type ?? null, quote: s.quote,
            }))
            fv.provenance.splice(pi, 1, ...replacement)
            return
          }
          // v0.4.2 同页重锚：模型引用了同页但错误块号的块——若同页恰有唯一块包含 quote，修复
          if (orderedBlocks !== null && p.quote.length >= 3) {
            const citedPage = block.page
            const samePageHits = orderedBlocks.filter((b) => b.page === citedPage && b.text_raw.includes(p.quote) && b.block_id !== block.block_id)
            if (samePageHits.length === 1) {
              const fixed = samePageHits[0]
              repairs.push(`[解析·修复] events[${i}].fields.${name}.provenance[${pi}]: quote 在同页块 ${fixed.block_id} 中唯一命中（模型误引 ${block.block_id}），已修复`)
              p.block_id = fixed.block_id
              p.page = fixed.page
              p.region = fixed.region ?? null
              p.table_id = fixed.table_ref?.table_id ?? null
              p.cell_ref = fixed.table_ref?.cell_ref ?? null
              p.source_type = fixed.source_type ?? null
              return
            }
          }
          errors.push(`[解析] events[${i}].fields.${name}.provenance[${pi}]: quote 不是块 ${block.block_id} text_raw 的子串`)
          return
        }
        p.page = block.page
        p.region = block.region ?? null
        p.table_id = block.table_ref?.table_id ?? null
        p.cell_ref = block.table_ref?.cell_ref ?? null
        p.source_type = block.source_type ?? null
      })
    }
  })
}

// ---------- 宗 D5 冻结口径四规则（evaluation/D5/handoffs/D5-gold-decisions.md @0de17901） ----------

/** 中文名变体判定：短名是长名的子序列（如"国贸集团"⊂"浙江省国际贸易集团有限公司"），或互为包含。 */
function isNameVariant(short, full) {
  if (short === full) return false
  if (full.includes(short) || short.includes(full)) return true
  let i = 0
  for (const ch of full) { if (ch === short[i]) i++ }
  return i === short.length && short.length >= 2
}

/** 候选主体名清洗：去编号/名称前缀、按地址与字段标签截断、去尾随数字；返回 null 表示无效。 */
function cleanDiscloser(v) {
  let s = String(v).trim()
  s = s.replace(/^[（(]?[一二三四五六七八九十0-9]{1,3}[）)]?[:：]?/, '')
  s = s.replace(/^名称[:：]/, '').replace(/^为/, '').replace(/^指/, '')
  const cuts = ['信息披露义务人', '姓名', '本报告书', '（以下简称', '以下简称', '住所', '注册地址', '通讯地址',
    '股份变动', '权益变动', '声明', '签署日期', '性别', '国籍', '曾用名', '身份证', '执行事务',
    '江苏省', '浙江省', '安徽省', '北京市', '上海市', '天津市', '重庆市', '河南省', '山东省', '广东省',
    '福建省', '湖南省', '湖北省', '四川省', '河北省', '山西省', '辽宁省', '吉林省', '黑龙江省', '江西省',
    '贵州省', '云南省', '陕西省', '甘肃省', '青海省', '广西', '西藏', '宁夏', '新疆', '内蒙古', '香港', '澳门']
  for (const cut of cuts) {
    const i = s.indexOf(cut)
    if (i > 0) s = s.slice(0, i)
  }
  s = s.replace(/[，、；,;].*$/, '').replace(/[\d].*$/, '').trim()
  if (s.length < 2 || s.length > 40) return null
  if (/本次|披露|持股|持有|拥有|成为|计划|情况|如下|声明|介绍|简介|基本情况|转让方|受让方|直系亲属|买卖|承诺|签署|保证|机构|授权|委托|条款|章程|先生|女士|《|外$|^及其|^第/.test(s)) return null
  return s
}

/** 从全文提取封面信息披露义务人（法定全称；含编号列表与"X及其一致行动人"聚合写法）。 */
function extractCoverDisclosers(text) {
  const names = []
  const push = (raw) => {
    const v = cleanDiscloser(raw)
    if (v !== null && !names.includes(v)) names.push(v)
  }
  for (const m of text.matchAll(/信息披露义务人[：:]?\s*([^\n，。；]{2,50})/g)) push(m[1])
  for (const m of text.matchAll(/信息披露义务人为\s*([^\n，。；]{2,50})/g)) push(m[1])
  return names
}

/** 封面"一致行动人：姓名"行（仅姓名行；002 式单一义务人＋分列一致行动人的结构才会用到）。 */
function extractCoverConcertParties(text) {
  const names = []
  for (const m of text.matchAll(/一致行动人[：:]\s*([^\n，。；]{2,40}?)(?=住所|通讯地址|注册地址|一致行动人|信息披露|$)/g)) {
    let s = m[1].trim()
    s = s.replace(/[\d].*$/, '').replace(/[，、；,;].*$/, '').trim()
    if (s.length < 2 || s.length > 20) continue
    if (/及其一致行动人|协议|声明|出具|提供|直系亲属|买卖|关系|情况|本次|披露/.test(s)) continue
    if (!names.includes(s)) names.push(s)
  }
  return names
}

/**
 * 四类冻结口径的确定性后处理（仅 equity_change）：
 * A. holder 用法定全称＋一致行动人聚合（D5-GOLD-001）
 * B. method 规范标签映射（D5-GOLD-002）
 * C. change_date 用生效/完成日而非拍卖/交易窗口（D5-GOLD-003）
 * D. 相等前后股数照实抽取的规则回填（D5-GOLD-004）
 * 附：非信息披露义务人/一致行动人的转让方不建事件（EQC-002 多事件口径）。
 */
function applyGoldConventions(events, inputText, parseDoc, postErrors, repairs = []) {
  const docText = parseDoc ? parseDoc.blocks.map((b) => b.text_raw).join('') : inputText
  const compact = docText.replace(/\s+/g, '')

  // ---- W. 中标类口径（宗 D6 gold 惯例）----
  const awEvents = events.filter((ev) => ev.event_type === 'award_contract')
  if (awEvents.length > 0) {
    // W1. 工期口径（gold 三形态）：首分句含"工期"＋数字→取首分句（AWD-005）；值带描述前缀（施工周期/服务期…）接数字→去前缀（AWD-006"750天"）；其余保持原句（AWD-003 全句）
    for (const ev of awEvents) {
      const du = ev.fields?.duration
      if (du?.status !== 'extracted' || typeof du.value !== 'string') continue
      let v = du.value
      const original = v
      const head = v.split(/[，,；;。]/)[0]
      if (head !== v && /工期/.test(head) && /\d/.test(head)) v = head
      v = v.replace(/^(施工周期|运营周期|建设周期|服务期|工期)(?=\d)/, '')
      if (v !== original && v.length >= 2) {
        du.note = `${du.note ?? ''}［口径精简：${original.slice(0, 14)}${original.length > 14 ? '…' : ''}→${v}（工期分句/去标签前缀）］`
        du.value = v
      }
    }
    // W2. "办理合同签订事宜/以最终签署的正式合同为准"式流程表述＝尚未正式签订 → contract_signed=extracted "false"
    // （"其他尚未签订正式合同"式混合状态不触发——gold 对未签事件记 not_disclosed，如 D6-AWD-002）
    const unsigned = compact.match(/办理合同签订事宜|以最终签署的正式合同/)
    if (unsigned !== null) {
      const ublk = parseDoc?.blocks.find((b) => b.text_raw && compact.includes(unsigned[0]) && b.text_raw.replace(/\s+/g, '').includes(unsigned[0].slice(0, 8)))
      for (const ev of awEvents) {
        const csF = ev.fields?.contract_signed
        if (csF !== undefined && csF.status !== 'extracted') {
          csF.status = 'extracted'
          csF.value = 'false'
          csF.raw_value = unsigned[0]
          csF.note = `${csF.note ?? ''}［口径修正：原文明示合同尚未正式签订→contract_signed="false"（extracted）］`
          if (ublk) csF.provenance = [{ block_id: ublk.block_id, source_type: ublk.source_type ?? 'paragraph', page: ublk.page, region: ublk.region ?? null, table_id: ublk.table_ref?.table_id ?? null, cell_ref: ublk.table_ref?.cell_ref ?? null, quote: unsigned[0] }]
        }
      }
    }
    // W2b. 混合状态公告（"已签订合同…其他尚未签订正式合同"并列）：未签子项的 contract_signed 按未披露处理（gold D6-AWD-002）
    if (/已签订合同/.test(compact) && /尚未签订/.test(compact)) {
      for (const ev of awEvents) {
        const csF = ev.fields?.contract_signed
        if (csF?.status === 'extracted' && csF.value === 'false') {
          csF.status = 'not_disclosed'
          csF.value = null
          csF.raw_value = null
          csF.note = `${csF.note ?? ''}［口径修正：混合状态公告（部分已签部分未签），未签子项按未披露处理］`
          csF.provenance = []
        }
      }
    }
    // W3. 招标方信息因商业机密豁免披露 → tenderer=not_disclosed（"某知名企业"类匿名描述不是招标方名称）
    if (/招标方信息[^。]{0,25}(商业机密|商业秘密|豁免)/.test(compact)) {
      for (const ev of awEvents) {
        const td = ev.fields?.tenderer
        if (td?.status === 'extracted' && typeof td.value === 'string' && td.value.length > 0
          && !/公司|集团|银行|大学|研究院|政府|管理局|事业部|中心$|部$/.test(td.value)) {
          td.status = 'not_disclosed'
          td.value = null
          td.raw_value = null
          td.note = `${td.note ?? ''}［口径修正：招标方信息因商业机密豁免披露，匿名描述不算招标方名称→not_disclosed］`
          td.provenance = []
        }
      }
    }
    // W4. bidder 的"X与Y联合"式牵头披露→只写牵头方（顿号全名单"X、Y、Z联合体"式保持原样——gold 两种形态都存在）
    for (const ev of awEvents) {
      const bd = ev.fields?.bidder
      if (bd?.status === 'extracted' && typeof bd.value === 'string') {
        const m = bd.value.match(/^(.+?)与.{2,20}联合体?$/)
        if (m !== null && m[1].length >= 4) {
          bd.note = `${bd.note ?? ''}［口径精简：${bd.value}→${m[1]}（牵头方）］`
          bd.value = m[1]
        }
      }
      // W4b. consortium_members 名单连接符统一顿号（gold："X、Y"）
      const cm = ev.fields?.consortium_members
      if (cm?.status === 'extracted' && typeof cm.value === 'string' && cm.value.includes('与')) {
        const parts = cm.value.split(/与|、/).map((s) => s.trim()).filter(Boolean)
        if (parts.length >= 2 && parts.every((s) => /(公司|企业|院|所|中心|集团)$/.test(s))) {
          cm.note = `${cm.note ?? ''}［口径归一：与→、（名单连接符）］`
          cm.value = parts.join('、')
        }
      }
    }
    // W6. 金额未披露时币种不默认：bid_amount 非 extracted 而 currency=CNY → currency not_mentioned
    for (const ev of awEvents) {
      const ba = ev.fields?.bid_amount
      const cu = ev.fields?.currency
      if (cu?.status === 'extracted' && cu.value === 'CNY' && ba !== undefined && ba.status !== 'extracted') {
        cu.status = 'not_mentioned'
        cu.value = null
        cu.note = `${cu.note ?? ''}［口径修正：金额未披露，币种不得默认 CNY→not_mentioned］`
      }
    }
    // W7. 外币折合人民币口径（D6-AWD-007，方 D6 判定书＋D8 群指示已落实为默认行为）：
    // raw_value 含"X 原币（折合人民币 Y 元）"→ 标准值取 Y、raw_value 改写为人民币子串
    // （完整双币种引文保留在 provenance.quote）、currency 配对 CNY、原币金额记 note。
    // 逃生口：JINGGUAN_CURRENCY_POLICY=legacy 恢复旧口径（用于裁决前后差异对照）。
    if (process.env.JINGGUAN_CURRENCY_POLICY !== 'legacy') {
      for (const ev of awEvents) {
        const ba = ev.fields?.bid_amount
        const cu = ev.fields?.currency
        if (ba?.status !== 'extracted' || typeof ba.raw_value !== 'string') continue
        const m = ba.raw_value.match(/([\d,，]+)\s*[^\d（），,]{0,8}[（(]\s*[^）)]*?折合人民币\s*([\d,，]+)\s*元\s*[）)]/)
        if (m === null) continue
        const orig = m[1].replace(/[,，]/g, '')
        const cny = m[2].replace(/[,，]/g, '')
        if (!/^\d+$/.test(orig) || !/^\d+$/.test(cny) || cny === '0') continue
        ba.raw_value = `人民币${m[2]}元`
        ba.value = Number(cny)
        ba.unit = 'cny'
        ba.standardized = true
        // 适配器 fx 路径已加的短标注与 W7 判定标注语义重复——W7 是权威出处，先剥离再追加
        ba.note = `${(ba.note ?? '').replace('［口径A（方 D6-AWD-007 判定）：文内明示人民币折合值，原币金额见完整引文］', '')}［方 D6-AWD-007 判定：采用公告明示的人民币折合金额；原始计价金额为 ${m[1]}（外币）。未执行汇率计算，未推断含税状态］`
        if (cu !== undefined && cu.status === 'extracted') {
          cu.raw_value = '人民币'
          cu.value = 'CNY'
          cu.unit = 'text'
          cu.standardized = true
          cu.note = `${cu.note ?? ''}［与选定的人民币金额配对；原始计价币种保留在 bid_amount 完整引文与判定记录（方 D6 判定书）］`
        }
      }
    }
    // W5. price_adjustment_status 证据锚定：quote 讲"份额/股权"调整而非"价格"调整 → not_mentioned
    for (const ev of awEvents) {
      const pa = ev.fields?.price_adjustment_status
      const q = pa?.provenance?.[0]?.quote ?? ''
      if ((pa?.status === 'extracted' || pa?.status === 'needs_review') && typeof q === 'string' && q.length > 0
        && /份额|股权/.test(q) && !/价格|单价|费率/.test(q)) {
        pa.status = 'not_mentioned'
        pa.value = null
        pa.raw_value = null
        pa.note = `${pa.note ?? ''}［口径修正：出处讲份额/股权调整而非价格调整→not_mentioned］`
        pa.provenance = []
      }
    }
  }

  // ---- P. 质押类口径 ----
  const plEvents = events.filter((ev) => ev.event_type === 'pledge')
  if (plEvents.length > 0) {
    // P2. 质押主体简称（gold 惯例）：原文"全称（以下简称'简称'）"定义存在且字段值为全称 → 用简称（解质表口径的 P1 在其后可覆盖回全称）
    const shortDefs = [...compact.matchAll(/([^，。；\s]{4,60}?)（以下简称["“']?([^)”']{2,20})["”']?）/g)]
    if (shortDefs.length > 0) {
      for (const ev of plEvents) {
        for (const fname of ['pledgor', 'pledgee']) {
          const f = ev.fields?.[fname]
          if (f?.status !== 'extracted' || typeof f.value !== 'string') continue
          // 后缀匹配：定义句 capture 以字段值结尾（前缀噪声如"接到公司控股股东"被自然忽略）
          const def = shortDefs.find((dm) => dm[1].endsWith(f.value) && dm[1].length - f.value.length <= 58)
          if (def !== undefined && def[2] !== f.value) {
            f.note = `${f.note ?? ''}［口径归一：${f.value}→${def[2]}（原文简称定义，质押主体跟简称）］`
            f.value = def[2]
          }
          // P2b（D11 缺陷①修复·对称面）：值=定义简称而字段自身引文含全称 → 按引文归全称
          // （PLD-009 E03 坏变体：value="有格投资" 而 quote="有格创业投资有限公司"）。
          // 双约束防误伤（PLD-010 教训：gold 本就要简称"中信银行宁波分行"，引文片段
          // "宁波分行"不是全称）：①全称须以机构后缀结尾；②首字与值相同且值为全称的
          // 子序列（有格投资⊂有格创业投资有限公司✓；宁波分行首字≠中信…✗）。
          else {
            const defShort = shortDefs.find((dm) => dm[2] === f.value)
            const ownQuote = String(f.provenance?.[0]?.quote ?? '')
            if (defShort !== undefined && ownQuote.length >= 4) {
              let full = null
              for (let len = defShort[1].length; len >= 4; len--) {
                const s = defShort[1].slice(-len)
                if (ownQuote.includes(s)) { full = s; break }
              }
              const subseq = (short, long) => { let i = 0; for (const ch of long) if (ch === short[i]) i++; return i === short.length }
              const orgSuffix = /(股份有限公司|有限公司|有限责任公司|公司|企业|集团|银行|分行|中心|院|所)$/
              if (full !== null && full !== f.value && orgSuffix.test(full)
                && full[0] === f.value[0] && f.value.length < full.length && subseq(f.value, full)) {
                f.note = `${f.note ?? ''}［口径归一：${f.value}→${full}（值取简称而引文为全称，按引文归一）］`
                f.value = full
              }
            }
          }
        }
      }
    }

    // P2c（D11 缺陷①修复·守卫）：质押事件"本次质押"字段 quote 含"原质押"语境
    // （解除质押段在描述被解除的原质押量，如"本次原质押给…的18,564,000股已解除质押"）
    // → 不得认证为新质押：降 needs_review（候选值与出处保留，不静默、不编造）。
    for (const ev of plEvents) {
      const dir = ev.fields?.direction?.value
      if (dir === 'release') continue // 解押方向事件本就描述原质押，属正常
      const f = ev.fields?.pledged_shares_this_time
      if (f?.status !== 'extracted') continue
      const q = String(f.provenance?.[0]?.quote ?? f.raw_value ?? '')
      if (/原质押/.test(q) && /解除|已解除|解除质押/.test(String(ev.notes ?? '') + q + String(ev.fields?.direction?.raw_value ?? ''))) {
        f.status = 'needs_review'
        f.note = `${f.note ?? ''}［守卫：quote 属解除质押段（原质押描述），不得认证为新质押——D11 缺陷①修复］`
      } else if (/原质押给.{0,30}已解除/.test(q.replace(/\s/g, ''))) {
        f.status = 'needs_review'
        f.note = `${f.note ?? ''}［守卫：quote 属解除质押段（原质押描述），不得认证为新质押——D11 缺陷①修复］`
      }
    }

    // P3. 公告日期证据锚定：出处为"报备/备查文件"落款日（quote 含标志词，或解析模式下锚块的相邻块即报备/备查清单）→ not_mentioned
    for (const ev of plEvents) {
      const ad = ev.fields?.announcement_date
      if (ad?.status !== 'extracted') continue
      const q = ad.provenance?.[0]?.quote ?? ad.raw_value ?? ''
      if (/公告日期|披露日期/.test(String(q))) continue // 明确标签的公告日期不降级
      let isFilingDate = /报备文件|备查文件|落款|签字日期|盖章日期/.test(String(q))
      if (!isFilingDate && parseDoc !== null) {
        const bid = ad.provenance?.[0]?.block_id
        const bIdx = bid ? parseDoc.blocks.findIndex((b) => b.block_id === bid) : -1
        if (bIdx !== -1) {
          const next = parseDoc.blocks[bIdx + 1]?.text_raw ?? ''
          if (/^报备文件|^备查文件|^\d+、[^。]{0,25}文件/.test(next.replace(/^\s*/, ''))) isFilingDate = true
        }
      }
      if (isFilingDate) {
        ad.status = 'not_mentioned'
        ad.value = null
        ad.raw_value = null
        ad.provenance = []
        ad.note = `${ad.note ?? ''}［口径修正：出处为报备/备查文件落款日期而非公告披露日→not_mentioned］`
      }
    }

    // P1. 解除质押组件合并：存在"将X股办理了质押解除手续"总额句且＝组件和 → 合并为一个总事件（gold 口径：其中句不拆总量）
    const releaseGroups = new Map()
    for (const ev of plEvents) {
      if ((ev.fields?.direction?.value ?? 'pledge') !== 'release') continue
      const k = String(ev.fields?.pledgor?.value ?? '')
      if (!releaseGroups.has(k)) releaseGroups.set(k, [])
      releaseGroups.get(k).push(ev)
    }
    for (const [, group] of releaseGroups) {
      if (group.length < 2) continue
      const totalM = compact.match(/将([\d,]+)股办理了质押解除手续/)
      if (totalM === null) continue
      const total = Number(totalM[1].replace(/,/g, ''))
      const sumShares = group.reduce((n, ev) => n + (Number(ev.fields?.pledged_shares_this_time?.value) || 0), 0)
      if (total !== sumShares) continue
      // 解质汇总表（gold 的 release 事件来源）：股东名称/本次解质股份/两比例——比"综上所述"句更完整
      const tableM = compact.match(/股东名称(.{2,30}?)本次解质股份([\d,]+)股占其所持股份比例(\d+(?:\.\d+)?)%占公司总股本比例(\d+(?:\.\d+)?)%/)
      const main = [...group].sort((a, b) => (Number(b.fields?.pledged_shares_this_time?.value) || 0) - (Number(a.fields?.pledged_shares_this_time?.value) || 0))[0]
      const anchor = docText.indexOf(totalM[1] + '股办理了质押解除手续')
      const sent = anchor === -1 ? totalM[0] : docText.slice(Math.max(0, docText.lastIndexOf('。', anchor) + 1), docText.indexOf('。', anchor) + 1)
      const psFv = main.fields?.pledged_shares_this_time
      if (psFv !== undefined) {
        psFv.value = total
        psFv.raw_value = sent.trim()
        psFv.note = `${psFv.note ?? ''}［口径合并：组件解除合计＝总额句（其中句不拆总量）］`
        const blk = parseDoc?.blocks.find((b) => b.text_raw && b.text_raw.replace(/\s+/g, '').includes('股办理了质押解除手续'))
        if (psFv.provenance?.[0] && blk) {
          psFv.provenance[0].block_id = blk.block_id
          psFv.provenance[0].page = blk.page
          psFv.provenance[0].quote = blk.text_raw.includes(sent.trim().slice(0, 10)) ? sent.trim() : blk.text_raw.trim()
        } else if (psFv.provenance?.[0]) {
          psFv.provenance[0].quote = sent.trim()
        }
      }
      if (tableM !== null && Number(tableM[2].replace(/,/g, '')) === total) {
        const tableName = tableM[1].replace(/^[:：\s]+/, '').trim()
        if (tableName.length >= 2 && main.fields?.pledgor !== undefined) {
          main.fields.pledgor.value = tableName
          main.fields.pledgor.raw_value = tableName
          main.fields.pledgor.note = `${main.fields.pledgor.note ?? ''}［口径合并：解质汇总表股东名称］`
        }
        const tblAnchor = docText.indexOf('本次解质股份')
        const tblSent = tblAnchor === -1 ? tableM[0] : docText.slice(Math.max(0, docText.lastIndexOf('。', tblAnchor) + 1), docText.indexOf('。', tblAnchor) + 1)
        // 解质表证据块：解析模式下锚定到真实块（含"本次解质股份"或股东名称的块），保证 block_id 存在
        const tblBlk = parseDoc?.blocks.find((b) => b.text_raw && b.text_raw.replace(/\s+/g, '').includes('本次解质股份'))
          ?? parseDoc?.blocks.find((b) => b.text_raw && b.text_raw.includes(tableName ?? '解质'))
        const mkRel = (val, denom) => ({
          raw_value: tableM[0].slice(0, 60), value: val, unit: 'percent', status: 'extracted',
          provenance: [tblBlk
            ? { block_id: tblBlk.block_id, source_type: tblBlk.source_type ?? 'cell', page: tblBlk.page, region: tblBlk.region ?? null, table_id: tblBlk.table_ref?.table_id ?? null, cell_ref: tblBlk.table_ref?.cell_ref ?? null, quote: tblBlk.text_raw.trim().slice(0, 80) }
            : { block_id: null, source_type: 'document', page: 1, region: null, table_id: null, cell_ref: null, quote: tblSent.trim() }],
          standardized: true, denominator: denom, note: '［口径合并：解质汇总表明示比例］',
        })
        if (main.fields?.pledged_ratio_this_time_of_held?.status !== 'extracted') main.fields.pledged_ratio_this_time_of_held = mkRel(Number(tableM[3]), 'holder_shares')
        if (main.fields?.pledged_ratio_this_time_of_total?.status !== 'extracted') main.fields.pledged_ratio_this_time_of_total = mkRel(Number(tableM[4]), 'total_share_capital')
        // 解质时间为区间（过程窗口）→ end_date 无单一解除日，置 needs_review（gold 口径）
        const rangeAfter = compact.slice(compact.indexOf(tableM[0]) + tableM[0].length).match(/^解质时间(20\d{2})年(\d{1,2})月(\d{1,2})日至(20\d{2})年(\d{1,2})月(\d{1,2})日/)
        const edFv = main.fields?.end_date
        if (rangeAfter !== null && edFv?.status === 'extracted') {
          edFv.status = 'needs_review'
          edFv.value = null
          edFv.raw_value = rangeAfter[0].replace(/^解质时间/, '解质时间：')
          edFv.unit = 'date'
          edFv.note = `${edFv.note ?? ''}［口径修正：解质时间为过程区间、无单一解除完成日→needs_review］`
        }
      }
      for (const ev of group) {
        if (ev === main) continue
        const idx = events.indexOf(ev)
        events.splice(idx, 1)
        repairs.push(`［口径合并］解除质押组件事件（${ev.fields?.pledgee?.value} ${ev.fields?.pledged_shares_this_time?.value}股）并入总额事件（${total}股）`)
      }
    }
    // 解质表口径对"自然单 release 事件"（模型已自发聚合、未走合并路径）同样生效——幂等守卫
    const tblSolo = compact.match(/股东名称(.{2,30}?)本次解质股份([\d,]+)股占其所持股份比例(\d+(?:\.\d+)?)%占公司总股本比例(\d+(?:\.\d+)?)%/)
    if (tblSolo !== null) {
      const tName = tblSolo[1].replace(/^[:：\s]+/, '').trim()
      const tTotal = Number(tblSolo[2].replace(/,/g, ''))
      const tBlk = parseDoc?.blocks.find((b) => b.text_raw && b.text_raw.replace(/\s+/g, '').includes('本次解质股份'))
      for (const ev of plEvents) {
        if ((ev.fields?.direction?.value ?? 'pledge') !== 'release') continue
        const ps = ev.fields?.pledged_shares_this_time
        if (ps?.status !== 'extracted' || Number(ps.value) !== tTotal) continue
        if (tName.length >= 2 && ev.fields?.pledgor !== undefined && ev.fields.pledgor.value !== tName) {
          ev.fields.pledgor.value = tName
          ev.fields.pledgor.raw_value = tName
          ev.fields.pledgor.note = `${ev.fields.pledgor.note ?? ''}［口径归一：解质汇总表股东名称］`
        }
        const mkProv = () => tBlk
          ? [{ block_id: tBlk.block_id, source_type: tBlk.source_type ?? 'cell', page: tBlk.page, region: tBlk.region ?? null, table_id: tBlk.table_ref?.table_id ?? null, cell_ref: tBlk.table_ref?.cell_ref ?? null, quote: tBlk.text_raw.trim().slice(0, 80) }]
          : [{ block_id: null, source_type: 'document', page: 1, region: null, table_id: null, cell_ref: null, quote: tblSolo[0].slice(0, 60) }]
        const mkRel2 = (val, denom) => ({ raw_value: tblSolo[0].slice(0, 60), value: val, unit: 'percent', status: 'extracted', provenance: mkProv(), standardized: true, denominator: denom, note: '［口径回填：解质汇总表明示比例］' })
        if (ev.fields?.pledged_ratio_this_time_of_held?.status !== 'extracted') ev.fields.pledged_ratio_this_time_of_held = mkRel2(Number(tblSolo[3]), 'holder_shares')
        if (ev.fields?.pledged_ratio_this_time_of_total?.status !== 'extracted') ev.fields.pledged_ratio_this_time_of_total = mkRel2(Number(tblSolo[4]), 'total_share_capital')
        const rngAfter = compact.slice(compact.indexOf(tblSolo[0]) + tblSolo[0].length).match(/^解质时间(20\d{2})年(\d{1,2})月(\d{1,2})日至(20\d{2})年(\d{1,2})月(\d{1,2})日/)
        if (rngAfter !== null) {
          const rng = `${rngAfter[1]}-${String(rngAfter[2]).padStart(2, '0')}-${String(rngAfter[3]).padStart(2, '0')}/${rngAfter[4]}-${String(rngAfter[5]).padStart(2, '0')}-${String(rngAfter[6]).padStart(2, '0')}`
          for (const dn of ['end_date', 'start_date']) {
            const f = ev.fields?.[dn]
            if (f?.status === 'extracted' && String(f.value) === rng) {
              f.status = dn === 'end_date' ? 'needs_review' : 'not_mentioned'
              f.value = null
              f.raw_value = rngAfter[0].replace(/^解质时间/, '解质时间：')
              f.unit = 'date'
              f.note = `${f.note ?? ''}［口径修正：解质时间为过程区间（${rng}），${dn === 'end_date' ? '无单一解除完成日→needs_review' : '非质押起始日→not_mentioned'}］`
            }
          }
        }
      }
    }
  }

  const eqEvents = events.filter((ev) => ev.event_type === 'equity_change')
  if (eqEvents.length === 0) return
  const disclosers = extractCoverDisclosers(docText)
  const concerts = extractCoverConcertParties(docText)
  // 群体口径变动短语（"X及其一致行动人的持股数量/比例由…减少/增加/稀释至"）——全语料仅 EQC-007 出现
  const groupChangePhrase = /及其一致行动人的(持股数量|持股比例)由/.test(docText)
  const groupAggregate = groupChangePhrase || disclosers.some((d) => d.endsWith('及其一致行动人'))

  // ---- A3. 群体口径合并：无"逐行变动数表"而变动数仅群体披露时，多个成员事件并为一个聚合事件 ----
  // 触发：≥2 个股权事件 + 群体披露句 + 全文无"前值%-变动数-后值%"式逐行变动数表（001/002 有表不合并）
  const perRowChangeTable = /%-?\d[\d,]{5,}-?\d+(?:\.\d+)?%/.test(compact)
  const groupDisclosure = /将其合计持有的[^。]{0,20}?[\d,]{4,}股[^。]{0,150}?转让/.test(compact)
    || /合计持有[^。]{0,30}?[\d,]{6,}[^。]{0,80}?本次权益变动后[^。]{0,30}?合计持有/.test(compact)
    || groupChangePhrase
  const eqAll = events.filter((ev) => ev.event_type === 'equity_change')
  if (groupDisclosure && !perRowChangeTable && eqAll.length > 0) {
    // 群体句解析（合并/改写两路径共用）；名单句起点不得跨越逗号/分号，且名单须是纯人名/公司名枚举（≤20字、无叙述词）
    const rawList = compact.match(/([^。；：，\s]{6,40})将其合计持有的/)?.[1] ?? null
    const transferorNames = rawList !== null && rawList.length <= 20 && !/本次|权益|变动|方式|指|拟|通过|公告|报告书|签署|持有/.test(rawList) ? rawList : null
    // 群体 holder：转让方名单句 > 封面义务人名单（顿号原样）
    const groupHolder = transferorNames
      ?? (disclosers.length >= 2 && compact.includes(disclosers.join('、')) ? disclosers.join('、') : null)
    const beforeM = compact.match(/权益变动前[^。]{0,25}?(?:信息披露义务人[^。]{0,15}?)?合计持有[^。]{0,25}?([\d,][\d,.]*)股?[^。]{0,60}?占[^。]{0,6}?总股本[^。]{0,6}?(\d+(?:\.\d+)?)%/)
    const afterM = compact.match(/变动后[^。]{0,25}?合计持有[^。]{0,25}?([\d,][\d,.]*)股?[^。]{0,60}?占[^。]{0,6}?总股本[^。]{0,6}?(\d+(?:\.\d+)?)%/)
    const sumM = beforeM && afterM ? [beforeM[1], beforeM[2], afterM[1], afterM[2]] : null
    const transferM = compact.match(/将其合计持有的[^。]{0,15}?([\d,][\d,.]*)股[^。]{0,60}?占[^。]{0,10}?(\d+(?:\.\d+)?)%/)
    const gBefore = sumM ? Number(sumM[0].replace(/,/g, '')) : null
    const gAfter = sumM ? Number(sumM[2].replace(/,/g, '')) : null
    const gChange = sumM ? Math.abs(gBefore - gAfter) : (transferM ? Number(transferM[1].replace(/,/g, '')) : null)
    const anchorNum = sumM ? sumM[0] : (transferM ? transferM[1] : null)
    const anchorBlock = anchorNum !== null ? parseDoc?.blocks.find((b) => b.text_raw && b.text_raw.includes(anchorNum)) : undefined
    const mkProv = () => anchorBlock
      ? [{ block_id: anchorBlock.block_id, source_type: anchorBlock.source_type ?? 'paragraph', page: anchorBlock.page, region: anchorBlock.region ?? null, table_id: anchorBlock.table_ref?.table_id ?? null, cell_ref: anchorBlock.table_ref?.cell_ref ?? null, quote: anchorBlock.text_raw.trim() }]
      : [{ block_id: null, source_type: 'document', page: 1, region: null, table_id: null, cell_ref: null, quote: null }]
    const groupFv = (val, unit, label) => val !== null && val !== undefined && !Number.isNaN(val)
      ? { raw_value: anchorNum, value: val, unit, status: 'extracted', provenance: mkProv(), standardized: true, denominator: label?.startsWith('ratio') ? 'total_share_capital' : null, note: '［口径合并：群体口径披露的合计值（gold 惯例）］' }
      : { raw_value: null, value: null, unit, status: 'not_mentioned', provenance: [], standardized: false, denominator: null, note: '［口径合并：原文未披露群体合计值］' }
    const transferorBlk = parseDoc?.blocks.find((b) => b.text_raw && b.text_raw.replace(/\s+/g, '').includes('将其合计持有'))

    if (eqAll.length > 1) {
      // 成员＝多数方向的事件（剔除反向的受让方个体事件——其变动属于对方自己的报告书）
      const dirs = eqAll.map((ev) => ev.fields?.direction?.value ?? 'increase')
      const majority = dirs.filter((d) => d === 'decrease').length > dirs.length / 2 ? 'decrease' : 'increase'
      const members = eqAll.filter((ev) => (ev.fields?.direction?.value ?? 'increase') === majority)
      if (members.length === 1) {
        // 模型已自发聚成单个群体事件：删少数方向的多余事件；幸存者 holder 为句片段时按群体名单改写
        for (let i = events.length - 1; i >= 0; i--) {
          const ev = events[i]
          if (ev.event_type === 'equity_change' && (ev.fields?.direction?.value ?? 'increase') !== majority) {
            events.splice(i, 1)
            repairs.push(`［口径过滤］删除反向受让方个体事件：holder=${ev.fields?.holder?.value}（其变动属于对方报告书口径）`)
          }
        }
        const solo = members[0]
        const sh = String(solo.fields?.holder?.value ?? '')
        if (groupHolder !== null && !groupHolder.includes(sh) && !sh.includes(groupHolder)) {
          const keepProv = JSON.parse(JSON.stringify(solo.fields?.holder?.provenance ?? []))
          solo.fields = {
            ...JSON.parse(JSON.stringify(solo.fields)),
            holder: { raw_value: groupHolder, value: groupHolder, unit: 'text', status: 'extracted', provenance: keepProv, standardized: true, denominator: null, note: `［口径改写：${sh.slice(0, 20)}${sh.length > 20 ? '…' : ''}→${groupHolder}（原文名单/封面义务人）］` },
            shares_before: groupFv(gBefore, 'shares'),
            shares_after: groupFv(gAfter, 'shares'),
            change_shares: groupFv(gChange, 'shares'),
            ratio_before: groupFv(sumM ? Number(sumM[1]) : null, 'percent', 'ratio_before'),
            ratio_after: groupFv(sumM ? Number(sumM[3]) : null, 'percent', 'ratio_after'),
          }
          repairs.push(`［口径改写］幸存单事件 holder 非群体名单，改写为 ${groupHolder}`)
        }
      } else if (members.length > 1) {
        // holder 来源优先级：原文转让方名单句 > 封面义务人名单前缀（从长到短试原文命中，过滤尾部垃圾项）> 成员名拼接
        let holderValue = transferorNames
        if (holderValue === null && disclosers.length >= 2) {
          for (let k = disclosers.length; k >= 2 && holderValue === null; k--) {
            const dj = disclosers.slice(0, k).join('、')
            const dh = disclosers.slice(0, k - 1).join('、') + '和' + disclosers[k - 1]
            holderValue = compact.includes(dh) ? dh : (compact.includes(dj) ? dj : null)
          }
        }
        if (holderValue === null) {
          const names = [...new Set(members.map((ev) => String(ev.fields?.holder?.value ?? '').trim()).filter(Boolean))]
          // holder 连接符跟原文：顿号连"和"与纯顿号两种形式，选原文出现的
          const joinDun = names.join('、')
          const joinHe = names.length > 1 ? names.slice(0, -1).join('、') + '和' + names[names.length - 1] : joinDun
          holderValue = compact.includes(joinHe.replace(/\s+/g, '')) ? joinHe : joinDun
        }
        const base = members[0]
        const merged = {
          event_id: 'E01',
          event_type: 'equity_change',
          fields: {
            ...JSON.parse(JSON.stringify(base.fields)),
            holder: { raw_value: holderValue, value: holderValue, unit: 'text', status: 'extracted', provenance: JSON.parse(JSON.stringify(base.fields?.holder?.provenance ?? [])), standardized: true, denominator: null, note: `［口径合并：${holderValue.slice(0, 30)}→群体事件（无逐行变动数表，变动数仅群体披露）］` },
            shares_before: groupFv(gBefore, 'shares'),
            shares_after: groupFv(gAfter, 'shares'),
            change_shares: groupFv(gChange, 'shares'),
            ratio_before: groupFv(sumM ? Number(sumM[1]) : null, 'percent', 'ratio_before'),
            ratio_after: groupFv(sumM ? Number(sumM[3]) : null, 'percent', 'ratio_after'),
          },
          extraction_method: base.extraction_method ?? null,
          notes: `［A3 群体合并］成员事件 ${holderValue.slice(0, 30)}（方向 ${majority}）合并为群体事件`,
        }
        // 替换：删全部股权事件，插入合并事件（保持其余类型事件不动）
        for (let i = events.length - 1; i >= 0; i--) if (events[i].event_type === 'equity_change') events.splice(i, 1)
        events.push(merged)
        repairs.push(`［口径合并］无逐行变动数表且变动数仅群体披露：${eqAll.length} 个成员事件合并为 1 个群体事件（holder=${holderValue}）`)
      }
    } else {
      // 路径2：模型只给了单个非群体口径事件（受让方视角或夹句片段的 holder）→ 按原文名单改写为群体减持事件
      const solo = eqAll[0]
      const soloHolder = String(solo.fields?.holder?.value ?? '')
      const groupHolder = transferorNames
        ?? (disclosers.length >= 2 && compact.includes(disclosers.join('、')) ? disclosers.join('、') : null)
      if (groupHolder !== null && !groupHolder.includes(soloHolder) && !soloHolder.includes(groupHolder)) {
        solo.fields = {
          ...JSON.parse(JSON.stringify(solo.fields)),
          holder: { raw_value: groupHolder, value: groupHolder, unit: 'text', status: 'extracted', provenance: JSON.parse(JSON.stringify(solo.fields?.holder?.provenance ?? [])), standardized: true, denominator: null, note: `［口径改写：${soloHolder.slice(0, 20)}${soloHolder.length > 20 ? '…' : ''}→${groupHolder}（原文名单/封面义务人，群体口径披露）］` },
          direction: { raw_value: '将其合计持有', value: 'decrease', unit: 'text', status: 'extracted', provenance: transferorBlk ? [{ block_id: transferorBlk.block_id, source_type: transferorBlk.source_type ?? 'paragraph', page: transferorBlk.page, region: transferorBlk.region ?? null, table_id: transferorBlk.table_ref?.table_id ?? null, cell_ref: transferorBlk.table_ref?.cell_ref ?? null, quote: '将其合计持有' }] : [{ block_id: null, source_type: 'document', page: 1, region: null, table_id: null, cell_ref: null, quote: '将其合计持有' }], standardized: true, denominator: null, note: '［口径改写：转让方合计转让→decrease］' },
          shares_before: groupFv(gBefore, 'shares'),
          shares_after: groupFv(gAfter, 'shares'),
          change_shares: groupFv(gChange, 'shares'),
          ratio_before: groupFv(sumM ? Number(sumM[1]) : null, 'percent', 'ratio_before'),
          ratio_after: groupFv(sumM ? Number(sumM[3]) : null, 'percent', 'ratio_after'),
        }
        solo.notes = `${solo.notes ?? ''}［A3 路径2 群体改写：${soloHolder.slice(0, 20)}→${groupHolder}］`
        repairs.push(`［口径改写］单事件 holder 非群体口径名单，按群体口径改写为 ${groupHolder} 群体事件`)
      }
    }
  }

  // ---- A1. 一致行动人聚合：群体口径数字 → "牵头主体全称及其一致行动人" ----
  if (groupAggregate || disclosers.some((d) => d.endsWith('及其一致行动人'))) {
    const lead = disclosers.find((d) => d.endsWith('及其一致行动人')) ?? disclosers[0]
    if (lead) {
      const leadBase = lead.replace(/及其一致行动人$/, '')
      const aggregateLabel = lead.endsWith('及其一致行动人') ? lead : `${lead}及其一致行动人`
      for (const ev of eqEvents) {
        const h = ev.fields?.holder
        if (h?.status !== 'extracted' || typeof h.value !== 'string') continue
        if (h.value === aggregateLabel) continue
        // 多主体并列事件不折叠——群体口径变动短语场景除外（如 EQC-007 附表全名单，数字为群体合计）
        if (h.value.includes('、') || h.value.includes('和')) {
          if (!groupChangePhrase) continue
          const first = h.value.split(/[、和]/)[0].trim()
          if (!(first === leadBase || isNameVariant(first, leadBase) || isNameVariant(leadBase, first))) continue
        } else if (!(h.value === leadBase || isNameVariant(h.value, leadBase) || isNameVariant(leadBase, h.value))) continue
        h.note = `${h.note ?? ''}［口径聚合：${h.value}→${aggregateLabel}（D5-GOLD-001 一致行动人合并披露）］`
        h.value = aggregateLabel
      }
    }
  }

  // ---- A2. 简称 → 封面法定全称（仅封面首位义务人且带法人后缀；单主体事件；聚合标签跳过） ----
  for (const ev of eqEvents) {
    const h = ev.fields?.holder
    if (h?.status !== 'extracted' || typeof h.value !== 'string' || h.value.includes('、')) continue
    const target = disclosers[0]
    if (!target || target === h.value || h.value.endsWith('及其一致行动人')) continue
    if (!(target.length > h.value.length) || !/(公司|企业|集团|LIMITED|Limited)$/.test(target)) continue
    if (isNameVariant(h.value, target)) {
      h.note = `${h.note ?? ''}［口径归一：${h.value}→${target}（D5-GOLD-001 法定全称）］`
      h.value = target
    }
  }

  // ---- 附. 口径过滤：仅"单一义务人＋分列一致行动人"结构（如 EQC-002）——名单外转让方不建事件 ----
  if (disclosers.length > 0 && concerts.length > 0) {
    const allowed = [disclosers[0], ...concerts]
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i]
      if (ev.event_type !== 'equity_change') continue
      const h = ev.fields?.holder
      if (h?.status !== 'extracted' || typeof h.value !== 'string') continue
      const ok = allowed.some((a) => {
        if (a === h.value || a.includes(h.value) || h.value.includes(a)) return true
        // 多主体并列事件（顿号/和分隔）：每个成员都须在名单内
        const members = h.value.split(/[、和]/).map((s) => s.trim()).filter(Boolean)
        return members.length > 1 && members.every((mm) => allowed.some((aa) => aa === mm || aa.includes(mm) || mm.includes(aa)))
      })
      if (!ok) {
        repairs.push(`［口径过滤］剔除非信息披露义务人/一致行动人的转让方事件：holder=${h.value}（D5-GOLD-001，名单=${allowed.join('/')}）`)
        events.splice(i, 1)
      }
    }
  }

  // ---- B. method 规范标签映射（证据＝raw_value＋quote；1/2 类兜底查全文——全语料仅个案出现，无交叉风险） ----
  const CANON = [
    { label: '可转债转股被动稀释', test: (s, t) => /可转债|可转换公司债券/.test(s) && /稀释|被动/.test(s) || (/可转债|可转换公司债券/.test(t) && /稀释/.test(t)) },
    { label: '司法拍卖被动减持', test: (s, t) => /司法拍卖/.test(s) && /被动/.test(s) || (/司法拍卖/.test(t) && /被动减持/.test(t)) },
    { label: '集中竞价及大宗交易', test: (s) => /集中竞价|集中交易/.test(s) && /大宗/.test(s) },
    { label: '集中竞价交易', test: (s) => /集中竞价|集中交易/.test(s) },
    { label: '公开征集协议转让', test: (s, _t, ev) => /公开征集/.test(s) && /协议转让/.test(s) && ev?.fields?.direction?.value === 'decrease' },
    { label: '协议转让', test: (s) => /协议转让/.test(s) },
  ]
  for (const ev of events) {
    if (ev.event_type !== 'equity_change') continue
    const m = ev.fields?.method
    if (m?.status !== 'extracted' || typeof m.value !== 'string') continue
    const evidence = [m.raw_value, ...(m.provenance ?? []).map((p) => p.quote ?? '')].filter(Boolean).join(' ')
    const hit = CANON.find((c) => c.test(evidence, docText, ev))
    if (hit && hit.label !== m.value) {
      const compat = hit.label.includes(m.value) || m.value.includes(hit.label)
        || [...m.value].filter((ch) => hit.label.includes(ch)).length >= 2
      if (compat) {
        m.note = `${m.note ?? ''}［方法规范：${m.value}→${hit.label}（D5-GOLD-002 规范标签）］`
        m.value = hit.label
        m.standardized = true
      }
    }
  }

  // ---- E. 变动量误挂 before 字段：多人合计转让句"将其合计持有的X股（占Y%）转让"的数字是变动量——
  //      与 change_shares 同值同出处时，before 字段按无合并期初值处理（not_mentioned，gold 口径） ----
  for (const ev of events) {
    if (ev.event_type !== 'equity_change') continue
    const sb = ev.fields?.shares_before
    const cs = ev.fields?.change_shares
    if (sb?.status !== 'extracted' || cs?.status !== 'extracted') continue
    if (sb.value !== cs.value) continue
    const sq = sb.provenance?.[0]?.quote
    if (typeof sq !== 'string' || sq !== (cs.provenance?.[0]?.quote ?? '\u0000')) continue
    const demote = (f, label) => {
      f.status = 'not_mentioned'
      f.value = null
      f.raw_value = null
      f.standardized = false
      f.note = `${f.note ?? ''}［口径修正：该数值为合计变动量（与 change_shares 同源），多人合并事件无单一期初值→${label} 置 not_mentioned］`
    }
    demote(sb, 'shares_before')
    const rb = ev.fields?.ratio_before
    const rq = rb?.provenance?.[0]?.quote
    if (rb?.status === 'extracted' && typeof rq === 'string' && rq.includes('%')) {
      const idx = docText.indexOf(sq)
      if (idx !== -1 && docText.slice(idx, idx + sq.length + 60).includes(rq)) demote(rb, 'ratio_before')
    }
  }

  // ---- C. change_date 生效/完成日（带日期的完成过户句优先于拍卖/交易窗口区间） ----
  const doneMatch = docText.match(/(20\d{2})年(\d{1,2})月(\d{1,2})日[^。]{0,35}?(完成过户登记|过户登记手续办理完毕|过户登记完成)/)
  if (doneMatch) {
    const iso = `${doneMatch[1]}-${String(doneMatch[2]).padStart(2, '0')}-${String(doneMatch[3]).padStart(2, '0')}`
    const frag = doneMatch[0]
    for (const ev of events) {
      if (ev.event_type !== 'equity_change') continue
      const cd = ev.fields?.change_date
      if (cd?.status === 'extracted' && cd.value !== iso) {
        cd.note = `${cd.note ?? ''}［生效日修正：${cd.value}→${iso}（D5-GOLD-003 过户完成日，窗口期仅为过程）］`
        cd.raw_value = frag
        cd.value = iso
        cd.unit = 'date_range'
        if (parseDoc) {
          const blk = parseDoc.blocks.find((b) => b.text_raw && b.text_raw.includes(frag.slice(0, 12)))
          if (blk) {
            cd.provenance = [{ block_id: blk.block_id, source_type: blk.source_type ?? 'paragraph', page: blk.page, region: blk.region ?? null, table_id: blk.table_ref?.table_id ?? null, cell_ref: blk.table_ref?.cell_ref ?? null, quote: frag }]
          }
        } else {
          cd.provenance = [{ block_id: null, source_type: 'document', page: 1, region: null, table_id: null, cell_ref: null, quote: frag }]
        }
      }
    }
  }

  // ---- C2. 条件性时间字段（"时间：办理完毕/完成…之日"）是 change_date 的权威口径——无日历日期→needs_review ----
  const condTime = docText.match(/时间[：:为][^。，\n\d]{5,60}之日/)
  if (condTime) {
    const frag = condTime[0]
    for (const ev of events) {
      if (ev.event_type !== 'equity_change') continue
      const cd = ev.fields?.change_date
      if (cd?.status !== 'extracted') continue
      cd.status = 'needs_review'
      cd.value = null
      cd.raw_value = frag
      cd.note = `${cd.note ?? ''}［口径修正：原文以条件性时间字段（${frag.slice(0, 18)}…）界定变动时间、未给日历日期→needs_review（D5-GOLD-003）］`
      if (parseDoc) {
        const blk = parseDoc.blocks.find((b) => b.text_raw && b.text_raw.includes(frag.slice(0, 10)))
        if (blk) cd.provenance = [{ block_id: blk.block_id, source_type: blk.source_type ?? 'paragraph', page: blk.page, region: blk.region ?? null, table_id: blk.table_ref?.table_id ?? null, cell_ref: blk.table_ref?.cell_ref ?? null, quote: blk.text_raw.includes(frag) ? frag : frag.slice(0, 10) }]
      }
    }
  }

  // ---- D. 被动稀释相等股数：按牵头主体行回填/校正（D5-GOLD-004；证据＝表格明列的前后股数行） ----
  if (/不涉及.{0,12}持股数量|持股数量.{0,8}未发生变|持股数量不变/.test(docText)) {
    for (const ev of events) {
      if (ev.event_type !== 'equity_change') continue
      const h = ev.fields?.holder
      const lead = typeof h?.value === 'string' ? h.value.replace(/及其一致行动人$/, '') : ''
      if (!lead) continue
      const sb = ev.fields?.shares_before
      const sa = ev.fields?.shares_after
      // 扁平化表格"股数比例"直接相连（如"249,519,76434.53%"）——股数必为千分位逗号组，比例整数位≤2位
      const num = '((?:\\d{1,3}(?:,\\d{3})+|\\d+))'
      const rowRe = new RegExp(`${lead}合计持有股份${num}\\d{1,2}(?:\\.\\d+)?%\\s*${num}`)
      const row = docText.match(rowRe)
      if (!row) continue
      const before = Number(row[1].replace(/,/g, ''))
      const after = Number(row[2].replace(/,/g, ''))
      if (before !== after) continue // 被动稀释前后数量不变；解析歧义时宁可不动模型输出
      // 单元格级证据（接口契约 source_type=cell）：行首名块＝lead 且同行有"合计持有股份"标签块
      const cellEv = (() => {
        if (!parseDoc) return null
        const cells = parseDoc.blocks.filter((b) => b.table_ref?.cell_ref && b.text_raw)
        const nameBlk = cells.find((b) => /^r\d+c1$/.test(b.table_ref.cell_ref) && b.text_raw.trim() === lead
          && cells.some((x) => x.table_ref.table_id === b.table_ref.table_id
            && x.table_ref.cell_ref.startsWith(b.table_ref.cell_ref.replace(/c1$/, 'c'))
            && x.text_raw.includes('合计持有股份')))
        if (!nameBlk) return null
        const rowPrefix = nameBlk.table_ref.cell_ref.replace(/c1$/, 'c')
        const tid = nameBlk.table_ref.table_id
        const col = (b) => Number(b.table_ref.cell_ref.replace(/^r\d+c/, ''))
        const nums = cells.filter((b) => b.table_ref.table_id === tid && b.table_ref.cell_ref.startsWith(rowPrefix)
          && /^[\d,]+$/.test(b.text_raw.trim())).sort((x, y) => col(x) - col(y))
        // 前后数值相等（被动稀释）时同一数值有两列：前值取首列、后值取末列
        const byVal = (v) => nums.filter((b) => Number(b.text_raw.replace(/,/g, '')) === v)
        const first = byVal(before)[0] ?? nums[0]
        const last = byVal(after)[byVal(after).length - 1] ?? nums[nums.length - 1]
        return { beforeBlk: first, afterBlk: last }
      })()
      const mkProv = (val) => {
        if (cellEv) {
          const blk = Number(val) === before ? cellEv.beforeBlk : cellEv.afterBlk
          if (blk) return [{ block_id: blk.block_id, source_type: 'cell', page: blk.page, region: blk.region ?? null, table_id: blk.table_ref.table_id, cell_ref: blk.table_ref.cell_ref, quote: blk.text_raw }]
        }
        // 回退：含该数值的块（quote＝数值原文，必为单块子串）
        const blk = parseDoc?.blocks.find((b) => b.text_raw && b.text_raw.includes(row[Number(val) === before ? 1 : 2]))
        if (blk) return [{ block_id: blk.block_id, source_type: blk.source_type ?? 'cell', page: blk.page, region: blk.region ?? null, table_id: blk.table_ref?.table_id ?? null, cell_ref: blk.table_ref?.cell_ref ?? null, quote: row[Number(val) === before ? 1 : 2] }]
        return [{ block_id: null, source_type: 'document', page: 1, region: null, table_id: null, cell_ref: null, quote: null }]
      }
      const mkFv = (val, why) => ({
        raw_value: `${lead}合计持有股份${row[1]}…${row[2]}`, value: val, unit: 'shares', status: 'extracted',
        provenance: mkProv(val),
        standardized: true, denominator: null,
        note: `［规则${why}：被动稀释数量不变，表格明列牵头主体行变动前后股数（D5-GOLD-004）］`,
      })
      if (sb !== undefined && sb.status !== 'extracted') ev.fields.shares_before = mkFv(before, '回填')
      else if (sb !== undefined && sb.value !== before) ev.fields.shares_before = mkFv(before, '校正口径')
      if (sa !== undefined && sa.status !== 'extracted') ev.fields.shares_after = mkFv(after, '回填')
      else if (sa !== undefined && sa.value !== after) ev.fields.shares_after = mkFv(after, '校正口径')
    }
  }
}

// ---------- 主流程 ----------

async function main() {
  const args = parseArgs(process.argv.slice(2))
  cacheSetupFromCli(process.argv.slice(2)) // D10 模型调用缓存（--cache-dir / JINGGUAN_CACHE_DIR；--no-cache 旁路）
  if (args.help || (!args.input && !args.parse)) {
    console.log('用法：node scripts/jingguan/run_extract.mjs --input <公告文本文件> [--parse <evidence/0.2 解析JSON>] [--event-type pledge|equity_change|award_contract] [--mock] [--out-dir runs] [--cache-dir <目录>] [--no-cache]')
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

  // ---- 扫描降级路径（D4）：解析层零可读文本（全页 SCANNED/降级块）时不调模型，
  // 全字段诚实置 unreadable——禁止编造任何值（宗 D4-SCAN-001 评分政策）。
  const READABLE_MIN = 20
  if (parseDoc !== null && parseDoc.joinedRaw.trim().length < READABLE_MIN) {
    const stamp0 = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')
    const runId0 = `${stamp0}-${eventType}-scan`
    // 降级件哈希：无可读文本时对 joinedRaw 取哈希会得到"空串的 sha256"（语义错误）。
    // 正确口径＝输入解析文件字节哈希（真实产物、张的链检可复核）；解析声明有合法 64 位 sha 时优先。
    const declaredSha = parseDoc.doc.handoff?.source?.file_sha256
    const sha0 = /^[0-9a-f]{64}$/i.test(declaredSha ?? '')
      ? declaredSha
      : createHash('sha256').update(readFileSync(resolve(REPO_ROOT, args.parse)), 'utf8').digest('hex')
    const degradeReasons = parseDoc.doc.quality?.degrade_reasons ?? []
    const degradedBlock = parseDoc.blocks.find((b) => b.source_type === 'scan_region') ?? parseDoc.blocks[0] ?? null
    const skeleton = {}
    for (const [fname, spec] of Object.entries(FIELD_REGISTRY[eventType])) {
      skeleton[fname] = {
        raw_value: null, value: null, unit: spec.unit, standardized: false,
        status: 'unreadable', provenance: [], denominator: null, note: null,
      }
    }
    const envelope0 = {
      schema_version: '0.3', run_id: runId0, is_mock: isMock,
      source: {
        file_id: parseDoc.doc.handoff?.source?.file_id ?? `sha256:${sha0.slice(0, 16)}`,
        file_name: parseDoc.doc.doc?.file_name ?? basename(args.parse),
        file_sha256: parseDoc.doc.handoff?.source?.file_sha256 ?? sha0,
        parse_meta: {
          parser_version: null,
          page_count: parseDoc.doc.doc?.page_count ?? 1,
          ...(parseDoc.doc.handoff?.source?.parse_meta ?? {}),
          blocks: projectBlocks(parseDoc.blocks), // W1：三键全保真，降级件同样可核
        },
      },
      events: [{
        event_id: 'E01', event_type: eventType, fields: skeleton,
        extraction_method: 'rule',
        notes: `扫描件诚实降级：解析层无可读文本（degrade_reasons: ${degradeReasons.join('；') || '未提供'}${degradedBlock ? `；降级块 ${degradedBlock.block_id}（source_type=scan_region）` : ''}），未调用模型，全部字段置 unreadable`,
      }],
      run_meta: {
        entry: 'cli', model: null, started_at: new Date().toISOString(), duration_ms: 0,
        // 版本戳与正常路径同规格（宗 D8 评分 version_traceability：a_run_id+code_version+is_mock，
        // 降级信封同样是 A 侧记录，缺 code_version 会使 D8-PAIR-013 丢版本追踪）
        code_version: (() => {
          try { return execSync('git rev-parse --short HEAD', { cwd: REPO_ROOT, encoding: 'utf8', stdio: 'pipe' }).trim() }
          catch { return 'dev' }
        })(),
        interface_version: 'v0.3',
        errors: [`[降级] 文档为扫描件/无可读文本（可读字符 ${parseDoc.joinedRaw.trim().length} < ${READABLE_MIN}），跳过模型调用，未产出任何字段值`],
      },
    }
    const outDir0 = resolve(REPO_ROOT, args.outDir, runId0)
    mkdirSync(outDir0, { recursive: true })
    writeFileSync(resolve(outDir0, 'events.json'), JSON.stringify(envelope0, null, 2), 'utf8')
    writeFileSync(resolve(outDir0, 'call_log.json'), JSON.stringify({
      run_id: runId0, is_mock: isMock, endpoint: 'none（扫描降级，未调用模型）', model: null,
      request: { mode: 'scan-degraded', readable_chars: parseDoc.joinedRaw.trim().length },
      response: null, error: null, timing: { total_ms: 0, call_ms: null }, created_at: envelope0.run_meta.started_at,
    }, null, 2), 'utf8')
    console.log(`[降级] run_id=${runId0}：扫描件无可读文本，全部字段置 unreadable，未调用模型、未编造任何值`)
    console.log(`[输出] ${args.outDir}/${runId0}/events.json`)
    process.exit(0)
  }
  if (parseDoc === null && inputText.trim().length < READABLE_MIN) {
    console.error(`输入无可读文本（${inputText.trim().length} 字符）——拒绝调用模型以免编造；扫描件请先走解析（--parse）获得降级块`)
    process.exit(2)
  }
  // MIXED 文档（部分页 TEXT 部分页 SCANNED）：可读文本够走正常抽取，但扫描页上的事件会被静默丢失——如实警告
  if (parseDoc !== null) {
    const scannedPages = parseDoc.doc.pages?.filter((p) => p.form === 'SCANNED').map((p) => p.page) ?? []
    if (scannedPages.length > 0 && parseDoc.joinedRaw.trim().length >= READABLE_MIN) {
      console.log(`[警告] MIXED 文档：第 ${scannedPages.join('、')} 页为 SCANNED——这些页上的事件可能被静默丢失`)
    }
  }

  const postErrors = [] // 提前声明（分块路径的 chunk 失败处理在下方引用）
  const repairs = [] // 已自动修复项与设计内提示：记 call_log，不计入 run_meta.errors（只留真实契约问题）
  // MIXED 提示属设计内降级通告（非契约问题）——落入 repairs
  if (parseDoc !== null) {
    const scannedPages2 = parseDoc.doc.pages?.filter((p) => p.form === 'SCANNED').map((p) => p.page) ?? []
    if (scannedPages2.length > 0 && parseDoc.joinedRaw.trim().length >= READABLE_MIN) {
      repairs.push(`[提示] MIXED 文档：第 ${scannedPages2.join('、')} 页为 SCANNED（无可读文本），仅从 TEXT 页抽取——扫描页上的事件可能缺失`)
    }
  }
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
  const INPUT_LIMIT = 60000
  const CHUNK_LIMIT = 50000

  // 分块抽取（v0.4.1）：超长文档按块分组逐次调模型、合并事件（去重键=（主体×对手方×direction））
  let call, callError = null
  let truncated = false
  const allEvents = []

  if (!isMock && modelInput.length > INPUT_LIMIT && parseDoc !== null) {
    // 解析块模式分块：按块分组使标注文本 ≤ CHUNK_LIMIT
    const chunks = []
    let curBlocks, curSize = 0
    curBlocks = []
    for (const b of parseDoc.blocks) {
      const line = b.header_path ? `[${b.block_id}|表头:${b.header_path}] ${b.text_raw}` : `[${b.block_id}] ${b.text_raw}`
      if (curSize + line.length > CHUNK_LIMIT && curBlocks.length > 0) {
        chunks.push(curBlocks)
        curBlocks = []
        curSize = 0
      }
      curBlocks.push(b)
      curSize += line.length
    }
    if (curBlocks.length > 0) chunks.push(curBlocks)

    console.log(`[分块] 输入 ${modelInput.length} 字符超上限，按块分 ${chunks.length} 次调用（每块 ≤${CHUNK_LIMIT} 字符）`)
    const sysPrompt = buildSystemPrompt(eventType, true)
    let chunkDurations = 0
    let chunkCacheHits = 0
    const seenKeys = new Set()

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunkText = chunks[ci].map((b) =>
        b.header_path ? `[${b.block_id}|表头:${b.header_path}] ${b.text_raw}` : `[${b.block_id}] ${b.text_raw}`
      ).join('\n')
      try {
        const chunkCall = await callModel({ baseURL, model, apiKey, system: sysPrompt, user: chunkText })
        chunkDurations += chunkCall.durationMs ?? 0
        if (chunkCall.cache_hit === true) chunkCacheHits++
        const chunkParsed = parseModelJson(chunkCall.content)
        for (const ev of chunkParsed.events ?? []) {
          const f = ev.fields ?? {}
          // 分块去重键（事件类型感知）：
          //   pledge:（质押人×质权人×direction）——先押后解 direction 不同，正确去重
          //   equity_change:（holder×direction×shares_before）——加 shares_before 区分同 holder 多次变动
          //   award_contract:（bidder×tenderer×project_name）——加项目名区分同组合多标段
          const base = `${f.pledgor?.value ?? f.holder?.value ?? f.bidder?.value ?? '?'}|${f.pledgee?.value ?? f.tenderer?.value ?? ''}|${f.direction?.value ?? 'pledge'}`
          const differentiator = ev.event_type === 'award_contract'
            ? String(f.project_name?.value ?? '')
            : ev.event_type === 'equity_change'
              ? String(f.shares_before?.value ?? '')
              : ''
          const key = `${base}|${differentiator}`
          if (!seenKeys.has(key)) {
            seenKeys.add(key)
            allEvents.push(ev)
          }
        }
      } catch (err) {
        postErrors.push(`[分块] 第 ${ci + 1} 块调用失败：${err.message}`)
      }
    }

    // D12：分块路径的缓存命中聚合上报——此前合成 call 不带 cache_hit/cache_key，
    // call_log 顶层 hit 恒 null（分块缓存实际生效，纯上报缺口）。key 为 null 表多块多键。
    call = {
      content: JSON.stringify({ events: allEvents }), usage: null, durationMs: chunkDurations, httpStatus: 200, retriesWithoutResponseFormat: false,
      cache_hit: chunkCacheHits === chunks.length ? true : (chunkCacheHits === 0 ? false : null),
      cache_key: null,
    }
    truncated = false // 分块模式下不截断
    const durationMs = Date.now() - t0
    console.log(`[分块完成] ${chunks.length} 块 → ${allEvents.length} 个事件（去重后），总耗时 ${durationMs}ms`)
  } else {
    truncated = modelInput.length > INPUT_LIMIT
    if (truncated) {
      console.log(`[警告] 输入 ${modelInput.length} 字符超上限 ${INPUT_LIMIT}，超出部分被截断——文末事件可能丢失（已记入 run_meta.errors）`)
    }
    try {
      call = isMock
        ? mockModelResponse(eventType)
        : await callModel({ baseURL, model, apiKey, system: buildSystemPrompt(eventType, parseDoc !== null), user: modelInput.slice(0, INPUT_LIMIT) })
    } catch (err) {
      callError = err
    }
  }
  const durationMs = Date.now() - t0

  // ---- D2 事件后处理：块级出处回填 ＋ 数值标准化（方的 normalize 移植） ----
  const events = call ? parseModelJson(call.content).events ?? [] : []
  if (truncated) {
    postErrors.push(`[输入] 模型输入超上限被截断：${modelInput.length} → ${INPUT_LIMIT} 字符，截断部分的事件可能丢失`)
  }
  // 前置清洗：模型偶发输出 null/非对象字段（违反契约），剔除并记错，保证后续阶段不崩
  for (const ev of events) {
    for (const [name, fv] of Object.entries(ev.fields ?? {})) {
      if (fv === null || typeof fv !== 'object') {
        postErrors.push(`[schema前置] 字段 ${name} 值非对象（${JSON.stringify(fv)}），已剔除`)
        delete ev.fields[name]
      }
    }
  }
  repairQuotes(events, parseDoc, inputText, repairs)
  if (parseDoc !== null) backfillProvenance(events, parseDoc.blockIndex, isMock, postErrors, parseDoc.blocks, repairs)
  let normalizedCount = 0
  for (const ev of events) {
    for (const [name, fv] of Object.entries(ev.fields ?? {})) {
      // 万股感知（v0.4）：raw_value 无单位标记时，取所属块表头的单位提示（如"本次质押数量（万股）"）
      let unitHint = null
      if (parseDoc !== null) {
        const bid = fv.provenance?.[0]?.block_id
        const blk = bid ? parseDoc.blockIndex.get(bid) : undefined
        const hp = blk?.header_path ?? blk?.table_ref?.header_path
        if (typeof hp === 'string') {
          if (hp.includes('亿股')) unitHint = '亿股'
          else if (hp.includes('万股')) unitHint = '万股'
          else if (hp.includes('亿元')) unitHint = '亿元'
          else if (hp.includes('万元')) unitHint = '万元'
        }
      }
      const err = normalizeFieldValue(name, fv, unitHint)
      if (err !== null) postErrors.push(err)
      else if (fv.standardized === true) normalizedCount++
      // 方向由 direction 表达，change_shares 强制非负（宗 D5 评估规则）
      if (name === 'change_shares' && typeof fv.value === 'number' && fv.value < 0) {
        fv.value = Math.abs(fv.value)
        fv.note = `${fv.note ?? ''}［原模型输出为负值，已归一化为非负量级（direction 表达方向）］`
      }
      // 注册表规定的单位强制修正（change_date 必须为 date_range）
      if (name === 'change_date' && fv.unit === 'date' && fv.status === 'extracted') {
        fv.unit = 'date_range'
        fv.note = `${fv.note ?? ''}［单位修正：date→date_range（注册表规定）］`
      }
    }
  }

  // ---- 继续标准化（method 清理在下方） ----
  for (const ev of events) {
    for (const [name, fv] of Object.entries(ev.fields ?? {})) {
      // method 精准后处理（v0.4.3）——五类规则逐一对照 gold 差异设计
      if (name === 'method' && typeof fv.value === 'string') {
        let m = fv.value
        const original = m
        // 1. 去"通过"前缀和"联交所"等地名前缀
        if (m.startsWith('通过')) m = m.slice(2)
        m = m.replace(/^联交所/, '')
        // 2. 去"方式"——无论在末尾还是在动词前（"交易方式增持"→"交易"后接"增持"需一并处理）
        m = m.replace(/方式(?=增持|减持|$)/g, '')
        // 3. 去末尾的"增持"或"减持"结果词（direction 已表达方向）
        if (m.endsWith('增持') || m.endsWith('减持')) m = m.slice(0, -2)
        // 4. 顿号归"及"
        m = m.replace(/、/g, '及')
        // 5. 如果值包含括号且括号内含"交易"或"转让"，提取括号内内容（gold 只要核心方法词）
        const parenMatch = m.match(/（([^）]*(?:交易|转让|减持|稀释)[^）]*)）/)
        if (parenMatch && parenMatch[1].length >= 4) {
          m = parenMatch[1]
        }
        // 6. 去首尾标点（但保留句尾句号——gold 的完整句子带句号）
        m = m.replace(/^[，、；：\s]+/, '')
        m = m.replace(/[，、；：\s]+$/, '')
        // 7. 从 quote 恢复句尾句号（gold 的完整方法描述通常带句号）
        const quote = fv.provenance?.[0]?.quote?.trim() ?? ''
        if (quote.endsWith('。') && !m.endsWith('。') && m.length >= 10) {
          m += '。'
        }
        if (m !== original && m.length > 0) {
          fv.note = `${fv.note ?? ''}［方法清理：${original}→${m}］`
          fv.value = m
        }
      }
    }
  }

  // ---- 宗 D5 冻结口径（0de17901 handoffs/D5-gold-decisions.md）四类确定性规则 ----
  applyGoldConventions(events, inputText, parseDoc, postErrors, repairs)

  // 硬性规则 1 清扫：非 extracted/needs_review 状态禁止携带值（模型偶发把 "not_disclosed" 写进 value）
  for (const ev of events) {
    for (const [fname, fv] of Object.entries(ev.fields ?? {})) {
      if (fv === null || typeof fv !== 'object') continue
      if (fv.status !== 'extracted' && fv.status !== 'needs_review' && fv.value !== null && fv.value !== undefined) {
        fv.note = `${fv.note ?? ''}［规则1清扫：${fv.status} 状态禁止携带值，置 null］`
        fv.value = null
        if (typeof fv.raw_value === 'string' && /not_(disclosed|mentioned|applicable)|unreadable/.test(fv.raw_value)) fv.raw_value = null
      }
    }
  }

  // 口径过滤/合并可能已删除事件或替换字段——清掉指向已不存在出处项的过期校验错误
  for (let ei = postErrors.length - 1; ei >= 0; ei--) {
    const m = postErrors[ei].match(/events\[(\d+)\]\.fields\.(\w+)\.provenance\[(\d+)\]/)
    if (m === null) continue
    const fv = events[Number(m[1])]?.fields?.[m[2]]
    if (!fv || !(fv.provenance?.[Number(m[3])] instanceof Object)) postErrors.splice(ei, 1)
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
          parse_meta: {
            parser_version: null,
            page_count: parseDoc.doc.doc?.page_count ?? 1,
            ...(handoff?.source?.parse_meta ?? {}),
            blocks: projectBlocks(parseDoc.blocks), // W1：三键全保真，下游（方 D7 归因/D9 块级复核）免 parses-map
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
      // D6-④ 运行版本/哈希日志：记录代码版本（git commit）和接口版本
      code_version: (() => {
        try { return execSync('git rev-parse --short HEAD', { cwd: REPO_ROOT, encoding: 'utf8', stdio: 'pipe' }).trim() }
        catch { return 'dev' }
      })(),
      interface_version: 'v0.3',
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
      mode: modelInput.length > INPUT_LIMIT && parseDoc !== null ? 'parse-blocks-chunked' : (parseDoc !== null ? 'parse-blocks' : 'raw-text'),
      temperature: 0,
      response_format: { type: 'json_object' },
    },
    response: call ? { content: call.content, usage: call.usage, http_status: call.httpStatus, dropped_response_format: call.retriesWithoutResponseFormat } : null,
    error: callError ? String(callError.message) : null,
    repairs, // 自动修复项与设计内提示（口径过滤、MIXED 通告等）——不计入 run_meta.errors
    cache: CACHE.enabled
      ? { enabled: true, dir: CACHE.dir, hit: call?.cache_hit ?? null, key: call?.cache_key ?? null, hits: CACHE.hits, misses: CACHE.misses, writes: CACHE.writes }
      : { enabled: false, hit: null, key: null, hits: 0, misses: 0, writes: 0 },
    timing: { total_ms: durationMs, call_ms: call?.durationMs ?? null, real_call_ms: call?.realDurationMs ?? call?.durationMs ?? null },
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
