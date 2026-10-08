/**
 * D9 归因规则用例 runner——消费宗 rules-cases.dev.json（20 条），产出其 §五约定的
 * B 侧归因报告（verdict ∈ corroborated|explainable_difference|restated|conflict|insufficient）。
 *
 * 判定原则：只读 sides 数据（值/字段/主体/引文/块），**不读 expected_verdict/category/
 * attribution_basis**（期望标签不进入判定）；每案走确定性链，先归因后矛盾。
 * 用法：node scripts/jingguan/run_d9_rules.mjs --cases <rules-cases.dev.json>
 *            [--verify-blocks <信封目录>] [--bilateral <张双侧出处包.json>] [--out <report.json>]
 * --verify-blocks（宗 v0.2 重锚后的块内容级硬校验，主源＝批次信封 parse_meta.blocks）：
 *   逐真实侧验证 quote∈block（NFKC＋去空白归一）；受控构造（SYNTH-*）与无块设计侧
 *   （扫描降级）豁免。真实语料 conflict 判定须双侧块级验证通过，否则标
 *   evidence_verified=false（宗规则 2 的块内容级强化）。
 * --bilateral：张双侧出处包逐侧 evidence_status 标注（包随宗重锚需张再生成，仅标注）。
 * --rules <module>（方 D9 主库直通）：模块导出 attributeCase(input, context)——
 *   input={case_id, sides}（宗用例 sides 原样，已含 entity/field/value/raw_value/unit/quote/block_id），
 *   context={documents:{<case_id>:信封}}（由 --envelopes 目录按侧 case_id 装配）。
 *   插件优先：返回 verdict 即接管该案（attribution_code='plugin'）；异常/缺信封回退内置链并记录。
 * --envelopes <dir>：--rules 装配 context 用的信封目录。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

function parseArgs(argv) {
  const a = { cases: 'evaluation/D9/cases/rules-cases.dev.json', out: null, bilateral: null, verifyBlocks: null, rules: null, envelopes: null, parsesMap: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--cases') a.cases = argv[++i]
    else if (argv[i] === '--out') a.out = argv[++i]
    else if (argv[i] === '--bilateral') a.bilateral = argv[++i]
    else if (argv[i] === '--verify-blocks') a.verifyBlocks = argv[++i]
    else if (argv[i] === '--rules') a.rules = argv[++i]
    else if (argv[i] === '--envelopes') a.envelopes = argv[++i]
    else if (argv[i] === '--parses-map') a.parsesMap = argv[++i]
    else { console.error(`未知参数：${argv[i]}`); process.exit(2) }
  }
  if (a.rules !== null && a.envelopes === null) { console.error('--rules 需同时提供 --envelopes <信封目录>（装配 d9_context.documents）'); process.exit(2) }
  return a
}

const normText = (s) => String(s ?? '').normalize('NFKC').replace(/\s+/gu, '')
/** 信封缓存：--verify-blocks 主源（批次信封 parse_meta.blocks）。 */
const envCache = new Map()
function envelopeOf(caseId) {
  if (envCache.has(caseId)) return envCache.get(caseId)
  let env = null
  try { env = JSON.parse(readFileSync(resolve(REPO_ROOT, args.verifyBlocks, `${caseId}.json`), 'utf8')) } catch { env = null }
  envCache.set(caseId, env)
  return env
}
/** 块内容级验证：quote ∈ 指定块（NFKC＋去空白）。返回 true/false/null(豁免/无信封)。 */
function verifySideBlock(s) {
  if (String(s.case_id).startsWith('SYNTH-')) return null // 受控构造：无解析块为设计使然
  const quote = String(s.quote ?? '')
  if (!s.block_id && quote.trim().length === 0) return null // 无块设计侧（扫描降级/星号占位）
  const env = envelopeOf(s.case_id)
  if (env === null) return null
  const blocks = env.source?.parse_meta?.blocks ?? []
  const b = blocks.find((x) => x.block_id === s.block_id)
  if (!b) return false
  return normText(b.text_raw ?? b.text).includes(normText(quote))
}

const num = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && /^-?\d+(?:\.\d+)?$/.test(v.trim())) {
    const n = Number(v)
    return String(n) === v.trim() ? n : null
  }
  return null
}
const normEntity = (x) => String(x ?? '').replace(/[\s、，,和]/g, '')
const memberCount = (x) => String(x ?? '').split(/[、，,]|和/).filter((s) => s.trim().length >= 2).length
const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * tol

/** 单案确定性归因链——顺序即优先级；返回 {verdict, code, attribution, computed} */
function decide(sides) {
  const quotes = sides.map((s) => s.quote ?? '')
  const values = sides.map((s) => num(s.value))
  const entities = sides.map((s) => s.entity ?? null)
  const fields = sides.map((s) => s.field ?? '')

  // 1. 空值/降级 → 证据不足（不得据空缺下任何结论）
  if (sides.some((s) => s.value === null || s.value === undefined || String(s.value).trim() === '' || s.field === '*')) {
    return { verdict: 'insufficient', code: 'NO_VALUE', attribution: '字段值缺失/降级（unreadable 或星号占位）——证据不足，不下任何结论', computed: [] }
  }

  // 2. 币种/折算口径：引文含外币或明示折合 → 口径差异（保留原币与折合双记录，不换算）
  if (quotes.some((q) => /折合人民币|阿联酋迪拉姆|迪拉姆/.test(q))) {
    return { verdict: 'explainable_difference', code: 'CURRENCY_SCOPE', attribution: '原币与人民币折合属同一金额的两种口径；取公告明示折合值、不自算汇率、保留双记录', computed: [] }
  }

  // 3. 单侧披露 → 主体可锚＝覆盖范围差异；主体不可锚＝证据不足
  if (sides.length === 1) {
    if (entities[0] !== null && String(entities[0]).trim().length >= 2) {
      return { verdict: 'explainable_difference', code: 'PARTIAL_COVERAGE', attribution: '该主体仅单侧披露——覆盖范围差异（部分覆盖），不构成矛盾', computed: [] }
    }
    return { verdict: 'insufficient', code: 'NO_SUBJECT_CONTEXT', attribution: '单侧披露且主体不可锚——缺可比性依据（如单位量级依赖表头），保留疑点', computed: [] }
  }

  // 4. 字段口径（字段名不同即口径不同，按可辨识的三类口径归因）
  if (fields[0] !== fields[1]) {
    const [f0, f1] = fields
    const stemOf = (f) => f.replace(/_(this_time|cumulative|of_held|of_total)$/, '')
    if (f0.includes('this_time') && f1.includes('cumulative')) {
      return { verdict: 'explainable_difference', code: 'SCOPE_CUMULATIVE', attribution: '“本次”与“累计”口径不同，数值必然不同；混比即为误报', computed: [] }
    }
    if (f0.includes('cumulative') && f1.includes('this_time')) {
      return { verdict: 'explainable_difference', code: 'SCOPE_CUMULATIVE', attribution: '“累计”与“本次”口径不同，数值必然不同；混比即为误报', computed: [] }
    }
    if (f0.includes('of_held') && f1.includes('of_total')) {
      return { verdict: 'explainable_difference', code: 'RATIO_DENOMINATOR', attribution: '分母不同（占其所持 vs 占公司总股本），比率不可直接相比', computed: [] }
    }
    if (f0.includes('of_total') && f1.includes('of_held')) {
      return { verdict: 'explainable_difference', code: 'RATIO_DENOMINATOR', attribution: '分母不同（占公司总股本 vs 占其所持），比率不可直接相比', computed: [] }
    }
    if (fields.includes('tax_included') || sides.some((s) => s.unit === 'text' && /^(true|false|含税|不含税)$/i.test(String(s.value)))) {
      return { verdict: 'explainable_difference', code: 'TAX_SCOPE', attribution: '含税状态决定金额可比性；未取得同口径依据时不得跨含税口径直接比数，也不倒算税率', computed: [] }
    }
    // 其余字段名差异：口径未定但不猜矛盾——保守记 explainable（字段级口径差异）
    if (stemOf(f0) === stemOf(f1)) {
      return { verdict: 'explainable_difference', code: 'FIELD_CALIBER', attribution: `字段口径不同（${f0} vs ${f1}）`, computed: [] }
    }
  }

  // 5. 显式更正语义（后发公告声明更正）→ 更正，非矛盾
  if (quotes.some((q) => /更正|重新披露/.test(q))) {
    return { verdict: 'restated', code: 'RESTATEMENT_EXPLICIT', attribution: '后发公告显式声明更正前次数值——归因为更正；以后发值为准并保留前次记录', computed: [] }
  }

  // 6a. 合计口径的实体形态：一侧主体为多名单（群体合计）→ 合计↔明细
  const aggIdx = entities.findIndex((e) => memberCount(e) >= 2)
  if (aggIdx >= 0) {
    return { verdict: 'explainable_difference', code: 'AGGREGATE_DETAIL', attribution: '一侧为群体合计口径、另一侧为单人/对方明细——合计不拆记到个人，亦非矛盾', computed: [] }
  }

  const [v0, v1] = values
  const bothNum = v0 !== null && v1 !== null

  // 7a. 同主体同字段数值一致 → 互证（先于合计语境：同主体等值即互证，
  //     即便对侧引文出现"合计"字样——那是语境描述，不改变该主体自身数值一致性）
  if (bothNum && normEntity(entities[0]) === normEntity(entities[1]) && fields[0] === fields[1] && close(v0, v1)) {
    return { verdict: 'corroborated', code: 'SAME_ENTITY_EQUAL', attribution: '同一主体同一字段两文档一致——互证', computed: [] }
  }

  // 6b. 跨主体合计语境：一侧引文把对侧主体列入“合计持有”名单 → 合计↔明细勾稽
  for (let i = 0; i < sides.length; i++) {
    const other = sides[1 - i]
    const q = quotes[i] ?? ''
    if (other?.entity && q.includes(String(other.entity)) && /合计|共计/.test(q)) {
      return { verdict: 'explainable_difference', code: 'AGGREGATE_DETAIL', attribution: `对侧引文将 ${other.entity} 置于“合计持有”语境——合计↔明细口径，勾稽而非矛盾`, computed: [] }
    }
  }

  // 7b. 主体不同但数值精确一致（非圆整大数）→ 反向咬合互证（转让双方各记一笔）
  if (bothNum && close(v0, v1) && Math.abs(v0) >= 1e5 && Math.abs(v0) % 10000 !== 0) {
    return { verdict: 'corroborated', code: 'REVERSE_BITE', attribution: '主体不同但同一非圆整数值精确一致——出让方减持额＝受让方增持额，反向咬合互证', computed: [] }
  }

  // 8. 量级/舍入/时点衔接（沿 attribute_b 内置链语义）→ 可解释口径
  if (bothNum) {
    for (const [k, u] of [[4, '万'], [8, '亿']]) {
      if (close(v0, v1 * 10 ** k, 1e-9) || close(v1, v0 * 10 ** k, 1e-9)) {
        return { verdict: 'explainable_difference', code: 'UNIT_SCALE', attribution: `有效数字一致、量级差 10^${k}（${u}）——单位口径差异`, computed: [] }
      }
    }
    const rel = Math.abs(v0 - v1) / Math.max(Math.abs(v0), Math.abs(v1))
    if (rel > 0 && rel <= 0.005) {
      return { verdict: 'explainable_difference', code: 'ROUNDING', attribution: `相对差 ${(rel * 100).toFixed(3)}% ≤ 0.5%——约数/舍入口径`, computed: [] }
    }
    for (const v of [v0, v1]) {
      const s = Math.round(Math.abs(v)).toString()
      const other = v === v0 ? quotes[1] : quotes[0]
      if (s.length >= 6 && String(other ?? '').replace(/[\s,，]/g, '').includes(s)) {
        return { verdict: 'explainable_difference', code: 'TEMPORAL_PROGRESSION', attribution: '数值出现在对侧引文——时点衔接（期末＝期初），正常进展', computed: [] }
      }
    }
  }

  // 9. 无法归因的两值差异 → 矛盾候选；须双侧证据齐全才判真矛盾，否则证据不足
  const dual = sides.filter((s) => s.block_id && s.quote && String(s.quote).length > 0).length >= 2
  if (dual) {
    return { verdict: 'conflict', code: 'TRUE_CONFLICT', attribution: '同一主体同一字段数值不同，无更正声明、无口径差异可解释——真矛盾（双侧原文为证）', computed: [] }
  }
  return { verdict: 'insufficient', code: 'CONFLICT_CANDIDATE_NO_DUAL_EVIDENCE', attribution: '数值不可归因但双侧证据不齐——矛盾候选保留疑点，不判真矛盾', computed: [] }
}

// ---------- 主流程 ----------
const args = parseArgs(process.argv.slice(2))
const ds = JSON.parse(readFileSync(resolve(REPO_ROOT, args.cases), 'utf8'))
const cases = ds.cases ?? ds
// 张双侧出处包（可选）：按 case_id 匹配，逐侧取 evidence_status/evidence_note
let bilateral = null
if (args.bilateral !== null) {
  bilateral = JSON.parse(readFileSync(resolve(REPO_ROOT, args.bilateral), 'utf8'))
}
const bilByCase = new Map((bilateral?.cases ?? []).map((c) => [c.case_id, c]))
const anchorable = (st) => st === 'present' || st === 'quote_whitespace_variance'

const outCases = []
const byVerdict = {}
const bilSummary = {}
const blockSummary = {}
// --rules（方 D9 主库直通）：按侧 case_id 装配 context.documents，插件 verdict 接管
let rulesLib = null
if (args.rules !== null) {
  const mod = await import(pathToFileURL(resolve(REPO_ROOT, args.rules)).href)
  if (typeof mod.attributeCase !== 'function') { console.error(`--rules 模块须导出 attributeCase(input, context)：${args.rules}`); process.exit(2) }
  rulesLib = mod.attributeCase
}
// --parses-map：{case_id: 解析文件路径}——方库需要全保真 parses（cell/table_ref 级），
// 信封内嵌块是精简版（无 source_type/table_ref），优先用原始解析文件
let parsesMap = {}
if (args.parsesMap !== null) parsesMap = JSON.parse(readFileSync(resolve(REPO_ROOT, args.parsesMap), 'utf8'))
const pluginFallbacks = []

/** W7（宗 2026-10-08 待办）·确定性合计勾稽：从"合计"侧引文解析成员名单，在对侧
 * 文档信封里取各成员 change_shares 明细求和，与合计侧数值程序化比对——留下
 * "合计是程序算的、不是模型说的"计算记录（合计项、来源与依据）。
 * 明细缺人则不产记录（判缺证据），绝不硬凑错账。 */
function programmaticSumCheck(c) {
  const sides = c.sides ?? []
  const aggIdx = sides.findIndex((s) => /合计/.test(String(s.quote ?? '')))
  if (aggIdx === -1) return null
  const agg = sides[aggIdx]
  const detail = sides[1 - aggIdx]
  if (detail == null) return null
  const m = String(agg.quote ?? '').match(/([\u4e00-\u9fa5]{2,4}(?:[、，和][\u4e00-\u9fa5]{2,4}){1,})(?:等)?(?:将其|持有的)/)
  if (m === null) return null
  const members = m[1].split(/[、，和]/).filter((x) => x.length >= 2)
  if (members.length < 2) return null
  const env = envelopeOf(detail.case_id)
  if (env === null) return null
  const terms = []
  for (const ev of env.events ?? []) {
    const holder = ev.fields?.holder?.value
    const cs = ev.fields?.change_shares
    if (!members.includes(String(holder)) || cs?.value == null) continue
    const p = cs.provenance?.[0]
    terms.push({ entity: holder, doc: detail.case_id, value: Number(cs.value), quote: p?.quote ?? null, block_id: p?.block_id ?? null })
  }
  if (terms.length < members.length) return null
  const sum = terms.reduce((a, t) => a + Math.abs(t.value), 0)
  const target = Number(agg.value)
  return {
    name: 'group_sum_reconciliation',
    used_source: 'deterministic_envelope_sumcheck',
    basis: `合计侧引文声明 ${members.join('、')} 合计 ${agg.raw_value ?? target}；程序在对侧文档 ${detail.case_id} 信封中取各成员 change_shares 明细求和比对`,
    members,
    terms,
    sum,
    aggregate_side: { case_id: agg.case_id, value: target, raw_value: agg.raw_value ?? null, quote: agg.quote, block_id: agg.block_id ?? null },
    match: sum === target,
  }
}

for (const c of cases) {
  let d = decide(c.sides ?? [])
  if (rulesLib !== null) {
    try {
      const documents = {}
      const parses = {}
      // 用例自带 context（方的受控例在 context.documents 携带 mock 信封/parses）——
      // 先以用例冻结的上下文为种子，再按 --envelopes 目录补缺；两处都无才为 null
      const caseCtxDocs = c.context?.documents
      const caseCtxParses = c.context?.parses
      if (caseCtxDocs && typeof caseCtxDocs === 'object') Object.assign(documents, caseCtxDocs)
      if (caseCtxParses && typeof caseCtxParses === 'object') Object.assign(parses, caseCtxParses)
      for (const s of c.sides ?? []) {
        if (documents[s.case_id] !== undefined) continue
        try {
          const env = JSON.parse(readFileSync(resolve(REPO_ROOT, args.envelopes, `${s.case_id}.json`), 'utf8'))
          documents[s.case_id] = env
          if (parsesMap[s.case_id] !== undefined) {
            // 优先：--parses-map 指向的原始解析文件（全保真 cell/table_ref）
            try { parses[s.case_id] = JSON.parse(readFileSync(resolve(REPO_ROOT, parsesMap[s.case_id]), 'utf8')) } catch { /* 留空 */ }
          }
          if (parses[s.case_id] === undefined) {
            // 回退：从信封内嵌 parse_meta.blocks 重构（精简块，可能缺 cell 级信息）
            const blocks = env.source?.parse_meta?.blocks
            if (Array.isArray(blocks) && blocks.length > 0) {
              const pages = new Map()
              for (const b of blocks) {
                const p = b.page ?? 1
                if (!pages.has(p)) pages.set(p, { page: p, blocks: [] })
                pages.get(p).blocks.push(b)
              }
              parses[s.case_id] = { doc: { file_sha256: env.source.file_sha256 }, pages: [...pages.values()], quality: { degraded: false, degrade_reasons: [], warnings: [] } }
            }
          }
        } catch { documents[s.case_id] = null }
      }
      const r = rulesLib({ case_id: c.case_id, sides: c.sides ?? [] }, { documents, parses })
      if (r && typeof r.verdict === 'string' && ['corroborated', 'explainable_difference', 'restated', 'conflict', 'insufficient'].includes(r.verdict)) {
        // 透传插件计算记录（share_sum/exchange_rate/tax_rate/unit_scale/rounding 五类，含 used_source）——
        // 此前硬编码 computed:[] 把方库的复算证据全丢了（宗 D12 待办指出，2026-10-08 修复）
        d = { verdict: r.verdict, code: `plugin:${r.attribution_code ?? 'FANG_D9'}`, attribution: r.attribution ?? r.reason ?? `方 D9 规则库判定 ${r.verdict}`, computed: Array.isArray(r.computed) ? r.computed : [] }
      }
    } catch (err) {
      pluginFallbacks.push({ case_id: c.case_id, error: String(err?.message ?? err).slice(0, 120) })
    }
  }
  byVerdict[d.verdict] = (byVerdict[d.verdict] ?? 0) + 1
  // W7：需程序化合计的用例——内置路径补充确定性勾稽记录（插件路径若已带 computed 则不覆盖）
  if (c.requires_programmatic_sum === true && Array.isArray(d.computed) && d.computed.length === 0) {
    const rec = programmaticSumCheck(c)
    if (rec !== null) d.computed.push(rec)
  }
  const bilCase = bilByCase.get(c.case_id) ?? null
  const bilSides = bilCase?.sides ?? null
  const outSides = (c.sides ?? []).map((s, ix) => {
    const bs = bilSides?.[ix] ?? bilSides?.find((x) => x.case_id === s.case_id && x.field === s.field) ?? null
    if (bs !== null) bilSummary[bs.evidence_status] = (bilSummary[bs.evidence_status] ?? 0) + 1
    let blockVerified = null
    if (args.verifyBlocks !== null) {
      blockVerified = verifySideBlock(s)
      blockSummary[String(blockVerified)] = (blockSummary[String(blockVerified)] ?? 0) + 1
    }
    return {
      case_id: s.case_id, block_id: s.block_id ?? null, quote: s.quote ?? null,
      evidence_status: bs?.evidence_status ?? null, evidence_note: bs?.evidence_note ?? null,
      ...(args.verifyBlocks !== null ? { block_verified: blockVerified } : {}),
    }
  })
  // conflict 证据硬校验（优先块内容级；无 --verify-blocks 时退回双侧出处包可锚性）
  let evidenceVerified = null
  if (d.verdict === 'conflict') {
    const realSides = outSides.filter((s) => !String(s.case_id).startsWith('SYNTH-'))
    if (realSides.length === 0) {
      evidenceVerified = true // 纯受控构造：双侧证据在报告层齐全即可（宗评分器口径）
    } else if (args.verifyBlocks !== null) {
      evidenceVerified = realSides.length >= 2 && realSides.every((s) => s.block_verified === true)
    } else if (args.bilateral !== null) {
      evidenceVerified = realSides.length >= 2 && realSides.every((s) => anchorable(s.evidence_status))
    }
  }
  outCases.push({
    case_id: c.case_id,
    verdict: d.verdict,
    attribution: d.attribution,
    attribution_code: d.code,
    sides: outSides,
    computed: d.computed,
    ...(evidenceVerified === false ? { evidence_verified: false, evidence_note: '真实语料 conflict 存在不可锚侧（quote_not_in_block/block_missing）——按宗规则2须双侧块级证据，此判定保留待证据重锚复核' } : {}),
  })
}
const codeVersion = (() => {
  try { return spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8', stdio: 'pipe' }).stdout.trim() } catch { return 'dev' }
})()
const report = {
  checked_on: new Date().toISOString().slice(0, 10),
  tool: 'run_d9_rules.mjs',
  code_version: codeVersion,
  input: args.cases,
  bilateral: args.bilateral !== null ? { source: args.bilateral, side_status_summary: bilSummary, reanchor_suggestions: bilateral?.reanchor_suggestions ?? [], reanchor_policy: bilateral?.reanchor_policy ?? null } : null,
  block_verify: args.verifyBlocks !== null ? { envelopes_dir: args.verifyBlocks, side_summary: blockSummary, policy: '主源＝批次信封 parse_meta.blocks；NFKC＋去空白归一后 quote∈block；受控构造与无块设计侧豁免（null）' } : null,
  policy: '期望标签不进入判定（只读 sides 值/字段/主体/引文/块）',
  cases_total: outCases.length,
  by_verdict: byVerdict,
  cases: outCases,
}
const outStr = JSON.stringify(report, null, 2)
if (args.out) writeFileSync(resolve(REPO_ROOT, args.out), outStr, 'utf8')
console.log(`[D9归因runner] ${outCases.length} 案｜${Object.entries(byVerdict).map(([k, v]) => `${k}=${v}`).join('｜')}${args.bilateral !== null ? `｜双侧证据 ${JSON.stringify(bilSummary)}` : ''}${args.out ? `｜报告 ${args.out}` : ''}`)
if (args.out === null) console.log(outStr)
