/**
 * 方 D7 标准化适配审计（master@e6334aa2，fxc178 2026-10-03 上传——非 feature 分支）。
 *
 * 背景：D8 群指示"使用你的 D7 实现并传入同事件上下文"。该包在 master 上，此前未消费。
 * 本工具把方 normalizeEnvelope（含 resolveUnitHints 单元格级表头锚＋eventContext 同事件
 * 币种上下文）作为**独立审计层**跑在最终信封上——只产差异报告，不回写信封（gold 语义
 * 不动；78 处降级冲突待宗裁决，见 docs/adjudication/D7-标准化严格性差异-证据页.md）。
 *
 * 用法：node scripts/jingguan/audit_fang_d7.mjs --src <方D7包目录> --envelopes <信封目录> [--out <报告.json>]
 * 依赖：方D7包目录须含 src_D7/normalization_D7.mts（master@e6334aa2，Node 24 直跑 .mts）。
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

function parseArgs(argv) {
  const a = { src: 'tools/fang-d7', envelopes: 'runs/batch-20261005T063943/envelopes', out: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--src') a.src = argv[++i]
    else if (argv[i] === '--envelopes') a.envelopes = argv[++i]
    else if (argv[i] === '--out') a.out = argv[++i]
    else { console.error(`未知参数：${argv[i]}`); process.exit(2) }
  }
  return a
}
const args = parseArgs(process.argv.slice(2))

const { normalizeEnvelope, resolveUnitHints } = await import(
  pathToFileURL(resolve(REPO_ROOT, args.src, 'src_D7/normalization_D7.mts')).href
)

/** 从信封自带 parse_meta.blocks 重构 parsed 布局（resolveUnitHints 需要 pages[].blocks）。 */
function parsedFromEnvelope(env) {
  const blocks = env.source?.parse_meta?.blocks
  if (!Array.isArray(blocks)) return null
  const pages = new Map()
  for (const b of blocks) {
    const p = b.page ?? 1
    if (!pages.has(p)) pages.set(p, { page: p, blocks: [] })
    pages.get(p).blocks.push(b)
  }
  return { doc: { file_sha256: env.source.file_sha256 }, pages: [...pages.values()] }
}

const results = []
const byCode = {}
let typeOnly = 0, downgrades = 0, valueSemantic = 0
for (const f of readdirSync(resolve(REPO_ROOT, args.envelopes))) {
  if (!f.endsWith('.json')) continue
  const caseId = f.replace(/\.json$/, '')
  let env
  try { env = JSON.parse(readFileSync(resolve(REPO_ROOT, args.envelopes, f), 'utf8')) } catch { continue }
  if (String(caseId).includes('scan-degrade')) continue // 无块设计：方规则1同向，单独通道
  let hints = {}
  const parsed = parsedFromEnvelope(env)
  if (parsed !== null) {
    try { hints = resolveUnitHints(env, parsed).hints } catch { hints = {} }
  }
  let res
  try { res = normalizeEnvelope(env, hints) } catch (err) {
    results.push({ case: caseId, fatal: String(err?.message ?? err).slice(0, 120) })
    continue
  }
  for (const ch of res.changes) {
    const b = ch.before ?? {}, a = ch.after ?? {}
    const numEq = (x, y) => {
      const nx = typeof x === 'string' && /^-?\d+(\.\d+)?$/.test(x) ? Number(x) : x
      const ny = typeof y === 'string' && /^-?\d+(\.\d+)?$/.test(y) ? Number(y) : y
      return nx === ny
    }
    const kind = ch.code === 'NORMALIZED'
      ? (numEq(b.value, a.value) && b.status === a.status ? 'type_only_number_to_decimal_string' : 'value_semantic_change')
      : (b.status !== a.status ? 'status_downgrade' : 'flag_change')
    if (kind === 'type_only_number_to_decimal_string') typeOnly++
    else if (kind === 'status_downgrade') downgrades++
    else if (kind === 'value_semantic_change') valueSemantic++
    byCode[ch.code] = (byCode[ch.code] ?? 0) + 1
    results.push({ case: caseId, event: ch.event_id, field: ch.field, code: ch.code, kind, before: { value: b.value, status: b.status, standardized: b.standardized }, after: { value: a.value, status: a.status, standardized: a.standardized } })
  }
}
const report = {
  audited_on: new Date().toISOString().slice(0, 10),
  tool: 'audit_fang_d7.mjs',
  source_package: 'master@e6334aa2（方 D7，fxc178 2026-10-03 上传至 master 而非 feature/fang-rules）',
  envelopes: args.envelopes,
  summary: { changes_total: results.filter((r) => !r.fatal).length, by_code: byCode, type_only: typeOnly, status_downgrades: downgrades, value_semantic_changes: valueSemantic },
  note: '独立审计层：不回写信封。status_downgrade＝方D7严格性（无单元格级表头锚不认单位）与现行gold extracted语义的冲突——待宗裁决（docs/adjudication/D7-标准化严格性差异-证据页.md）',
  changes: results,
}
const outStr = JSON.stringify(report, null, 2)
if (args.out !== null) writeFileSync(resolve(REPO_ROOT, args.out), outStr, 'utf8')
console.log(`[D7审计] ${report.summary.changes_total} 变更｜${JSON.stringify(byCode)}｜类型等价 ${typeOnly}｜状态降级 ${downgrades}｜值语义变化 ${valueSemantic}${args.out ? `｜报告 ${args.out}` : ''}`)
if (args.out === null) console.log(outStr)
