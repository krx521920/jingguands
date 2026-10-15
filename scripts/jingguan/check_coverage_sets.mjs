#!/usr/bin/env node
/**
 * 覆盖率口径核对器 v2（2026-10-15，按方轩诚 F1 审计意见重写）
 *
 * 相比 v1 的修正（v1 多抽检查存在字符串解构 bug——`for (const [i,k] of envKeys)`
 * 把 "0:tax_included" 解构成字符，多抽候选永远为空；方以隔离负例证实）：
 *   ① 多抽检查改为按键拆分（indexOf 切第一个冒号），负例可检出
 *   ② 外层遍历 Gold manifest（combined-manifest 30 份）：缺整信封＝Gold 期望全记 miss，分母不丢
 *   ③ 事件对齐弃数组序号，改业务自然键（质押：类型+出质人+质权人+方向；中标：类型+主体+项目；
 *      股权变动：类型+主体+方向）；键冲突/未匹配＝对齐冲突单列并阻断成功，不猜
 *   ④ 退出语义：仅当 miss=0 ∧ extra=0 ∧ 对齐无冲突 ∧ Gold 文档数>0 才 0；无 Gold/坏 Gold 不计成功
 *
 * 用法：node scripts/jingguan/check_coverage_sets.mjs [--data <信封目录>] [--json <输出.json>]
 */
import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const rootRel = p => (isAbsolute(p) ? p : join(REPO_ROOT, p)) // 绝对路径直用，相对路径锚仓库根
const argv = process.argv.slice(2)
let dataDir = 'workspace/cjh/page_prototype/data_unified', outFile = null, manifestFile = 'corpus/combined-manifest.json'
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--data') dataDir = argv[++i]
  else if (argv[i] === '--json') outFile = argv[++i]
  else if (argv[i] === '--manifest') manifestFile = argv[++i]
  else { console.error(`未知参数：${argv[i]}`); process.exit(2) }
}

const man = JSON.parse(readFileSync(rootRel(manifestFile), 'utf8'))
// gold 路径＝清单所在目录相对（真实清单在 corpus/ 下：corpus/＋zongbowen/…＝现行布局；测试清单任意目录同样成立）
const goldBase = dirname(rootRel(manifestFile))

// 事件业务自然键（禁数组序号；键取不到＝无法对齐，如实报）。
// value 优先（归一后两侧同形——方审计 event_key 同形态）；raw_value 是原文截段，两侧形态不一，仅作兜底
const fv = (fields, name) => {
  const f = fields?.[name]
  return String(f?.value ?? f?.raw_value ?? '').trim()
}
function bizKey(eventType, fields) {
  if (eventType === 'pledge') return ['pledge', fv(fields, 'pledgor'), fv(fields, 'pledgee'), fv(fields, 'direction')].join('∥')
  if (eventType === 'award_contract') return ['award', fv(fields, 'tenderer'), fv(fields, 'project_name')].join('∥')
  if (eventType === 'equity_change') return ['equity', fv(fields, 'holder'), fv(fields, 'direction')].join('∥')
  return [eventType, ''].join('∥')
}
const splitKey = key => { const ix = key.indexOf(':'); return [key.slice(0, ix), key.slice(ix + 1)] }

let both = 0, miss = [], extra = [], alignConflicts = [], noGold = [], outOfScope = []
const statusCross = {}
const envFiles = new Set(readdirSync(rootRel(dataDir)).filter(f => f.endsWith('.json')))

for (const it of man.items) {
  const caseId = it.case_id
  const goldFile = join(goldBase, it.gold)
  const envFile = join(rootRel(dataDir), `${caseId}.json`)
  let gold
  try { gold = JSON.parse(readFileSync(goldFile, 'utf8')) } catch (e) { noGold.push(`${caseId}(gold读失败:${e.message.slice(0, 40)})`); continue }

  // 信封侧：缺整文件＝Gold 全部期望字段记 miss（分母保留）
  let env = null
  if (existsSync(envFile)) env = JSON.parse(readFileSync(envFile, 'utf8'))
  else { for (const ev of gold.events ?? []) for (const [k, v] of Object.entries(ev.fields ?? {})) { const gs = v?.status ?? (v?.value != null ? 'extracted' : 'unknown'); if (gs === 'extracted') miss.push(`${caseId} [缺整信封] ${k}`) } ; continue }

  // 业务键对齐（双向）
  const goldByKey = new Map()
  for (const ev of gold.events ?? []) {
    const k = bizKey(ev.event_type, ev.fields)
    if (goldByKey.has(k)) alignConflicts.push(`${caseId} gold 键碰撞: ${k.slice(0, 60)}`)
    goldByKey.set(k, ev)
  }
  const envByKey = new Map()
  for (const ev of env.events ?? []) {
    const k = bizKey(ev.event_type, ev.fields)
    if (envByKey.has(k)) alignConflicts.push(`${caseId} 信封键碰撞: ${k.slice(0, 60)}`)
    envByKey.set(k, ev)
  }
  for (const k of new Set([...goldByKey.keys(), ...envByKey.keys()])) {
    const g = goldByKey.get(k), e = envByKey.get(k)
    if (!g) { for (const [fn, v] of Object.entries(e.fields ?? {})) if (v?.status === 'extracted') extra.push(`${caseId} [信封多出事件] ${fn}`) ; continue }
    if (!e) { for (const [fn, v] of Object.entries(g.fields ?? {})) { const gs = v?.status ?? (v?.value != null ? 'extracted' : 'unknown'); if (gs === 'extracted') miss.push(`${caseId} [信封缺事件 ${k.slice(0, 40)}] ${fn}`) } ; continue }
    // 同键事件逐字段
    const envExtracted = new Set()
    for (const [fn, v] of Object.entries(e.fields ?? {})) {
      if (v?.status === 'extracted') envExtracted.add(fn)
      statusCross[`${caseId}∣${k}∣${fn}`] = [v?.status, null]
    }
    for (const [fn, v] of Object.entries(g.fields ?? {})) {
      const gs = typeof v === 'object' ? (v?.status ?? (v?.value != null ? 'extracted' : 'unknown')) : (v != null ? 'extracted' : 'unknown')
      const ck = `${caseId}∣${k}∣${fn}`
      if (statusCross[ck]) statusCross[ck][1] = gs
      if (gs === 'extracted') { if (envExtracted.has(fn)) both++; else miss.push(`${caseId} ${fn}`) }
    }
    for (const fn of envExtracted) {
      const c = statusCross[`${caseId}∣${k}∣${fn}`]
      if (!c || c[1] !== 'extracted') extra.push(`${caseId} ${fn}(gold=${c ? c[1] : 'gold无此字段'})`)
    }
  }
}
// 信封目录里有、manifest 外的件（如演示件/扫描件）：范围外单列，不冒充成功也不误报
for (const f of envFiles) { const c = f.replace('.json', ''); if (!man.items.some(it => it.case_id === c)) outOfScope.push(c) }

const cross = {}
for (const [key, [e, g]] of Object.entries(statusCross)) { if (!g) continue; const kk = `${e}→${g}`; cross[kk] = (cross[kk] ?? 0) + 1; }

const summary = {
  checked_on: new Date().toISOString().slice(0, 10),
  envelopes_dir: dataDir,
  gold_docs: man.items.length,
  both_extracted: both,
  miss_candidates: miss,
  extra_candidates: extra,
  align_conflicts: alignConflicts,
  no_gold: noGold,
  out_of_scope: outOfScope,
  cross_table: cross,
  alignment: '业务自然键（类型+主体+对手方/项目+方向）；禁数组序号',
  basis_note: 'Gold＝corpus/zongbowen/*/gold（宗独立维护，开发不可改）；外层遍历 manifest，缺整信封保留 Gold 分母',
}
console.log(`[口径核对v2] gold文档=${man.items.length}｜both=${both}｜漏抽=${miss.length}｜多抽=${extra.length}｜对齐冲突=${alignConflicts.length}｜范围外=${outOfScope.length}`)
if (miss.length) console.log('  miss 样例:', miss.slice(0, 5).join('; '))
if (extra.length) console.log('  extra 样例:', extra.slice(0, 5).join('; '))
if (alignConflicts.length) console.log('  对齐冲突:', alignConflicts.slice(0, 5).join('; '))
console.log(`[交叉表] ${JSON.stringify(cross)}`)
if (outFile) { writeFileSync(rootRel(outFile), JSON.stringify(summary, null, 1), 'utf8'); console.log(`[报告] ${outFile}`) }
const ok = miss.length === 0 && extra.length === 0 && alignConflicts.length === 0 && man.items.length > 0 && noGold.length === 0
process.exit(ok ? 0 : 1)
