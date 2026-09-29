#!/usr/bin/env node
/**
 * 质押闭环批量入口（D3）：一条命令跑 N 份文档，输出逐份信封＋汇总＋（可选）Gold 字段级对照。
 *
 * 用法：
 *   node scripts/jingguan/run_batch.mjs <文件或目录>... [--mock] [--gold]
 *   npm run jingguan:batch -- corpus/zhangzhibo/parse            # 张的真实解析
 *   npm run jingguan:batch -- corpus/zongbowen/dev/raw --gold    # 宗的受控样例＋Gold对照
 *
 * 文件类型自动识别：
 *   *.parse.json            → 解析块模式（evidence/0.2，块级出处）
 *   *.json 含 pages[].text  → 评测受控样例（提取文本，纯文本模式）
 *   *.txt                   → 纯文本模式
 * 事件类型按文件名推断：pledge/PLD→pledge；equity/EQC→equity_change；award/AWD→award_contract。
 *
 * 输出：runs/<run_id>/ 逐份产物（events.json＋call_log.json）＋ runs/batch-<stamp>/batch_report.{md,json}。
 * Gold 对照为开发期错误定位用；正式评测成绩以宗博文的独立评测脚本为准。
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync } from 'node:fs'
import { basename, resolve, join } from 'node:path'

const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const RUNNER = join(REPO_ROOT, 'scripts/jingguan/run_extract.mjs')
const GOLD_MANIFEST = join(REPO_ROOT, 'corpus/zongbowen/dev/manifest.json')

// ---------- 参数与文件收集 ----------

function parseArgs(argv) {
  const args = { files: [], mock: false, gold: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--mock') args.mock = true
    else if (a === '--gold') args.gold = true
    else args.files.push(a)
  }
  return args
}

function collectFiles(paths) {
  const files = []
  for (const p of paths) {
    const abs = resolve(process.cwd(), p)
    if (!existsSync(abs)) { console.error(`路径不存在：${p}`); process.exit(2) }
    if (statSync(abs).isDirectory()) {
      for (const f of readdirSync(abs).sort()) files.push(join(abs, f))
    } else files.push(abs)
  }
  return files.filter((f) => /\.(json|txt)$/i.test(f))
}

function inferEventType(name) {
  const n = name.toLowerCase()
  if (n.includes('pledge') || n.includes('pld')) return 'pledge'
  if (n.includes('equity') || n.includes('eqc')) return 'equity_change'
  if (n.includes('award') || n.includes('awd')) return 'award_contract'
  return null
}

/** 评测受控样例（pages[].text）→ 纯文本临时文件，返回 {input, caseId} 或 null（非该格式）。 */
function fixtureToText(jsonPath, tmpDir) {
  let d
  try { d = JSON.parse(readFileSync(jsonPath, 'utf8')) } catch { return null }
  if (!Array.isArray(d.pages) || typeof d.pages[0]?.text !== 'string') return null
  const text = d.pages.map((p) => p.text).join('\n')
  const caseId = d.case_id ?? basename(jsonPath).replace(/\.json$/, '')
  const txtPath = join(tmpDir, `${caseId}.txt`)
  writeFileSync(txtPath, text, 'utf8')
  return { input: txtPath, caseId }
}

// ---------- Gold 对照 ----------

function valuesEqual(a, b) {
  if (a === b) return true
  const na = Number(a), nb = Number(b)
  if (a !== null && b !== null && !Number.isNaN(na) && !Number.isNaN(nb)
    && typeof a !== 'boolean' && typeof b !== 'boolean') return Math.abs(na - nb) < 1e-9
  return false
}

function compareWithGold(mine, gold) {
  const rows = []
  const goldEv = gold.events?.[0]
  const mineEv = mine.events?.[0]
  if (goldEv === undefined || mineEv === undefined) {
    return { rows: [{ field: '(事件缺失)', verdict: 'MINE_MISSING', detail: `mine events=${mine.events?.length ?? 0}` }], metrics: {} }
  }
  const fields = new Set([...Object.keys(goldEv.fields ?? {}), ...Object.keys(mineEv.fields ?? {})])
  if ('consortium' in (goldEv.fields ?? {}) && !('consortium' in (mineEv.fields ?? {}))) fields.delete('consortium') // gold 旧版单字段，滞后于 v0.3 拆分
  let goldExtracted = 0, hit = 0, wrongFilled = 0, statusMatch = 0, neutral = 0
  for (const f of [...fields].sort()) {
    const g = goldEv.fields[f]
    const m = mineEv.fields[f]
    if (g !== undefined && g.status === 'extracted') {
      goldExtracted++
      if (m === undefined) rows.push({ field: f, verdict: 'MINE_MISSING', detail: `gold=${JSON.stringify(g.value)}` })
      else if (m.status !== 'extracted') rows.push({ field: f, verdict: 'STATUS_DIFF', detail: `gold=extracted(${JSON.stringify(g.value)}) mine=${m.status}` })
      else if (!valuesEqual(m.value, g.value)) rows.push({ field: f, verdict: 'VALUE_DIFF', detail: `gold=${JSON.stringify(g.value)} mine=${JSON.stringify(m.value)}` })
      else { hit++; statusMatch++; rows.push({ field: f, verdict: 'MATCH', detail: `${JSON.stringify(g.value)}` }) }
    } else {
      // gold 未给出值（not_* / 缺字段）
      const goldStatus = g?.status ?? '(未注册)'
      if (g === undefined) {
        neutral++
        rows.push({ field: f, verdict: m !== undefined && (m.status === 'extracted' || m.status === 'needs_review') ? 'GOLD_UNREGISTERED' : 'MATCH', detail: `gold未注册（版本滞后），mine=${m?.status ?? '无'}` })
        continue
      }
      if (m !== undefined && (m.status === 'extracted' || (m.status === 'needs_review' && m.value !== null))) {
        wrongFilled++
        rows.push({ field: f, verdict: 'WRONG_FILLED', detail: `gold=${goldStatus} mine=${m.status}(${JSON.stringify(m.value)})` })
      } else {
        statusMatch++
        rows.push({ field: f, verdict: 'MATCH', detail: `双方均无值（${goldStatus}）` })
      }
    }
  }
  const metrics = {
    gold_extracted_fields: goldExtracted,
    value_hit: hit,
    field_accuracy: goldExtracted === 0 ? null : Number((hit / goldExtracted).toFixed(4)),
    wrong_filled: wrongFilled,
    status_match_ratio: (fields.size - neutral) === 0 ? null : Number((statusMatch / (fields.size - neutral)).toFixed(4)),
  }
  return { rows, metrics }
}

// ---------- 主流程 ----------

const args = parseArgs(process.argv.slice(2))
if (args.files.length === 0) {
  console.log('用法：node scripts/jingguan/run_batch.mjs <文件或目录>... [--mock] [--gold]')
  process.exit(2)
}
const files = collectFiles(args.files)
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')
const batchDir = join(REPO_ROOT, 'runs', `batch-${stamp}`)
mkdirSync(join(batchDir, 'inputs'), { recursive: true })

const goldMap = new Map()
if (args.gold) {
  const manifest = JSON.parse(readFileSync(GOLD_MANIFEST, 'utf8'))
  for (const item of manifest.items) {
    goldMap.set(item.case_id, {
      gold: JSON.parse(readFileSync(join(REPO_ROOT, 'corpus/zongbowen/dev', item.gold), 'utf8')),
      eventType: item.event_type,
    })
  }
}

const results = []
for (const file of files) {
  const name = basename(file)
  const eventType = inferEventType(name)
  if (eventType === null) { console.log(`[跳过] ${name}：无法推断事件类型`); continue }
  let runArgs
  let caseId = null
  if (/\.parse\.json$/i.test(name)) {
    runArgs = ['--parse', file, '--event-type', eventType]
    caseId = name.replace(/\.parse\.json$/, '')
  } else if (/\.json$/i.test(name)) {
    const fx = fixtureToText(file, join(batchDir, 'inputs'))
    if (fx === null) { console.log(`[跳过] ${name}：非评测样例格式`); continue }
    runArgs = ['--input', fx.input, '--event-type', eventType]
    caseId = fx.caseId
  } else {
    runArgs = ['--input', file, '--event-type', eventType]
    caseId = name.replace(/\.txt$/, '')
  }
  if (args.mock) runArgs.push('--mock')

  console.log(`\n===== ${caseId}（${eventType}）=====`)
  const proc = spawnSync(process.execPath, [RUNNER, ...runArgs], { encoding: 'utf8' })
  const out = (proc.stdout ?? '') + (proc.stderr ?? '')
  const runIdMatch = out.match(/runs[\\/](\S+?)[\\/]events\.json/)
  const runId = runIdMatch?.[1] ?? null
  const entry = { case: caseId, event_type: eventType, file: name, run_id: runId, ok: proc.status === 0 && runId !== null }
  if (!entry.ok) entry.output_tail = out.split('\n').slice(-6).join('\n')
  if (runId !== null) {
    const events = JSON.parse(readFileSync(join(REPO_ROOT, 'runs', runId, 'events.json'), 'utf8'))
    const statusCount = {}
    for (const ev of events.events ?? []) for (const fv of Object.values(ev.fields ?? {})) statusCount[fv.status] = (statusCount[fv.status] ?? 0) + 1
    entry.status_count = statusCount
    entry.validation_errors = events.run_meta?.errors?.length ?? 0
    if (args.gold && goldMap.has(caseId)) {
      const cmp = compareWithGold(events, goldMap.get(caseId).gold)
      entry.gold = cmp.metrics
      entry.gold_rows = cmp.rows.filter((r) => r.verdict !== 'MATCH')
    }
  }
  results.push(entry)
}

// ---------- 汇总报告 ----------

const okCount = results.filter((r) => r.ok).length
const errTotal = results.reduce((n, r) => n + (r.validation_errors ?? 0), 0)
let md = `# 批量运行报告 ${stamp}\n\n- 输入：${results.length} 份（成功 ${okCount}）；契约校验问题合计 ${errTotal} 条\n- 模式：${args.mock ? 'MOCK（不计入真实成绩）' : '真实模型调用'}\n\n| 案例 | 类型 | run_id | 字段状态 | 校验问题 |\n|---|---|---|---|---|\n`
for (const r of results) {
  md += `| ${r.case} | ${r.event_type} | ${r.run_id ?? '—'} | ${r.ok ? JSON.stringify(r.status_count) : '失败'} | ${r.validation_errors ?? '—'} |\n`
}
if (args.gold) {
  md += `\n## Gold 对照（开发期错误定位；正式成绩以评测脚本为准）\n\n| 案例 | gold应提取 | 值命中 | 字段准确率 | 错误填充 | 状态一致率 |\n|---|---|---|---|---|---|\n`
  for (const r of results) {
    if (r.gold === undefined) continue
    md += `| ${r.case} | ${r.gold.gold_extracted_fields} | ${r.gold.value_hit} | ${r.gold.field_accuracy === null ? '—' : (r.gold.field_accuracy * 100).toFixed(1) + '%'} | ${r.gold.wrong_filled} | ${r.gold.status_match_ratio === null ? '—' : (r.gold.status_match_ratio * 100).toFixed(1) + '%'} |\n`
  }
  const diffRows = results.filter((r) => Array.isArray(r.gold_rows) && r.gold_rows.length > 0)
  if (diffRows.length > 0) {
    md += `\n### 差异明细\n`
    for (const r of diffRows) {
      md += `\n**${r.case}**\n\n| 字段 | 判定 | 说明 |\n|---|---|---|\n`
      for (const row of r.gold_rows) md += `| ${row.field} | ${row.verdict} | ${row.detail.replace(/\|/g, '\\|')} |\n`
    }
  }
}
writeFileSync(join(batchDir, 'batch_report.md'), md, 'utf8')
writeFileSync(join(batchDir, 'batch_report.json'), JSON.stringify({ stamp, mock: args.mock, results }, null, 2), 'utf8')
console.log(`\n[汇总] 成功 ${okCount}/${results.length}，校验问题合计 ${errTotal}`)
console.log(`[报告] runs/batch-${stamp}/batch_report.md`)
if (errTotal > 0 || okCount < results.length) process.exit(1)
