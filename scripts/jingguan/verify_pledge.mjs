#!/usr/bin/env node
/**
 * 质押数值核验（D4 接入，方轩诚 D3 工具 verifyPledge 的管道集成）。
 *
 * 职责：把抽取信封（events.json）里的质押数值事实映射为她的 PledgeInput 协议，
 * 调用 tools/fang-verify 的 CLI（原样使用她的实现，不做移植——单一真源在她侧），
 * 汇总 verified/mismatch/calculated/needs_review 状态并输出报告。
 *
 * 映射规则（信封 → PledgeInput）：
 *   每个事件产生至多 4 条核验请求：本次/累计 × 占持股/占总股本。
 *   shares ← pledged_shares_{this_time,cumulative}；ratio ← pledged_ratio_{...}_{of_held,of_total}；
 *   ratioPolicy 按 raw_value 小数位推断（≥3 位小数视为 rounded 披露）。
 *   事件缺哪条事实就跳过哪条（她的协议允许 null，但缺分子/分母时核验无意义）。
 *
 * 用法：npm run jingguan:verify-pledge -- <events.json 或包含它的运行目录/批次目录>
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const FANG_CLI = join(REPO_ROOT, 'tools/fang-verify/src_D3/pledge/cli_D3.ts')

const args = process.argv.slice(2)
if (args.length === 0 || args[0].startsWith('--')) {
  console.log('用法：npm run jingguan:verify-pledge -- <events.json | run目录 | batch目录>')
  process.exit(2)
}
const target = resolve(process.cwd(), args[0])
let envelopeFiles = []
if (statSync(target).isDirectory()) {
  const direct = join(target, 'events.json')
  if (existsSync(direct)) envelopeFiles = [direct]
  else {
    for (const d of readdirSync(target)) {
      const e = join(target, d, 'events.json')
      if (existsSync(e) && !d.startsWith('batch-') && d !== 'envelopes' && d !== 'inputs' && d !== '_archive') envelopeFiles.push(e)
    }
  }
} else envelopeFiles = [target]
if (envelopeFiles.length === 0) { console.error('未找到 events.json'); process.exit(2) }

/** 信封 FieldValue → 她的 Fact；无法构成核验事实返回 null。 */
function toFact(fv, kind, scope, holderId, asOf, eventId, docName, sha, denKind = null) {
  if (!fv || fv.status !== 'extracted' || fv.value === null) return null
  const rawDigits = typeof fv.raw_value === 'string' ? (fv.raw_value.replace(/[,\s，]/g, '').match(/-?\d+(?:\.\d+)?/) ?? [null])[0] : null
  if (rawDigits === null) return null
  const unitMark = { shares: fv.raw_value.match(/(亿股|万股|股)/)?.[1] ?? null, percent: '%' }[kind]
  return {
    measure: {
      kind, rawText: fv.raw_value, rawValue: rawDigits,
      sourceUnit: kind === 'shares' ? (unitMark ?? '股') : '%',
      qualifier: /约|大约/.test(fv.raw_value) ? 'approx' : (/不超过|不高于|最多/.test(fv.raw_value) ? 'at_most' : 'exact'),
      scope, status: rawDigits === '0' ? 'explicit_zero' : 'present',
      denominator: denKind ? { kind: denKind, definition: denKind === 'holder_shares' ? '该股东所持股份' : '公司总股本' } : null,
    },
    context: { companyId: docName, holderId, asOf, eventId },
    source: { document: docName, sha256: sha, page: fv.provenance?.[0]?.page ?? null, locator: fv.provenance?.[0]?.block_id ?? `envelope:${docName}:${eventId}`, sampleType: 'real' },
  }
}

const allInputs = []
const meta = []
for (const ef of envelopeFiles) {
  const env = JSON.parse(readFileSync(ef, 'utf8'))
  const doc = basename(ef)
  const sha = env.source?.file_sha256 ?? null
  const asOf = env.events?.[0]?.fields?.announcement_date?.value ?? env.run_meta?.started_at?.slice(0, 10) ?? null
  for (const ev of env.events ?? []) {
    const f = ev.fields ?? {}
    if (env.events[0].event_type !== undefined && ev.event_type !== 'pledge') continue
    const holder = String(f.pledgor?.value ?? 'unknown-holder')
    for (const [sharesK, ratioK, scope, denKind] of [
      ['pledged_shares_this_time', 'pledged_ratio_this_time_of_held', 'single', 'holder_shares'],
      ['pledged_shares_this_time', 'pledged_ratio_this_time_of_total', 'single', 'total_share_capital'],
      ['pledged_shares_cumulative', 'pledged_ratio_cumulative_of_held', 'cumulative', 'holder_shares'],
      ['pledged_shares_cumulative', 'pledged_ratio_cumulative_of_total', 'cumulative', 'total_share_capital'],
    ]) {
      const sharesF = toFact(f[sharesK], 'shares', scope, holder, asOf, ev.event_id, doc, sha)
      const ratioF = toFact(f[ratioK], 'ratio', scope, holder, asOf, ev.event_id, doc, sha, denKind)
      if (sharesF === null || ratioF === null) continue
      const dec = (String(f[ratioK].raw_value).match(/\d\.(\d+)/) ?? [''])[0].length - 1
      // 分母快照：公告不单独给"持股数"字段，但可从累计股数÷累计占比反推（数学恒等式）。
      // 反推值供核验层计算用，不回填为事实——方 D3 协议"计算值不回填为原文事实"。
      let denFact = null
      let denDerived = false
      const cumS = f['pledged_shares_cumulative']
      const cumRH = f['pledged_ratio_cumulative_of_held']
      const cumRT = f['pledged_ratio_cumulative_of_total']
      const cumR = denKind === 'holder_shares' ? cumRH : cumRT
      if (cumS?.status === 'extracted' && cumR?.status === 'extracted' && typeof cumS.value === 'number' && typeof cumR.value === 'number' && cumR.value !== 0) {
        const den = cumS.value / (cumR.value / 100)
        if (Number.isFinite(den) && den > 0) {
          denFact = {
            measure: { kind: 'shares', rawText: `反推自累计 ${cumS.raw_value} ÷ ${cumR.raw_value}`, rawValue: String(Math.round(den)), sourceUnit: '股', qualifier: 'approx', scope: 'unknown', status: 'present', denominator: null },
            context: { companyId: doc, holderId: holder, asOf: asOf, eventId: ev.event_id },
            source: { document: doc, sha256: sha, page: null, locator: `denominator-derived:${doc}:${ev.event_id}`, sampleType: 'real' },
          }
          denDerived = true
        }
      }
      allInputs.push({
        id: `${doc}:${ev.event_id}:${scope}:${denKind}`,
        shares: sharesF, ratio: ratioF,
        denominator: denFact === null ? null : { kind: denKind, fact: denFact },
        // 分母为反推值时在 id 标注（消费方应降权：反推精度损失 ≈ 累计比例小数位误差）
        ratioPolicy: { mode: 'rounded', decimalPlaces: Math.max(dec, 0) },
      })
      meta.push({ id: `${doc}:${ev.event_id}:${scope}:${denKind}`, event: ev.event_id, doc })
    }
  }
}

if (allInputs.length === 0) {
  console.log('没有可核验的质押数值对（需事件同时具备股数与对应比例且均 extracted）')
  process.exit(0)
}

const tmpIn = join(REPO_ROOT, '.tmp_pledge_input.json')
writeFileSync(tmpIn, JSON.stringify(allInputs, null, 1), 'utf8')
const proc = spawnSync(process.execPath, [FANG_CLI, tmpIn], { encoding: 'utf8', cwd: REPO_ROOT })
// 她的 CLI 成功与失败都是 JSON 到 stdout；解析完整响应后再清理临时文件
let out = null
try { out = JSON.parse(proc.stdout) } catch { /* 非 JSON（崩溃） */ }
const { unlinkSync } = await import('node:fs')
if (out === null || out.status === 'error' || out.results === undefined) {
  console.error('她的 CLI 执行失败：')
  console.error('  message:', out?.message ?? (proc.stderr || proc.stdout).toString().slice(0, 300))
  const sv = out?.sourceValidation
  if (sv !== undefined && sv !== null) console.error('  sourceValidation:', JSON.stringify(sv).slice(0, 300))
  if (out?.results !== undefined) {
    for (const r of out.results.slice(0, 3)) {
      const rr = r.result ?? r
      console.error(`  ${rr.id ?? '?'} → ${rr.status}: ${(rr.reasons ?? []).map((x) => x.message ?? x).join('；').slice(0, 150)}`)
    }
  }
  unlinkSync(tmpIn)
  process.exit(1)
}
unlinkSync(tmpIn)

const byStatus = {}
for (const r of out.results ?? []) byStatus[r.result?.status] = (byStatus[r.result?.status] ?? 0) + 1
console.log(`[核验] ${envelopeFiles.length} 个信封 → ${allInputs.length} 条核验请求`)
console.log(`[结果] ${JSON.stringify(out.summary ?? byStatus)}`)
let bad = 0
for (const r of out.results ?? []) {
  if (r.result?.status === 'mismatch' || r.result?.status === 'invalid') {
    bad++
    console.log(`  ✗ ${r.result.id} → ${r.result.status}: ${(r.result.reasons ?? []).join('；').slice(0, 120)}`)
  }
}
const reportPath = join(REPO_ROOT, 'runs', `verify-pledge-${Date.now()}.json`)
writeFileSync(reportPath, JSON.stringify({ generated: new Date().toISOString(), inputs: allInputs.length, summary: out.summary, results: out.results }, null, 1), 'utf8')
console.log(`[报告] ${reportPath.replace(REPO_ROOT + '\\', '').replace(REPO_ROOT + '/', '')}`)
process.exit(bad > 0 ? 1 : 0)
