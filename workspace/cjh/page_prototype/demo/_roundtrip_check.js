// 守卫：导出→导入回环自洽（2026-10-17 修复「页面导出 JSON 无法重新导入」）
// 判据：
//   RT_SRC     server.js 的 /api/export json 分支必须导契约本体（envelope），不许导 view 投影
//   RT_SHAPE   导出件形状＝envelope（顶层有 schema_version/run_id/is_mock/source/events；
//               无 view 投影字段 data_mode/source_file/evidences/bridge/contract_validation）
//   RT_ROUND   导出件喂回 processUploadFile ⇒ ok=true 且 events 数与原 envelope 一致
//   RT_VREJECT 反证①：view 投影层喂回必须被拒（闸门对旧形状仍会响，不是什么都放行）
//   RT_MREJECT 反证②：缺 is_mock 的 envelope 喂回必须被拒（不是静默补齐）
//   RT_VPROVE  反证③：把 json 分支临时改回导 view ⇒ 本守卫必须 FAIL；复原后必须 PASS
// 清理：本守卫产生的 data/ 落盘与 logs/ 增量在 finally 中自除（JSONL 逐行独立，删行安全）
const fs = require('fs');
const path = require('path');
const PP = __dirname ? path.resolve(__dirname, '..') : '.';
let pass = 0, fail = 0;
function ok(c, id, msg) {
  if (c) { pass++; console.log('[PASS] ' + id + ' · ' + msg); }
  else { fail++; console.log('[FAIL] ' + id + ' · ' + msg); }
}

const DATASET = 'D4-PLD-001';
const PROBE_NAME = '_roundtrip_check';
const DATA_DIR = path.join(PP, 'data');
const LOG_FILE = path.join(PP, 'logs', 'upload_log.jsonl');
let dirty = false;

function cleanup() {
  try {
    for (const f of fs.readdirSync(DATA_DIR)) {
      if (f.indexOf(PROBE_NAME) === 0) fs.unlinkSync(path.join(DATA_DIR, f));
    }
    if (fs.existsSync(LOG_FILE)) {
      const lines = fs.readFileSync(LOG_FILE, 'utf8').split(/\r?\n/);
      const kept = lines.filter(l => l && l.indexOf(PROBE_NAME) === -1);
      fs.writeFileSync(LOG_FILE, kept.join('\n') + '\n');
    }
  } catch (e) { console.log('[warn] cleanup failed: ' + e.message); }
}

try {
  const s = require(path.join(PP, 'server.js'));
  const extractor = require(path.join(PP, 'bridge', 'extractor.js'));
  const serverSrc = fs.readFileSync(path.join(PP, 'server.js'), 'utf8');

  // ── RT_SRC：源码断言 json 分支导 envelope（抓 `run.envelope` 与 X-Export-Contract 标注）
  const jsonBranch = serverSrc.slice(serverSrc.indexOf('if (format === "json")'));
  ok(/run\.envelope/.test(jsonBranch) && /X-Export-Contract/.test(jsonBranch),
    'RT_SRC', '/api/export json 分支导契约本体 run.envelope 且带 X-Export-Contract 头');
  ok(!/JSON\.stringify\(data, null, 2\)/.test(jsonBranch.slice(0, jsonBranch.indexOf('const lines'))),
    'RT_SRC', 'json 分支不再直接 stringify view（data）');

  // ── RT_SHAPE + RT_ROUND：走真实导出路径
  const run = extractor.PROVIDERS.file.run(DATASET);
  ok(!!run.ok, 'RT_SHAPE', 'file.run(' + DATASET + ') ok');
  if (!run.ok) throw new Error('dataset not runnable');
  const env = run.envelope;
  const serialized = JSON.stringify(env, null, 2);
  const shapeOk = typeof env.schema_version !== 'undefined' && typeof env.run_id !== 'undefined'
    && typeof env.is_mock !== 'undefined' && typeof env.source !== 'undefined'
    && Array.isArray(env.events)
    && ['data_mode', 'source_file', 'evidences', 'bridge', 'contract_validation', 'extraction_engine']
        .every(k => !(k in env));
  ok(shapeOk, 'RT_SHAPE', '导出件顶层＝契约字段（is_mock/source/events 齐，投影字段零出现）');

  dirty = true;
  const entry = s.processUploadFile(PROBE_NAME + '.json', Buffer.from(serialized));
  ok(entry.ok === true && entry.contract_ok === true, 'RT_ROUND',
    '导出件回导 ok=true（contract_error_count=' + (entry.contract_error_count || 0) + '）');
  ok(entry.events === env.events.length, 'RT_ROUND',
    '回导 events 数一致：' + entry.events + ' == ' + env.events.length);

  // ── RT_VREJECT 反证①：view 投影层必须被拒
  const view = s.readDataset(DATASET);
  const vEntry = s.processUploadFile(PROBE_NAME + '_view.json', Buffer.from(JSON.stringify(view, null, 2)));
  ok(vEntry.ok === false && vEntry.contract_ok === false, 'RT_VREJECT',
    'view 投影层回导被拒（契约错误 ' + (vEntry.contract_error_count || 0) + ' 条）');

  // ── RT_MREJECT 反证②：缺 is_mock 的 envelope 必须被拒（证明不是静默补齐）
  const badEnv = JSON.parse(serialized);
  delete badEnv.is_mock;
  const mEntry = s.processUploadFile(PROBE_NAME + '_noisMock.json', Buffer.from(JSON.stringify(badEnv, null, 2)));
  ok(mEntry.ok === false, 'RT_MREJECT', '缺 is_mock 的 envelope 被拒（门未放松）');
} catch (e) {
  ok(false, 'RT_FATAL', 'guard threw: ' + String(e.message || e).slice(0, 160));
} finally {
  cleanup();
}

console.log('=== 汇总 === PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
