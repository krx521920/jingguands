/**
 * 宗 D9 归因规则用例门禁——runner 20 案＋score-rules --strict 评分。
 * 原则随 runner：期望标签不进入判定；矛盾须双侧证据；不得无源换算。
 */
import { spawnSync } from 'node:child_process'
import { rmSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'

const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const node = process.execPath
const CASES = 'evaluation/D9/cases/rules-cases.dev.json'
const TMP_REPORT = resolve(REPO_ROOT, 'runs', '.tmp-d9-rules-report.json')
const TMP_SCORE = resolve(REPO_ROOT, 'runs', '.tmp-d9-rules-score.json')

function run(args) {
  const r = spawnSync(node, args, { cwd: REPO_ROOT, encoding: 'utf8' })
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

try {
  // W7 后评分器契约：requires_programmatic_sum 用例的勾稽记录需信封源——
  // step1 与正典命令同参（--verify-blocks）
  const VB = 'runs/batch-20261005T063943/envelopes'
  const step1 = run(['scripts/jingguan/run_d9_rules.mjs', '--cases', CASES, '--verify-blocks', VB, '--out', 'runs/.tmp-d9-rules-report.json'])
  console.log(step1.out.trim().split(/\r?\n/).slice(-1)[0])
  if (step1.status !== 0) { console.error('[D9规则门禁] runner 未过'); process.exit(1) }

  const step2 = run(['evaluation/D9/score-rules.mjs', '--report', TMP_REPORT, '--json', TMP_SCORE, '--strict'])
  const verdict = /"result":\s*"(\w+)"/.exec(step2.out)?.[1]
  const pass = /"pass":\s*(\d+)/.exec(step2.out)?.[1]
  const fail = /"fail":\s*(\d+)/.exec(step2.out)?.[1]
  const fp = /"false_positive_conflict":\s*(\d+)/.exec(step2.out)?.[1]
  const fn = /"false_negative_conflict":\s*(\d+)/.exec(step2.out)?.[1]
  console.log(`[D9严格评分] result=${verdict}｜pass ${pass}｜fail ${fail}｜矛盾误报 ${fp}｜矛盾漏报 ${fn}`)
  if (step2.status !== 0 || verdict !== 'PASS') { console.error('[D9规则门禁] --strict 评分未过'); process.exit(1) }

  // 块内容级硬校验（宗 v0.2 重锚后主源验证）：20/20 保持＋30 真实侧全 verified
  const step5 = run(['scripts/jingguan/run_d9_rules.mjs', '--cases', CASES, '--verify-blocks', VB, '--out', 'runs/.tmp-d9-vb-report.json'])
  const step6 = run(['evaluation/D9/score-rules.mjs', '--report', resolve(REPO_ROOT, 'runs/.tmp-d9-vb-report.json'), '--json', TMP_SCORE, '--strict'])
  const verdict6 = /"result":\s*"(\w+)"/.exec(step6.out)?.[1]
  const vbRep = JSON.parse(readFileSync(resolve(REPO_ROOT, 'runs/.tmp-d9-vb-report.json'), 'utf8'))
  const vbTrue = vbRep.block_verify?.side_summary?.true ?? 0
  const vbFalse = vbRep.block_verify?.side_summary?.false ?? 0
  console.log(`[D9块级校验] result=${verdict6}｜真实侧块验证 true=${vbTrue} false=${vbFalse}（宗v0.2重锚后主源验证）`)
  if (step5.status !== 0 || step6.status !== 0 || verdict6 !== 'PASS' || vbFalse !== 0) { console.error('[D9规则门禁] 块级校验未过'); process.exit(1) }

  // 双侧出处包模式（张 D9 包）：标注不改变判定，20/20 须保持（包待张按 v0.2 再生成，仅标注层）
  // 同样带 --verify-blocks：W7 后评分器对 requires_programmatic_sum 用例要求勾稽记录（需信封源）
  const BIL = 'tools/zhang-bilateral/bilateral_evidence.json'
  const step3 = run(['scripts/jingguan/run_d9_rules.mjs', '--cases', CASES, '--bilateral', BIL, '--verify-blocks', VB, '--out', 'runs/.tmp-d9-bil-report.json'])
  const step4 = run(['evaluation/D9/score-rules.mjs', '--report', resolve(REPO_ROOT, 'runs/.tmp-d9-bil-report.json'), '--json', TMP_SCORE, '--strict'])
  const verdict4 = /"result":\s*"(\w+)"/.exec(step4.out)?.[1]
  console.log(`[D9双侧模式] result=${verdict4}（标注 evidence_status＋重锚建议透传，判定不变）`)
  if (step3.status !== 0 || step4.status !== 0 || verdict4 !== 'PASS') { console.error('[D9规则门禁] 双侧模式未过'); process.exit(1) }

  // 不可锚真冲突路径：真实语料 conflict 若双侧不可锚 → evidence_verified=false（宗规则2块级强化）
  {
    const dir = mkdtempSync(join(tmpdir(), 'd9-bil-flag-'))
    const casesPath = join(dir, 'c.json').replace(/\\/g, '/')
    writeFileSync(casesPath, JSON.stringify({ cases: [{ case_id: 'X1', sides: [
      { case_id: 'D5-EQC-001', entity: '某主体', field: 'shares_after', value: 100, quote: '甲', block_id: 'b1' },
      { case_id: 'D5-EQC-002', entity: '某主体', field: 'shares_after', value: 200, quote: '乙', block_id: 'b2' },
    ] }] }))
    const bilPath = join(dir, 'bil.json').replace(/\\/g, '/')
    writeFileSync(bilPath, JSON.stringify({ cases: [{ case_id: 'X1', sides: [
      { case_id: 'D5-EQC-001', field: 'shares_after', evidence_status: 'quote_not_in_block' },
      { case_id: 'D5-EQC-002', field: 'shares_after', evidence_status: 'present' },
    ] }] }))
    const r = run(['scripts/jingguan/run_d9_rules.mjs', '--cases', casesPath, '--bilateral', bilPath, '--out', join(dir, 'o.json').replace(/\\/g, '/')])
    if (r.status !== 0) { console.error('[D9规则门禁] 不可锚路径 runner 失败: ' + r.stderr); process.exit(1) }
    const rep = JSON.parse(readFileSync(join(dir, 'o.json'), 'utf8'))
    const x1 = rep.cases.find((c) => c.case_id === 'X1')
    assert.equal(x1.verdict, 'conflict', '值不可归因＋双侧齐全 → conflict')
    assert.equal(x1.evidence_verified, false, '真实语料 conflict 含不可锚侧 → evidence_verified=false')
    rmSync(dir, { recursive: true, force: true })
  }

  // 方 D9 主库直通（--rules + --parses-map 全保真解析）：接口验收断言——
  // 结果须与方自跑一致（18/20：019/020 受控缺事实判 insufficient，非接口缺陷）
  const step7 = run(['scripts/jingguan/run_d9_rules.mjs', '--cases', CASES,
    '--rules', 'tools/fang-attribution/src_D9/attribution_D9.mjs',
    '--envelopes', 'runs/batch-20261005T063943/envelopes',
    '--parses-map', 'runs/D9-parses-map.json', '--out', 'runs/.tmp-d9-fanglib.json'])
  if (step7.status !== 0) { console.error('[D9规则门禁] 方库直通 runner 失败: ' + step7.stderr); process.exit(1) }
  const fl = JSON.parse(readFileSync(resolve(REPO_ROOT, 'runs/.tmp-d9-fanglib.json'), 'utf8'))
  const flDist = fl.by_verdict ?? {}
  const c19 = fl.cases.find((c) => c.case_id === 'D9-RULE-019'), c20 = fl.cases.find((c) => c.case_id === 'D9-RULE-020')
  console.log(`[方库直通] 分布 ${JSON.stringify(flDist)}｜019=${c19.verdict} 020=${c20.verdict}（对齐方自跑 18/20，受控缺事实为 insufficient）`)
  assert.equal(flDist.corroborated, 5, '方库互证数对齐其自跑')
  assert.equal(flDist.explainable_difference, 11, '方库可解释差异数对齐其自跑')
  assert.equal(c19.verdict, 'insufficient', '019 受控缺事实 → 方库诚实 insufficient')
  assert.equal(c20.verdict, 'insufficient', '020 受控缺事实 → 方库诚实 insufficient')

  console.log(`✓ 宗D9归因用例：${pass}/20 全过（期望标签未进入判定；更正/真矛盾受控项含双侧证据；--bilateral 标注＋不可锚标记＋--verify-blocks 块级＋方库直通 18/20 对齐）`)
} finally {
  rmSync(TMP_REPORT, { force: true })
  rmSync(TMP_SCORE, { force: true })
  rmSync(resolve(REPO_ROOT, 'runs/.tmp-d9-bil-report.json'), { force: true })
  rmSync(resolve(REPO_ROOT, 'runs/.tmp-d9-vb-report.json'), { force: true })
  rmSync(resolve(REPO_ROOT, 'runs/.tmp-d9-fanglib.json'), { force: true })
}
