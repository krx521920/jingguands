#!/usr/bin/env node
/**
 * E1 官方批次出处命中核验（D16 数据侧收口，2026-10-10）
 *
 * 对首测/E1 权威批次（31 信封，437/437）的全部 provenance 逐条做块级命中核验：
 * quote（NFKC＋去空白归一）∈ 快照块 text_raw——与 run_d9_rules --verify-blocks 同口径。
 * 快照按 sha 键物化（evaluation/D9/snapshot-paths.json，单一真源不复制）。
 *
 * 用法：node scripts/jingguan/check_provenance_e1.mjs [--envelopes <目录>] [--out <json>]
 *   --envelopes 默认 runs/batch-20261008T005756/envelopes（与 E1 同 sha 集）
 * 输出：逐条 {case, event_id, field, block_id, hit, reason} ＋ summary（命中/总数/omit 清单）
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { sideResolve, sideWriteResolve } from './lib/side_paths.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const argv = process.argv.slice(2)
const args = { envelopes: 'runs/batch-20261008T005756/envelopes,runs/d8-demo-20261004/envelopes', out: 'evaluation/D9/e1-provenance-check.json' }
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--envelopes') args.envelopes = argv[++i]
  else if (argv[i] === '--out') args.out = argv[++i]
  else { console.error(`未知参数：${argv[i]}`); process.exit(2) }
}

const norm = (s) => String(s ?? '').normalize('NFKC').replace(/\s+/gu, '')

// ---- 快照索引（按 file_sha256；扫描降级件例外按 parse 文件 sha）----
// 清单与 parse_path 经 sideResolve：并包树（delivery/v2.0）上位于 evaluation/run-side/weiwenyu/ 镜像
const snapPath = sideResolve(REPO_ROOT, 'evaluation/D9/snapshot-paths.json')
const snap = JSON.parse(readFileSync(snapPath, 'utf8'))
const byDocSha = new Map()
const byFileSha = new Map()
for (const d of snap.docs) {
  const parse = JSON.parse(readFileSync(sideResolve(REPO_ROOT, d.parse_path), 'utf8'))
  const blocks = (parse.pages ?? []).flatMap((p) => p.blocks ?? [])
  const idx = new Map(blocks.map((b) => [b.block_id, b]))
  if (d.file_sha256 && /^[0-9a-f]{64}$/i.test(d.file_sha256)) byDocSha.set(d.file_sha256, { d, blocks, idx })
  byFileSha.set(d.parse_file_sha256, { d, blocks, idx })
}

// ---- 逐条核验 ----
const rows = []
let total = 0, hit = 0, omitNoSnap = 0, omitNoQuote = 0, miss = 0
const envDirs = args.envelopes.split(",").map((d) => resolve(REPO_ROOT, d))
const { readdirSync } = await import('node:fs')
const envFiles = []
const seenCases = new Set()
for (const envDir of envDirs) for (const f of readdirSync(envDir).filter((x) => x.endsWith('.json'))) envFiles.push({ envDir, f })
envFiles.sort((a, b) => a.f.localeCompare(b.f))
for (const { envDir, f } of envFiles) {
  // 去重：演示批目录含 E1 语料文档副本（同 case 二次抽取）——首见优先（E1 权威批在前）
  const dedupKey = f.replace(/\.json$/, '')
  if (seenCases.has(dedupKey)) continue
  seenCases.add(dedupKey)
  const env = JSON.parse(readFileSync(resolve(envDir, f), 'utf8'))
  const caseId = f.replace(/\.json$/, '')
  // 快照解析：join 键＝信封 source.file_sha256；找不到再试信封文件自身 sha（扫描降级件口径）
  const envFileSha = createHash('sha256').update(readFileSync(resolve(envDir, f))).digest('hex')
  let snapEntry = byDocSha.get(env.source.file_sha256) ?? byFileSha.get(envFileSha) ?? null
  if (snapEntry === null) {
    // 扫描降级件：信封 file_sha256＝输入解析文件字节哈希——按该文件本体再试
    const advPath = 'corpus/adversarial/pledge-scan-degrade.parse.json'
    if (existsSync(resolve(REPO_ROOT, advPath))) {
      const advSha = createHash('sha256').update(readFileSync(resolve(REPO_ROOT, advPath))).digest('hex')
      if (env.source.file_sha256 === advSha || envFileSha === advSha) snapEntry = byFileSha.get(advSha) ?? null
    }
  }
  for (const ev of env.events ?? []) {
    for (const [fk, fv] of Object.entries(ev.fields ?? {})) {
      for (const p of fv.provenance ?? []) {
        total++
        const base = { case: caseId, event_id: ev.event_id, field: fk, block_id: p.block_id ?? null }
        if (p.block_id === null || p.block_id === undefined || !String(p.quote ?? '').trim()) {
          omitNoQuote++; rows.push({ ...base, hit: null, reason: 'omit_no_block_or_quote' }); continue
        }
        if (snapEntry === null) {
          omitNoSnap++; rows.push({ ...base, hit: null, reason: 'omit_no_snapshot' }); continue
        }
        const blk = snapEntry.idx.get(p.block_id)
        if (blk === undefined) { miss++; rows.push({ ...base, hit: false, reason: 'block_not_found' }); continue }
        const ok = norm(blk.text_raw ?? blk.text).includes(norm(p.quote))
        if (ok) hit++; else miss++
        rows.push({ ...base, hit: ok, reason: ok ? null : 'quote_not_in_block' })
      }
    }
  }
}

const outTarget = sideWriteResolve(REPO_ROOT, args.out) // 镜像已有同名证据时原位更新 run-side，不混入正典 evaluation/D9/
const summary = {
  checked_on: new Date().toISOString().slice(0, 10),
  envelopes_dir: args.envelopes,
  snapshots_manifest: relative(REPO_ROOT, snapPath).replaceAll('\\', '/'),
  provenance_total: total,
  hit, miss,
  omit_no_block_or_quote: omitNoQuote,
  omit_no_snapshot: omitNoSnap,
  omit_detail: rows.filter((r) => r.reason?.startsWith('omit')).map((r) => `${r.case}.${r.field}(${r.reason})`),
  caliber_note: '权威批次集＝E1 31 信封＋D8 演示批 3 信封（key＝file_sha256，快照自 evaluation/D9/snapshot-paths.json 物化，并包树上经 sideResolve 落 evaluation/run-side/weiwenyu/ 镜像）。页面注册表 863 条的口径含其本地 41 文档集（多出的批次外文档不在权威集）；未中条目如实保留不掩——已知 1 条为演示件表单残片引文（DEMO-EQC-HL-0930.direction 的"变动方向□上升下降"，非 E1 计分成员）。',
}
const out = { summary, rows }
writeFileSync(outTarget.path, JSON.stringify(out, null, 1), 'utf8')
console.log(`[E1出处核验] 总 ${total}｜命中 ${hit}｜未中 ${miss}｜omit(无块/引文) ${omitNoQuote}｜omit(无快照) ${omitNoSnap}｜报告 ${outTarget.rel}`)
process.exit(miss === 0 ? 0 : 1)
