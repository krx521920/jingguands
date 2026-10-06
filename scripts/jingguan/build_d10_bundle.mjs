/**
 * D10 集成 bundle 构建器——消费宗 evaluation/D10/cases/integration-cases.json（10 组），
 * 产出其 check-integration.mjs 校验的 bundle（runs/D10-integration-bundle.json）。
 *
 * 每案例条目：input_sha256[]（成员信封 source.file_sha256）· run_id（该组 B 运行 id）·
 * code_version · schema_version · records[]（成员 A 运行＋缓存命中态）· diff_list[]（B 冲突清单）·
 * report{events,diffs,attribution,boundaries} · cache{三项一致性，取自当日实测证据}。
 * 成员信封查找顺序：<--envelopes>（当日冷批）→ runs/d8-demo-20261004/envelopes（演示补料）。
 * 用法：node scripts/jingguan/build_d10_bundle.mjs --envelopes <dir> [--out <bundle.json>]
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const node = process.execPath

function parseArgs(argv) {
  const a = { envelopes: null, out: 'runs/D10-integration-bundle.json', cases: 'evaluation/D10/cases/integration-cases.json' }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--envelopes') a.envelopes = argv[++i]
    else if (argv[i] === '--out') a.out = argv[++i]
    else if (argv[i] === '--cases') a.cases = argv[++i]
    else { console.error(`未知参数：${argv[i]}`); process.exit(2) }
  }
  if (a.envelopes === null) { console.error('用法：build_d10_bundle.mjs --envelopes <当日批次信封目录> [--out ...]'); process.exit(2) }
  return a
}
const args = parseArgs(process.argv.slice(2))

/** 成员信封查找：当日批次 → 演示目录（DEMO-* 成员）。 */
function envelopePathFor(member) {
  const p1 = resolve(REPO_ROOT, args.envelopes, `${member}.json`)
  if (existsSync(p1)) return p1
  const p2 = resolve(REPO_ROOT, 'runs/d8-demo-20261004/envelopes', `${member}.json`)
  if (existsSync(p2)) return p2
  return null
}

/** 读成员 call_log 的缓存命中态（按信封 run_id 定位 runs/<run_id>/call_log.json）。 */
function memberRecord(member) {
  const p = envelopePathFor(member)
  if (p === null) return { case_id: member, envelope_found: false, run_id: null, cached: null, model_calls: null }
  const env = JSON.parse(readFileSync(p, 'utf8'))
  let cached = null, hits = null, misses = null
  const cl = resolve(REPO_ROOT, 'runs', String(env.run_id), 'call_log.json')
  if (existsSync(cl)) {
    try {
      const log = JSON.parse(readFileSync(cl, 'utf8'))
      if (log.cache?.enabled) { cached = log.cache.hit; hits = log.cache.hits; misses = log.cache.misses }
    } catch { /* 边车缺失如实 null */ }
  }
  return {
    case_id: member, envelope_found: true, run_id: env.run_id,
    file_sha256: env.source.file_sha256, is_mock: env.is_mock,
    events: (env.events ?? []).length,
    cache: { hit: cached, hits, misses },
  }
}

const cases = JSON.parse(readFileSync(resolve(REPO_ROOT, args.cases), 'utf8')).cases ?? JSON.parse(readFileSync(resolve(REPO_ROOT, args.cases), 'utf8'))
const codeVersion = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8', stdio: 'pipe' }).stdout.trim()

// 缓存三一致性（当日实测：冷批→重放批→清缓存冷批，见 runs/D10-cache-evidence.json）
const cacheEvidence = existsSync(resolve(REPO_ROOT, 'runs/D10-cache-evidence.json'))
  ? JSON.parse(readFileSync(resolve(REPO_ROOT, 'runs/D10-cache-evidence.json'), 'utf8'))
  : null
if (cacheEvidence === null) { console.error('缺少 runs/D10-cache-evidence.json（三态实测证据）——先跑缓存三联'); process.exit(2) }

const results = []
const tmp = mkdtempSync(join(tmpdir(), 'd10-bundle-'))
try {
  for (const c of cases) {
    const inputSha = []
    const records = []
    let schemaVersion = '0.3'
    for (const m of c.members) {
      const rec = memberRecord(m)
      records.push(rec)
      if (rec.file_sha256) inputSha.push(rec.file_sha256)
      else inputSha.push(null)
    }
    // B 运行：临时 manifest → verify_crossdoc（--d9-enrich 顺带给归因备料）
    const mPath = join(tmp, 'm.json').replace(/\\/g, '/')
    const envDir = join(tmp, 'env').replace(/\\/g, '/')
    spawnSync(node, ['-e', `const fs=require('fs');fs.mkdirSync('${envDir}',{recursive:true})`])
    for (const m of c.members) {
      const p = envelopePathFor(m)
      spawnSync(node, ['-e', `const fs=require('fs');fs.copyFileSync(${JSON.stringify(p).replace(/"/g, "'")},${JSON.stringify(join(envDir, m + '.json')).replace(/"/g, "'")})`])
    }
    writeFileSync(mPath, JSON.stringify({ groups: [{ group_id: c.case_id, members: c.members }] }))
    const outPath = join(tmp, 'b.json').replace(/\\/g, '/')
    const r = spawnSync(node, ['scripts/jingguan/verify_crossdoc.mjs', '--envelopes-dir', envDir, '--manifest', mPath, '--d9-enrich', '--matcher', 'tools/fang-matching/src_D8/matching_D8.mjs', '--out', outPath], { cwd: REPO_ROOT, encoding: 'utf8' })
    let relation = null, reasons = [], conflicts = [], corroborations = [], complementaries = [], bRunId = null
    try {
      const rep = JSON.parse(readFileSync(outPath, 'utf8'))
      const g = rep.results[0]
      relation = g.predicted_relation
      reasons = g.reasons ?? []
      conflicts = g.consistency?.conflicts ?? []
      corroborations = g.consistency?.corroborations ?? []
      complementaries = g.consistency?.complementaries ?? []
      bRunId = rep.b_run?.b_run_id ?? null
      schemaVersion = rep.results[0]?.a_run_links?.[0]?.schema_version ?? '0.3'
    } catch { /* B 运行失败如实空 */ }
    // 归因：有冲突才跑 attribute_b（内置链；方库可在 D9 通路复用）
    let attribution = { conflict_count: conflicts.length, attributions: [], note: conflicts.length === 0 ? '零冲突（引擎零误报）——无需归因' : null }
    if (conflicts.length > 0) {
      const attrOut = join(tmp, 'a.json').replace(/\\/g, '/')
      spawnSync(node, ['scripts/jingguan/attribute_b.mjs', '--report', outPath, '--out', attrOut], { cwd: REPO_ROOT, encoding: 'utf8' })
      try { attribution.attributions = JSON.parse(readFileSync(attrOut, 'utf8')).attributions ?? [] } catch { /* 如实空 */ }
    }
    const boundaries = []
    if (relation === 'unknown') boundaries.push(...reasons.filter((x) => x.startsWith('MEMBER_NO_USABLE_FIELDS') || x === 'INSUFFICIENT_SIGNALS').map((x) => `证据不足：${x}`))
    for (const rec of records) if (rec.envelope_found === false) boundaries.push(`成员信封缺失：${rec.case_id}`)
    results.push({
      case_id: c.case_id,
      title: c.title ?? null,
      input_sha256: inputSha,
      run_id: bRunId ?? `manual-${codeVersion}`,
      code_version: codeVersion,
      schema_version: schemaVersion,
      records,
      diff_list: conflicts.map((x) => ({ entity: x.entity ?? null, field: x.field ?? null, kind: x.kind ?? 'value_mismatch' })),
      report: {
        events: records.map((r2) => ({ case_id: r2.case_id, events: r2.events ?? null })),
        diffs: { conflicts: conflicts.length, corroborations: corroborations.length, complementaries: complementaries.length, relation },
        attribution,
        boundaries,
      },
      cache: {
        replay_business_fields_identical: cacheEvidence.replay_business_fields_identical === true,
        cold_cache_new_call_log: cacheEvidence.cold_cache_new_call_log === true,
        web_cli_same_result: cacheEvidence.web_cli_same_result === true,
        evidence: cacheEvidence.source ?? null,
      },
    })
    console.log(`[bundle] ${c.case_id} ${relation ?? '?'}｜冲突 ${conflicts.length}｜互证 ${corroborations.length}`)
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
const bundle = {
  built_at: new Date().toISOString(),
  built_by: 'build_d10_bundle.mjs',
  code_version: codeVersion,
  cache_definitions: {
    replay_business_fields_identical: '冷批 vs 重放批 31 信封业务字段（schema/is_mock/sha/events 全量）逐字节一致',
    cold_cache_new_call_log: '清缓存后重跑产生全新调用日志（cache.hit=false），见证据文件',
    web_cli_same_result: 'CLI 产物（信封 JSON）为唯一事实源，Web（陈页面）读取同一文件——三态批次两两逐字节一致',
  },
  results,
}
writeFileSync(resolve(REPO_ROOT, args.out), JSON.stringify(bundle, null, 2), 'utf8')
console.log(`[bundle] ${results.length} 案例 → ${args.out}`)
