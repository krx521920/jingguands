#!/usr/bin/env node
/**
 * 批量分母回归（D6-②②，评测方要求：损坏 JSON／损失文件批量回归，证明失败项仍留在输入分母）。
 *
 * 场景（一次批量的 7 个输入，全部断言留在 results 分母中）：
 *   1 pledge-valid.json        合法受控样例（pages[].text）      → 抽取成功（隔离对照）
 *   2 pledge-truncated.json    JSON 截断损坏                     → skipped（非评测格式）
 *   3 pledge-empty-pages.json  合法 JSON 但 pages=[]（内容损失）  → skipped（非评测格式）
 *   4 pledge-no-pages.json     合法 JSON 但无 pages 键（结构损失）→ skipped（非评测格式）
 *   5 pledge-binary.json       非 UTF-8 二进制垃圾                → skipped（非评测格式）
 *   6 pledge-blank.txt         纯空白文本                        → failed（拒绝调模型以免编造）
 *   7 note-unknown-type.json   合法样例但文件名无法推断事件类型    → skipped（无法推断事件类型）
 *
 * 附加路径（假 RUNNER 模拟）：runner 打印 runs 路径但产物缺失/损坏 → failed（产物不可读/损坏），
 * 且批次不崩、报告照常产出——防单文件产物损坏炸整批的回归。
 *
 * 用法：node scripts/jingguan/test_batch_denominator.mjs（已纳入 gates.mjs 门禁）
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readdirSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const TMP = join(REPO_ROOT, '.tmp_denom_test')
const issues = []
const check = (ok, msg) => { if (!ok) issues.push(msg) }

// ---------- 1. 构造输入集 ----------
rmSync(TMP, { recursive: true, force: true })
const inputs = join(TMP, 'inputs')
mkdirSync(inputs, { recursive: true })

writeFileSync(join(inputs, 'pledge-valid.json'), JSON.stringify({
  case_id: 'pledge-valid',
  pages: [{ page: 1, text: '控股股东张三将其持有的本公司1,000,000股质押给李四银行，占其所持股份总数的10%。' }],
}), 'utf8')
writeFileSync(join(inputs, 'pledge-truncated.json'), '{"case_id":"pledge-truncated","pages":[{"page":1,"text":"故意截断', 'utf8')
writeFileSync(join(inputs, 'pledge-empty-pages.json'), '{"case_id":"x","pages":[]}', 'utf8')
writeFileSync(join(inputs, 'pledge-no-pages.json'), '{"case_id":"y","foo":1}', 'utf8')
writeFileSync(join(inputs, 'pledge-binary.json'), Buffer.from([0xff, 0xfe, 0x00, 0x81, 0xde, 0xad, 0xbe, 0xef, 0x00, 0x11]), )
writeFileSync(join(inputs, 'pledge-blank.txt'), '   \n\t \n', 'utf8')
writeFileSync(join(inputs, 'note-unknown-type.json'), JSON.stringify({
  case_id: 'note-unknown-type',
  pages: [{ page: 1, text: '一份内容合法但文件名无法推断事件类型的样例。' }],
}), 'utf8')

const INPUT_COUNT = 7

// ---------- 2. 跑批量（--mock：合法样例走 mock 抽取，无需密钥） ----------
const before = new Set(readdirSync(join(REPO_ROOT, 'runs')))
const r1 = spawnSync(process.execPath, ['scripts/jingguan/run_batch.mjs', inputs, '--mock'], { cwd: REPO_ROOT, encoding: 'utf8' })
check(r1.status === 0 || r1.status === 1, `批量进程异常退出（status=${r1.status}）：${(r1.stderr ?? '').slice(-200)}`) // exit 1＝设计内失败信号，非崩溃
const created = readdirSync(join(REPO_ROOT, 'runs')).filter((d) => d.startsWith('batch-') && !before.has(d))
check(created.length === 1, `应恰好产出 1 个批次目录，实际 ${created.length}`)
const report = JSON.parse(readFileSync(join(REPO_ROOT, 'runs', created[0], 'batch_report.json'), 'utf8'))

// ---------- 3. 分母断言 ----------
check(report.results.length === INPUT_COUNT, `分母丢失：输入 ${INPUT_COUNT} 个文件，results 仅 ${report.results.length} 条`)
const byCase = Object.fromEntries(report.results.map((c) => [c.case, c]))
const expect = {
  'pledge-valid': { ok: true, why: null },
  'pledge-truncated': { ok: false, why: '非评测样例格式' },
  'pledge-empty-pages': { ok: false, why: '非评测样例格式' },
  'pledge-no-pages': { ok: false, why: '非评测样例格式' },
  'pledge-binary': { ok: false, why: '非评测样例格式' },
  'pledge-blank': { ok: false, why: null, refuse: true },
  'note-unknown-type': { ok: false, why: '无法推断事件类型' },
}
for (const [cs, exp] of Object.entries(expect)) {
  const row = byCase[cs]
  if (row === undefined) { check(false, `${cs} 从分母中消失`); continue }
  check(row.ok === exp.ok, `${cs} ok 应为 ${exp.ok}，实际 ${row.ok}`)
  if (exp.why !== null) check(String(row.skip_reason ?? '').includes(exp.why), `${cs} skip_reason 应含"${exp.why}"，实际：${row.skip_reason ?? '(空)'}`)
  if (exp.refuse) check(String(row.output_tail ?? '').includes('拒绝调用模型'), `${cs} 应记录"拒绝调用模型"拒绝原因，实际：${(row.output_tail ?? '').slice(-60)}`)
}
check(byCase['pledge-valid']?.status_count !== undefined, '合法样例应有抽取产物（隔离对照失败）')
const okCount = report.results.filter((c) => c.ok).length
check(okCount === 1, `失败未隔离：成功数应为 1，实际 ${okCount}`)

// ---------- 4. 产物损坏/缺失路径（假 RUNNER：打印 runs 路径但不写产物） ----------
const fakeRunner = join(TMP, 'fake_runner.mjs')
writeFileSync(fakeRunner, '#!/usr/bin/env node\nconsole.log("runs/FAKE-CORRUPT-PRODUCT/events.json")\nprocess.exit(0)\n', 'utf8')
const batchSrc = readFileSync(join(REPO_ROOT, 'scripts/jingguan/run_batch.mjs'), 'utf8')
const patched = batchSrc.replace("const RUNNER = join(REPO_ROOT, 'scripts/jingguan/run_extract.mjs')", `const RUNNER = ${JSON.stringify(fakeRunner)}`)
check(patched !== batchSrc, 'RUNNER 常量替换失败（run_batch.mjs 结构变更？）')
const testCopy = join(REPO_ROOT, 'scripts/jingguan', '.tmp_denom_batch.mjs')
writeFileSync(testCopy, patched, 'utf8')
try {
  const before2 = new Set(readdirSync(join(REPO_ROOT, 'runs')))
  const r2 = spawnSync(process.execPath, [testCopy, inputs, '--mock'], { cwd: REPO_ROOT, encoding: 'utf8' })
  check(r2.status === 0 || r2.status === 1, `产物损坏场景：批次进程不应崩溃（status=${r2.status}）：${(r2.stderr ?? '').split('\n').filter(Boolean).slice(-2).join(' | ')}`)
  const created2 = readdirSync(join(REPO_ROOT, 'runs')).filter((d) => d.startsWith('batch-') && !before2.has(d))
  const report2 = JSON.parse(readFileSync(join(REPO_ROOT, 'runs', created2[0], 'batch_report.json'), 'utf8'))
  check(report2.results.length === INPUT_COUNT, `产物损坏场景分母丢失：${report2.results.length}/${INPUT_COUNT}`)
  const valid2 = report2.results.find((c) => c.case === 'pledge-valid')
  check(valid2 !== undefined && valid2.ok === false, '产物损坏场景：合法样例应记 failed（而非崩溃或成功）')
  check(String(valid2?.skip_reason ?? '').includes('产物不可读'), `产物损坏场景 skip_reason 应含"产物不可读"，实际：${valid2?.skip_reason ?? '(空)'}`)
} finally {
  rmSync(testCopy, { force: true })
}

// ---------- 5. 清理本测试产生的批次目录与临时目录 ----------
const after = readdirSync(join(REPO_ROOT, 'runs')).filter((d) => (d.startsWith('batch-') || d.startsWith('FAKE')) && !before.has(d) && !before.has('FAKE-CORRUPT-PRODUCT'))
for (const d of after) rmSync(join(REPO_ROOT, 'runs', d), { recursive: true, force: true })
rmSync(TMP, { recursive: true, force: true })

// ---------- 结果 ----------
if (issues.length === 0) {
  console.log(`✓ 批量分母回归：${INPUT_COUNT} 输入全入分母（1 成功＋${INPUT_COUNT - 1} 失败/跳过），失败隔离＋产物损坏路径（不炸整批）通过`)
  process.exit(0)
}
console.log(`✗ 批量分母回归失败 ${issues.length} 处：`)
for (const i of issues) console.log(`  - ${i}`)
process.exit(1)
