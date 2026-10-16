// 导出→导入 回环探针：证实页面导出件能否重新导入
// 用法：node _roundtrip_probe.mjs  （在 page_prototype 目录内执行）
// 会临时落盘文件，运行后由调用方清理 data/ 与 logs/ 的增量
import { createRequire } from 'node:module'
import fs from 'node:fs'

const require = createRequire(import.meta.url)
const s = require('./server.js')
const extractor = require('./bridge/extractor.js')

const DATASET = 'D4-PLD-001'
console.log('[dataset]', DATASET)

// 1) 导出路径（2026-10-17 修复后）：/api/export?format=json 走 file.run 的契约本体
const run = extractor.PROVIDERS.file.run(DATASET)
if (!run.ok) { console.log('[export] file.run FAILED:', run.reason); process.exit(2) }
const serialized = JSON.stringify(run.envelope, null, 2)
console.log('[export] envelope top-level keys:', JSON.stringify(Object.keys(run.envelope)))
console.log('[export] JSON.stringify ok, bytes =', Buffer.byteLength(serialized))

// 2) 把该导出件喂回导入闸门
const entry = s.processUploadFile('_roundtrip_probe.json', Buffer.from(serialized))
console.log('[import] ok =', entry.ok)
console.log('[import] error =', entry.error || '(none)')
console.log('[import] contract_ok =', entry.contract_ok, '| contract_error_count =', entry.contract_error_count)
if (entry.contract_errors) console.log('[import] contract_errors =', JSON.stringify(entry.contract_errors.slice(0, 6)))
console.log('[import] dataset =', entry.dataset, '| events =', entry.events)

// 3) 反证：view 投影层（修复前的导出形状）必须被拒
const view = s.readDataset(DATASET)
const viewEntry = s.processUploadFile('_roundtrip_probe_view.json', Buffer.from(JSON.stringify(view, null, 2)))
console.log('[counter] view-json import: ok =', viewEntry.ok, '(expect false) | error =', String(viewEntry.error || '').slice(0, 80))

process.exit(0)
