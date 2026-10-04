#!/usr/bin/env node
/**
 * 跨文档核验引擎（D8）：给定一组文档的抽取信封，判定文档间关联性，并对相关文档做事件级一致性核验。
 *
 * 三个关联信号（只用信封字段，不依赖原文——封存回放对 raw/gold 哈希锁定）：
 *   S1 实体重叠：holder/pledgor/pledgee/bidder/tenderer 主体名跨文档相同（名称形态容差：
 *      全称/简称互含或子序列，如"有格投资"⊂"有格创业投资有限公司"）
 *   S2 数值锚点：≥6 位且非圆整（%10000≠0，排除总股本类整亿/整万）的股数/金额在两文档同时出现
 *   S3 反向咬合：共享锚点数值中，一文档出自 increase 事件、另一文档出自 decrease 事件
 *      （转让双方文件：受让方增持额＝出让方减持额）
 *
 * 判定：related := (E≥2 ∧ A≥1) ∨ (E≥1 ∧ A≥2) ∨ (A≥1 ∧ 反向咬合)
 *
 * 相关组一致性核验（事件对齐后逐字段）：
 *   corroboration 同主体同字段跨文档数值一致（互证）
 *   conflict      同主体同字段跨文档数值冲突（双方 quote 存证）
 *   complementary 主体仅见于一侧（互补覆盖，非冲突）
 *
 * 用法：
 *   node scripts/jingguan/verify_crossdoc.mjs --envelopes-dir runs/batch-XXX/envelopes \
 *     --manifest corpus/zongbowen/sealed/cross-doc-manifest.json [--out report.json] [--expect]
 * --expect：按 manifest 的 expected_relation 判分（封存回放模式），全对 exit 0。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dirname, '..', '..')

function parseArgs(argv) {
  const a = { envelopesDir: null, manifest: null, out: null, expect: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--envelopes-dir') a.envelopesDir = argv[++i]
    else if (argv[i] === '--manifest') a.manifest = argv[++i]
    else if (argv[i] === '--out') a.out = argv[++i]
    else if (argv[i] === '--expect') a.expect = true
  }
  if (!a.envelopesDir || !a.manifest) {
    console.log('用法：node scripts/jingguan/verify_crossdoc.mjs --envelopes-dir <dir> --manifest <跨文档manifest> [--out report.json] [--expect]')
    process.exit(2)
  }
  return a
}

// ---------- 名称形态容差（与 run_batch 对齐：相等/互含/首字相同子序列） ----------
function subseq(short, full) { let i = 0; for (const ch of full) { if (ch === short[i]) i++ } return i === short.length }
function nameEq(x, y) {
  if (x === y) return true
  if (y.includes(x) || x.includes(y)) return true
  const [s, f] = x.length <= y.length ? [x, y] : [y, x]
  return s[0] === f[0] && s.length >= 3 && subseq(s, f)
}

// ---------- 信封信号抽取 ----------
const ENTITY_FIELDS = ['holder', 'pledgor', 'pledgee', 'bidder', 'tenderer']
const NUMERIC_FIELDS = new Set(['shares_before', 'shares_after', 'change_shares', 'pledged_shares_this_time', 'pledged_shares_cumulative', 'bid_amount', 'pledge_amount', 'recognized_revenue'])

function entitiesOf(env) {
  const out = new Set()
  for (const ev of env.events ?? []) {
    for (const k of ENTITY_FIELDS) {
      const v = ev.fields?.[k]?.value
      if (typeof v === 'string' && v.length >= 2) {
        for (const part of v.split(/[、和，,]/)) {
          const t = part.trim()
          if (t.length >= 2) out.add(t)
        }
      }
    }
  }
  return [...out]
}

/** 数值锚点：非圆整大数（股数/金额）；direction 过滤用于反向咬合（null=不限）。 */
function anchorsOf(env, direction) {
  const out = new Set()
  for (const ev of env.events ?? []) {
    const d = ev.fields?.direction?.value
    if (direction !== null && d !== undefined && d !== direction) continue
    for (const [k, f] of Object.entries(ev.fields ?? {})) {
      const v = f?.value
      if (typeof v === 'number' && v >= 100000 && NUMERIC_FIELDS.has(k) && v % 10000 !== 0) out.add(v)
    }
  }
  return [...out]
}

/** 事件级实体→字段数值映射（一致性核验用）。
 *  多主体合并事件（holder 含顿号/和，≥2 成员）的数值是**群体合计**——记为 aggregate 条目
 *  （entity=合并名单原文），不拆记到个人头上（合计值≠个人值，拆记会产生伪矛盾）。 */
function entityFieldMap(env) {
  const map = new Map()
  for (const ev of env.events ?? []) {
    const holderRaw = [ENTITY_FIELDS[0], 'pledgor', 'bidder'].map((k) => ev.fields?.[k]?.value).find((v) => typeof v === 'string' && v.length >= 2)
    if (holderRaw === undefined) continue
    const members = String(holderRaw).split(/[、和，,]/).map((s) => s.trim()).filter((s) => s.length >= 2)
    const isAggregate = members.length >= 2
    const entities = isAggregate ? [String(holderRaw).trim()] : members
    for (const t of entities) {
      for (const [k, f] of Object.entries(ev.fields ?? {})) {
        if (!NUMERIC_FIELDS.has(k)) continue
        const v = f?.value
        if (typeof v !== 'number') continue
        const key = `${t}|${k}`
        if (!map.has(key)) map.set(key, { entity: t, field: k, value: v, quote: f.provenance?.[0]?.quote ?? null, event_id: ev.event_id, aggregate: isAggregate, members: isAggregate ? members : null })
      }
    }
  }
  return [...map.values()]
}

// ---------- 单组核验 ----------
function verifyGroup(group, envelopes) {
  const signals = { shared_entities: [], shared_anchor_numbers: [], reverse_match_numbers: [] }
  let maxE = 0, maxA = 0, reverse = false
  for (let i = 0; i < envelopes.length; i++) {
    for (let j = i + 1; j < envelopes.length; j++) {
      const eA = entitiesOf(envelopes[i]), eB = entitiesOf(envelopes[j])
      const sharedE = eA.filter((x) => eB.some((y) => nameEq(x, y)))
      if (sharedE.length > maxE) { maxE = sharedE.length; signals.shared_entities = sharedE }
      const aAll = anchorsOf(envelopes[i], null), bAll = anchorsOf(envelopes[j], null)
      const sharedA = aAll.filter((x) => bAll.includes(x))
      if (sharedA.length > maxA) { maxA = sharedA.length; signals.shared_anchor_numbers = sharedA }
      const upDown = anchorsOf(envelopes[i], 'increase').filter((x) => anchorsOf(envelopes[j], 'decrease').includes(x))
      const downUp = anchorsOf(envelopes[i], 'decrease').filter((x) => anchorsOf(envelopes[j], 'increase').includes(x))
      if (sharedA.length >= 1 && (upDown.length || downUp.length)) {
        reverse = true
        signals.reverse_match_numbers = [...upDown, ...downUp]
      }
    }
  }
  const related = (maxE >= 2 && maxA >= 1) || (maxE >= 1 && maxA >= 2) || (maxA >= 1 && reverse)
  const result = {
    group_id: group.group_id,
    members: group.members,
    predicted_relation: related ? 'related' : 'unrelated',
    signals: {
      shared_entity_count: maxE,
      shared_entities: signals.shared_entities,
      anchor_count: maxA,
      shared_anchor_numbers: signals.shared_anchor_numbers,
      reverse_match: reverse,
      reverse_match_numbers: signals.reverse_match_numbers,
    },
  }
  if (!related) return result
  // 一致性核验：两两文档按 实体×字段 对齐
  result.consistency = { corroborations: [], conflicts: [], complementaries: [] }
  for (let i = 0; i < envelopes.length; i++) {
    for (let j = i + 1; j < envelopes.length; j++) {
      const mA = entityFieldMap(envelopes[i]), mB = entityFieldMap(envelopes[j])
      const seen = new Set()
      for (const a of mA) {
        const b = mB.find((x) => nameEq(x.entity, a.entity) && x.field === a.field)
        if (b === undefined) continue
        if (a.aggregate !== b.aggregate) continue // 个人↔合计混合对不直接比数值——交给合计勾稽分支
        const key = `${a.entity}|${a.field}|${b.entity}`
        if (seen.has(key)) continue
        seen.add(key)
        if (Math.abs(a.value - b.value) < 1e-9) {
          result.consistency.corroborations.push({ entity: a.entity, field: a.field, value: a.value, docs: [group.members[i], group.members[j]], quotes: [a.quote, b.quote] })
        } else {
          result.consistency.conflicts.push({ entity: a.entity, field: a.field, values: [{ doc: group.members[i], value: a.value, quote: a.quote }, { doc: group.members[j], value: b.value, quote: b.quote }] })
        }
      }
      // 群体合计 ↔ 分人值之和 勾稽（合计事件不与单人直接比对，跨档核验总量）
      for (const agg of [...mA, ...mB].filter((x) => x.aggregate)) {
        const indivSide = mA.includes(agg) ? mB : mA
        const indivs = indivSide.filter((x) => !x.aggregate && agg.members.some((m) => nameEq(m, x.entity)) && x.field === agg.field)
        if (indivs.length < 2) continue
        // 部分覆盖（对侧仅披露部分成员，如 002 只列两名一致行动人）不判矛盾也不判互证
        if (!agg.members.every((m) => indivs.some((x) => nameEq(x.entity, m)))) {
          result.consistency.complementaries.push({ kind: 'partial_aggregate_coverage', entity: agg.entity, field: agg.field, covered: indivs.map((x) => x.entity), aggregate_value: agg.value })
          continue
        }
        const sum = indivs.reduce((n, x) => n + x.value, 0)
        if (Math.abs(sum - agg.value) < 1e-6) {
          result.consistency.corroborations.push({
            kind: 'group_total_matches_sum', entity: agg.entity, field: agg.field,
            aggregate: { doc: mA.includes(agg) ? group.members[i] : group.members[j], value: agg.value },
            parts: indivs.map((x) => ({ doc: mA.includes(agg) ? group.members[j] : group.members[i], entity: x.entity, value: x.value })),
          })
        } else {
          result.consistency.conflicts.push({
            kind: 'group_total_mismatch', entity: agg.entity, field: agg.field,
            aggregate: { doc: mA.includes(agg) ? group.members[i] : group.members[j], value: agg.value },
            parts_sum: sum,
            parts: indivs.map((x) => ({ doc: mA.includes(agg) ? group.members[j] : group.members[i], entity: x.entity, value: x.value })),
          })
        }
      }
      const eA = entitiesOf(envelopes[i]), eB = entitiesOf(envelopes[j])
      for (const e of eA) if (!eB.some((y) => nameEq(e, y))) result.consistency.complementaries.push({ entity: e, only_in: group.members[i] })
      for (const e of eB) if (!eA.some((y) => nameEq(e, y))) result.consistency.complementaries.push({ entity: e, only_in: group.members[j] })
    }
  }
  return result
}

// ---------- 主流程 ----------
const args = parseArgs(process.argv.slice(2))
const manifest = JSON.parse(readFileSync(resolve(REPO_ROOT, args.manifest), 'utf8'))
const envDir = resolve(REPO_ROOT, args.envelopesDir)
const groups = manifest.groups ?? []
const results = []
let matched = 0, relatedHit = 0, unrelatedHit = 0, missing = []
for (const g of groups) {
  const envelopes = g.members.map((cs) => {
    for (const suffix of [`${cs}.json`, cs]) {
      const p = resolve(envDir, suffix)
      if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'))
    }
    return null
  })
  if (envelopes.some((e) => e === null)) { missing.push(g.group_id); continue }
  const r = verifyGroup(g, envelopes)
  results.push(r)
  if (!args.expect || r.predicted_relation === g.expected_relation) matched++
  if (g.expected_relation === 'related' && r.predicted_relation === 'related') relatedHit++
  if (g.expected_relation !== 'related' && r.predicted_relation !== 'related') unrelatedHit++
}
const report = {
  checked_on: new Date().toISOString().slice(0, 10),
  envelopes_dir: args.envelopesDir,
  manifest: args.manifest,
  expect_mode: args.expect,
  groups_total: groups.length,
  groups_checked: results.length,
  groups_missing_envelope: missing,
  related_detected: results.filter((r) => r.predicted_relation === 'related').length,
  related_conflicts_total: results.reduce((n, r) => n + (r.consistency?.conflicts?.length ?? 0), 0),
  related_corroborations_total: results.reduce((n, r) => n + (r.consistency?.corroborations?.length ?? 0), 0),
  results,
}
if (args.expect) {
  report.expected_match = matched
  report.expected_miss = groups.length - matched - missing.length
  report.related_hit = `${relatedHit}/${groups.filter((g) => g.expected_relation === 'related').length}`
  report.unrelated_clean = `${unrelatedHit}/${groups.filter((g) => g.expected_relation !== 'related').length}`
}
const outStr = JSON.stringify(report, null, 2)
if (args.out) writeFileSync(resolve(REPO_ROOT, args.out), outStr, 'utf8')
const rel = report.related_detected
console.log(`[跨文档核验] ${report.groups_checked}/${groups.length} 组｜判定相关 ${rel}｜互证 ${report.related_corroborations_total}｜矛盾 ${report.related_conflicts_total}${missing.length ? `｜缺信封 ${missing.join(',')}` : ''}`)
if (args.expect) {
  console.log(`[封存回放] 相关命中 ${report.related_hit}｜无关零误报 ${report.unrelated_clean}｜判定一致 ${matched}/${groups.length}`)
  if (matched !== groups.length || missing.length > 0) process.exit(1)
}
