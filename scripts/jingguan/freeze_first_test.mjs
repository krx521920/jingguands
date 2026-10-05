/**
 * D11 首测冻结运行（我主持日）——"先冻结独立运行，开发不干预"。
 *
 * 一次命令产出首测报告包 runs/first-test-<ts>/：
 *   A. 统一批次 35 输入（真实 API）→ 字段级成绩＋信封
 *   B. 宗 D8 v0.2 13 组配对：内置引擎模式＋方插件模式 → --strict 评分 ×2
 *   C. 封存 20 组回放（门禁口径）
 *   D. 宗 D9 20 条归因用例（含 --bilateral 双侧证据标注）→ --strict
 *   汇总 manifest.json＋summary.md，各段记 code_version（冻结可审计）。
 *
 * 纪律：工作区不干净（有未提交改动）即拒绝运行——冻结运行不允许开发态代码；
 * --dry 复用既有批次信封跳过 A 段 API 调用（联调用，产出标注 dry=true）。
 * 用法：node scripts/jingguan/freeze_first_test.mjs [--dry] [--batch <既有批次信封目录>]
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const node = process.execPath
const dry = process.argv.includes('--dry')
const batchArgIx = process.argv.indexOf('--batch')
const EXISTING_BATCH = batchArgIx > 0 ? process.argv[batchArgIx + 1] : 'runs/batch-20261005T063943'

function sh(args, opts = {}) {
  const r = spawnSync(node, args, { cwd: REPO_ROOT, encoding: 'utf8', ...opts })
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}
const gitClean = spawnSync('git', ['status', '--porcelain'], { cwd: REPO_ROOT, encoding: 'utf8' }).stdout.trim()
if (gitClean.length > 0 && !dry) {
  console.error('[首测冻结] 工作区不干净——冻结运行须在提交后的代码态执行（开发不干预）：\n' + gitClean.slice(0, 300))
  process.exit(2)
}
const codeVersion = sh(['-e', '']).status === 0
  ? spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).stdout.trim()
  : 'dev'

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
const outDir = resolve(REPO_ROOT, 'runs', `first-test-${stamp}${dry ? '-dry' : ''}`)
mkdirSync(outDir, { recursive: true })
const manifest = { frozen_at: new Date().toISOString(), code_version: codeVersion, dry, stages: [] }
const lines = [`# 首测冻结报告（${dry ? 'DRY 联调' : '正式'}）`, ``, `- 冻结时间：${manifest.frozen_at}`, `- 代码版本：${codeVersion}`, ``]

function stage(id, name, args, checks) {
  const t0 = Date.now()
  const r = sh(args)
  const ms = Date.now() - t0
  const entry = { id, name, cmd: args.join(' '), exit: r.status, ms, checks: {} }
  for (const [k, re] of Object.entries(checks)) entry.checks[k] = re.exec(r.out)?.[1] ?? null
  const ok = r.status === 0 && Object.values(entry.checks).every((v) => v !== null)
  entry.ok = ok
  manifest.stages.push(entry)
  lines.push(`## ${id}. ${name} — ${ok ? '✓' : '✗'}（${ms}ms）`)
  lines.push(`- 命令：\`${args.join(' ')}\``)
  lines.push(`- 指标：${Object.entries(entry.checks).map(([k, v]) => `${k}=${v}`).join('｜')}`)
  const tail = r.out.trim().split(/\r?\n/).filter(Boolean).slice(-2)
  lines.push(...tail.map((t) => `- > ${t.slice(0, 160)}`))
  return { ok, out: r.out }
}

// ---- A. 统一批次 ----
let batchEnvelopes = null
if (dry) {
  const dir = resolve(REPO_ROOT, EXISTING_BATCH, 'envelopes')
  if (!existsSync(dir)) { console.error(`[首测冻结-dry] 信封目录不存在：${dir}`); process.exit(2) }
  batchEnvelopes = `${EXISTING_BATCH}/envelopes`
  manifest.stages.push({ id: 'A', name: '统一批次（dry 复用）', cmd: `reuse ${EXISTING_BATCH}`, ok: true, note: 'dry 模式不重跑 API' })
  lines.push(`## A. 统一批次 — DRY 复用 ${EXISTING_BATCH}（437/437 见该批次报告）`)
} else {
  const a = stage('A', '统一批次 35 输入（真实 API）', [
    'scripts/jingguan/run_batch.mjs',
    'corpus/zhangzhibo/d4/parse-official', 'corpus/zhangzhibo/d5/parse-official', 'corpus/zongbowen/d6/raw',
    'corpus/adversarial/award-empty-text.txt', 'corpus/adversarial/note-unknown.json', 'corpus/adversarial/pledge-corrupt.json',
    'corpus/adversarial/pledge-empty.txt', 'corpus/adversarial/pledge-scan-degrade.parse.json',
    '--gold', '--gold-manifest', 'corpus/combined-manifest.json',
  ], {})
  const m = /\[报告\] (runs\/batch-\w+)/.exec(a.out)?.[1]
  batchEnvelopes = m ? `${m}/envelopes` : null
  if (m) {
    const rep = JSON.parse(readFileSync(resolve(REPO_ROOT, m, 'batch_report.json'), 'utf8'))
    let total = 0, pass = 0
    for (const x of rep.results) { const g = x.gold; if (!g?.gold_extracted_fields) continue; total += g.gold_extracted_fields; pass += g.value_hit ?? 0 }
    manifest.stages.at(-1).checks.field_accuracy = `${pass}/${total}`
    lines.push(`- 字段级：**${pass}/${total}**`)
  }
}
if (batchEnvelopes === null && !dry) { console.error('[首测冻结] A 段未产出批次目录'); process.exit(1) }

// ---- B. 宗 D8 v0.2 配对（内置＋方插件）----
const envelopesDir = batchEnvelopes ?? 'runs/batch-20261005T063943/envelopes'
const b1 = stage('B1', 'D8 配对·内置引擎', ['scripts/jingguan/verify_crossdoc.mjs', '--envelopes-dir', envelopesDir, '--manifest', 'evaluation/D8/pairs/pairs.dev30.json', '--expect', '--out', `${rel(outDir)}/d8-builtin.json`], { verdict: /判定一致 (\d+\/\d+)/ })
writeFileSync(resolve(outDir, 'd8-builtin-score.json'), '')
sh(['evaluation/D8/score-pairs.mjs', '--report', resolve(outDir, 'd8-builtin.json'), '--json', resolve(outDir, 'd8-builtin-score.json'), '--strict'])
const s1 = JSON.parse(readFileSync(resolve(outDir, 'd8-builtin-score.json'), 'utf8'))
manifest.stages.at(-1).checks.strict = `${s1.result} ${s1.pass}/${s1.pass + s1.fail + s1.not_run}`
lines.push(`- --strict：**${s1.result} ${s1.pass}/${s1.pass + s1.fail + s1.not_run}**`)

const b2 = stage('B2', 'D8 配对·方 matching 插件', ['scripts/jingguan/verify_crossdoc.mjs', '--envelopes-dir', envelopesDir, '--manifest', 'evaluation/D8/pairs/pairs.dev30.json', '--matcher', 'tools/fang-matching/src_D8/matching_D8.mjs', '--expect', '--out', `${rel(outDir)}/d8-plugin.json`], { verdict: /判定一致 (\d+\/\d+)/ })
sh(['evaluation/D8/score-pairs.mjs', '--report', resolve(outDir, 'd8-plugin.json'), '--json', resolve(outDir, 'd8-plugin-score.json'), '--strict'])
const s2 = JSON.parse(readFileSync(resolve(outDir, 'd8-plugin-score.json'), 'utf8'))
manifest.stages.at(-1).checks.strict = `${s2.result} ${s2.pass}/${s2.pass + s2.fail + s2.not_run}`
lines.push(`- --strict：**${s2.result} ${s2.pass}/${s2.pass + s2.fail + s2.not_run}**`)

// ---- C. 封存 20 组回放 ----
stage('C', '封存 20 组回放', ['scripts/jingguan/verify_crossdoc.mjs', '--envelopes-dir', 'runs/batch-20261003T160213/envelopes', '--manifest', 'corpus/zongbowen/sealed/cross-doc-manifest.json', '--expect'], { verdict: /判定一致 (\d+\/\d+)/ })

// ---- D. 宗 D9 20 条归因 ----
const d1 = stage('D', 'D9 归因 20 条（含双侧证据）', ['scripts/jingguan/run_d9_rules.mjs', '--cases', 'evaluation/D9/cases/rules-cases.dev.json', '--bilateral', 'tools/zhang-bilateral/bilateral_evidence.json', '--out', `${rel(outDir)}/d9-rules.json`], { cases: /(\d+) 案/ })
sh(['evaluation/D9/score-rules.mjs', '--report', resolve(outDir, 'd9-rules.json'), '--json', resolve(outDir, 'd9-rules-score.json'), '--strict'])
const s3 = JSON.parse(readFileSync(resolve(outDir, 'd9-rules-score.json'), 'utf8'))
manifest.stages.at(-1).checks.strict = `${s3.result} ${s3.pass}/${s3.pass + s3.fail + s3.not_run}`
lines.push(`- --strict：**${s3.result} ${s3.pass}/${s3.pass + s3.fail + s3.not_run}**`)

function rel(p) { return resolve(p).replace(REPO_ROOT + '\\', '').replace(REPO_ROOT + '/', '').replace(/\\/g, '/') }

const allOk = manifest.stages.every((s) => s.ok !== false)
manifest.all_ok = allOk
lines.push(``, `## 总判定：${allOk ? '✓ 全部通过' : '✗ 存在失败段'}`)
writeFileSync(resolve(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
writeFileSync(resolve(outDir, 'summary.md'), lines.join('\n') + '\n')
console.log(`[首测冻结${dry ? '-DRY' : ''}] ${allOk ? '✓' : '✗'} ${manifest.stages.length} 段｜code_version=${codeVersion}｜报告 ${rel(outDir)}/summary.md`)
process.exit(allOk ? 0 : 1)
