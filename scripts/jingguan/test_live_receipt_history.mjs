/** Historical receipts verify their frozen implementation and replay the current postprocessor separately. */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, rmSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
const root = resolve(import.meta.dirname, '../..'), temp = mkdtempSync(join(tmpdir(), 'finstruct-receipt-history-'))
const folder = 'evaluation/run-side/weiwenyu/2026-10-17-live-delivery'
const run = () => spawnSync(process.execPath, [join(temp, folder, 'verify.mjs')], { cwd: temp, encoding: 'utf8', timeout: 20000 })
try {
  cpSync(join(root, folder), join(temp, folder), { recursive: true })
  const manifest = JSON.parse(readFileSync(join(root, folder, 'manifest.json'), 'utf8'))
  for (const file of Object.keys(manifest.source_hashes)) {
    const dest = join(temp, file); mkdirSync(dirname(dest), { recursive: true }); cpSync(join(root, file), dest)
  }
  const good = run(); assert.equal(good.error, undefined); assert.equal(good.status, 0, good.stderr)
  const stats = JSON.parse(good.stdout); assert.equal(stats.web_cli_fields_same, 125); assert.equal(stats.strict_anchors, 240)
  const snapshot = join(temp, folder, 'source-snapshots/notice_status.mjs'), saved = readFileSync(snapshot)
  writeFileSync(snapshot, Buffer.concat([saved, Buffer.from('\n// modified historical source\n')]))
  const tamperedSource = run(); assert.equal(tamperedSource.error, undefined); assert.equal(tamperedSource.status, 1)
  writeFileSync(snapshot, saved)
  const receipt = join(temp, folder, manifest.runs[0].file); writeFileSync(receipt, '{}')
  const tamperedReceipt = run(); assert.equal(tamperedReceipt.error, undefined); assert.equal(tamperedReceipt.status, 1)
  console.log('PASS historical source archive, current-rule replay, source tamper rejection, receipt tamper rejection')
} finally { assert.equal(dirname(temp), resolve(tmpdir())); rmSync(temp, { recursive: true, force: true }) }
