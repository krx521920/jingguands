#!/usr/bin/env node
/** CLI 回归：同秒扫描输入保留独立产物；摘要归因不凭通用容差消除差异。 */
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'

const root = resolve(import.meta.dirname, '..', '..')
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/KEY|SECRET|TOKEN|PASSWORD/i.test(key)))
env.JINGGUAN_LLM_BASE_URL = 'http://127.0.0.1:1'
const temp = mkdtempSync(join(tmpdir(), 'jingguan-release-'))
const children = new Set()
const pending = []

function run(args) {
  const promise = new Promise((done) => {
    const child = spawn(process.execPath, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
    children.add(child)
    let stdout = '', stderr = '', error = null, timedOut = false
    const timer = setTimeout(() => { timedOut = true; child.kill() }, 30000)
    child.stdout.on('data', (data) => { stdout += data })
    child.stderr.on('data', (data) => { stderr += data })
    child.on('error', (err) => { error = err.message })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      children.delete(child)
      done({ code, signal, timedOut, error, stdout, stderr })
    })
  })
  pending.push(promise)
  return promise
}

function succeeded(result) {
  assert.equal(result.timedOut, false, '子进程超时')
  assert.equal(result.signal, null, '子进程被信号中断')
  assert.equal(result.error, null)
  assert.equal(result.code, 0, result.stderr)
}

async function scans() {
  const clock = join(temp, 'clock.mjs')
  writeFileSync(clock, `const NativeDate = Date
globalThis.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : ['2026-10-16T00:00:00.000Z'])) }
  static now() { return 1792108800000 }
}
`)
  const output = join(temp, 'outputs')
  const prior = join(output, '20261016T000000-pledge-scan')
  mkdirSync(prior, { recursive: true })
  const sentinel = '{"previous_run":"must remain unchanged"}'
  writeFileSync(join(prior, 'events.json'), sentinel)
  const template = JSON.parse(readFileSync(join(root, 'scripts/jingguan/testdata/D4-SCAN-001.parse.json'), 'utf8'))
  const inputs = Array.from({ length: 4 }, (_, i) => {
    const doc = structuredClone(template), sha = String(i + 1).repeat(64)
    Object.assign(doc.doc, { file_name: `scan-${i}.pdf`, file_sha256: sha, file_id: `sha256:${sha}` })
    Object.assign(doc.handoff.source, { file_name: `scan-${i}.pdf`, file_sha256: sha, file_id: `sha256:${sha}` })
    const file = join(temp, `scan-${i}.json`)
    writeFileSync(file, JSON.stringify(doc))
    return { file, sha }
  })
  const jobs = Array.from({ length: 20 }, (_, i) => inputs[i % inputs.length])
  const results = await Promise.all(jobs.map(({ file }) => run([
    '--import', pathToFileURL(clock).href, 'scripts/jingguan/run_extract.mjs',
    '--parse', file, '--event-type', 'pledge', '--out-dir', output,
  ])))
  results.forEach(succeeded)
  const dirs = readdirSync(output).filter((name) => name !== '20261016T000000-pledge-scan')
  assert.equal(dirs.length, 20, '20 个成功进程必须留下 20 份独立结果（含同输入重复运行）')
  assert.equal(readFileSync(join(prior, 'events.json'), 'utf8'), sentinel, '不能覆盖已有产物')
  const counts = new Map()
  for (const dir of dirs) {
    const envelope = JSON.parse(readFileSync(join(output, dir, 'events.json'), 'utf8'))
    const log = JSON.parse(readFileSync(join(output, dir, 'call_log.json'), 'utf8'))
    assert.equal(envelope.run_id, dir)
    assert.equal(log.run_id, dir)
    assert.equal(log.request.mode, 'scan-degraded')
    assert.equal(log.response, null, '扫描降级不得调用模型')
    assert.equal(envelope.run_meta.started_at, '2026-10-16T00:00:00.000Z')
    for (const event of envelope.events) for (const field of Object.values(event.fields)) {
      assert.equal(field.status, 'unreadable')
      assert.equal(field.value, null)
    }
    counts.set(envelope.source.file_sha256, (counts.get(envelope.source.file_sha256) ?? 0) + 1)
  }
  for (const { sha } of inputs) assert.equal(counts.get(sha), 5, '每个来源的五次运行都须保留')
  console.log('PASS 扫描：固定同秒 20/20 独立产物，4 来源各 5 份，已有产物未覆盖，零模型调用')
}

async function rounding() {
  const cases = [
    ['精确股数', [1000000, 1004500], ['质押1,000,000股', '质押1,004,500股']],
    ['只差一股', [1000000, 1000001], ['持股1,000,000股', '持股1,000,001股']],
    ['只差一分', [100, 100.01], ['金额100元', '金额100.01元']],
    ['负数小差异', [-100, -100.01], ['金额-100元', '金额-100.01元']],
    ['边界内', [995001, 1000000], ['持股995,001股', '持股1,000,000股']],
    ['边界上', [995000, 1000000], ['持股995,000股', '持股1,000,000股']],
    ['边界外', [994999, 1000000], ['持股994,999股', '持股1,000,000股']],
    ['约数无精度', [1000000, 1004500], ['约1,000,000股', '1,004,500股']],
    ['无引文', [1000000, 1004500], ['', '']],
    ['合计差一股', [3000000, 1000000, 1999999], ['合计3,000,000股', '持股1,000,000股', '持股1,999,999股']],
  ]
  const groups = cases.map(([id, values, quotes]) => ({
    group_id: id, predicted_relation: 'related', reasons: [],
    consistency: { conflicts: [{ entity: '同一主体', field: 'shares_after',
      values: values.map((value, i) => ({ doc: `d${i}`, value, quote: quotes[i] })) }],
    corroborations: [], complementaries: [] },
  }))
  const file = join(temp, 'rounding.json')
  writeFileSync(file, JSON.stringify({ results: groups }))
  const result = await run(['scripts/jingguan/attribute_b.mjs', '--report', file])
  succeeded(result)
  const report = JSON.parse(result.stdout.slice(result.stdout.indexOf('{')))
  assert.equal(report.attributions.length, cases.length)
  for (const item of report.attributions) {
    assert.equal(item.attribution, 'unexplained_needs_review', `${item.group_id}：无精度证据不得消除差异`)
    assert.equal(item.decided_by, 'builtin:UNEXPLAINED_DISCREPANCY')
  }
  console.log(`PASS 舍入：${cases.length}/${cases.length} 保留疑点，不套用通用百分比容差`)
}

let failures = 0
try {
  for (const test of [scans, rounding]) {
    try { await test() } catch (error) { failures++; console.error(`FAIL ${test.name}: ${error.message}`) }
  }
} finally {
  for (const child of children) child.kill()
  await Promise.all(pending)
  rmSync(temp, { recursive: true, force: true })
}
process.exitCode = failures ? 1 : 0
