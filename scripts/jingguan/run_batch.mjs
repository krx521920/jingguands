#!/usr/bin/env node
/**
 * 质押闭环批量入口（D3）：一条命令跑 N 份文档，输出逐份信封＋汇总＋（可选）Gold 字段级对照。
 *
 * 用法：
 *   node scripts/jingguan/run_batch.mjs <文件或目录>... [--mock] [--gold] [--gold-manifest <manifest路径>]
 *   npm run jingguan:batch -- corpus/zhangzhibo/parse                  # 张的真实解析
 *   npm run jingguan:batch -- corpus/zongbowen/dev/raw --gold          # 宗 D2 受控样例＋Gold对照
 *   npm run jingguan:batch -- corpus/zongbowen/d3/raw --gold --gold-manifest corpus/zongbowen/d3/manifest.json
 *   npm run jingguan:batch -- corpus/zongbowen/d5/raw --gold --gold-manifest corpus/zongbowen/d5/manifest.json
 *   npm run jingguan:batch -- corpus/zongbowen/d6/raw --gold --gold-manifest corpus/zongbowen/d6/manifest.json
 *   # ↑ D3/D5 评测集；D6 raw/ 即张官方解析（evidence/0.9，哈希一致），自动走块级出处模式
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
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync, copyFileSync } from 'node:fs'
import { basename, resolve, join, dirname } from 'node:path'
import { goldFieldSupported } from './lib/checks.mjs'

const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const RUNNER = join(REPO_ROOT, 'scripts/jingguan/run_extract.mjs')
const GOLD_MANIFEST = join(REPO_ROOT, 'corpus/zongbowen/dev/manifest.json')

// ---------- 参数与文件收集 ----------

function parseArgs(argv) {
  const args = { files: [], mock: false, gold: false, goldManifest: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--mock') args.mock = true
    else if (a === '--gold') args.gold = true
    else if (a === '--gold-manifest') args.goldManifest = argv[++i]
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
  if (n.includes('award') || n.includes('awd') || n.includes('bid')) return 'award_contract'
  return null
}

/** 评测受控样例（pages[].text）→ 纯文本临时文件，返回 {input, caseId, text} 或 null（非该格式）。 */
function fixtureToText(jsonPath, tmpDir) {
  let d
  try { d = JSON.parse(readFileSync(jsonPath, 'utf8')) } catch { return null }
  if (!Array.isArray(d.pages) || typeof d.pages[0]?.text !== 'string') return null
  const text = d.pages.map((p) => p.text).join('\n')
  const caseId = d.case_id ?? basename(jsonPath).replace(/\.json$/, '')
  const txtPath = join(tmpDir, `${caseId}.txt`)
  writeFileSync(txtPath, text, 'utf8')
  return { input: txtPath, caseId, text }
}

/** 宗 D6 评测集 raw/ 即张的官方解析（evidence/0.9，manifest 哈希一致）——判定后走块级出处模式。 */
function isZhangParse(jsonPath) {
  try {
    const d = JSON.parse(readFileSync(jsonPath, 'utf8'))
    return Array.isArray(d.pages) && Array.isArray(d.pages[0]?.blocks)
  } catch { return false }
}

// ---------- Gold 对照 ----------

function valuesEqual(a, b) {
  if (a === b) return true
  // gold 侧布尔与系统侧字符串("true"/"false")视为同值（接口规定 value 用字符串，gold 偶用原生布尔）
  const norm = (v) => (v === true ? 'true' : v === false ? 'false' : v)
  if (typeof a === 'boolean' || typeof b === 'boolean' || a === 'true' || a === 'false' || b === 'true' || b === 'false') {
    return norm(a) === norm(b)
  }
  const na = Number(a), nb = Number(b)
  if (a !== null && b !== null && !Number.isNaN(na) && !Number.isNaN(nb)
    && typeof a !== 'boolean' && typeof b !== 'boolean') return Math.abs(na - nb) < 1e-9
  return false
}

/** 事件自然键（事件类型感知，与分块去重键同构）：
 * pledge = 质押人×质权人×direction；equity_change = holder×direction×shares_before；
 * award_contract = bidder×tenderer×project_name（v0.4.1 加项目名——同组合多标段不碰撞）。
 * direction 缺省视为 pledge——兼容宗 D3 gold 与旧输出。 */
function eventKey(ev) {
  const f = ev.fields ?? {}
  const a = f.pledgor?.value ?? f.holder?.value ?? f.bidder?.value ?? '?'
  const b = f.pledgee?.value ?? f.tenderer?.value ?? ''
  const d = f.direction?.value ?? 'pledge'
  const diff = ev.event_type === 'award_contract'
    ? String(f.project_name?.value ?? '')
    : ev.event_type === 'equity_change'
      ? String(f.shares_before?.value ?? '')
      : ''
  return `${String(a)}|${String(b)}|${String(d)}|${diff}`
}

/** 单事件字段比对：写入 rows，返回 {goldExtracted, hit, wrongFilled, statusMatch, neutral, goldUnsupported, fieldDenominator}。 */
function compareEventFields(mineEv, goldEv, goldText, rows, prefix) {
  const cnt = { goldExtracted: 0, hit: 0, wrongFilled: 0, statusMatch: 0, neutral: 0, goldUnsupported: 0, fieldDenominator: 0 }
  const fields = new Set([...Object.keys(goldEv.fields ?? {}), ...Object.keys(mineEv.fields ?? {})])
  if ('consortium' in (goldEv.fields ?? {}) && !('consortium' in (mineEv.fields ?? {}))) fields.delete('consortium') // gold 旧版单字段，滞后于 v0.3 拆分
  cnt.fieldDenominator = fields.size
  for (const f of [...fields].sort()) {
    const g = goldEv.fields[f]
    const m = mineEv.fields[f]
    const where = prefix ? `${prefix}.${f}` : f
    if (g !== undefined && g.status === 'extracted') {
      if (!goldFieldSupported(g, goldText)) {
        cnt.goldUnsupported++
        rows.push({ field: where, verdict: 'GOLD_UNSUPPORTED', detail: `gold=${JSON.stringify(g.value)} 在原文中无支撑` })
        continue
      }
      cnt.goldExtracted++
      if (m === undefined) rows.push({ field: where, verdict: 'MINE_MISSING', detail: `gold=${JSON.stringify(g.value)}` })
      else if (m.status !== 'extracted') rows.push({ field: where, verdict: 'STATUS_DIFF', detail: `gold=extracted(${JSON.stringify(g.value)}) mine=${m.status}` })
      else if (!valuesEqual(m.value, g.value)) rows.push({ field: where, verdict: 'VALUE_DIFF', detail: `gold=${JSON.stringify(g.value)} mine=${JSON.stringify(m.value)}` })
      else { cnt.hit++; cnt.statusMatch++; rows.push({ field: where, verdict: 'MATCH', detail: `${JSON.stringify(g.value)}` }) }
    } else {
      const goldStatus = g?.status ?? '(未注册)'
      if (g === undefined) {
        cnt.neutral++
        rows.push({ field: where, verdict: m !== undefined && (m.status === 'extracted' || m.status === 'needs_review') ? 'GOLD_UNREGISTERED' : 'MATCH', detail: `gold未注册（版本滞后），mine=${m?.status ?? '无'}` })
        continue
      }
      if (m !== undefined && (m.status === 'extracted' || (m.status === 'needs_review' && m.value !== null))) {
        cnt.wrongFilled++
        rows.push({ field: where, verdict: 'WRONG_FILLED', detail: `gold=${goldStatus} mine=${m.status}(${JSON.stringify(m.value)})` })
      } else {
        cnt.statusMatch++
        rows.push({ field: where, verdict: 'MATCH', detail: `双方均无值（${goldStatus}）` })
      }
    }
  }
  return cnt
}

/** Gold 对照（多事件对齐版）：按事件自然键对齐后逐事件字段比对，聚合指标。 */
function compareWithGold(mine, gold, goldText) {
  const rows = []
  const goldEvents = gold.events ?? []
  const mineEvents = mine.events ?? []
  const metrics = {
    gold_extracted_fields: 0, value_hit: 0, field_accuracy: null,
    wrong_filled: 0, status_match_ratio: null, gold_unsupported: 0,
    gold_events: goldEvents.length, mine_events: mineEvents.length,
    matched_events: 0,
  }
  if (goldEvents.length === 0 && mineEvents.length === 0) return { rows, metrics }
  // 按自然键对齐（同键多事件按出现顺序配对）；名称形态容差：全称/简称互含或子序列（"有格投资"⊂"有格创业投资有限公司"，简称常抽字而成非连续子串）
  const minePool = [...mineEvents]
  let sum = { goldExtracted: 0, hit: 0, wrongFilled: 0, statusMatch: 0, neutral: 0, goldUnsupported: 0, denom: 0 }
  const subseq = (short, full) => { let i = 0; for (const ch of full) { if (ch === short[i]) i++ } return i === short.length }
  const sameName = (a, b) => {
    if (a === b) return true
    if (a.length < 2 || b.length < 2) return false
    if (a.includes(b) || b.includes(a)) return true
    const [s2, f2] = a.length <= b.length ? [a, b] : [b, a]
    return s2[0] === f2[0] && subseq(s2, f2)
  }
  for (const gEv of goldEvents) {
    const key = eventKey(gEv)
    const gk = key.split('|')
    let idx = minePool.findIndex((mEv) => eventKey(mEv) === key)
    if (idx === -1) {
      // 名称形态容差匹配：主体/对手方互含＋direction 相同
      idx = minePool.findIndex((mEv) => {
        const mk = eventKey(mEv).split('|')
        return mk[2] === gk[2] && sameName(mk[0], gk[0]) && sameName(mk[1], gk[1])
      })
    }
    if (idx === -1 && minePool.length === 1 && goldEvents.length === 1) idx = 0 // 单事件退化：直接配对（主体名可能表示形式不同）
    if (idx === -1) {
      rows.push({ field: `(${gEv.event_id} ${key.replace(/\|.*$/, '')})`, verdict: 'MINE_MISSING_EVENT', detail: `gold 事件未在系统输出中找到（键：${key}）` })
      continue
    }
    const mEv = minePool.splice(idx, 1)[0]
    metrics.matched_events++
    const c = compareEventFields(mEv, gEv, goldText, rows, gEv.event_id)
    sum.goldExtracted += c.goldExtracted; sum.hit += c.hit; sum.wrongFilled += c.wrongFilled
    sum.statusMatch += c.statusMatch; sum.neutral += c.neutral; sum.goldUnsupported += c.goldUnsupported; sum.denom += c.fieldDenominator
  }
  for (const extra of minePool) {
    rows.push({ field: `(${extra.event_id} ${eventKey(extra).replace(/\|.*$/, '')})`, verdict: 'MINE_EXTRA_EVENT', detail: `系统多出的事件（键：${eventKey(extra)}）` })
    sum.wrongFilled += 1 // 多余事件至少计一处错误填充倾向
  }
  metrics.gold_extracted_fields = sum.goldExtracted
  metrics.value_hit = sum.hit
  metrics.field_accuracy = sum.goldExtracted === 0 ? null : Number((sum.hit / sum.goldExtracted).toFixed(4))
  metrics.wrong_filled = sum.wrongFilled
  metrics.status_match_ratio = (sum.denom - sum.neutral - sum.goldUnsupported) === 0 ? null : Number((sum.statusMatch / (sum.denom - sum.neutral - sum.goldUnsupported)).toFixed(4))
  metrics.gold_unsupported = sum.goldUnsupported
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
  const manifestPath = args.goldManifest ?? join(REPO_ROOT, 'corpus/zongbowen/dev/manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const base = dirname(manifestPath)
  for (const item of manifest.items) {
    goldMap.set(item.case_id, {
      gold: JSON.parse(readFileSync(join(base, item.gold), 'utf8')),
      eventType: item.event_type,
    })
  }
}

const results = []
for (const file of files) {
  const name = basename(file)
  const eventType = inferEventType(name)
  if (eventType === null) {
    // D6 完成标准：失败/跳过的文件不可从报告分母中删除——记入 results 标记 skipped
    console.log(`[跳过] ${name}：无法推断事件类型`)
    results.push({ case: name.replace(/\.(parse\.)?json$/i, ''), event_type: '?', file: name, run_id: null, ok: false, status: 'skipped', skip_reason: '无法推断事件类型' })
    continue
  }
  let runArgs
  let caseId = null
  let rawText = null
  if (/\.parse\.json$/i.test(name)) {
    runArgs = ['--parse', file, '--event-type', eventType]
    caseId = name.replace(/\.parse\.json$/, '')
  } else if (/\.raw\.json$/i.test(name) && isZhangParse(file)) {
    // 宗 D6 raw/ = 张官方解析（哈希一致）——块级出处模式，case_id 与 manifest 对齐
    runArgs = ['--parse', file, '--event-type', eventType]
    caseId = name.replace(/\.raw\.json$/, '')
  } else if (/\.json$/i.test(name)) {
    const fx = fixtureToText(file, join(batchDir, 'inputs'))
    if (fx === null) {
      // 失败计数闭环：无法识别的文件不得从分母中消失——记 skipped
      console.log(`[跳过] ${name}：非评测样例格式`)
      results.push({ case: name.replace(/\.json$/i, ''), event_type: eventType, file: name, run_id: null, ok: false, status: 'skipped', skip_reason: '非评测样例格式（JSON 无 pages[].text 且非解析块格式）' })
      continue
    }
    runArgs = ['--input', fx.input, '--event-type', eventType]
    caseId = fx.caseId
    rawText = fx.text
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
    // 失败隔离：单文件产物损坏/不可读不得炸整批——按失败记录后继续
    try {
      const events = JSON.parse(readFileSync(join(REPO_ROOT, 'runs', runId, 'events.json'), 'utf8'))
      const statusCount = {}
      for (const ev of events.events ?? []) for (const fv of Object.values(ev.fields ?? {})) statusCount[fv.status] = (statusCount[fv.status] ?? 0) + 1
      entry.status_count = statusCount
      entry.validation_errors = events.run_meta?.errors?.length ?? 0
      if (args.gold && goldMap.has(caseId)) {
        const cmp = compareWithGold(events, goldMap.get(caseId).gold, rawText)
        entry.gold = cmp.metrics
        entry.gold_rows = cmp.rows.filter((r) => r.verdict !== 'MATCH')
      }
    } catch (err) {
      entry.ok = false
      entry.status = 'failed'
      entry.skip_reason = `产物不可读/损坏：${String(err.message).slice(0, 120)}`
    }
  }
  results.push(entry)
}

// 按案例名导出信封（对齐评测脚本 compare-fields.mjs 的 --system-dir 消费方式：
// <case_id>.json），评测方可直接出分
mkdirSync(join(batchDir, 'envelopes'), { recursive: true })
for (const r of results) {
  if (r.ok && r.run_id) {
    copyFileSync(join(REPO_ROOT, 'runs', r.run_id, 'events.json'), join(batchDir, 'envelopes', `${r.case}.json`))
  }
}

// ---------- 汇总报告 ----------

const okCount = results.filter((r) => r.ok).length
const errTotal = results.reduce((n, r) => n + (r.validation_errors ?? 0), 0)
let md = `# 批量运行报告 ${stamp}\n\n- 输入：${results.length} 份（成功 ${okCount}）；契约校验问题合计 ${errTotal} 条\n- 模式：${args.mock ? 'MOCK（不计入真实成绩）' : '真实模型调用'}\n\n| 案例 | 类型 | run_id | 字段状态 | 校验问题 |\n|---|---|---|---|---|\n`
for (const r of results) {
  md += `| ${r.case} | ${r.event_type} | ${r.run_id ?? '—'} | ${r.ok ? JSON.stringify(r.status_count) : '失败'} | ${r.validation_errors ?? '—'} |\n`
}
if (args.gold) {
  md += `\n## Gold 对照（开发期错误定位；正式成绩以评测脚本为准）\n\n| 案例 | gold应提取 | 值命中 | 字段准确率 | 错误填充 | 状态一致率 | gold不可支撑 |\n|---|---|---|---|---|---|---|\n`
  for (const r of results) {
    if (r.gold === undefined) continue
    md += `| ${r.case} | ${r.gold.gold_extracted_fields} | ${r.gold.value_hit} | ${r.gold.field_accuracy === null ? '—' : (r.gold.field_accuracy * 100).toFixed(1) + '%'} | ${r.gold.wrong_filled} | ${r.gold.status_match_ratio === null ? '—' : (r.gold.status_match_ratio * 100).toFixed(1) + '%'} | ${r.gold.gold_unsupported} |\n`
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
