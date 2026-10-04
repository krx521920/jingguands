/**
 * B 归因引擎单测（D9）——8 类内置规则＋插件链优先＋不足证据组。
 * 用法：node scripts/jingguan/test_attribution.mjs（全过退出 0）
 * 材料说明：合成冲突形状与 verifyGroup 输出逐字段一致（values[] 与 aggregate/parts 两种）；
 * 币种用例取自 D6-AWD-007 真实数字；累计用例取自科创新材勾稽真实数字；时点用例取自鸿路演示真实数字。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const node = process.execPath

// 无 --out 时 attribute_b 将完整 JSON 打印到 stdout——本测试据此解析
function attribute(groups) {
  const dir = mkdtempSync(join(tmpdir(), 'attr-test-'))
  const report = join(dir, 'r.json').replace(/\\/g, '/')
  writeFileSync(report, JSON.stringify({ results: groups }))
  const r = spawnSync(node, ['scripts/jingguan/attribute_b.mjs', '--report', report], { cwd: REPO_ROOT, encoding: 'utf8' })
  rmSync(dir, { recursive: true, force: true })
  assert.equal(r.status, 0, String(r.stderr))
  const start = r.stdout.indexOf('{')
  return JSON.parse(r.stdout.slice(start))
}

const conflictGroup = (values, quotes, field = 'pledged_shares') => ({
  group_id: 'T', predicted_relation: 'related', reasons: ['SHARED_ENTITIES_AND_ANCHORS'],
  consistency: { conflicts: [{ entity: '某公司', field, values: values.map((v, i) => ({ doc: `d${i}`, value: v, quote: quotes[i] ?? '' })) }], corroborations: [], complementaries: [] },
})
const at = (out, i = 0) => out.attributions[i]

// 1. 万/亿量级错配 → 口径·单位量级
let out = attribute([conflictGroup([150000000, 15000], ['质押1.5亿元', '质押15,000万元'])])
assert.equal(at(out).attribution, 'caliber_unit_scale'); assert.equal(at(out).decided_by, 'builtin:UNIT_SCALE_MISMATCH')

// 2. 累计 vs 单次（科创新材真实数字：合计 8,427,900 = 四分项之和）
out = attribute([{ group_id: 'T2', predicted_relation: 'related', reasons: [], consistency: { conflicts: [{ entity: '于春生等', field: 'change_shares', aggregate: { doc: 'a', value: 8427900, quote: '增持8,427,900股' }, parts: [ { doc: 'b', entity: '蔚文绪', value: 3680700, quote: '' }, { doc: 'b', entity: '马军强', value: 2975600, quote: '' }, { doc: 'b', entity: '杨占坡', value: 430000, quote: '' }, { doc: 'b', entity: '蔚文举', value: 1341600, quote: '' } ] } ] } }])
assert.equal(at(out).attribution, 'caliber_cumulative_vs_incremental')

// 3. 币种折算（AWD-007 真实数字）
out = attribute([conflictGroup([317915000, 173800000], ['中标金额为173,800,000阿联酋迪拉姆（折合人民币317,915,000元）', '合同金额317,915,000元'], 'bid_amount')])
assert.equal(at(out).attribution, 'caliber_currency')

// 4. 同句不同数（引文归一后一致）→ 真矛盾
out = attribute([conflictGroup([3680700, 368070000], ['蔚文绪减持3,680,700股', '蔚文绪减持3,680,700股'])])
assert.equal(at(out).attribution, 'true_conflict'); assert.equal(at(out).decided_by, 'builtin:SAME_QUOTE_DIFFERENT_NUMBER')

// 5. 时点衔接（鸿路真实数字：总股本 744,970,839 → 753,463,864）
out = attribute([conflictGroup([744970839, 753463864], ['公司总股本为744,970,839股', '公司总股本由744,970,839股增加至753,463,864股'], 'total_shares_before')])
assert.equal(at(out).attribution, 'temporal_progression')

// 6. 舍入/约数（相对差 0.45%）
out = attribute([conflictGroup([1000000, 1004500], ['约1,000,000元', '1,004,500元'], 'bid_amount')])
assert.equal(at(out).attribution, 'caliber_rounding')

// 7. 无法解释 → 保留疑点（不自动定矛盾）
out = attribute([conflictGroup([123456, 654321], ['质押123,456股', '质押654,321股'])])
assert.equal(at(out).attribution, 'unexplained_needs_review'); assert.equal(at(out).confidence, 'low')

// 8. 证据不足组 → 不猜归因
out = attribute([{ group_id: 'T8', predicted_relation: 'unknown', reasons: ['INSUFFICIENT_SIGNALS', 'MEMBER_NO_USABLE_FIELDS:x'], consistency: { conflicts: [], corroborations: [], complementaries: [] } }])
assert.equal(at(out).attribution, 'insufficient_evidence')

// 9. 插件规则优先于内置链（方 D9 规则库接口验证）＋轨迹记录 decided_by=plugin:*
{
  const dir = mkdtempSync(join(tmpdir(), 'attr-plugin-'))
  const rulesPath = join(dir, 'rules.mjs').replace(/\\/g, '/')
  writeFileSync(rulesPath, `export const attributeRules = [{
    id: 'FANG_TAX_CALIBER', label: '口径差异·含税/未税',
    applies: (ctx) => ctx.values.length === 2 && ctx.quotes.some((q) => q.includes('含税')),
    decide: (ctx) => ({ attribution: 'caliber_tax', confidence: 'high', evidence: '含税口径差异：' + ctx.values.join(' vs ') }),
  }]`)
  const reportPath = join(dir, 'r.json').replace(/\\/g, '/')
  writeFileSync(reportPath, JSON.stringify({ results: [conflictGroup([1130000, 1000000], ['金额1,130,000元（含税）', '金额1,000,000元'], 'bid_amount')] }))
  const r = spawnSync(node, ['scripts/jingguan/attribute_b.mjs', '--report', reportPath, '--rules', rulesPath], { cwd: REPO_ROOT, encoding: 'utf8' })
  assert.equal(r.status, 0, String(r.stderr))
  const parsed = JSON.parse(r.stdout.slice(r.stdout.indexOf('{')))
  assert.equal(parsed.attributions[0].attribution, 'caliber_tax')
  assert.equal(parsed.attributions[0].decided_by, 'plugin:FANG_TAX_CALIBER')
  assert.equal(parsed.trace[0].decided_by, 'plugin:FANG_TAX_CALIBER')
  rmSync(dir, { recursive: true, force: true })
}

// 10. 插件异常不炸整跑（B2 精神：记录 aligner 式错误并落回内置链）
{
  const dir = mkdtempSync(join(tmpdir(), 'attr-plugin-err-'))
  const rulesPath = join(dir, 'rules.mjs').replace(/\\/g, '/')
  writeFileSync(rulesPath, `export const attributeRules = [{ id: 'BOOM', label: '炸', applies: () => true, decide: () => { throw new Error('插件异常') } }]`)
  const reportPath = join(dir, 'r.json').replace(/\\/g, '/')
  writeFileSync(reportPath, JSON.stringify({ results: [conflictGroup([150000000, 15000], ['质押1.5亿元', '质押15,000万元'])] }))
  const r = spawnSync(node, ['scripts/jingguan/attribute_b.mjs', '--report', reportPath, '--rules', rulesPath], { cwd: REPO_ROOT, encoding: 'utf8' })
  assert.equal(r.status, 0, '插件异常应被捕获，整跑不炸：' + String(r.stderr))
  const parsed = JSON.parse(r.stdout.slice(r.stdout.indexOf('{')))
  assert.equal(parsed.attributions[0].attribution, 'caliber_unit_scale', '异常后应落回内置链')
  assert.ok(parsed.trace.some((t) => t.error && t.rule_id === 'BOOM'), '异常须记入轨迹')
  rmSync(dir, { recursive: true, force: true })
}

// 11. 无差异报告（如宗 13 组 0 矛盾场景的空冲突组）
out = attribute([{ group_id: 'T11', predicted_relation: 'related', reasons: [], consistency: { conflicts: [], corroborations: [], complementaries: [] } }])
assert.equal(out.attributions.length, 0)

console.log('✓ B 归因引擎单测：11 组用例全部通过（内置 8 规则＋插件优先＋异常隔离＋不足证据不猜）')
