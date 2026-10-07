/**
 * D11 缺陷定位固化测试——两个新发现缺陷的"症状可检测性"基线（green）
 * 与修复目标（red，D12 实现后转绿）。
 * ①PLD-009-E03：质押/解押混列模型方差（坏轮事件固化于 testdata/d11/）
 * ②AWD-002：跨块 quote 锚定失败（校验器如实报错＝不编造，症状可检测）
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const TD = resolve(REPO_ROOT, 'scripts/jingguan/testdata/d11')

// ① PLD-009 E03：坏轮症状在固化件中完整且带 gold 正确值与修复目标
{
  const fx = JSON.parse(readFileSync(resolve(TD, 'pld009-e03-bad-variant.json'), 'utf8'))
  assert.equal(fx.defect, 'PLD-009-E03')
  assert.equal(fx.bad_event.fields.pledgor.value, '有格投资', '坏轮简称症状固化')
  assert.equal(fx.bad_event.fields.pledged_shares_this_time.value, 18564000, '坏轮误取解押段原质押数固化')
  assert.deepEqual(fx.expectation.gold_正确值, { pledged_shares_this_time: 19254000, ratio_of_held: 5.98, ratio_of_total: 1.24 }, '预期＝gold 正确值（修复目标）')
  assert.ok(fx.expectation.修复目标_D12.length >= 2, '修复目标（守卫＋简称兜底）随件固化')
}

// ② AWD-002：跨块 quote 症状固化（前缀块尾＋锚定块头＝quote）；当前系统行为＝校验器如实报错（不编造）
{
  const fx = JSON.parse(readFileSync(resolve(TD, 'awd002-crossblock-quote.json'), 'utf8'))
  assert.equal(fx.defect, 'AWD-002-crossblock')
  assert.notEqual(fx.suffix_block.id, fx.prefix_block.id, '前缀块≠后缀块（跨块实锤）')
  const norm = (s) => String(s ?? '').replace(/[\s,，、；;]/g, '')
  assert.ok(norm(fx.quote).includes(norm(fx.suffix_block.text_head).slice(0, 20)), 'quote 后缀确实在锚定块内')
  assert.ok(fx.expectation.修复目标_D12.includes('跨块重锚'), '修复目标随件固化')
  // 当前行为基线（green）：该校验错误已在实测批次中被如实记录（batch-20261007T082845 AWD-002 validation_errors>0）
  const rep = JSON.parse(readFileSync(resolve(REPO_ROOT, 'runs/batch-20261007T082845/batch_report.json'), 'utf8'))
  const awd = rep.results.find((r) => r.case === 'D6-AWD-002')
  assert.ok((awd?.validation_errors ?? 0) > 0, '症状可检测：校验器如实报错而非静默编造')
}

// ③ 修复目标（D12 转绿钩子）：待 D12 实现"原质押守卫/跨块重锚"后，
// 此处将追加：坏轮事件过守卫 → needs_review；跨块 quote 过重锚 → 校验零错。
// 今日以 TODO 固化目标，不虚绿。
console.log('✓ D11 缺陷定位固化：两症状可检测（green 基线）＋gold 正确值与修复目标随件（D12 转绿钩子）')
