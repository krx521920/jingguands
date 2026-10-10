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
 *
 * D08-1 B 流程契约（验收三条）：
 *   B1 B 仅使用带出处的结构化字段：进入核验的字段必须 status=extracted 且 provenance 含
 *      block_id 或 quote——无出处的字段不参与 B（排除数记入 fields_excluded），B 从不
 *      重新生成/推断字段值（复用 A 结果）。
 *   B2 对齐失败返回原因：unrelated 判定携带 reasons[]（NO_SHARED_ENTITY/NO_SHARED_ANCHOR/
 *      NO_REVERSE_MATCH/INSUFFICIENT_SIGNALS{E,A}）；部分覆盖带 PARTIAL_* 原因。
 *   B3 A/B 运行记录可关联：report.b_run 为本次 B 运行标识；a_run_links[] 逐成员记录
 *      A 侧 run_id/code_version/schema_version/is_mock。
 *
 * 可插拔对齐器（对接方轩诚 D08-4 matching v1）：--matcher <path.mjs> 加载导出
 *   alignEvents(envA, envB) => [{entityA, entityB, field, valueA, valueB, quoteA, quoteB}]
 * 的模块替代内置事件对齐（关联判定信号不变）；缺省用内置 nameEq 对齐。
 */
import {readFileSync, writeFileSync, existsSync, readdirSync} from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO_ROOT = resolve(import.meta.dirname, '..', '..')

function parseArgs(argv) {
  const a = { envelopesDir: null, manifest: null, out: null, expect: false, matcher: null, d9Enrich: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--envelopes-dir') a.envelopesDir = argv[++i]
    else if (argv[i] === '--manifest') a.manifest = argv[++i]
    else if (argv[i] === '--out') a.out = argv[++i]
    else if (argv[i] === '--expect') a.expect = true
    else if (argv[i] === '--matcher') a.matcher = argv[++i]
    else if (argv[i] === '--d9-enrich') a.d9Enrich = true
  }
  if (!a.envelopesDir || !a.manifest) {
    console.log('用法：node scripts/jingguan/verify_crossdoc.mjs --envelopes-dir <dir> --manifest <跨文档manifest> [--out report.json] [--expect] [--matcher <module>] [--d9-enrich]')
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

/** B1：字段可用性——extracted 且出处含 block_id 或 quote（B 只消费带出处的 A 字段）。 */
function usableField(f) {
  if (f?.status !== 'extracted') return false
  return (f.provenance ?? []).some((p) => (p.block_id !== null && p.block_id !== undefined) || (typeof p.quote === 'string' && p.quote.trim().length > 0))
}

/** 逐信封统计可用/排除字段数（进 report.fields_excluded）。 */
function fieldUsability(env) {
  let usable = 0, excluded = 0
  for (const ev of env.events ?? []) {
    for (const [, f] of Object.entries(ev.fields ?? {})) {
      if (f?.status !== 'extracted') continue
      if (usableField(f)) usable++
      else excluded++
    }
  }
  return { usable, excluded }
}

function entitiesOf(env) {
  const out = new Set()
  for (const ev of env.events ?? []) {
    for (const k of ENTITY_FIELDS) {
      const f = ev.fields?.[k]
      if (!usableField(f)) continue // B1：无出处的字段不进 B
      const v = f.value
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

/** 数值兼容（方 D6 标准化接口）：value 可为 number 或精确十进制字符串
 *  （超精度值以字符串承载，如 "9007199254740993"）。字符串仅在能无损往返时转数值；
 *  超出 Number 精度的字符串返回 null（不降级为浮点，避免跨信封伪相等）。 */
function asNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && /^-?\d+(?:\.\d+)?$/.test(v.trim())) {
    const n = Number(v)
    return String(n) === v.trim() ? n : null
  }
  return null
}

/** 数值锚点：非圆整大数（股数/金额）；direction 过滤用于反向咬合（null=不限）。 */
function anchorsOf(env, direction) {
  const out = new Set()
  for (const ev of env.events ?? []) {
    const d = ev.fields?.direction?.value
    if (direction !== null && d !== undefined && d !== direction) continue
    for (const [k, f] of Object.entries(ev.fields ?? {})) {
      if (!usableField(f)) continue // B1：无出处的字段不进 B
      const v = asNumber(f?.value)
      if (v !== null && v >= 100000 && NUMERIC_FIELDS.has(k) && v % 10000 !== 0) out.add(v)
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
        if (!usableField(f)) continue // B1：无出处的字段不进 B
        const v = asNumber(f?.value)
        if (v === null) continue
        const key = `${t}|${k}`
        if (!map.has(key)) map.set(key, {
          entity: t, field: k, value: v, quote: f.provenance?.[0]?.quote ?? null, event_id: ev.event_id, aggregate: isAggregate, members: isAggregate ? members : null,
          // 方 D9 归因所需的字段级元数据（d9_input 组装用；不影响判定）
          unit: f.unit ?? null, raw_value: f.raw_value ?? null, block_id: f.provenance?.[0]?.block_id ?? null, page: f.provenance?.[0]?.page ?? null,
        })
      }
    }
  }
  return [...map.values()]
}

// ---------- 单组核验 ----------
function verifyGroup(group, envelopes, matcherFn = null, groupMatcherFn = null, pluginName = null, d9Enrich = false, allEnvelopes = null) {
  // B3：逐成员 A 侧运行标识（run_id/code_version/schema_version/is_mock）——A/B 记录可关联
  const a_run_links = group.members.map((cs, ix) => ({
    case_id: cs,
    a_run_id: envelopes[ix]?.run_id ?? null,
    code_version: envelopes[ix]?.run_meta?.code_version ?? null,
    schema_version: envelopes[ix]?.schema_version ?? null,
    is_mock: envelopes[ix]?.is_mock ?? null,
  }))
  const fields_excluded = group.members.map((cs, ix) => ({ case_id: cs, ...fieldUsability(envelopes[ix]) }))
  // 方 D8.2 完整入口（explainGroup）：插件组级三态判定先于任何数值/合计分支——
  // 只有 same(related) 的文档对才进入可比性检查（unknown/different 不执行数值核验）。
  // 插件异常按组记录并整体回退内置链（B2 精神：失败返回原因，不炸 B 运行）。
  let pluginAlignment = null
  if (groupMatcherFn !== null) {
    try {
      const pr = groupMatcherFn(group, envelopes)
      if (pr && typeof pr.predicted_relation === 'string') {
        pluginAlignment = { ...pr, plugin_relation: ({ same: 'related', different: 'unrelated', unknown: 'unknown' }[pr.predicted_relation] ?? pr.predicted_relation) }
      }
    } catch (err) {
      pluginAlignment = { plugin_relation: null, plugin_error: String(err?.message ?? err).slice(0, 200) }
    }
  }
  const g_members = group.members
  const signals = { shared_entities: [], shared_anchor_numbers: [], reverse_match_numbers: [] }
  let maxE = 0, maxA = 0, reverse = false
  for (let i = 0; i < envelopes.length; i++) {
    for (let j = i + 1; j < envelopes.length; j++) {
      const eA = entitiesOf(envelopes[i]), eB = entitiesOf(envelopes[j])
      const sharedE = eA.filter((x) => eB.some((y) => nameEq(x, y)))
      if (sharedE.length > maxE) { maxE = sharedE.length; signals.shared_entities = sharedE; signals.shared_entities_from_pair = [g_members[i], g_members[j]] }
      const aAll = anchorsOf(envelopes[i], null), bAll = anchorsOf(envelopes[j], null)
      const sharedA = aAll.filter((x) => bAll.includes(x))
      if (sharedA.length > maxA) { maxA = sharedA.length; signals.shared_anchor_numbers = sharedA; signals.shared_anchors_from_pair = [g_members[i], g_members[j]] }
      const upDown = anchorsOf(envelopes[i], 'increase').filter((x) => anchorsOf(envelopes[j], 'decrease').includes(x))
      const downUp = anchorsOf(envelopes[i], 'decrease').filter((x) => anchorsOf(envelopes[j], 'increase').includes(x))
      if (sharedA.length >= 1 && (upDown.length || downUp.length)) {
        reverse = true
        signals.reverse_match_numbers = [...upDown, ...downUp]
        signals.reverse_from_pair = [g_members[i], g_members[j]]
      }
    }
  }
  const related = (maxE >= 2 && maxA >= 1) || (maxE >= 1 && maxA >= 2) || (maxA >= 1 && reverse)
  // 第三态（宗 D8 配对集评分契约）：任一成员 0 可用字段（如 pledge-scan-degrade 全页
  // 扫描降级 14 字段全 unreadable）→ 证据不足，不得强行判 unrelated。输出 unknown＋
  // INSUFFICIENT_SIGNALS；两侧都有可用证据而不重合才是真 unrelated。
  const insufficient = fields_excluded.some((x) => x.usable === 0)
  const builtinRelation = insufficient ? 'unknown' : (related ? 'related' : 'unrelated')
  // 终审判定：插件组级判定接管（方 D8.2 explainGroup）；无插件/插件异常 → 内置链。
  // 引擎第三态守卫保留否决权：0 可用字段的成员存在时，任何非 unknown 的插件判定被否决
  // （纵深防御——与方规则 1 同向，冲突时以更保守者为准并记 discrepancy）。
  let predicted = builtinRelation
  let discrepancy = null
  if (pluginAlignment !== null && pluginAlignment.plugin_relation !== null) {
    predicted = pluginAlignment.plugin_relation
    if (insufficient && predicted !== 'unknown') {
      discrepancy = `插件判 ${predicted}，但存在 0 可用字段成员——引擎第三态守卫否决为 unknown`
      predicted = 'unknown'
    }
  }
  // B2：判定原因（unrelated 必带失败原因码；related 带命中信号码）
  const reasons = []
  if (insufficient) {
    reasons.push('INSUFFICIENT_SIGNALS')
    for (const fe of fields_excluded) if (fe.usable === 0) reasons.push(`MEMBER_NO_USABLE_FIELDS:${fe.case_id}`)
  } else if (related) {
    if (maxE >= 2 && maxA >= 1) reasons.push('SHARED_ENTITIES_AND_ANCHORS')
    else if (maxE >= 1 && maxA >= 2) reasons.push('ENTITY_WITH_MULTIPLE_ANCHORS')
    else reasons.push('REVERSE_MATCH')
  } else {
    if (maxE === 0) reasons.push('NO_SHARED_ENTITY')
    if (maxA === 0) reasons.push('NO_SHARED_ANCHOR')
    if (maxA > 0 && !reverse) reasons.push('NO_REVERSE_MATCH')
    if (maxE > 0 && maxA === 0) reasons.push('INSUFFICIENT_SIGNALS')
    if (reasons.length === 0) reasons.push('INSUFFICIENT_SIGNALS')
  }
  // 插件接管时原因换用规则库输出（保留引擎守卫信息），内置原因留在 alignment 审计段
  if (pluginAlignment !== null && pluginAlignment.plugin_relation !== null) {
    reasons.length = 0
    const prReasons = Array.isArray(pluginAlignment.reasons) ? pluginAlignment.reasons.filter((x) => typeof x === 'string') : []
    reasons.push(...prReasons)
    if (predicted === 'unknown' && !reasons.includes('INSUFFICIENT_SIGNALS')) reasons.unshift('INSUFFICIENT_SIGNALS')
    if (insufficient) for (const fe of fields_excluded) if (fe.usable === 0) reasons.push(`MEMBER_NO_USABLE_FIELDS:${fe.case_id}`)
  }
  const result = {
    group_id: group.group_id,
    members: group.members,
    a_run_links,
    fields_excluded,
    predicted_relation: predicted,
    reasons,
    signals: {
      // 注意：组级信号＝逐对最大值，各信号可能来自不同文档对（见 *_from_pair）——防误读为组内一致来源
      shared_entity_count: maxE,
      shared_entities: signals.shared_entities,
      shared_entities_from_pair: signals.shared_entities_from_pair ?? null,
      anchor_count: maxA,
      shared_anchor_numbers: signals.shared_anchor_numbers,
      shared_anchors_from_pair: signals.shared_anchors_from_pair ?? null,
      reverse_match: reverse,
      reverse_match_numbers: signals.reverse_match_numbers,
      reverse_from_pair: signals.reverse_from_pair ?? null,
    },
  }
  // 方 D8.2 插件审计段：关联解释/双侧元数据/UI 提示原样透传（陈消费），内置判定留档对照
  if (pluginAlignment !== null) {
    result.alignment = {
      plugin: pluginName,
      plugin_relation: pluginAlignment.plugin_relation,
      builtin_relation: builtinRelation,
      plugin_reasons: pluginAlignment.reasons ?? null,
      relation_label: pluginAlignment.relation_label ?? null,
      association_explanation: pluginAlignment.association_explanation ?? null,
      ui_hint: pluginAlignment.ui_hint ?? null,
      member_meta: pluginAlignment.member_meta ?? null,
      document_pair_relations: Array.isArray(pluginAlignment.document_pairs)
        ? pluginAlignment.document_pairs.map((p) => ({ members: p.members ?? null, predicted_relation: p.predicted_relation ?? null, status: p.status ?? null, reasons: p.reasons ?? null }))
        : null,
      plugin_error: pluginAlignment.plugin_error ?? null,
      discrepancy,
    }
  }
  // 方 D9 归因上下文（--d9-enrich，按其接口规格 §2）：documents＝**批次全信封**
  // （D14 收口：方 D12.1 点名——合计勾稽需交易第三方来源，仅给组成员会把
  // AGGREGATE_PARTIAL_COVERAGE 当数值已勾稽；完整上下文＝其 46/46 验证形态），
  // parses＝从信封内嵌 parse_meta.blocks 重构的 evidence/0.9 布局（块级核验源）
  if (d9Enrich) {
    const documents = {}
    const parses = {}
    const addDoc = (caseId, env) => {
      if (env == null || documents[caseId] !== undefined) return
      documents[caseId] = env
      const blocks = env?.source?.parse_meta?.blocks
      if (Array.isArray(blocks) && blocks.length > 0) {
        const pages = new Map()
        for (const b of blocks) {
          const p = b.page ?? 1
          if (!pages.has(p)) pages.set(p, { page: p, blocks: [] })
          pages.get(p).blocks.push(b)
        }
        parses[caseId] = { doc: { file_sha256: env.source.file_sha256 }, pages: [...pages.values()], quality: { degraded: false, degrade_reasons: [], warnings: [] } }
      }
    }
    for (let ix = 0; ix < group.members.length; ix++) addDoc(group.members[ix], envelopes[ix])
    if (allEnvelopes !== null) for (const [caseId, env] of allEnvelopes) addDoc(caseId, env)
    result.d9_context = { documents, parses }
  }
  // d9_input 组装：sides 顺序必须与冲突 values/aggregate+parts 逐项对齐（方适配器按值逐项核对）
  const d9Input = (sides) => ({ case_id: `${group.group_id}:${sides.map((s) => `${s.case_id}.${s.entity}.${s.field}`).join('|')}`, sides })
  // 一致性核验门（方 D8.2）：只有 related（same）才执行数值/合计核验——
  // unknown/different 不得进入数值比较
  if (predicted !== 'related') return result
  // 一致性核验：两两文档按 实体×字段 对齐
  result.consistency = { corroborations: [], conflicts: [], complementaries: [] }
  for (let i = 0; i < envelopes.length; i++) {
    for (let j = i + 1; j < envelopes.length; j++) {
      // 方 D8.2 逐对门控：插件模式下只有判 same(related) 的文档对进入可比性检查
      if (pluginAlignment !== null && pluginAlignment.plugin_relation !== null && Array.isArray(pluginAlignment.document_pairs)) {
        const mi = group.members[i], mj = group.members[j]
        const dp = pluginAlignment.document_pairs.find((p) => Array.isArray(p.members) && p.members.length === 2
          && ((p.members[0] === mi && p.members[1] === mj) || (p.members[0] === mj && p.members[1] === mi)))
        if (dp !== undefined && dp.predicted_relation !== 'related') continue
      }
      // 可插拔对齐器（D08-4 matching v1 接入点）：只替代"直接事件对齐"；
      // 合计勾稽与互补是独立核验语义，插件模式下照常执行（不得因插件短路而丢失）。
      // 插件异常按对记录并继续（B2 精神：失败返回原因，不炸整个 B 运行）。
      const mA = entityFieldMap(envelopes[i]), mB = entityFieldMap(envelopes[j])
      if (matcherFn !== null) {
        try {
          const pairs = matcherFn(envelopes[i], envelopes[j]) ?? []
          for (const pr of pairs) {
            if (Math.abs((pr.valueA ?? NaN) - (pr.valueB ?? NaN)) < 1e-9) {
              result.consistency.corroborations.push({ entity: pr.entityA, field: pr.field, value: pr.valueA, docs: [group.members[i], group.members[j]], quotes: [pr.quoteA ?? null, pr.quoteB ?? null], matcher: 'plugin' })
            } else {
              const conflict = { entity: pr.entityA, field: pr.field, values: [{ doc: group.members[i], value: pr.valueA, quote: pr.quoteA ?? null }, { doc: group.members[j], value: pr.valueB, quote: pr.quoteB ?? null }], matcher: 'plugin' }
              if (d9Enrich) conflict.d9_input = d9Input([
                { case_id: group.members[i], entity: pr.entityA, field: pr.field, value: pr.valueA, quote: pr.quoteA ?? null, block_id: (pr.evidenceA ?? [])[0]?.block_id ?? null },
                { case_id: group.members[j], entity: pr.entityB ?? pr.entityA, field: pr.field, value: pr.valueB, quote: pr.quoteB ?? null, block_id: (pr.evidenceB ?? [])[0]?.block_id ?? null },
              ])
              result.consistency.conflicts.push(conflict)
            }
          }
        } catch (err) {
          result.consistency.aligner_errors = result.consistency.aligner_errors ?? []
          result.consistency.aligner_errors.push({ pair: [group.members[i], group.members[j]], error: String(err?.message ?? err).slice(0, 200) })
        }
      } else {
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
            const conflict = { entity: a.entity, field: a.field, values: [{ doc: group.members[i], value: a.value, quote: a.quote }, { doc: group.members[j], value: b.value, quote: b.quote }] }
            if (d9Enrich) conflict.d9_input = d9Input([
              { case_id: group.members[i], entity: a.entity, field: a.field, value: a.value, raw_value: a.raw_value, unit: a.unit, block_id: a.block_id, page: a.page, quote: a.quote },
              { case_id: group.members[j], entity: b.entity, field: b.field, value: b.value, raw_value: b.raw_value, unit: b.unit, block_id: b.block_id, page: b.page, quote: b.quote },
            ])
            result.consistency.conflicts.push(conflict)
          }
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
          const conflict = {
            kind: 'group_total_mismatch', entity: agg.entity, field: agg.field,
            aggregate: { doc: mA.includes(agg) ? group.members[i] : group.members[j], value: agg.value },
            parts_sum: sum,
            parts: indivs.map((x) => ({ doc: mA.includes(agg) ? group.members[j] : group.members[i], entity: x.entity, value: x.value })),
          }
          if (d9Enrich) conflict.d9_input = d9Input([
            { case_id: conflict.aggregate.doc, entity: agg.entity, field: agg.field, value: agg.value, raw_value: agg.raw_value, unit: agg.unit, block_id: agg.block_id, page: agg.page, quote: agg.quote },
            ...indivs.map((x) => ({ case_id: mA.includes(agg) ? group.members[j] : group.members[i], entity: x.entity, field: x.field, value: x.value, raw_value: x.raw_value, unit: x.unit, block_id: x.block_id, page: x.page, quote: x.quote })),
          ])
          result.consistency.conflicts.push(conflict)
        }
      }
      const eA = entitiesOf(envelopes[i]), eB = entitiesOf(envelopes[j])
      const compSeen = new Set(result.consistency.complementaries.map((c) => `${c.entity}|${c.only_in}`))
      for (const e of eA) if (!eB.some((y) => nameEq(e, y)) && !compSeen.has(`${e}|${group.members[i]}`)) { compSeen.add(`${e}|${group.members[i]}`); result.consistency.complementaries.push({ entity: e, only_in: group.members[i] }) }
      for (const e of eB) if (!eA.some((y) => nameEq(e, y)) && !compSeen.has(`${e}|${group.members[j]}`)) { compSeen.add(`${e}|${group.members[j]}`); result.consistency.complementaries.push({ entity: e, only_in: group.members[j] }) }
    }
  }
  return result
}

// ---------- 主流程 ----------
const args = parseArgs(process.argv.slice(2))
let matcherFn = null
let groupMatcherFn = null
if (args.matcher !== null) {
  const mod = await import(pathToFileURL(resolve(REPO_ROOT, args.matcher)).href)
  if (typeof mod.alignEvents !== 'function' && typeof mod.explainGroup !== 'function') {
    console.error(`--matcher 模块须导出 alignEvents(envA, envB) 和/或 explainGroup(group, envelopes)：${args.matcher}`)
    process.exit(2)
  }
  matcherFn = typeof mod.alignEvents === 'function' ? mod.alignEvents : null
  // 方 D8.2 完整入口：explainGroup（组级三态＋关联解释）——提供即接管组级判定
  groupMatcherFn = typeof mod.explainGroup === 'function' ? mod.explainGroup : null
}
const manifest = JSON.parse(readFileSync(resolve(REPO_ROOT, args.manifest), 'utf8'))
const envDir = resolve(REPO_ROOT, args.envelopesDir)
const groups = manifest.groups ?? []
const results = []
let matched = 0, relatedHit = 0, unrelatedHit = 0, insufficientHit = 0, missing = []
for (const g of groups) {
  const envelopes = g.members.map((cs) => {
    for (const suffix of [`${cs}.json`, cs]) {
      const p = resolve(envDir, suffix)
      if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'))
    }
    return null
  })
  if (envelopes.some((e) => e === null)) { missing.push(g.group_id); continue }
  // D14：d9-enrich 需要批次全信封上下文（方 D12.1：合计勾稽的交易第三方来源在成员之外）
  const allEnvelopes = args.d9Enrich ? new Map(readdirSync(envDir).filter((f) => f.endsWith('.json')).map((f) => {
    const caseId = f.replace(/.json$/, '')
    for (const cs of g.members) { if (cs === caseId) return [caseId, envelopes[g.members.indexOf(cs)]] }
    try { return [caseId, JSON.parse(readFileSync(resolve(envDir, f), 'utf8'))] } catch { return [caseId, null] }
  })) : null
  const r = verifyGroup(g, envelopes, matcherFn, groupMatcherFn, args.matcher, args.d9Enrich, allEnvelopes)
  results.push(r)
  // 期望匹配三态（与宗 score-pairs.mjs 判定一致）：related→判 related；unrelated→判
  // unrelated 且 0 矛盾；insufficient→判 unknown 或 reasons 含 INSUFFICIENT_SIGNALS
  const predHit = g.expected_relation === 'related' ? r.predicted_relation === 'related'
    : g.expected_relation === 'unrelated' ? r.predicted_relation === 'unrelated' && (r.consistency?.conflicts ?? []).length === 0
      : r.predicted_relation === 'unknown' || (r.reasons ?? []).includes('INSUFFICIENT_SIGNALS')
  if (!args.expect || predHit) matched++
  if (g.expected_relation === 'related' && r.predicted_relation === 'related') relatedHit++
  if (g.expected_relation === 'unrelated' && r.predicted_relation === 'unrelated') unrelatedHit++
  if (g.expected_relation === 'insufficient' && predHit) insufficientHit++
}
const report = {
  checked_on: new Date().toISOString().slice(0, 10),
  b_run: {
    b_run_id: `b-${new Date().toISOString().replace(/[-:]/g, '').replace('T', '').slice(0, 14)}`,
    engine: 'verify_crossdoc.mjs',
    matcher: args.matcher ? { plugin: args.matcher, capabilities: [matcherFn !== null ? 'alignEvents' : null, groupMatcherFn !== null ? 'explainGroup' : null].filter(Boolean) } : { builtin: 'nameEq+anchors' },
    envelopes_dir: args.envelopesDir,
  },
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
  report.unrelated_clean = `${unrelatedHit}/${groups.filter((g) => g.expected_relation === 'unrelated').length}`
  report.insufficient_signalled = `${insufficientHit}/${groups.filter((g) => g.expected_relation === 'insufficient').length}`
}
const outStr = JSON.stringify(report, null, 2)
if (args.out) writeFileSync(resolve(REPO_ROOT, args.out), outStr, 'utf8')
const rel = report.related_detected
console.log(`[跨文档核验] ${report.groups_checked}/${groups.length} 组｜判定相关 ${rel}｜互证 ${report.related_corroborations_total}｜矛盾 ${report.related_conflicts_total}${missing.length ? `｜缺信封 ${missing.join(',')}` : ''}`)
if (args.expect) {
  console.log(`[封存回放] 相关命中 ${report.related_hit}｜无关零误报 ${report.unrelated_clean}｜判定一致 ${matched}/${groups.length}`)
  const insTotal = groups.filter((g) => g.expected_relation === 'insufficient').length
  if (insTotal > 0) console.log(`[证据不足] 第三态命中 ${report.insufficient_signalled}`)
  if (matched !== groups.length || missing.length > 0) process.exit(1)
}
