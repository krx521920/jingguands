#!/usr/bin/env node
/**
 * 标准化移植验收测试——跑方轩诚的换算用例（D1 版 10 组 +
 * D2 扩充版 20 组，来源 feature/fang-rules c856882 / 24b7656）。
 * 任何一条不过＝移植不忠实，禁止接入主链。
 *
 * 用法：node scripts/jingguan/test_normalization.mjs [用例JSON路径]
 *   缺省依次跑 D1 与 D2 两套用例。
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fangNormalize } from './lib/fang_normalize.mjs'

const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const caseFiles = process.argv.length > 2
  ? [resolve(process.cwd(), process.argv[2])]
  : [
      resolve(REPO_ROOT, 'scripts/jingguan/testdata/normalization_cases.json'),
      resolve(REPO_ROOT, 'scripts/jingguan/testdata/normalization_cases_d2.json'),
    ].filter(existsSync)
if (caseFiles.length === 0) { console.error('找不到用例文件'); process.exit(2) }

let failed = 0
let totalAll = 0
for (const caseFile of caseFiles) {
  const label = caseFile.includes('_d2') ? 'D2' : 'D1'
  const cases = JSON.parse(readFileSync(caseFile, 'utf8'))
  let failedThis = 0
  const errors = []
  for (const c of cases) {
    c.inputs.forEach((input, i) => {
    const expected = c.expected[i]
    let actual = null
    let err = null
    try {
      actual = fangNormalize(input)
    } catch (e) {
      err = e.message
    }
    if (err !== null) {
      failedThis++
      errors.push(`${label} ${c.id}[${i}] 抛错：${err}`)
      return
    }
    const valueOk = actual.value === expected.value
    const unitOk = actual.unit === expected.unit
    const statusOk = actual.status === expected.status
    const qualifierOk = (actual.qualifier ?? null) === (expected.qualifier ?? null)
    const scopeOk = actual.scope === expected.scope
    const denOk = JSON.stringify(actual.denominator ?? null) === JSON.stringify(expected.denominator ?? null)
    if (valueOk && unitOk && statusOk && qualifierOk && scopeOk && denOk) {
      console.log(`✓ ${label} ${c.id}[${i}] value=${JSON.stringify(actual.value)} unit=${actual.unit} status=${actual.status}${actual.qualifier ? ' qualifier=' + actual.qualifier : ''}`)
    } else {
      failedThis++
      const exp = JSON.stringify(expected)
      const act = JSON.stringify({ value: actual.value, unit: actual.unit, status: actual.status, qualifier: actual.qualifier, scope: actual.scope, denominator: actual.denominator })
      errors.push(`${label} ${c.id}[${i}] 期望 ${exp}｜实际 ${act}`)
    }
  })
  }
  const total = cases.reduce((n, c) => n + c.inputs.length, 0)
  totalAll += total
  failed += failedThis
  if (failedThis > 0) for (const e of errors) console.log(`✗ ${e}`)
  console.log(`[${label}] ${failedThis === 0 ? '全部通过' : '失败 ' + failedThis + '/' + total}：${total} 条`)
}

console.log(failed === 0 ? `全部通过：${totalAll} 条（方轩诚 D1+D2 用例验收）` : `失败：${failed}/${totalAll}`)
process.exit(failed === 0 ? 0 : 1)
