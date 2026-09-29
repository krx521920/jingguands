#!/usr/bin/env node
/**
 * 运行目录安全清理——只删除【未被 git 跟踪】的 runs/ 子目录。
 *
 * 背景：D3 曾用 `rm -rf runs/2026*-pledge-*` 清理临时运行，通配符误删 58 个已提交文件。
 * 本工具以 git ls-files 为准，跟踪中的文件所在目录一律不碰；删除已提交证据必须显式
 * `git rm` 走提交留痕。
 *
 * 用法：npm run jingguan:clean-runs -- [--dry]
 *   --dry 只列出将删除的目录，不实际删除。
 */
import { spawnSync } from 'node:child_process'
import { rmSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const RUNS = join(REPO_ROOT, 'runs')
const dry = process.argv.includes('--dry')

const ls = spawnSync('git', ['ls-files', 'runs/'], { cwd: REPO_ROOT, encoding: 'utf8' })
if (ls.status !== 0) {
  console.error('无法获取 git 跟踪清单，拒绝执行：', ls.stderr)
  process.exit(1)
}
const trackedDirs = new Set(ls.stdout.split(/\r?\n/).filter(Boolean).map((f) => f.split('/')[1]))

if (!existsSync(RUNS)) {
  console.log('runs/ 不存在，无事可做。')
  process.exit(0)
}

let removed = 0
for (const name of readdirSync(RUNS)) {
  const full = join(RUNS, name)
  if (!statSync(full).isDirectory() || name === '_archive') continue
  if (trackedDirs.has(name)) continue // 已提交目录绝不碰
  if (dry) {
    console.log(`[dry] 将删除未跟踪目录：${name}`)
  } else {
    rmSync(full, { recursive: true, force: true })
    console.log(`已删除未跟踪目录：${name}`)
  }
  removed++
}
console.log(dry ? `[dry] 共 ${removed} 个未跟踪目录待删（已提交目录未触碰）` : `完成：清理 ${removed} 个未跟踪目录，已提交目录未触碰`)
