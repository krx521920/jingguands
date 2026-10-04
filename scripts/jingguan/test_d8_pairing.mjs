/**
 * 宗 D8 13 组配对开发集 · B 全量回放＋--strict 评分门禁。
 *
 * 输入：evaluation/D8/pairs/pairs.dev30.json（宗交付，字节一致引入自 zongbowen@e758d43a：
 *   4 同事件＋8 不同事件＋1 证据不足）＋ 统一批次信封目录（含 pledge-scan-degrade）。
 * 步骤：① verify_crossdoc 三态判定（--expect 13/13）→ 临时 B 报告；
 *       ② 宗 score-pairs.mjs --strict 评分（related/unrelated 零矛盾/insufficient 第三态
 *          ＋逐成员版本追踪 a_run_id+code_version+is_mock=false）。
 * 退出码 0＝两步全过。临时报告用后即删，不留未跟踪产物。
 */
import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const node = process.execPath
// 信封目录＝统一批次（35 输入：30 语料＋5 对抗，含 scan-degrade 信封）
const ENVELOPES = 'runs/batch-20261004T093750/envelopes'
const MANIFEST = 'evaluation/D8/pairs/pairs.dev30.json'
const TMP_REPORT = resolve(REPO_ROOT, 'runs', '.tmp-d8-b-report.json')

function run(args) {
  const r = spawnSync(node, args, { cwd: REPO_ROOT, encoding: 'utf8' })
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

try {
  const step1 = run(['scripts/jingguan/verify_crossdoc.mjs', '--envelopes-dir', ENVELOPES, '--manifest', MANIFEST, '--expect', '--out', 'runs/.tmp-d8-b-report.json'])
  console.log(step1.out.trim().split(/\r?\n/).slice(-2).join('\n'))
  if (step1.status !== 0) { console.error('[D8配对门禁] B 回放未过'); process.exit(1) }

  const step2 = run(['evaluation/D8/score-pairs.mjs', '--report', TMP_REPORT, '--json', resolve(REPO_ROOT, 'runs', '.tmp-d8-score.json'), '--strict'])
  const pass = /"pass":\s*(\d+)/.exec(step2.out)?.[1]
  const fail = /"fail":\s*(\d+)/.exec(step2.out)?.[1]
  const notRun = /"not_run":\s*(\d+)/.exec(step2.out)?.[1]
  const verdict = /"result":\s*"(\w+)"/.exec(step2.out)?.[1]
  console.log(`[D8严格评分] result=${verdict}｜pass ${pass}｜fail ${fail}｜not_run ${notRun}`)
  if (step2.status !== 0 || verdict !== 'PASS') { console.error('[D8配对门禁] --strict 评分未过'); process.exit(1) }
  console.log(`✓ 宗D8配对严格评分：${pass}/${Number(pass) + Number(fail) + Number(notRun)} 全过（含 PAIR-013 证据不足第三态＋版本追踪）`)
} finally {
  rmSync(TMP_REPORT, { force: true })
  rmSync(resolve(REPO_ROOT, 'runs', '.tmp-d8-score.json'), { force: true })
}
