#!/usr/bin/env node
/**
 * 契约五方一致性机检（D3 审计产物）——防"改一处漏四处"的回归门。
 *
 * 交叉校验五个载体里的同一契约：
 *   1. interface/event-envelope.schema.json（JSON Schema）
 *   2. scripts/jingguan/lib/registry.mjs（JS 单一真源）
 *   3. packages/jingguan/core/src/index.ts（插件 TS 镜像）
 *   4. interface/README.md（注册表文档）
 *   5. scripts/jingguan/run_extract.mjs（mock 数据＋信封 schema_version）
 *
 * 任何一方不同步即失败。用法：node scripts/jingguan/test_contract_sync.mjs
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { EVENT_TYPES, STATUSES, FIELD_REGISTRY } from './lib/registry.mjs'

const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const issues = []
const check = (ok, msg) => { if (!ok) issues.push(msg) }

// ---------- 1. Schema ----------
const schema = JSON.parse(readFileSync(resolve(REPO_ROOT, 'interface/event-envelope.schema.json'), 'utf8'))
const schemaVersion = schema.properties.schema_version.const
const eventTypeEnum = schema.$defs.event.properties.event_type.enum
const unitEnum = schema.$defs.field_value.properties.unit.enum
const statusEnum = schema.$defs.field_value.properties.status.enum
const denomEnum = schema.$defs.field_value.properties.denominator.enum.filter((v) => v !== null)

check(JSON.stringify(EVENT_TYPES.slice().sort()) === JSON.stringify(eventTypeEnum.slice().sort()),
  `事件类型不一致：registry=${EVENT_TYPES} schema=${eventTypeEnum}`)
check(JSON.stringify(STATUSES.slice().sort()) === JSON.stringify(statusEnum.slice().sort()),
  `状态枚举不一致：registry=${STATUSES} schema=${statusEnum}`)

// ---------- 2/3. registry vs 插件 TS 镜像 ----------
const pluginSrc = readFileSync(resolve(REPO_ROOT, 'packages/jingguan/core/src/index.ts'), 'utf8')
// 截取 FIELD_REGISTRY 常量块
const regMatch = pluginSrc.match(/export const FIELD_REGISTRY[^{]*\{[\s\S]*?\n\}/)
check(regMatch !== null, '插件 TS 中找不到 FIELD_REGISTRY 块')
if (regMatch !== null) {
  for (const type of EVENT_TYPES) {
    const block = regMatch[0].match(new RegExp(`  ${type}: \\{([\\s\\S]*?)\\n  \\}`))
    check(block !== null, `插件 TS 缺少 ${type} 注册表块`)
    if (block === null) continue
    const pluginFields = {}
    for (const m of block[1].matchAll(/(\w+): \{([^}]*)\}/g)) {
      const fd = m[2].match(/fixedDenominator: '([^']+)'/)
      const unit = m[2].match(/unit: '([^']+)'/)
      pluginFields[m[1]] = { unit: unit?.[1], fixedDenominator: fd?.[1] }
    }
    const regFields = FIELD_REGISTRY[type]
    for (const name of Object.keys(regFields)) {
      const pf = pluginFields[name]
      check(pf !== undefined, `插件 TS 缺字段 ${type}.${name}`)
      if (pf !== undefined) {
        check(pf.unit === regFields[name].unit, `${type}.${name} unit 不一致：插件=${pf.unit} registry=${regFields[name].unit}`)
        check((pf.fixedDenominator ?? null) === (regFields[name].fixedDenominator ?? null),
          `${type}.${name} fixedDenominator 不一致：插件=${pf.fixedDenominator} registry=${regFields[name].fixedDenominator}`)
      }
    }
    for (const name of Object.keys(pluginFields)) {
      check(name in regFields, `插件 TS 多出注册表没有的字段 ${type}.${name}`)
    }
  }
}

// registry 内部合法性：unit/denominator 必须在 schema 枚举内
for (const [type, fields] of Object.entries(FIELD_REGISTRY)) {
  for (const [name, spec] of Object.entries(fields)) {
    check(unitEnum.includes(spec.unit), `${type}.${name} unit "${spec.unit}" 不在 schema unit 枚举内`)
    if (spec.fixedDenominator !== undefined) {
      check(denomEnum.includes(spec.fixedDenominator), `${type}.${name} fixedDenominator "${spec.fixedDenominator}" 不在 schema 分母枚举内`)
    }
  }
}

// ---------- 3b. 出处结构：schema provenance 键集 vs 插件 Provenance 接口 ----------
const provSchemaKeys = new Set(Object.keys(schema.$defs.provenance.properties))
const provInterfaceMatch = pluginSrc.match(/export interface Provenance \{([\s\S]*?)\}/)
check(provInterfaceMatch !== null, '插件 TS 缺少 Provenance 接口')
if (provInterfaceMatch !== null) {
  const pluginProvKeys = new Set([...provInterfaceMatch[1].matchAll(/^\s+(\w+)\??:/gm)].map((m) => m[1]))
  for (const k of provSchemaKeys) check(pluginProvKeys.has(k), `插件 Provenance 接口缺出处键 ${k}（schema 有）`)
  for (const k of pluginProvKeys) check(provSchemaKeys.has(k), `插件 Provenance 接口多出出处键 ${k}（schema 无）`)
}
// runner 出处回填覆盖检查在读取 runnerSrc 之后执行（见第 5 节末尾）

// ---------- 4. README 注册表文档 ----------
const readme = readFileSync(resolve(REPO_ROOT, 'interface/README.md'), 'utf8')
const readmeSections = { pledge: '### pledge 质押', equity_change: '### equity_change 股权变动', award_contract: '### award_contract' }
for (const [type, header] of Object.entries(readmeSections)) {
  const idx = readme.indexOf(header)
  check(idx !== -1, `README 缺少 ${type} 注册表章节`)
  if (idx === -1) continue
  const nextIdx = readme.indexOf('\n### ', idx + 10)
  const section = readme.slice(idx, nextIdx === -1 ? undefined : nextIdx)
  const docFields = [...section.matchAll(/^\| (\w+) \|/gm)].map((m) => m[1]).filter((f) => f !== '字段名')
  const regNames = Object.keys(FIELD_REGISTRY[type])
  for (const f of regNames) check(docFields.includes(f), `README ${type} 表缺字段 ${f}`)
  for (const f of docFields) check(regNames.includes(f), `README ${type} 表多出字段 ${f}（不在注册表）`)
}

// ---------- 5. runner mock 与信封版本 ----------
const runnerSrc = readFileSync(resolve(REPO_ROOT, 'scripts/jingguan/run_extract.mjs'), 'utf8')
check(runnerSrc.includes(`schema_version: '${schemaVersion}'`), `runner 信封 schema_version 字面量不是 '${schemaVersion}'`)
check(pluginSrc.includes(`schema_version: '${schemaVersion}'`), `插件信封 schema_version 字面量不是 '${schemaVersion}'`)
for (const type of EVENT_TYPES) {
  const block = runnerSrc.match(new RegExp(`    ${type}: \\{[\\s\\S]*?\\n    \\},`))
  check(block !== null, `runner mock 缺少 ${type} 块`)
  if (block === null) continue
  const mockFields = [...block[0].matchAll(/^ {10}(\w+):/gm)].map((m) => m[1])
  for (const f of Object.keys(FIELD_REGISTRY[type])) check(mockFields.includes(f), `runner mock ${type} 缺字段 ${f}`)
  for (const f of mockFields) check(f in FIELD_REGISTRY[type], `runner mock ${type} 多出字段 ${f}`)
}

// fang_normalize 分母映射覆盖 schema 枚举
const fangSrc = readFileSync(resolve(REPO_ROOT, 'scripts/jingguan/lib/fang_normalize.mjs'), 'utf8')
for (const d of denomEnum) check(fangSrc.includes(`${d}: { kind:`), `fang_normalize 分母映射缺 ${d}`)

// ---------- 6. runner 出处回填必须覆盖 schema 出处键 ----------
const backfillFn = runnerSrc.match(/function backfillProvenance[\s\S]*?\n\}/)
check(backfillFn !== null, 'runner 缺少 backfillProvenance 函数')
if (backfillFn !== null) {
  for (const k of provSchemaKeys) {
    if (k === 'quote') continue // quote 由模型给出并另行校验
    check(backfillFn[0].includes(`p.${k} =`) || backfillFn[0].includes(`p.${k} ??=`), `runner 出处回填未赋值 ${k}`)
  }
}

// ---------- 结果 ----------
if (issues.length === 0) {
  const total = Object.values(FIELD_REGISTRY).reduce((n, f) => n + Object.keys(f).length, 0)
  console.log(`✓ 契约五方一致：${EVENT_TYPES.length} 类事件 / ${total} 字段 / ${STATUSES.length} 状态 / schema v${schemaVersion}`)
  process.exit(0)
}
console.log(`✗ 契约不一致 ${issues.length} 处：`)
for (const i of issues) console.log(`  - ${i}`)
process.exit(1)
