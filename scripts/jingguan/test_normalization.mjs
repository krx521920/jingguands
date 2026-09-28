#!/usr/bin/env node
/**
 * 标准化移植验收测试——跑方轩诚的 10 个换算用例（她的 D1 产物，
 * 来源 feature/fang-rules c856882:tests/fixtures/normalization_cases.json）。
 * 任何一条不过＝移植不忠实，禁止接入主链。
 *
 * 用法：node scripts/jingguan/test_normalization.mjs
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fangNormalize } from './lib/fang_normalize.mjs'

const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const cases = JSON.parse(readFileSync(resolve(REPO_ROOT, 'scripts/jingguan/testdata/normalization_cases.json'), 'utf8'))

let failed = 0
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
      failed++
      console.log(`✗ ${c.id}[${i}] 抛错：${err}`)
      return
    }
    const valueOk = actual.value === expected.value
    const unitOk = actual.unit === expected.unit
    const statusOk = actual.status === expected.status
    const qualifierOk = (actual.qualifier ?? null) === (expected.qualifier ?? null)
    const scopeOk = actual.scope === expected.scope
    const denOk = JSON.stringify(actual.denominator ?? null) === JSON.stringify(expected.denominator ?? null)
    if (valueOk && unitOk && statusOk && qualifierOk && scopeOk && denOk) {
      console.log(`✓ ${c.id}[${i}] value=${JSON.stringify(actual.value)} unit=${actual.unit} status=${actual.status}${actual.qualifier ? ' qualifier=' + actual.qualifier : ''}`)
    } else {
      failed++
      const exp = JSON.stringify(expected)
      const act = JSON.stringify({ value: actual.value, unit: actual.unit, status: actual.status, qualifier: actual.qualifier, scope: actual.scope, denominator: actual.denominator })
      console.log(`✗ ${c.id}[${i}] 期望 ${exp}`)
      console.log(`        实际 ${act}`)
    }
  })
}

const total = cases.reduce((n, c) => n + c.inputs.length, 0)
console.log(failed === 0 ? `全部通过：${total} 条（方轩诚 10 用例验收）` : `失败：${failed}/${total}`)
process.exit(failed === 0 ? 0 : 1)
