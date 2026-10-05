/**
 * D9 归因规则用例 runner——消费宗 rules-cases.dev.json（20 条），产出其 §五约定的
 * B 侧归因报告（verdict ∈ corroborated|explainable_difference|restated|conflict|insufficient）。
 *
 * 判定原则：只读 sides 数据（值/字段/主体/引文/块），**不读 expected_verdict/category/
 * attribution_basis**（期望标签不进入判定）；每案走确定性链，先归因后矛盾。
 * 用法：node scripts/jingguan/run_d9_rules.mjs --cases <rules-cases.dev.json> [--out <report.json>]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

function parseArgs(argv) {
  const a = { cases: 'evaluation/D9/cases/rules-cases.dev.json', out: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--cases') a.cases = argv[++i]
    else if (argv[i] === '--out') a.out = argv[++i]
    else { console.error(`未知参数：${argv[i]}`); process.exit(2) }
  }
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
const outCases = []
const byVerdict = {}
for (const c of cases) {
  const d = decide(c.sides ?? [])
  byVerdict[d.verdict] = (byVerdict[d.verdict] ?? 0) + 1
  outCases.push({
    case_id: c.case_id,
    verdict: d.verdict,
    attribution: d.attribution,
    attribution_code: d.code,
    sides: (c.sides ?? []).map((s) => ({ case_id: s.case_id, block_id: s.block_id ?? null, quote: s.quote ?? null })),
    computed: d.computed,
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
  policy: '期望标签不进入判定（只读 sides 值/字段/主体/引文/块）',
  cases_total: outCases.length,
  by_verdict: byVerdict,
  cases: outCases,
}
const outStr = JSON.stringify(report, null, 2)
if (args.out) writeFileSync(resolve(REPO_ROOT, args.out), outStr, 'utf8')
console.log(`[D9归因runner] ${outCases.length} 案｜${Object.entries(byVerdict).map(([k, v]) => `${k}=${v}`).join('｜')}${args.out ? `｜报告 ${args.out}` : ''}`)
if (args.out === null) console.log(outStr)
