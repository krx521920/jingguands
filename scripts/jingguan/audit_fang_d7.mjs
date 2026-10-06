/**
 * 方 D7 标准化适配审计（master@e6334aa2，fxc178 2026-10-03 上传——非 feature 分支）。
 *
 * 背景：D8 群指示"使用你的 D7 实现并传入同事件上下文"。该包在 master 上，此前未消费。
 * 本工具把方 normalizeEnvelope（含 resolveUnitHints 单元格级表头锚＋eventContext 同事件
 * 币种上下文）作为**独立审计层**跑在最终信封上——只产差异报告，不回写信封（gold 语义
 * 不动；78 处降级冲突待宗裁决，见 docs/adjudication/D7-标准化严格性差异-证据页.md）。
 *
 * 用法：node scripts/jingguan/audit_fang_d7.mjs --src <方D7包目录> --envelopes <信封目录> [--parses-map <map.json>] [--out <报告.json>]
 * --parses-map：{case_id: 原始解析文件路径}——信封内嵌块是精简版（无 header_path/
 * source_type/table_ref），强度分类必须用全保真原始解析。
 * 依赖：方D7包目录须含 src_D7/normalization_D7.mts（master@e6334aa2，Node 24 直跑 .mts）。
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

function parseArgs(argv) {
  const a = { src: 'tools/fang-d7', envelopes: 'runs/batch-20261005T063943/envelopes', out: null, parsesMap: 'runs/full-parses-map.json' }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--src') a.src = argv[++i]
    else if (argv[i] === '--envelopes') a.envelopes = argv[++i]
    else if (argv[i] === '--out') a.out = argv[++i]
    else if (argv[i] === '--parses-map') a.parsesMap = argv[++i]
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
// 方案 C 强度分类（宗 D7-分层字段规范）：cell 三重→strong；块级 header_path→medium；
// 表级 table_ref 无 header→weak；引文自带单位（raw_value 含明确单位词）→strong（引文即证据，
// 强于表头推断——映射口径见 docs/d10-cache-integration.md，宗可改枚举归属）；
// UNIT_CONFLICT→conflict；其余→none。
const UNIT_TOKEN = /\d\s*(亿股|万股|股|亿元|万元|元|%)/
// 原始解析块索引（全保真：header_path/source_type/table_ref 都在）——按 case 建懒缓存
const parsesMap = args.parsesMap !== null ? JSON.parse(readFileSync(resolve(REPO_ROOT, args.parsesMap), 'utf8')) : {}
const origBlockCache = new Map()
function origBlocksOf(caseId) {
  if (origBlockCache.has(caseId)) return origBlockCache.get(caseId)
  let blocks = []
  const p = parsesMap[caseId]
  if (p !== undefined) {
    try {
      const doc = JSON.parse(readFileSync(resolve(REPO_ROOT, p), 'utf8'))
      blocks = doc.pages?.flatMap((pg) => pg.blocks ?? []) ?? []
    } catch { blocks = [] }
  }
  origBlockCache.set(caseId, blocks)
  return blocks
}
function classifyStrength(caseId, ch, code) {
  if (code === 'UNIT_CONFLICT') return { evidence_strength: 'conflict', unit_basis: 'conflict' }
  const field = fieldOf(caseId, ch)
  if (field == null) return { evidence_strength: 'unknown', unit_basis: null }
  if (UNIT_TOKEN.test(String(field.raw_value ?? ''))) return { evidence_strength: 'strong', unit_basis: 'quote_internal' }
  const p = field.provenance?.[0]
  const blk = p?.block_id ? origBlocksOf(caseId).find((b) => b.block_id === p.block_id) : null
  if (blk == null) return { evidence_strength: 'unknown', unit_basis: null } // 块定位失败（映射缺/块号漂移）
  if (blk.source_type === 'cell' && blk.table_ref != null && p.source_type === 'cell'
    && p.table_id === blk.table_ref.table_id && p.cell_ref === blk.table_ref.cell_ref) {
    return { evidence_strength: 'strong', unit_basis: 'cell_header' }
  }
  if (typeof blk.header_path === 'string' && blk.header_path.trim().length > 0) {
    return { evidence_strength: 'medium', unit_basis: 'block_header' }
  }
  if (blk.table_ref != null) return { evidence_strength: 'weak', unit_basis: 'table_hint' }
  // 块定位成功但无任何锚（段落裸数字、无单位词、无表头表格）→ 按框架为 none（唯一合法降级档之一）
  return { evidence_strength: 'none', unit_basis: 'none' }
}
const envCache = new Map()
function fieldOf(caseId, ch) {
  if (!envCache.has(caseId)) {
    try { envCache.set(caseId, JSON.parse(readFileSync(resolve(REPO_ROOT, args.envelopes, `${caseId}.json`), 'utf8'))) } catch { envCache.set(caseId, null) }
  }
  return envCache.get(caseId)?.events?.find((e) => e.event_id === ch.event_id)?.fields?.[ch.field] ?? null
}
for (const f of readdirSync(resolve(REPO_ROOT, args.envelopes))) {
  if (!f.endsWith('.json')) continue
  const caseId = f.replace(/\.json$/, '')
  let env
  try { env = JSON.parse(readFileSync(resolve(REPO_ROOT, args.envelopes, f), 'utf8')) } catch { continue }
  if (String(caseId).includes('scan-degrade')) continue // 无块设计：方规则1同向，单独通道
  const blockIndex = new Map((env.source?.parse_meta?.blocks ?? []).map((b) => [b.block_id, b]))
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
    const tier = classifyStrength(caseId, ch, ch.code)
    results.push({
      case: caseId, event: ch.event_id, field: ch.field, code: ch.code, kind,
      evidence_strength: tier.evidence_strength, unit_basis: tier.unit_basis,
      before: { value: b.value, status: b.status, standardized: b.standardized },
      after: { value: a.value, status: a.status, standardized: a.standardized },
    })
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
