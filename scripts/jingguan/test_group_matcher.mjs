/**
 * 方 D8.2 explainGroup 完整入口单测——插件组级接管语义（第 15 道门禁）。
 * 用例：①插件接管判定（unrelated 推翻内置 related 且不执行数值核验）
 *      ②插件 unknown → 无 consistency，reasons 兜底 INSUFFICIENT_SIGNALS
 *      ③插件异常 → 整体回退内置链不炸
 *      ④插件误判（0 可用字段组判 related）→ 引擎第三态守卫否决为 unknown＋discrepancy
 *      ⑤无插件 → 行为与旧版逐字节一致（related 组保留 consistency）
 *      ⑥插件 related 但 document_pairs 某对非 same → 该对跳过数值核验
 * 材料：runs/d8-demo-20261004（真实信封：海正 same、鸿路 different、scan-degrade unknown）。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, cpSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const node = process.execPath
const DEMO_ENV = resolve(REPO_ROOT, 'runs/d8-demo-20261004/envelopes')

function tempEnvDir() {
  const dir = mkdtempSync(join(tmpdir(), 'gm-test-'))
  const envDir = join(dir, 'envelopes')
  mkdirSync(envDir)
  return { dir, envDir }
}

function writeStub(dir, code) {
  const p = join(dir, 'stub.mjs').replace(/\\/g, '/')
  writeFileSync(p, code)
  return p
}

function run(envDir, manifest, matcher) {
  const dir = mkdtempSync(join(tmpdir(), 'gm-manifest-'))
  const mp = join(dir, 'm.json').replace(/\\/g, '/')
  writeFileSync(mp, JSON.stringify(manifest))
  const args = ['scripts/jingguan/verify_crossdoc.mjs', '--envelopes-dir', envDir.replace(/\\/g, '/'), '--manifest', mp]
  if (matcher) args.push('--matcher', matcher.replace(/\\/g, '/'))
  args.push('--out', join(dir, 'o.json').replace(/\\/g, '/'))
  const r = spawnSync(node, args, { cwd: REPO_ROOT, encoding: 'utf8' })
  const report = JSON.parse(readFileSync(join(dir, 'o.json'), 'utf8'))
  rmSync(dir, { recursive: true, force: true })
  return { status: r.status, report, stderr: r.stderr }
}

const HZ = ['DEMO-EQC-HZ-RESULT', 'D5-EQC-004'] // 真实 related（同交易包）
const group = (id, members) => ({ groups: [{ group_id: id, members }] })

// ① 插件 unrelated 推翻内置 related：不执行数值核验（无 consistency 键），审计段记录双方
{
  const { dir, envDir } = tempEnvDir()
  for (const c of HZ) cpSync(join(DEMO_ENV, c + '.json'), join(envDir, c + '.json'))
  const stub = writeStub(dir, `export function explainGroup(g, envs) { return { predicted_relation: 'unrelated', reasons: ['STUB_SAYS_DIFFERENT'], document_pairs: [{ members: g.members, predicted_relation: 'unrelated' }] } }`)
  const { report } = run(envDir, group('T1', HZ), stub)
  const g1 = report.results[0]
  assert.equal(g1.predicted_relation, 'unrelated', '插件应接管组级判定')
  assert.deepEqual(g1.reasons, ['STUB_SAYS_DIFFERENT'])
  assert.equal(g1.consistency, undefined, 'different 不得执行数值核验')
  assert.equal(g1.alignment.plugin_relation, 'unrelated')
  assert.equal(g1.alignment.builtin_relation, 'related', '内置判定留档对照')
  rmSync(dir, { recursive: true, force: true })
}

// ② 插件 unknown：无 consistency；reasons 无 INSUFFICIENT_SIGNALS 时引擎兜底补上
{
  const { dir, envDir } = tempEnvDir()
  for (const c of HZ) cpSync(join(DEMO_ENV, c + '.json'), join(envDir, c + '.json'))
  const stub = writeStub(dir, `export function explainGroup() { return { predicted_relation: 'unknown', reasons: ['STUB_NO_IDENTITY'] } }`)
  const { report } = run(envDir, group('T2', HZ), stub)
  const g2 = report.results[0]
  assert.equal(g2.predicted_relation, 'unknown')
  assert.equal(g2.consistency, undefined, 'unknown 不得执行数值核验')
  assert.ok(g2.reasons.includes('INSUFFICIENT_SIGNALS'), 'unknown 必带 INSUFFICIENT_SIGNALS（评分契约）')
  assert.ok(g2.reasons.includes('STUB_NO_IDENTITY'))
  rmSync(dir, { recursive: true, force: true })
}

// ③ 插件异常：整体回退内置链，不炸整跑，错误入 alignment.plugin_error
{
  const { dir, envDir } = tempEnvDir()
  for (const c of HZ) cpSync(join(DEMO_ENV, c + '.json'), join(envDir, c + '.json'))
  const stub = writeStub(dir, `export function explainGroup() { throw new Error('stub 炸了') }`)
  const { status, report } = run(envDir, group('T3', HZ), stub)
  assert.equal(status, 0, '插件异常不得炸 B 运行')
  const g3 = report.results[0]
  assert.equal(g3.predicted_relation, 'related', '异常回退内置链判定')
  assert.ok(g3.consistency && g3.consistency.corroborations.length > 0, '回退后数值核验照常')
  assert.match(g3.alignment.plugin_error, /stub 炸了/)
  assert.equal(g3.alignment.plugin_relation, null)
  rmSync(dir, { recursive: true, force: true })
}

// ④ 第三态守卫否决权：0 可用字段组（scan-degrade）即使插件误判 related 也必须 unknown
{
  const { dir, envDir } = tempEnvDir()
  cpSync(resolve(REPO_ROOT, 'runs/batch-20261004T093750/envelopes/pledge-scan-degrade.json'), join(envDir, 'pledge-scan-degrade.json'))
  cpSync(resolve(REPO_ROOT, 'runs/batch-20261004T093750/envelopes/D6-AWD-001.json'), join(envDir, 'D6-AWD-001.json'))
  const stub = writeStub(dir, `export function explainGroup() { return { predicted_relation: 'related', reasons: ['STUB_WRONG'] } }`)
  const { report } = run(envDir, group('T4', ['pledge-scan-degrade', 'D6-AWD-001']), stub)
  const g4 = report.results[0]
  assert.equal(g4.predicted_relation, 'unknown', '0 可用字段成员存在 → 守卫否决为 unknown')
  assert.match(g4.alignment.discrepancy, /否决/)
  assert.ok(g4.reasons.some((x) => x.startsWith('MEMBER_NO_USABLE_FIELDS:')))
  rmSync(dir, { recursive: true, force: true })
}

// ⑤ 无插件：行为与旧版一致（related 组保留 consistency＋内置互证）
{
  const { dir, envDir } = tempEnvDir()
  for (const c of HZ) cpSync(join(DEMO_ENV, c + '.json'), join(envDir, c + '.json'))
  const { report } = run(envDir, group('T5', HZ), null)
  const g5 = report.results[0]
  assert.equal(g5.predicted_relation, 'related')
  assert.ok(g5.consistency.corroborations.length >= 3, '内置互证保留')
  assert.equal(g5.alignment, undefined, '无插件不产生 alignment 段')
  rmSync(dir, { recursive: true, force: true })
}

// ⑥ 插件 related＋alignEvents：同一模块两入口并用（字段对来自 alignEvents，判定来自 explainGroup）
{
  const { dir, envDir } = tempEnvDir()
  for (const c of HZ) cpSync(join(DEMO_ENV, c + '.json'), join(envDir, c + '.json'))
  const stub = writeStub(dir, `
export function explainGroup(g) { return { predicted_relation: 'related', reasons: ['STUB_SAME'], document_pairs: [{ members: g.members, predicted_relation: 'related' }] } }
export function alignEvents(a, b) { return [{ entityA: '某主体', entityB: '某主体', field: 'shares_after', valueA: 100, valueB: 100, quoteA: 'q', quoteB: 'q' }] }`)
  const { report } = run(envDir, group('T6', HZ), stub)
  const g6 = report.results[0]
  assert.equal(g6.predicted_relation, 'related')
  const pluginCorr = (g6.consistency.corroborations ?? []).filter((c) => c.matcher === 'plugin')
  assert.equal(pluginCorr.length, 1, 'alignEvents 字段对进入互证')
  assert.equal(pluginCorr[0].field, 'shares_after')
  rmSync(dir, { recursive: true, force: true })
}

// ⑦ document_pairs 逐对门控：组 related 但某对 non-same → 该对跳过数值核验
{
  const { dir, envDir } = tempEnvDir()
  const batchEnv = resolve(REPO_ROOT, 'runs/batch-20261004T093750/envelopes')
  for (const c of ['D5-EQC-001', 'D5-EQC-002', 'D5-EQC-003']) cpSync(join(batchEnv, c + '.json'), join(envDir, c + '.json'))
  const stub = writeStub(dir, `
export function explainGroup(g) {
  return { predicted_relation: 'related', reasons: ['STUB_MIX'],
    document_pairs: [
      { members: [g.members[0], g.members[1]], predicted_relation: 'related' },
      { members: [g.members[0], g.members[2]], predicted_relation: 'unknown' },
      { members: [g.members[1], g.members[2]], predicted_relation: 'related' },
    ] }
}
export function alignEvents(a, b) { return [{ entityA: 'X', entityB: 'X', field: 'shares_after', valueA: 1, valueB: 1, quoteA: 'q', quoteB: 'q' }] }`)
  const { report } = run(envDir, group('T7', ['D5-EQC-001', 'D5-EQC-002', 'D5-EQC-003']), stub)
  const g7 = report.results[0]
  assert.equal(g7.predicted_relation, 'related')
  // 桩对每对都返回字段对；门控后只有 same 对 (0,1)/(1,2) 进入，non-same 对 (0,2) 缺席
  const corr = (g7.consistency.corroborations ?? []).filter((c) => c.matcher === 'plugin')
  const pairKey = (c) => [...c.docs].sort().join('|')
  const pairs = new Set(corr.map(pairKey))
  assert.ok(pairs.has('D5-EQC-001|D5-EQC-002') && pairs.has('D5-EQC-002|D5-EQC-003'), 'same 对进入数值核验')
  assert.ok(!pairs.has('D5-EQC-001|D5-EQC-003'), 'non-same 对被门控，不得进入数值核验')
  assert.ok(!JSON.stringify(g7.consistency).includes('"D5-EQC-001","D5-EQC-003"'), 'non-same 对不得进入任何核验分支')
  rmSync(dir, { recursive: true, force: true })
}

console.log('✓ explainGroup 完整入口单测：7 组用例全过（接管/拒数值/异常回退/守卫否决/无插件一致/双入口/逐对门控）')
