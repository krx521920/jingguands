import { existsSync } from 'node:fs'
import { relative, resolve } from 'node:path'

/**
 * 并包树（delivery/v2.0）路径解析（2026-10-10 宗并包，裁决 A）：
 * 魏侧 evaluation/D* 证据在并包树上按原路径并入 evaluation/run-side/weiwenyu/（字节不动）；
 * 宗方正典仍在 evaluation/ 原位。本函数让同一命令在 weiwenyu 分支与并包树上等价可跑：
 * 原址存在 → 用原址；原址缺失而 run-side 镜像存在 → 落镜像（stderr 提示一次）；否则原样返回。
 */
export function sideResolve(repoRoot, p, note = true) {
  const abs = resolve(repoRoot, p)
  if (existsSync(abs)) return abs
  const rel = relative(repoRoot, abs).replaceAll('\\', '/')
  if (rel.startsWith('evaluation/')) {
    const mirrorRel = 'evaluation/run-side/weiwenyu/' + rel.slice('evaluation/'.length)
    const mirror = resolve(repoRoot, mirrorRel)
    if (existsSync(mirror)) {
      if (note) console.error(`[side] ${rel} 原址不存在，使用并包树镜像 ${mirrorRel}`)
      return mirror
    }
  }
  return abs
}

/** 写入侧（如 E1 报告）：run-side 镜像已有同名证据文件时写镜像（原位更新我方证据，不混入正典目录），否则写原址。 */
export function sideWriteResolve(repoRoot, p) {
  const abs = resolve(repoRoot, p)
  const rel = relative(repoRoot, abs).replaceAll('\\', '/')
  if (rel.startsWith('evaluation/')) {
    const mirror = resolve(repoRoot, 'evaluation/run-side/weiwenyu/' + rel.slice('evaluation/'.length))
    if (existsSync(mirror)) return { path: mirror, rel: 'evaluation/run-side/weiwenyu/' + rel.slice('evaluation/'.length), mirrored: true }
  }
  return { path: abs, rel, mirrored: false }
}
