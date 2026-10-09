import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const REF = 'origin/zongbowen'
const CACHE_DIR = resolve(REPO_ROOT, 'runs/.tmp-eval')

/**
 * D13 单一真源（宗 2026-10-09 审计裁定）：evaluation/ 评测侧文件以 zongbowen 分支为唯一正典，
 * 抽取侧分支不保留副本。需要运行时消费（门禁/冻结/评分），用本函数按需从 git 引用物化到
 * runs/.tmp-eval/（字节精确，git show 输出直写）。物化来源 sha 记入 .provenance.json 可追溯。
 */
export function evalFile(relPath) {
  if (relPath.startsWith('evaluation/')) relPath = relPath.slice('evaluation/'.length)
  const target = resolve(CACHE_DIR, relPath)
  if (existsSync(target)) return target
  if (spawnSync('git', ['rev-parse', '--verify', '--quiet', REF], { cwd: REPO_ROOT }).status !== 0) {
    const f = spawnSync('git', ['fetch', 'origin', 'zongbowen'], { cwd: REPO_ROOT, encoding: 'utf8' })
    if (f.status !== 0) throw new Error(`评测侧文件 ${relPath} 本地缺失，且 fetch origin/zongbowen 失败`)
  }
  const show = spawnSync('git', ['show', `${REF}:evaluation/${relPath}`], { cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024 })
  if (show.status !== 0) throw new Error(`origin/zongbowen 无 evaluation/${relPath}：${String(show.stderr).slice(0, 160)}`)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, show.stdout) // Buffer 直写，字节精确
  const provPath = resolve(CACHE_DIR, '.provenance.json')
  let prov = {}
  try { prov = JSON.parse(readFileSync(provPath, 'utf8')) } catch { /* 首次 */ }
  const sha = spawnSync('git', ['rev-parse', REF], { cwd: REPO_ROOT, encoding: 'utf8' }).stdout.trim()
  prov[relPath] = { ref: REF, sha, fetched_files_bytes: show.stdout.length }
  writeFileSync(provPath, JSON.stringify(prov, null, 1), 'utf8')
  return target
}
