#!/usr/bin/env node
/**
 * 共同契约校验器——任何模块的事件输出，提交前必须通过本命令。
 *
 * 用法：
 *   node scripts/jingguan/validate_envelope.mjs runs/20260927xxxx-pledge-xxxx/events.json [更多文件…]
 *   node scripts/jingguan/validate_envelope.mjs            # 不带参数＝校验 runs/ 下全部 events.json
 *   npm run jingguan:validate                              # 等价于上一条
 *
 * 校验内容：
 *   1. interface/event-envelope.schema.json（v0.3）全部结构约束；
 *   2. 字段注册表强制（scripts/jingguan/lib/registry.mjs）：字段名白名单、unit 一致、
 *      比例字段 denominator 的 fixed/requires 约定。
 *   3. 出处基线断言（scripts/jingguan/lib/checks.mjs）：region 必须 left<right、top<bottom、非负。
 * 退出码：全部通过 0；任一失败 1。
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { validateAgainstSchema } from './lib/schema_validator.mjs'
import { checkRegistry } from './lib/registry.mjs'
import { checkProvenance, checkEquityDirection } from './lib/checks.mjs'

const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const SCHEMA_PATH = resolve(REPO_ROOT, 'interface', 'event-envelope.schema.json')
const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'))

function collectTargets(args) {
  if (args.length > 0) {
    return args.map((a) => resolve(process.cwd(), a))
  }
  const runsDir = resolve(REPO_ROOT, 'runs')
  if (!existsSync(runsDir)) return []
  return readdirSync(runsDir)
    .map((d) => join(runsDir, d, 'events.json'))
    .filter((p) => existsSync(p))
}

const targets = collectTargets(process.argv.slice(2))
if (targets.length === 0) {
  console.log('没有找到待校验的 events.json（可显式传文件路径，或确认 runs/ 下有输出）。')
  process.exit(0)
}

let failed = 0
for (const target of targets) {
  let instance
  try {
    instance = JSON.parse(readFileSync(target, 'utf8'))
  } catch (err) {
    console.log(`✗ ${target}\n  JSON 解析失败：${err.message}`)
    failed++
    continue
  }
  const issues = [
    ...validateAgainstSchema(instance, schema, schema),
    ...checkRegistry(instance),
    ...checkProvenance(instance),
    ...checkEquityDirection(instance),
  ]
  const rel = target.includes('runs') ? 'runs/' + target.split(/[\\/]runs[\\/]/)[1] : target
  if (issues.length === 0) {
    console.log(`✓ ${rel}（schema v${instance.schema_version ?? '?'}，${instance.events?.length ?? 0} 事件）`)
  } else {
    failed++
    console.log(`✗ ${rel}（${issues.length} 个问题）`)
    for (const issue of issues) console.log(`    - ${issue}`)
  }
}

console.log(failed === 0 ? `全部通过：${targets.length} 个文件` : `失败：${failed}/${targets.length} 个文件`)
process.exit(failed === 0 ? 0 : 1)
