"use strict";
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../..');
const RUNS = path.resolve(process.env.FINSTRUCT_RUN_DIR || path.join(ROOT, 'runs/web-live'));
const EXTRACT = process.env.EXTRACT_SERVICE_URL || 'http://127.0.0.1:8788';
const UPSTREAM = process.env.UPSTREAM || 'http://127.0.0.1:8642';
const SAMPLES = [
  { id: 'D4-PLD-001', event_type: 'pledge', path: 'corpus/zhangzhibo/d4/parse-official/D4-PLD-001.parse.json' },
  { id: 'D5-EQC-002', event_type: 'equity_change', path: 'corpus/zhangzhibo/d5/parse-official/D5-EQC-002.parse.json' },
  { id: 'D6-AWD-002', event_type: 'award_contract', path: 'corpus/zhangzhibo/d6/parse-official/D6-AWD-002.parse.json' }
];
const send = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
const fail = (status, message) => Object.assign(new Error(message), { status });
function readJSON(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0, exceeded = false;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 40 * 1024 * 1024) { if (!exceeded) reject(fail(413, '输入不得超过 40 MiB')); exceeded = true; chunks.length = 0; }
      if (!exceeded) chunks.push(chunk);
    });
    req.on('error', reject);
    req.on('end', () => { if (!exceeded) { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(fail(400, '输入不是合法 JSON')); } } });
  });
}
async function upstreamJSON(url, options = {}) {
  const response = await fetch(url, { signal: AbortSignal.timeout(240000), ...options });
  const data = await response.json();
  if (!response.ok) throw fail(response.status, data.error || `服务返回 ${response.status}`);
  return data;
}

/** Live extraction routes. Credentials remain exclusively in the extraction process.
 * Each request bypasses cache and retains its input, original envelope and call log.
 */
module.exports = async function liveApi(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/live/health' && req.method === 'GET') {
    try {
      const data = await upstreamJSON(EXTRACT + '/health', { signal: AbortSignal.timeout(2500) });
      return send(res, 200, { ready: data.ok === true, model: data.model, cache: 'disabled', mode: 'live' });
    } catch { return send(res, 200, { ready: false, mode: 'unavailable', reason: '抽取服务未启动；在仓库根目录配置密钥后运行启动脚本。' }); }
  }
  if (url.pathname === '/api/live/samples' && req.method === 'GET') return send(res, 200, { samples: SAMPLES.map(({ path: input, ...s }) => ({ ...s, available: fs.existsSync(path.join(ROOT, input)) })) });
  if (url.pathname === '/api/live/log' && req.method === 'GET') {
    const id = url.searchParams.get('id') || '';
    if (!/^[a-zA-Z0-9-]+$/.test(id)) return send(res, 400, { error: '非法日志编号' });
    const file = path.join(RUNS, id + '.json');
    if (!fs.existsSync(file)) return send(res, 404, { error: '日志不存在' });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${id}.json"` });
    return res.end(fs.readFileSync(file));
  }
  if (url.pathname !== '/api/live/extract' || req.method !== 'POST') return send(res, 404, { error: '未知真实抽取接口' });
  if ((req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) || req.headers['sec-fetch-site'] === 'cross-site') return send(res, 403, { error: '仅接受本机页面的同源抽取请求' });
  if (!String(req.headers['content-type']).includes('application/json')) return send(res, 415, { error: '请提交 JSON' });
  const id = 'web-' + randomUUID(), started = new Date().toISOString();
  let receipt;
  try {
    const body = await readJSON(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail(400, '需要抽取输入对象');
    let input;
    if (body.sample) {
      const sample = SAMPLES.find(s => s.id === body.sample);
      if (!sample) throw fail(400, '未知内置样例');
      input = { event_type: sample.event_type, parse: JSON.parse(fs.readFileSync(path.join(ROOT, sample.path), 'utf8')) };
    } else {
      if (!['pledge', 'equity_change', 'award_contract'].includes(body.event_type)) throw fail(400, '请选择三类支持的事件之一');
      if (body.parse && typeof body.parse === 'object' && Array.isArray(body.parse.pages) && body.parse.pages.some(p => Array.isArray(p.blocks) && p.blocks.length)) input = { event_type: body.event_type, parse: body.parse };
      else if (typeof body.text === 'string' && body.text.trim()) input = { event_type: body.event_type, text: body.text, file_name: 'input.txt' };
      else throw fail(400, '请提供 evidence 解析 JSON 或公告全文；事件信封请使用结果导入。');
    }
    receipt = { id, channel: 'web', started_at: started, input_sha256: createHash('sha256').update(JSON.stringify(input)).digest('hex'), input, cache: 'disabled' };
    const result = await upstreamJSON(EXTRACT + '/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, cache_dir: 'none' }) });
    Object.assign(receipt, { run_id: result.run_id, envelope: result.envelope, call_log: result.call_log });
    if (!result.ok || !result.envelope || result.envelope.is_mock || !result.call_log || result.call_log.is_mock || result.call_log.error || result.call_log.cache?.enabled !== false) throw fail(502, result.call_log?.error || '抽取未完成真实冷跑；已保留失败日志。');
    const form = new FormData();
    form.append('file', new Blob([JSON.stringify(result.envelope)], { type: 'application/json' }), id + '.json');
    const imported = await upstreamJSON(UPSTREAM + '/api/upload', { method: 'POST', body: form });
    if (imported.ok !== 1 || !imported.results?.[0]?.ok) throw fail(502, '结果入库失败：' + (imported.results?.[0]?.error || '未通过契约校验'));
    receipt.dataset = imported.results[0].dataset;
    receipt.completed_at = new Date().toISOString();
    fs.mkdirSync(RUNS, { recursive: true });
    fs.writeFileSync(path.join(RUNS, id + '.json'), JSON.stringify(receipt, null, 2) + '\n');
    return send(res, 200, { ok: true, dataset: receipt.dataset, run_id: result.run_id, log_url: '/api/live/log?id=' + id, cache: 'disabled', errors: result.envelope.run_meta?.errors || [] });
  } catch (error) {
    const message = String(error.message).slice(0, 500);
    if (receipt) {
      Object.assign(receipt, { error: message, completed_at: new Date().toISOString() });
      fs.mkdirSync(RUNS, { recursive: true });
      fs.writeFileSync(path.join(RUNS, id + '.json'), JSON.stringify(receipt, null, 2) + '\n');
    }
    return send(res, error.status || 502, { ok: false, error: message, ...(receipt ? { log_url: '/api/live/log?id=' + id } : {}) });
  }
};
