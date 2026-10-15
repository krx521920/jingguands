#!/usr/bin/env node
/**
 * 覆盖率口径核对器（2026-10-15，对应陈《分母口径调整建议》×张《解析侧独立核验》之争）
 *
 * 独立复算三件事（不经页面、不经引擎标签自证）：
 *   ① 信封 extracted 集 vs Gold extracted 集——双向差集（漏抽/多抽候选）
 *   ② 信封状态 × Gold 判定交叉表（与陈§三表格对照）
 *   ③ 判定差异清单（信封≠Gold 的逐条位置）
 *
 * 用法：node scripts/jingguan/check_coverage_sets.mjs [--data <信封目录>] [--json <输出.json>]
 * 默认信封目录＝页面权威批 data_unified/；Gold 经 corpus/combined-manifest.json 映射到
 * corpus/zongbowen/<批>/gold/<case>.envelope.json（宗独立维护，开发不可改——独立性来源）。
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const argv = process.argv.slice(2)
let dataDir = 'workspace/cjh/page_prototype/data_unified', outFile = null
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--data') dataDir = argv[++i]
  else if (argv[i] === '--json') outFile = argv[++i]
  else { console.error(`未知参数：${argv[i]}`); process.exit(2) }
}

const man = JSON.parse(readFileSync(join(REPO_ROOT, 'corpus/combined-manifest.json'), 'utf8'))
const goldPath = new Map(man.items.map(it => [it.case_id, it.gold.replace(/^zongbowen\//, 'corpus/zongbowen/')]))
const files = readdirSync(join(REPO_ROOT, dataDir)).filter(f => f.endsWith('.json'))

let both = 0, goldOnly = [], envOnly = [], diffs = [], noGold = []
const statusCross = {}
for (const f of files) {
  const caseId = f.replace('.json', '')
  const env = JSON.parse(readFileSync(join(REPO_ROOT, dataDir, f), 'utf8'))
  const gp = goldPath.get(caseId)
  if (!gp) { noGold.push(caseId); continue }
  let gold
  try { gold = JSON.parse(readFileSync(join(REPO_ROOT, gp), 'utf8')) } catch (e) { noGold.push(`${caseId}(gold读失败)`); continue }
  const envKeys = new Set()
  env.events.forEach((ev, i) => {
    for (const [k, v] of Object.entries(ev.fields ?? {})) {
      if (v?.status === 'extracted') envKeys.add(`${i}:${k}`)
      statusCross[`${caseId}:${i}:${k}`] = [v?.status, null]
    }
  })
  ;(gold.events ?? []).forEach((ev, i) => {
    for (const [k, v] of Object.entries(ev.fields ?? {})) {
      const gs = typeof v === 'object' ? (v?.status ?? (v?.value != null ? 'extracted' : 'unknown')) : (v != null ? 'extracted' : 'unknown')
      const key = `${caseId}:${i}:${k}`
      if (statusCross[key]) statusCross[key][1] = gs
      if (gs === 'extracted') { if (envKeys.has(`${i}:${k}`)) both++; else goldOnly.push(`${caseId} E${i + 1}.${k}`) }
    }
  })
  for (const [i, k] of envKeys) {
    const c = statusCross[`${caseId}:${i}:${k}`]
    if (c && c[1] !== 'extracted') envOnly.push(`${caseId} E${+i + 1}.${k}`)
  }
}
const cross = {}
for (const [key, [e, g]] of Object.entries(statusCross)) {
  if (!g) continue
  const kk = `${e}→${g}`
  cross[kk] = (cross[kk] ?? 0) + 1
  if (e !== g) diffs.push({ field: key, envelope: e, gold: g })
}

const summary = {
  checked_on: new Date().toISOString().slice(0, 10),
  envelopes_dir: dataDir,
  both_extracted: both,
  miss_candidates: goldOnly,   // gold 有值而信封非 extracted（漏抽候选）
  extra_candidates: envOnly,   // 信封 extracted 而 gold 非（多抽候选）
  not_compared: noGold,
  cross_table: cross,
  judgment_diffs: diffs,       // 信封≠Gold 的逐条（标签语义差异）
  basis_note: 'Gold＝corpus/zongbowen/*/gold（宗独立维护，开发不可改）；独立性来源＝分工规则 §六.8',
}
console.log(`[口径核对] both=${both}｜漏抽候选=${goldOnly.length}｜多抽候选=${envOnly.length}｜未对照=${noGold.length}｜判定差异=${diffs.length}`)
console.log(`[交叉表] ${JSON.stringify(cross)}`)
if (diffs.length) for (const d of diffs) console.log(`  差异 ${d.field}: 信封=${d.envelope} gold=${d.gold}`)
if (outFile) {
  writeFileSync(resolve(REPO_ROOT, outFile), JSON.stringify(summary, null, 1), 'utf8')
  console.log(`[报告] ${outFile}`)
}
process.exit(goldOnly.length === 0 && envOnly.length === 0 ? 0 : 1)
