/**
 * B 归因流程（D9）——对跨文档核验差异做确定性归因，输出调用轨迹。
 *
 * 原则（任务表 D9 魏）：模型可解释但不得覆盖确定性规则判定——本工具全部结论由
 * 规则产生（内置优先级链＋可插拔规则库）；LLM 解释层只作为 model_explanation
 * 附加信息（v1 恒 null，接口预留）。
 *
 * 用法：
 *   node scripts/jingguan/attribute_b.mjs --report <b-report.json> [--rules <规则模块.mjs>] [--out <out.json>]
 * 规则模块接口（方 D9 归因规则库接入点）：
 *   export const attributeRules = [{ id, label, applies(ctx), decide(ctx) }]
 *   ctx = { group, kind, entry, values, quotes }；插件规则先于内置链执行，
 *   返回 { attribution, confidence, evidence } 或 null（落到内置链）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

function parseArgs(argv) {
  const a = { report: null, rules: null, out: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--report') a.report = argv[++i]
    else if (argv[i] === '--rules') a.rules = argv[++i]
    else if (argv[i] === '--out') a.out = argv[++i]
    else { console.error(`未知参数：${argv[i]}`); process.exit(2) }
  }
  if (a.report === null) { console.error('用法：attribute_b.mjs --report <b-report.json> [--rules <模块>] [--out <out.json>]'); process.exit(2) }
  return a
}

const num = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && /^-?\d+(?:\.\d+)?$/.test(v.trim())) {
    const n = Number(v)
    return String(n) === v.trim() ? n : null
  }
  return null
}
const normQuote = (q) => (typeof q === 'string' ? q.replace(/[\s,，、；;]/g, '') : '')
const close = (a, b, tol = 1e-6) => Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * tol

// ---------- 内置归因链（确定性；顺序即优先级，先命中先归因） ----------
// 顺序原则：可解释口径（单位/累计/币种）最优先——同句不同数若属量级错配仍归口径；
// 其后同句不同数（真矛盾）＞时点衔接＞舍入＞保留疑点。
const BUILTIN_RULES = [
  {
    id: 'INSUFFICIENT_EVIDENCE',
    label: '证据不足（不强行归因）',
    applies: (ctx) => ctx.kind === 'insufficient',
    decide: () => ({ attribution: 'insufficient_evidence', confidence: 'high', evidence: 'B 判定 unknown/INSUFFICIENT_SIGNALS——证据不足时不下矛盾结论，也不猜测归因' }),
  },
  {
    id: 'UNIT_SCALE_MISMATCH',
    label: '口径差异·单位量级（万/亿）',
    applies: (ctx) => ctx.values.length === 2 && ctx.values.every((v) => v !== null),
    decide: (ctx) => {
      const [a, b] = ctx.values
      for (const [k, u] of [[4, '万'], [8, '亿']]) {
        if (close(a, b * 10 ** k, 1e-9) || close(b, a * 10 ** k, 1e-9)) {
          return { attribution: 'caliber_unit_scale', confidence: 'high', evidence: `${a} vs ${b}：有效数字一致，量级差 10^${k}（${u}）——单位口径差异，非数值矛盾` }
        }
      }
      return null
    },
  },
  {
    id: 'CUMULATIVE_VS_INCREMENTAL',
    label: '口径差异·累计 vs 单次',
    applies: (ctx) => ctx.values.length >= 2 && ctx.values.every((v) => v !== null),
    decide: (ctx) => {
      const vs = [...ctx.values]
      for (let i = 0; i < vs.length; i++) {
        const rest = vs.filter((_, j) => j !== i).reduce((n, x) => n + x, 0)
        if (vs.length >= 2 && close(vs[i], rest)) {
          return { attribution: 'caliber_cumulative_vs_incremental', confidence: 'high', evidence: `${vs[i]} == 其余值之和 ${rest}——合计口径 vs 分项口径` }
        }
      }
      return null
    },
  },
  {
    id: 'CURRENCY_EQUIV',
    label: '口径差异·币种折算',
    applies: (ctx) => ctx.quotes.some((q) => /折合人民币|阿联酋迪拉姆|美元|港元|迪拉姆/.test(q)),
    decide: (ctx) => ({
      attribution: 'caliber_currency',
      confidence: 'high',
      evidence: `引文含外币/折合表述（${ctx.quotes.find((q) => /折合人民币|迪拉姆|美元|港元/.test(q))?.slice(0, 50) ?? ''}…）——原币与人民币折合两种口径（参见 D6-AWD-007 判定：取公告明示折合值）`,
    }),
  },
  {
    id: 'SAME_QUOTE_DIFFERENT_NUMBER',
    label: '真矛盾·同句不同数',
    applies: (ctx) => ctx.quotes.length >= 2 && ctx.quotes.every((q) => q.trim().length > 0),
    decide: (ctx) => {
      const q0 = normQuote(ctx.quotes[0])
      const q1 = normQuote(ctx.quotes[1])
      if (q0.length >= 6 && q0 === q1) {
        return { attribution: 'true_conflict', confidence: 'high', evidence: '两侧引文归一后完全一致但抽取数值不同——同一原句不同数值，真矛盾（或抽取错误，须人工终审）' }
      }
      return null
    },
  },
  {
    id: 'TEMPORAL_PROGRESSION',
    label: '正常进展·时点衔接（非矛盾）',
    applies: (ctx) => ctx.values.length === 2 && ctx.quotes.every((q) => q.length > 0),
    decide: (ctx) => {
      // 一侧数值出现在另一侧引文里（前后持股衔接：A 的 after 即 B 的 before）
      const [va, vb] = ctx.values
      for (const v of [va, vb]) {
        if (v === null) continue
        const s = Math.round(Math.abs(v)).toString()
        const other = v === va ? ctx.quotes[1] : ctx.quotes[0]
        if (s.length >= 6 && normQuote(other).includes(s)) {
          return { attribution: 'temporal_progression', confidence: 'medium', evidence: `数值 ${v} 同时出现在对侧引文中——时点衔接（一文档的期末值即另一文档的期初值），属正常进展而非矛盾` }
        }
      }
      return null
    },
  },
  {
    id: 'ROUNDING_TOLERANCE',
    label: '口径差异·约数/舍入',
    applies: (ctx) => ctx.values.length === 2 && ctx.values.every((v) => v !== null) && ctx.values.some((v) => v !== 0),
    decide: (ctx) => {
      const [a, b] = ctx.values
      const rel = Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b))
      if (rel > 0 && rel <= 0.005) {
        return { attribution: 'caliber_rounding', confidence: 'medium', evidence: `相对差 ${(rel * 100).toFixed(3)}% ≤ 0.5%——约数/舍入口径（"约""大约"披露），非实质矛盾` }
      }
      return null
    },
  },
  {
    id: 'UNEXPLAINED_DISCREPANCY',
    label: '无法解释·保留疑点（待人工/更正线索）',
    applies: () => true,
    decide: (ctx) => ({
      attribution: 'unexplained_needs_review',
      confidence: 'low',
      evidence: `数值 ${ctx.values.join(' vs ')} 无单位/币种/累计/舍入/时点规律可解释——按"不能解释则保留疑点"不自动定矛盾，标记疑似更正或录入差异，待人工复核`,
    }),
  },
]

// ---------- 主流程 ----------
const args = parseArgs(process.argv.slice(2))
let pluginRules = []
if (args.rules !== null) {
  const mod = await import(pathToFileURL(resolve(REPO_ROOT, args.rules)).href)
  if (!Array.isArray(mod.attributeRules)) { console.error(`--rules 模块须导出 attributeRules 数组：${args.rules}`); process.exit(2) }
  pluginRules = mod.attributeRules
}

const report = JSON.parse(readFileSync(resolve(REPO_ROOT, args.report), 'utf8'))
const results = report.results ?? []
const attributions = []
const trace = []

for (const group of results) {
  // 证据不足组 → 直接归因（不猜）
  if (group.predicted_relation === 'unknown' || (group.reasons ?? []).includes('INSUFFICIENT_SIGNALS')) {
    const entry = { group_id: group.group_id, kind: 'insufficient', entity: null, field: null, values: [], quotes: [] }
    runChain(group, entry)
    continue
  }
  const conflicts = group.consistency?.conflicts ?? []
  for (const c of conflicts) {
    // 两种冲突形状：values[]（逐文档对撞）与 aggregate/parts（合计勾稽不齐）
    let values, quotes
    if (Array.isArray(c.values) && c.values.length > 0) {
      values = c.values.map((v) => num(v.value))
      quotes = c.values.map((v) => v.quote ?? '').filter(Boolean)
    } else if (c.aggregate) {
      values = [num(c.aggregate.value), ...(c.parts ?? []).map((p) => num(p.value))]
      quotes = [c.aggregate.quote ?? '', ...(c.parts ?? []).map((p) => p.quote ?? '')].filter(Boolean)
    } else {
      values = []
      quotes = []
    }
    const entry = { group_id: group.group_id, kind: 'conflict', entity: c.entity ?? null, field: c.field ?? null, values, quotes }
    runChain(group, entry)
  }
}

function runChain(group, entry) {
  const ctx = { group, kind: entry.kind, entry, values: entry.values, quotes: entry.quotes }
  let decision = null
  let decidedBy = null
  // 插件（方 D9 规则库）先于内置链——规则库同为确定性规则，可优先归因
  for (const r of pluginRules) {
    try {
      if (typeof r.applies === 'function' && !r.applies(ctx)) continue
      decision = typeof r.decide === 'function' ? r.decide(ctx) : null
      if (decision) { decidedBy = `plugin:${r.id}`; break }
    } catch (err) {
      trace.push({ group_id: group.group_id, rule_id: r.id, decided_by: 'plugin', error: String(err?.message ?? err).slice(0, 120) })
    }
  }
  if (!decision) {
    for (const r of BUILTIN_RULES) {
      if (!r.applies(ctx)) continue
      decision = r.decide(ctx)
      if (decision) { decidedBy = `builtin:${r.id}`; break }
    }
  }
  const record = {
    group_id: group.group_id,
    kind: entry.kind,
    entity: entry.entity,
    field: entry.field,
    values: entry.values,
    attribution: decision?.attribution ?? 'unexplained_needs_review',
    label: BUILTIN_RULES.find((r) => r.id === decidedBy?.replace(/^builtin:/, ''))?.label ?? decision?.label ?? '无法解释·保留疑点（待人工/更正线索）',
    confidence: decision?.confidence ?? 'low',
    evidence: decision?.evidence ?? '',
    decided_by: decidedBy ?? 'builtin:UNEXPLAINED_DISCREPANCY',
    model_explanation: null, // 接口预留：LLM 解释只附加、不覆盖确定性判定
  }
  attributions.push(record)
  trace.push({
    group_id: group.group_id, kind: entry.kind, entity: entry.entity, field: entry.field,
    decided_by: record.decided_by, attribution: record.attribution, inputs: { values: entry.values, quotes: entry.quotes.map((q) => q.slice(0, 60)) },
  })
}

const byAttribution = {}
for (const a of attributions) byAttribution[a.attribution] = (byAttribution[a.attribution] ?? 0) + 1
const codeVersion = (() => {
  try { return spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8', stdio: 'pipe' }).stdout.trim() } catch { return 'dev' }
})()
const out = {
  tool: 'attribute_b.mjs',
  code_version: codeVersion,
  input_report: args.report,
  rules: { plugin: args.rules ?? null, builtin_chain: BUILTIN_RULES.map((r) => r.id) },
  groups_scanned: results.length,
  conflicts_and_insufficient: attributions.length,
  by_attribution: byAttribution,
  attributions,
  trace, // 调用轨迹：每条归因的规则、输入与结论（可审计）
}
const outStr = JSON.stringify(out, null, 2)
if (args.out) writeFileSync(resolve(REPO_ROOT, args.out), outStr, 'utf8')
console.log(`[B归因] ${attributions.length} 条差异｜${Object.entries(byAttribution).map(([k, v]) => `${k}=${v}`).join('｜') || '无差异'}｜插件规则 ${pluginRules.length} 条`)
if (args.out === null) console.log(outStr)
