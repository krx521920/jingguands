const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');
const { once } = require('node:events');

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'finstruct-live-'));
  const repo = path.resolve(__dirname, '../../..');
  const fixture = JSON.parse(fs.readFileSync(path.join(repo, 'workspace/cjh/page_prototype/data_unified/D6-AWD-002.json'), 'utf8'));
  let calls = 0, uploaded = null, child, exited;
  const service = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/health') return res.end(JSON.stringify({ ok: true, cache: 'disabled' }));
    if (req.url === '/extract') {
      calls++;
      const data = JSON.parse(body);
      assert.equal(data.cache_dir, 'none');
      assert(data.parse || data.text);
      if (data.text === 'fail') { res.statusCode = 502; return res.end(JSON.stringify({ error: 'model unavailable' })); }
      const envelope = { ...fixture, run_id: 'test-live-' + calls, is_mock: data.text === 'mock' };
      return res.end(JSON.stringify({ ok: true, run_id: envelope.run_id, envelope, call_log: { run_id: envelope.run_id, is_mock: false, cache: { enabled: data.text === 'cached' }, error: data.text === 'log-error' ? 'model failed' : null } }));
    }
    if (req.url === '/api/upload') { uploaded = body; return res.end(JSON.stringify({ ok: 1, results: [{ ok: true, dataset: 'saved-test' }] })); }
    res.statusCode = 404; res.end('{}');
  });
  try {
    service.listen(0, '127.0.0.1'); await once(service, 'listening');
    const base = 'http://127.0.0.1:' + service.address().port;
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/KEY|SECRET|TOKEN|PASSWORD/i.test(k)));
    Object.assign(env, { PORT: '0', UPSTREAM: base, EXTRACT_SERVICE_URL: base, FINSTRUCT_RUN_DIR: temp });
    child = fork(path.join(__dirname, 'server.js'), [], { env, silent: true, execArgv: ['--require', path.join(repo, 'workspace/cjh/page_prototype/demo/fixtures/listening.cjs')] });
    exited = once(child, 'exit');
    let log = ''; child.stderr.on('data', c => log += c);
    const [ready] = await Promise.race([once(child, 'message', { signal: AbortSignal.timeout(15000) }), exited.then(() => { throw Error(log); })]);
    const url = 'http://127.0.0.1:' + ready.port;
    const request = (p, data, headers = {}) => fetch(url + p, data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof data === 'string' ? data : JSON.stringify(data) });
    const health = await request('/api/live/health');
    assert.equal(health.status, 200, '新版 UI 必须有真实抽取入口');
    assert.equal((await health.json()).ready, true);
    const samples = await (await request('/api/live/samples')).json();
    assert.equal(samples.samples.length, 3);
    const pdfBytes = fs.readFileSync(path.join(repo, 'scripts/jingguan/fixtures/parser-two-page.pdf'));
    const parsedPdf = await request('/api/live/parse', { pdf_base64: pdfBytes.toString('base64'), file_name: 'award.pdf' });
    assert.equal(parsedPdf.status, 200, await parsedPdf.clone().text());
    assert.equal((await parsedPdf.json()).parse.pages.length, 2);
    assert.equal(calls, 0, 'PDF parsing alone never calls a model');
    assert.equal((await request('/api/live/parse', { pdf_base64: '?' })).status, 400);
    assert.equal((await request('/api/live/parse', {}, { Origin: 'https://example.com' })).status, 403);
    for (const sample of samples.samples) {
      const result = await request('/api/live/extract', { sample: sample.id });
      assert.equal(result.status, 200, await result.clone().text());
      const data = await result.json();
      assert.equal(data.dataset, 'saved-test'); assert(uploaded.includes('test-live-'));
      const receipt = await (await request(data.log_url)).json();
      assert.equal(receipt.call_log.cache.enabled, false);
      assert.equal(receipt.envelope.run_id, data.run_id);
      assert.equal(receipt.channel, 'web');
    }
    for (const [data, code] of [[{}, 400], ['bad json', 400], [{ sample: '../escape' }, 400], [{ event_type: 'award_contract', text: 'fail' }, 502]]) {
      assert.equal((await request('/api/live/extract', data)).status, code);
    }
    assert.equal((await request('/api/live/extract', { sample: samples.samples[0].id }, { Origin: 'https://example.com' })).status, 403);
    assert.equal((await request('/api/live/log?id=..')).status, 400);
    assert.equal((await request('/api/live/log?id=missing')).status, 404);
    assert.equal(calls, 4, '无效输入不得触发模型请求');
    for (const text of ['mock', 'cached', 'log-error']) {
      const response = await request('/api/live/extract', { event_type: 'award_contract', text });
      assert.equal(response.status, 502, '模拟/缓存/调用失败不得伪装真实冷跑');
      const failure = await response.json();
      assert((await (await request(failure.log_url)).json()).error);
    }
    assert.equal((await request('/api/live/extract', {}, { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await request('/api/live/unknown')).status, 404);
    const parseResult = await request('/api/live/extract', { event_type: 'award_contract', parse: { pages: [{ blocks: [{ text_raw: '测试解析输入' }] }] } });
    assert.equal(parseResult.status, 200);
    await new Promise(r => service.close(r));
    assert.equal((await (await request('/api/live/health')).json()).ready, false);
    console.log('PASS UI live HTTP: 3 samples, independent receipts, upload, failures, origin and input guards');
  } finally {
    if (child && child.exitCode === null) {
      try {
        if (process.env.NODE_V8_COVERAGE) {
          const messages = require('node:events').on(child, 'message', { signal: AbortSignal.timeout(5000) });
          child.send('coverage');
          for await (const [message] of messages) if (message.coverage === true) break;
        }
      } finally { child.kill(); await exited; }
    }
    service.closeAllConnections(); await new Promise(r => service.close(r));
    if (!path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw Error('unsafe cleanup');
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
