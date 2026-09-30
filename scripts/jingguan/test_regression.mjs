#!/usr/bin/env node
/**
 * 抽取行为回归（D4 正式交付物）——固化多事件/万股/release/条件性日期四类关键行为。
 *
 * 数据：scripts/jingguan/testdata/regression/*.json（从 2026-09-30 挑战批次真实运行精选，
 * 场景即宗博文 D4 十份挑战集的考点）。契约形态回归＋关键值断言，不调模型、稳定可重跑：
 * 任何 prompt/标准化/契约改动若破坏这些行为，本测试当场红灯。
 *
 * 用法：npm run jingguan:test-regression
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { validateAgainstSchema } from './lib/schema_validator.mjs'
import { checkRegistry } from './lib/registry.mjs'
import { checkProvenance } from './lib/checks.mjs'

const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const REG_DIR = join(REPO_ROOT, 'scripts/jingguan/testdata/regression')
const SCHEMA = JSON.parse(readFileSync(join(REPO_ROOT, 'interface/event-envelope.schema.json'), 'utf8'))

let failed = 0
const check = (ok, msg) => { if (ok) console.log(`  ✓ ${msg}`); else { failed++; console.log(`  ✗ ${msg}`) } }

function contractOK(env, name) {
  const issues = [
    ...validateAgainstSchema(env, SCHEMA, SCHEMA),
    ...checkRegistry(env),
    ...checkProvenance(env),
  ]
  check(issues.length === 0, `${name}：schema/注册表/出处全过（${issues.length} 问题${issues.length ? '：' + issues[0] : ''}）`)
}

const load = (f) => JSON.parse(readFileSync(join(REG_DIR, f), 'utf8'))
const fieldsOf = (env, id) => env.events.find((e) => e.event_id === id)?.fields ?? {}

// ---- 1. 多事件（万集科技 3 事件，按质权人拆分）----
{
  const env = load('multi-event-pledge.json')
  console.log('[1] 多事件')
  contractOK(env, '多事件')
  check(env.events.length === 3, `3 个事件（实际 ${env.events.length}）`)
  const pledgees = env.events.map((e) => e.fields.pledgee?.value)
  check(new Set(pledgees).size === 3, '三个质权人互不相同')
  check(fieldsOf(env, 'E01').pledged_shares_this_time?.value === 2100000, 'E01 本次股数 2,100,000')
  check(env.events.every((e) => e.fields.direction?.value === 'pledge'), '全部 direction=pledge')
}

// ---- 2. 万股感知（364.00万股 → 3,640,000）----
{
  const env = load('wan-gu-unit.json')
  console.log('[2] 万股感知')
  contractOK(env, '万股')
  check(fieldsOf(env, 'E01').pledged_shares_this_time?.value === 3640000, `本次股数 3,640,000（实际 ${fieldsOf(env, 'E01').pledged_shares_this_time?.value}）`)
  check(fieldsOf(env, 'E01').pledged_shares_this_time?.standardized === true, 'standardized=true')
}

// ---- 3. release 混合（质押+解除，3 事件；已知锚点差异单列）----
{
  const env = load('release-mixed.json')
  console.log('[3] release 混合')
  contractOK(env, 'release')
  const dirs = env.events.map((e) => e.fields.direction?.value)
  check(env.events.length === 3, `3 个事件·无重复拆分（实际 ${env.events.length}）`)
  check(dirs.filter((d) => d === 'release').length === 1, `恰一个 release 事件（directions: ${dirs.join(',')}）`)
  const names = env.events.map((e) => e.fields.pledgor?.value)
  check(new Set(names).size === 1 && names[0] === '有格创业投资有限公司', '主体全称统一（全称/简称不各建一份）')
  const rel = env.events.find((e) => e.fields.direction?.value === 'release')
  check(rel?.fields.start_date?.status === 'not_mentioned', 'release 无起始日 → not_mentioned')
  // 已知锚点差异（D4 登记，待与宗博文对齐句子级锚定规则）：模型锚定"Y的18,564,000股已解除质押"句，
  // gold 锚定"本次将19,254,000股办理了质押解除手续"句（两值差=其中69万股组成部分）。锁定当前值防退化，不判对错。
  check(rel?.fields.pledged_shares_this_time?.value === 18564000, `release 数量锁定当前锚点 18,564,000（gold 总量句 19,254,000——已知差异见注释）`)
}

// ---- 4. 条件性日期（非特定到期日 → needs_review 不编造）----
{
  const env = load('conditional-date.json')
  console.log('[4] 条件性日期')
  contractOK(env, '条件日期')
  const ed = fieldsOf(env, 'E01').end_date
  check(ed?.status === 'needs_review' && ed?.value === null, `end_date needs_review+null（实际 ${ed?.status}/${ed?.value}）`)
  check(typeof ed?.raw_value === 'string' && ed.raw_value.length > 0, 'raw_value 保留原文描述')
}

// ---- 5. 扫描降级（零可读文本→全 unreadable，不调模型不编造）----
{
  const env = load('scan-degraded.json')
  console.log('[5] 扫描降级')
  contractOK(env, '扫描')
  const f = env.events[0].fields
  check(Object.values(f).every((fv) => fv.status === 'unreadable'), '全部字段 unreadable')
  check(Object.values(f).every((fv) => fv.value === null), '零字段值（不编造）')
  check(env.run_meta.model === null, '未调用模型')
  check(env.events[0].extraction_method === 'rule', 'extraction_method=rule（诚实降级非模型输出）')
}

console.log(failed === 0 ? '\n全部通过：抽取行为回归（5 场景）' : `\n失败 ${failed} 项`)
process.exit(failed === 0 ? 0 : 1)
