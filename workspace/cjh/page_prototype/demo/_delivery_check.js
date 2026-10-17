// Real HTTP regression: all primary JSON exports can be reimported unchanged;
// malformed static URLs return 400 without terminating the server.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const http = require('node:http');

async function main() {
  const source = path.resolve(__dirname, '..');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jingguan-delivery-'));
  const page = path.join(root, 'page_prototype');
  let child, exited, log = '';
  const failures = [];
  let passed = 0;
  async function check(name, fn) {
    try { await fn(); passed++; }
    catch (error) { failures.push({ name, error: error.message }); }
  }
  try {
    fs.mkdirSync(page);
    for (const item of ['server.js', 'bridge', 'data', 'data_unified', 'public']) {
      fs.cpSync(path.join(source, item), path.join(page, item), { recursive: true });
    }
    fs.cpSync(path.join(source, '../spec'), path.join(root, 'spec'), { recursive: true });
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/KEY|SECRET|TOKEN|PASSWORD/i.test(key)));
    Object.assign(env, { PORT: '0', ENGINE: 'file', EXTRACT_CLI_CMD: '', EXTRACT_HTTP_URL: '' });
    child = fork(path.join(page, 'server.js'), [], {
      env, silent: true, execArgv: ['--require', path.join(__dirname, 'fixtures/listening.cjs')]
    });
    exited = once(child, 'exit');
    child.stdout.on('data', chunk => { log += chunk; });
    child.stderr.on('data', chunk => { log += chunk; });
    const [ready] = await Promise.race([
      once(child, 'message', { signal: AbortSignal.timeout(15000) }),
      exited.then(() => { throw new Error('server exited before readiness: ' + log); })
    ]);
    const base = 'http://127.0.0.1:' + ready.port;
    const get = url => fetch(base + url, { signal: AbortSignal.timeout(5000) });
    const upload = async (name, data) => {
      const form = new FormData();
      form.append('file', new Blob([JSON.stringify(data)], { type: 'application/json' }), name + '.json');
      const res = await fetch(base + '/api/upload', { method: 'POST', body: form, signal: AbortSignal.timeout(5000) });
      assert.equal(res.status, 200);
      return res.json();
    };
    const datasets = fs.readdirSync(path.join(page, 'data_unified')).filter(n => n.endsWith('.json') && !n.endsWith('.check.json'));
    assert(datasets.length > 0, 'primary corpus must not be empty');
    for (const filename of datasets) {
      const dataset = filename.slice(0, -5);
      await check('roundtrip ' + dataset, async () => {
        const response = await get('/api/export?format=json&dataset=' + dataset);
        assert.equal(response.status, 200);
        const envelope = await response.json();
        const imported = await upload('roundtrip-' + dataset, envelope);
        assert.equal(imported.ok, 1, JSON.stringify(imported.results));
        assert.equal(response.headers.get('x-export-contract'), 'v0.3-envelope');
        const engine = JSON.parse(decodeURIComponent(response.headers.get('x-extraction-engine')));
        assert.equal(engine.engine, 'file');
        assert.equal(engine.reruns_extraction, false);
        const result = await (await get('/api/export?format=json&dataset=' + imported.results[0].dataset)).json();
        assert.deepEqual(result, envelope);
      });
    }
    await check('view remains rejected', async () => {
      const view = await (await get('/api/result?dataset=D4-PLD-001')).json();
      const imported = await upload('reject-view', view);
      assert.equal(imported.ok, 0);
      assert.equal(imported.results[0].contract_ok, false);
    });
    await check('missing is_mock remains rejected', async () => {
      const envelope = JSON.parse(fs.readFileSync(path.join(page, 'data_unified/D4-PLD-001.json'), 'utf8'));
      delete envelope.is_mock;
      assert.equal((await upload('reject-missing', envelope)).ok, 0);
    });
    await check('CSV remains available', async () => {
      const response = await get('/api/export?format=csv&dataset=D4-PLD-001');
      assert.equal(response.status, 200);
      assert.match(await response.text(), /run_id,data_mode,event_id/);
    });
    for (const url of ['/%', '/%zz', '/%E4%']) {
      await check('malformed ' + url, async () => {
        assert.equal((await get(url)).status, 400);
        assert.equal((await get('/api/datasets')).status, 200);
      });
    }
    await check('invalid URL returns 500 and keeps server alive', async () => {
      const status = await new Promise((resolve, reject) => {
        const req = http.get({ host: '127.0.0.1', port: ready.port, path: 'http://[' }, res => {
          res.resume();
          res.once('end', () => resolve(res.statusCode));
        });
        req.once('error', reject);
        req.setTimeout(5000, () => req.destroy(new Error('invalid URL request timeout')));
      });
      assert.equal(status, 500);
      assert.equal((await get('/api/datasets')).status, 200);
    });
    await check('missing dataset is 404', async () => {
      assert.equal((await get('/api/export?format=json&dataset=does-not-exist')).status, 404);
    });
  } finally {
    try {
      if (child) {
        try {
          if (process.env.NODE_V8_COVERAGE && child.exitCode === null && child.signalCode === null) {
            const flushed = once(child, 'message', { signal: AbortSignal.timeout(5000) });
            child.send('coverage');
            assert.equal((await flushed)[0].coverage, true);
          }
        } finally {
          if (child.exitCode === null && child.signalCode === null) child.kill();
          await exited;
        }
      }
    } finally {
      assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
      assert(path.basename(root).startsWith('jingguan-delivery-'));
      fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  }
  console.log(JSON.stringify({ passed, failed: failures.length, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
