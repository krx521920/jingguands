import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
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
  // 陈旧缓存防护：origin/zongbowen 前进后旧物化件失效——ref sha 变了就整目录重建
  const refSha = spawnSync('git', ['rev-parse', REF], { cwd: REPO_ROOT, encoding: 'utf8' })
  if (refSha.status === 0) {
    const sha = refSha.stdout.trim()
    try {
      const prov = JSON.parse(readFileSync(resolve(CACHE_DIR, '.provenance.json'), 'utf8'))
      if (prov.__ref && prov.__ref !== sha) rmSync(CACHE_DIR, { recursive: true, force: true })
    } catch { /* 无 provenance＝首用 */ }
  }
  const target = resolve(CACHE_DIR, relPath)
  if (existsSync(target)) return target
  // 窄克隆（按 tag --depth 1）的 refspec 只含该 tag：普通 fetch 不建跟踪引用——
  // 必须显式 refspec 拉成 refs/remotes/origin/zongbowen，物化才能引用（D16 tag 检出实测）
  if (spawnSync('git', ['rev-parse', '--verify', '--quiet', REF], { cwd: REPO_ROOT }).status !== 0) {
    const f = spawnSync('git', ['fetch', 'origin', '+refs/heads/zongbowen:refs/remotes/origin/zongbowen'], { cwd: REPO_ROOT, encoding: 'utf8' })
    if (f.status !== 0) throw new Error(`评测侧文件 ${relPath} 本地缺失，且 fetch origin/zongbowen 失败：${String(f.stderr).slice(0, 120)}`)
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
  prov.__ref = sha
  writeFileSync(provPath, JSON.stringify(prov, null, 1), 'utf8')
  return target
}
