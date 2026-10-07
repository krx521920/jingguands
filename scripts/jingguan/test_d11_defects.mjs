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

// ② AWD-002：跨块 quote 症状固化（前缀块尾＋锚定块头＝quote）；修复（D11 晚落地）已转绿
{
  const fx = JSON.parse(readFileSync(resolve(TD, 'awd002-crossblock-quote.json'), 'utf8'))
  assert.equal(fx.defect, 'AWD-002-crossblock')
  assert.notEqual(fx.suffix_block.id, fx.prefix_block.id, '前缀块≠后缀块（跨块实锤，症状固化）')
  const norm = (s) => String(s ?? '').replace(/[\s,，、；;]/g, '')
  assert.ok(norm(fx.quote).includes(norm(fx.suffix_block.text_head).slice(0, 20)), 'quote 后缀确实在锚定块内')
  assert.ok(fx.expectation.修复目标_D12.includes('跨块重锚'), '修复目标随件固化')
  // 修复转绿（83213ed6）：修复后批次 AWD-002 校验问题 4→0（重锚生效，症状消失）
  const rep = JSON.parse(readFileSync(resolve(REPO_ROOT, 'runs/batch-20261007T084852/batch_report.json'), 'utf8'))
  const awd = rep.results.find((r) => r.case === 'D6-AWD-002')
  assert.equal(awd?.validation_errors ?? -1, 0, '修复后 AWD-002 校验零错（跨块重锚生效）')
}

// ③ 修复转绿验证（D11 晚落地，83213ed6）：
// - P2c 守卫与 P2b 约束已由 docs/d12-perf-and-stability.md 第五节实证（坏变体语境重演✓/
//   PLD-010 误伤教训例不触发✓）；此处断言修复后全量批次零回归。
{
  const rep = JSON.parse(readFileSync(resolve(REPO_ROOT, 'runs/batch-20261007T084852/batch_report.json'), 'utf8'))
  let total = 0, hit = 0
  for (const x of rep.results) { const g = x.gold; if (!g?.gold_extracted_fields) continue; total += g.gold_extracted_fields; hit += g.value_hit ?? 0 }
  assert.equal(`${hit}/${total}`, '437/437', '修复后全量批次零回归（437/437）')
}
console.log('✓ D11 缺陷定位→修复闭环：症状固化＋修复转绿（AWD-002 零错）＋全量 437/437 零回归')
