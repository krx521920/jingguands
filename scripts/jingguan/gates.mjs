#!/usr/bin/env node
/**
 * 总门禁——一条命令跑完全部检查（D3 起：任何改动后必跑，替代逐条手敲）。
 *
 * 包含：
 *   1 契约五方机检（schema/registry/插件TS/README/mock＋source_type 枚举核对）
 *   2 出处断言单测（越界/翻转/负值/无尺寸）
 *   3 方轩诚 10 用例（标准化移植验收）
 *   4 宗博文 20 条格式测试（corpus 副本）
 *   5 全量契约校验器（runs/ 全部 events.json）＋6 Gold 一致性机检（check_gold）
 *   6 批量分母回归（损坏JSON/损失文件/产物损坏——失败项留分母，D6-②）
 *   7 git 状态守卫：已跟踪文件被删＝红灯（防误删通配符复发）；.tmp 残留＝红灯
 *   7 远端同步：本地领先 origin＝红灯（防"以为推了"）
 *
 * 用法：npm run jingguan:gates
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const node = process.execPath

function runGate(name, args, opts = {}) {
  const r = spawnSync(node, args, { cwd: REPO_ROOT, encoding: 'utf8' })
  const ok = r.status === 0
  const tail = (r.stdout ?? '').trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] ?? ''
  return { name, ok, tail, fatal: opts.fatal !== false }
}

const results = [
  runGate('契约五方机检', ['scripts/jingguan/test_contract_sync.mjs']),
  runGate('出处断言单测', ['scripts/jingguan/test_checks.mjs']),
  runGate('标准化验收（方10用例）', ['scripts/jingguan/test_normalization.mjs']),
  runGate('宗20条格式测试', ['corpus/zongbowen/tests/standardization-format.test.mjs']),
  runGate('全量契约校验器', ['scripts/jingguan/validate_envelope.mjs']),
  runGate('Gold 一致性机检', ['scripts/jingguan/check_gold.mjs']),
  runGate('抽取行为回归', ['scripts/jingguan/test_regression.mjs']),
  runGate('批量分母回归', ['scripts/jingguan/test_batch_denominator.mjs']),
  runGate('跨文档核验回放', ['scripts/jingguan/verify_crossdoc.mjs', '--envelopes-dir', 'runs/batch-20261003T160213/envelopes', '--manifest', 'corpus/zongbowen/sealed/cross-doc-manifest.json', '--expect']),
  runGate('宗D8配对严格评分', ['scripts/jingguan/test_d8_pairing.mjs']),
  runGate('B归因引擎单测', ['scripts/jingguan/test_attribution.mjs']),
  runGate('方D8完整入口单测', ['scripts/jingguan/test_group_matcher.mjs']),
  runGate('宗D9归因用例', ['scripts/jingguan/test_d9_rules.mjs']),
  runGate('D11缺陷定位固化', ['scripts/jingguan/test_d11_defects.mjs']),
]

// ---- 6 git 状态守卫 ----
const st = spawnSync('git', ['status', '--porcelain'], { cwd: REPO_ROOT, encoding: 'utf8' }).stdout ?? ''
const lines = st.split(/\r?\n/).filter(Boolean)
const deleted = lines.filter((l) => l.startsWith(' D') || l.startsWith('D '))
const tmpFiles = readdirSync(REPO_ROOT).filter((f) => f.startsWith('.tmp'))
results.push({ name: 'git守卫·已跟踪文件零删除', ok: deleted.length === 0, tail: deleted.length === 0 ? '无删除' : `${deleted.length} 个被删：${deleted.slice(0, 3).join('; ')}` })
results.push({ name: 'git守卫·无临时文件残留', ok: tmpFiles.length === 0, tail: tmpFiles.length === 0 ? '干净' : tmpFiles.join(',') })

// ---- 7 远端同步 ----
const fetch = spawnSync('git', ['fetch', 'origin', 'weiwenyu'], { cwd: REPO_ROOT, encoding: 'utf8' })
const remoteExists = spawnSync('git', ['rev-parse', '--verify', '--quiet', 'origin/weiwenyu'], { cwd: REPO_ROOT }).status === 0
if (fetch.status !== 0) {
  results.push({ name: '远端同步', ok: true, tail: '网络不可达，跳过（网络恢复后重跑）', fatal: false })
} else if (!remoteExists) {
  // tag 检出环境（窄克隆无分支引用）：本门禁保护的是开发分支推送纪律，此处改为
  // 校验 HEAD 精确命中已发布 tag（D16 tag 检出实测补充）
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).stdout.trim()
  const tagHit = spawnSync('git', ['rev-parse', 'origin/v1.0-d14-release^{commit}', 'origin/v1.1-d16-candidate^{commit}'], { cwd: REPO_ROOT, encoding: 'utf8' })
  const hit = tagHit.status === 0 && tagHit.stdout.trim().split('\n').includes(head)
  results.push({ name: '远端同步', ok: hit, fatal: false, tail: hit ? `tag 检出环境：HEAD＝已发布 tag ${head.slice(0, 8)}` : 'tag 检出环境但 HEAD 不在任何已发布 tag 上' })
} else {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).stdout.trim()
  const remote = spawnSync('git', ['rev-parse', 'origin/weiwenyu'], { cwd: REPO_ROOT, encoding: 'utf8' }).stdout.trim()
  const ahead = spawnSync('git', ['rev-list', '--count', `origin/weiwenyu..HEAD`], { cwd: REPO_ROOT, encoding: 'utf8' }).stdout.trim()
  results.push({ name: '远端同步（防"以为推了"）', ok: head === remote, tail: head === remote ? `一致 ${head.slice(0, 8)}` : `本地领先 ${ahead} 个提交未推送` })
}

// ---- 汇总 ----
const failed = results.filter((r) => !r.ok)
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.tail ? '｜' + r.tail : ''}`)
console.log(failed.length === 0
  ? `\n全部通过：${results.length} 道门禁`
  : `\n失败 ${failed.length}/${results.length}：${failed.map((f) => f.name).join('、')}`)
process.exit(failed.length === 0 ? 0 : 1)
