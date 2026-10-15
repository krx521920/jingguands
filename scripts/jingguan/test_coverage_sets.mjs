#!/usr/bin/env node
/**
 * check_coverage_sets 核对器的负例回归（按方 F1 §五建议；对应 v1 的多抽漏报教训）
 *
 * 七个负例，全部构造在临时目录（不触碰仓库数据）：
 *   1. 多抽（gold not_mentioned，信封 extracted）——v1 死循环漏报的原案，必须报 1 条 extra
 *   2. 漏抽（gold extracted，信封 not_mentioned）——伪弃权必须留分母
 *   3. 缺整事件（gold 两事件，信封一事件）——该事件期望字段全记 miss
 *   4. 缺整信封（manifest 有、目录无）——Gold 期望全记 miss，不静默
 *   5. 事件重排（信封两事件顺序对调）——业务键对齐后结果与顺序无关
 *   6. 键碰撞（gold 两事件同键）——对齐冲突，退出非 0
 *   7. 零 Gold（manifest 空）——不得按全量成功退出
 */
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const TMP = join(REPO_ROOT, 'runs/.tmp-cc-test')
const SCRIPT = join(REPO_ROOT, 'scripts/jingguan/check_coverage_sets.mjs')
let passed = 0, failed = 0

const F = (status, value) => ({ status, raw_value: value ?? null, value: value ?? null })
const pledgor = { pledgor: F('extracted', '张三'), pledgee: F('extracted', '李四'), direction: F('extracted', 'pledge') }

function setup({ goldEvents, envEvents = null, omitEnv = false, manifestItems = null, goldEvents2 = null }) {
  rmSync(TMP, { recursive: true, force: true })
  mkdirSync(join(TMP, 'zongbowen/g'), { recursive: true }) // 清单相对布局：gold 在清单同目录的 zongbowen/ 下
  mkdirSync(join(TMP, 'env'), { recursive: true })
  const items = manifestItems ?? [{ case_id: 'T1', gold: 'zongbowen/g/T1.envelope.json' }]
  writeFileSync(join(TMP, 'manifest.json'), JSON.stringify({ items }))
  writeFileSync(join(TMP, 'zongbowen/g/T1.envelope.json'), JSON.stringify({ events: goldEvents }))
  if (goldEvents2) writeFileSync(join(TMP, 'zongbowen/g/T2.envelope.json'), JSON.stringify({ events: goldEvents2 }))
  if (!omitEnv && envEvents) writeFileSync(join(TMP, 'env/T1.json'), JSON.stringify({ events: envEvents }))
}

function run() {
  let code = 0, out = ''
  try {
    out = execFileSync(process.execPath, [SCRIPT, '--data', join(TMP, 'env'), '--manifest', join(TMP, 'manifest.json'), '--json', join(TMP, 'r.json')], { encoding: 'utf8' })
  } catch (e) { code = e.status ?? 1; out = String(e.stdout ?? '') + String(e.stderr ?? '') }
  let r = null
  try { r = JSON.parse(readFileSync(join(TMP, 'r.json'), 'utf8')) } catch { /* 报告未写出＝运行即崩 */ }
  return { code, out, r }
}

function check(name, cond, detail) {
  if (cond) { passed++; console.log(`✓ ${name}`) } else { failed++; console.log(`✗ ${name} ${detail ?? ''}`) }
}

// 1. 多抽
setup({ goldEvents: [{ event_type: 'pledge', fields: { ...pledgor, tax_included: F('not_mentioned') } }], envEvents: [{ event_type: 'pledge', fields: { ...pledgor, tax_included: F('extracted', '含税') } }] })
let x = run()
check('1 多抽报1条', x.r?.extra_candidates?.length === 1, JSON.stringify(x.r?.extra_candidates))
check('1 退出非0', x.code !== 0)

// 2. 漏抽（伪弃权）
setup({ goldEvents: [{ event_type: 'pledge', fields: { ...pledgor, pledge_amount: F('extracted', '1000万') } }], envEvents: [{ event_type: 'pledge', fields: { ...pledgor, pledge_amount: F('not_mentioned') } }] })
x = run()
check('2 伪弃权记miss', x.r?.miss_candidates?.length === 1 && x.r.miss_candidates[0].includes('pledge_amount'))

// 3. 缺整事件
setup({
  goldEvents: [
    { event_type: 'pledge', fields: { ...pledgor, pledge_amount: F('extracted', '1000万') } },
    { event_type: 'pledge', fields: { pledgor: F('extracted', '王五'), pledgee: F('extracted', '赵六'), direction: F('extracted', 'pledge'), pledge_amount: F('extracted', '2000万') } },
  ],
  envEvents: [{ event_type: 'pledge', fields: { ...pledgor, pledge_amount: F('extracted', '1000万') } }],
})
x = run()
check('3 缺事件全记miss', x.r?.miss_candidates?.length === 4 && x.r.miss_candidates.every(m => m.includes('信封缺事件')), JSON.stringify(x.r?.miss_candidates?.length))

// 4. 缺整信封
setup({ goldEvents: [{ event_type: 'pledge', fields: { ...pledgor, pledge_amount: F('extracted', '1000万') } }], omitEnv: true })
x = run()
check('4 缺信封记miss', x.r?.miss_candidates?.length === 4 && x.r.miss_candidates.every(m => m.includes('缺整信封')), JSON.stringify(x.r?.miss_candidates?.length))
check('4 退出非0', x.code !== 0)

// 5. 事件重排（业务键对齐，结果不变）
const eA = { event_type: 'pledge', fields: { ...pledgor, pledge_amount: F('extracted', '1000万') } }
const eB = { event_type: 'pledge', fields: { pledgor: F('extracted', '王五'), pledgee: F('extracted', '赵六'), direction: F('extracted', 'pledge'), pledge_amount: F('extracted', '2000万') } }
setup({ goldEvents: [eA, eB], envEvents: [eB, eA] })
x = run()
check('5 重排不误报', x.r?.miss_candidates?.length === 0 && x.r?.extra_candidates?.length === 0 && x.code === 0)

// 6. 键碰撞
setup({
  goldEvents: [eA, { event_type: 'pledge', fields: { ...pledgor, pledge_amount: F('extracted', '3000万') } }],
  envEvents: [eA],
})
x = run()
check('6 键碰撞阻断', x.r?.align_conflicts?.length >= 1 && x.code !== 0)

// 7. 零 Gold
setup({ goldEvents: [eA], envEvents: [eA], manifestItems: [] })
x = run()
check('7 空manifest不成功', x.code !== 0)

rmSync(TMP, { recursive: true, force: true })
console.log(failed === 0 ? `\n全部通过：${passed} 项负例` : `\n失败 ${failed}/${passed + failed}`)
process.exit(failed === 0 ? 0 : 1)
