#!/usr/bin/env node
/**
 * 三层运行一致性比对（D12：修后回归 / 并发一致性 / 缓存重放确定性）
 *
 * 口径对齐宗 D12 评测计划与 D11 cold-run-verification：
 * - 值层（主判据）：事件按自然键配对后，凡任一侧有值的字段槽 value 必须相等
 * - 业务字段层：全部字段的 value+status；null↔null 的状态翻转不计值层失败，逐条列出归因
 * - 含 note 层（逐字节）：events 数组 JSON 序列化相等
 *
 * 用法：node scripts/jingguan/compare_runs.mjs <信封目录A> <信封目录B> [--out <报告.json>]
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

const argv = process.argv.slice(2)
const args = { a: argv[0], b: argv[1], out: null }
for (let i = 2; i < argv.length; i++) {
  if (argv[i] === '--out') args.out = argv[++i]
  else { console.error(`未知参数：${argv[i]}`); process.exit(2) }
}
if (!args.a || !args.b) { console.error('用法：compare_runs.mjs <信封目录A> <信封目录B> [--out 报告.json]'); process.exit(2) }

const loadDir = (d) => {
  const out = {}
  for (const f of readdirSync(resolve(REPO_ROOT, d))) {
    if (!f.endsWith('.json')) continue
    out[f.replace(/\.json$/, '')] = JSON.parse(readFileSync(resolve(REPO_ROOT, d, f), 'utf8'))
  }
  return out
}
const A = loadDir(args.a)
const B = loadDir(args.b)

/** 事件自然键（与抽取器分块去重键同族：主体×对手方×方向×区分量） */
function eventKey(ev) {
  const f = ev.fields ?? {}
  const base = `${f.pledgor?.value ?? f.holder?.value ?? f.bidder?.value ?? '?'}|${f.pledgee?.value ?? f.tenderer?.value ?? ''}|${f.direction?.value ?? 'pledge'}`
  const diff = ev.event_type === 'award_contract' ? String(f.project_name?.value ?? '')
    : ev.event_type === 'equity_change' ? String(f.shares_before?.value ?? '') : ''
  return `${base}|${diff}`
}
function pairEvents(ea, eb) {
  const mb = new Map(eb.map((e) => [eventKey(e), e]))
  const pairs = []
  for (const e of ea) {
    const m = mb.get(eventKey(e))
    pairs.push([e, m ?? null])
    if (m) mb.delete(eventKey(e))
  }
  for (const e of mb.values()) pairs.push([null, e])
  return pairs
}

let docsSameByte = 0, docsSameBiz = 0, valueSlots = 0, valueSlotsDiffer = 0
const bizDiff = [], statusFlips = [], eventCountMismatch = []

for (const name of Object.keys(A)) {
  if (!B[name]) continue
  const ea = A[name].events ?? [], eb = B[name].events ?? []
  if (JSON.stringify(ea) === JSON.stringify(eb)) docsSameByte++
  if (ea.length !== eb.length) eventCountMismatch.push(`${name}：${ea.length} vs ${eb.length}`)
  let bizSame = true
  for (const [x, y] of pairEvents(ea, eb)) {
    if (x === null || y === null) { bizSame = false; continue }
    const fields = new Set([...Object.keys(x.fields ?? {}), ...Object.keys(y.fields ?? {})])
    for (const fk of fields) {
      const fa = x.fields[fk] ?? {}, fb = y.fields[fk] ?? {}
      const aHas = fa.value !== null && fa.value !== undefined, bHas = fb.value !== null && fb.value !== undefined
      if (aHas || bHas) {
        valueSlots++
        if (JSON.stringify(fa.value) !== JSON.stringify(fb.value)) { valueSlotsDiffer++; bizSame = false; bizDiff.push(`${name} ${eventKey(x).slice(0, 40)} ${fk}：${JSON.stringify(fa.value)} vs ${JSON.stringify(fb.value)}`) }
      }
      if (fa.status !== fb.status) {
        bizSame = false
        if (!aHas && !bHas) statusFlips.push(`${name} ${eventKey(x).slice(0, 40)} ${fk}：${fa.status} ↔ ${fb.status}（值 null/null）`)
        else bizDiff.push(`${name} ${fk} 状态：${fa.status} vs ${fb.status}（有值字段）`)
      }
    }
  }
  if (bizSame && JSON.stringify(ea) === JSON.stringify(eb)) docsSameBiz++
  else if (bizSame && ea.length === eb.length) docsSameBiz++
}

const report = {
  compared_on: new Date().toISOString().slice(0, 10),
  dirs: { a: args.a, b: args.b },
  docs: Object.keys(A).length,
  events_byte_identical: docsSameByte,
  business_identical: docsSameBiz,
  value_slots_total: valueSlots,
  value_slots_differ: valueSlotsDiffer,
  event_count_mismatch: eventCountMismatch,
  status_flips_null_null: statusFlips,
  business_diffs: bizDiff,
}
const line = `值槽 ${valueSlots - valueSlotsDiffer}/${valueSlots} 一致（差异 ${valueSlotsDiffer}）｜业务同构 ${docsSameBiz}/${report.docs}｜events 逐字节 ${docsSameByte}/${report.docs}｜null状态翻转 ${statusFlips.length} 条`
console.log(line)
if (statusFlips.length) statusFlips.forEach((s) => console.log('  [翻转] ' + s))
if (bizDiff.length) bizDiff.slice(0, 10).forEach((s) => console.log('  [值差] ' + s))
if (args.out) {
  writeFileSync(resolve(REPO_ROOT, args.out), JSON.stringify(report, null, 1), 'utf8')
  console.log(`[报告] ${args.out}`)
}
process.exit(valueSlotsDiffer === 0 && eventCountMismatch.length === 0 ? 0 : 1)
