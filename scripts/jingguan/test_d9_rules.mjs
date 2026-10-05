/**
 * 宗 D9 归因规则用例门禁——runner 20 案＋score-rules --strict 评分。
 * 原则随 runner：期望标签不进入判定；矛盾须双侧证据；不得无源换算。
 */
import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

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
  const step1 = run(['scripts/jingguan/run_d9_rules.mjs', '--cases', CASES, '--out', 'runs/.tmp-d9-rules-report.json'])
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
  console.log(`✓ 宗D9归因用例：${pass}/20 全过（期望标签未进入判定；更正/真矛盾受控项含双侧证据）`)
} finally {
  rmSync(TMP_REPORT, { force: true })
  rmSync(TMP_SCORE, { force: true })
}
