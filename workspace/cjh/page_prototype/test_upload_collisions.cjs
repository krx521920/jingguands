// Real HTTP uploads must remain addressable across every registered data batch.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');
const { once, on } = require('node:events');
const { test } = require('node:test');

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'data_unified/D4-PLD-001.json'), 'utf8'));
const envelope = id => ({ ...structuredClone(fixture), run_id: id });

async function withServer(run, extraSeeds = []) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'finstruct-upload-collisions-'));
  const page = path.join(temp, 'page_prototype');
  let child, exited, stderr = '';
  try {
    fs.mkdirSync(page);
    for (const item of ['server.js', 'bridge']) fs.cpSync(path.join(__dirname, item), path.join(page, item), { recursive: true });
    fs.cpSync(path.join(__dirname, '../spec'), path.join(temp, 'spec'), { recursive: true });
    for (const dir of ['data', 'data_unified', 'public']) fs.mkdirSync(path.join(page, dir));
    const seeds = [['data_unified/D4-PLD-001.json', 'frozen-original'], ['data/legacy-upload.json', 'legacy-original'], ...extraSeeds];
    const protectedFiles = new Map();
    for (const [name, id] of seeds) {
      const file = path.join(page, name), bytes = Buffer.from(JSON.stringify(envelope(id)) + '\n');
      fs.writeFileSync(file, bytes); protectedFiles.set(file, bytes);
    }
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/KEY|SECRET|TOKEN|PASSWORD/i.test(key)));
    Object.assign(env, { PORT: '0', ENGINE: 'file', EXTRACT_CLI_CMD: '', EXTRACT_HTTP_URL: '' });
    child = fork(path.join(page, 'server.js'), [], { env, silent: true, execArgv: ['--require', path.join(__dirname, 'demo/fixtures/listening.cjs')] });
    exited = once(child, 'exit');
    child.stdout.resume(); child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-3000); });
    const [ready] = await Promise.race([
      once(child, 'message', { signal: AbortSignal.timeout(15000) }),
      exited.then(() => { throw Error('server exited before ready: ' + stderr); }),
    ]);
    const base = 'http://127.0.0.1:' + ready.port;
    const get = suffix => fetch(base + suffix, { signal: AbortSignal.timeout(10000) });
    async function upload(items) {
      const form = new FormData();
      for (const [name, value] of items) form.append('file', new Blob([JSON.stringify(value)], { type: 'application/json' }), name + '.json');
      const response = await fetch(base + '/api/upload', { method: 'POST', body: form, signal: AbortSignal.timeout(10000) });
      assert.equal(response.status, 200); return response.json();
    }
    async function verify(result, value) {
      assert.equal(result.ok, true, result.error);
      const dataset = result.dataset;
      const response = await get('/api/export?format=json&dataset=' + dataset);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), value, 'JSON export must be the uploaded envelope');
      const view = await (await get('/api/result?dataset=' + dataset)).json();
      assert.equal(view.run_id, value.run_id, 'visible result must use the uploaded run');
      assert.equal(view.extraction_engine.data_source.counts_for_primary, false);
      const csv = await (await get('/api/export?format=csv&dataset=' + dataset)).text();
      const rows = csv.replace(/^\uFEFF/, '').split(/\r?\n/).slice(1).filter(Boolean);
      assert(rows.length > 0);
      assert(rows.every(row => row.startsWith(value.run_id + ',')), 'every CSV row must use the uploaded run');
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(page, 'data', dataset + '.json'), 'utf8')), value);
      const list = await (await get('/api/datasets')).json();
      assert.equal(list.datasets.filter(name => name.toLowerCase() === dataset.toLowerCase()).length, 1);
      for (const [file, bytes] of protectedFiles) assert.deepEqual(fs.readFileSync(file), bytes, 'existing datasets must stay byte-identical');
      return dataset;
    }
    await run({ upload, verify, get, page });
    for (const [file, bytes] of protectedFiles) assert.deepEqual(fs.readFileSync(file), bytes);
  } finally {
    try {
      if (child && child.exitCode === null && child.signalCode === null) {
        try {
          if (process.env.NODE_V8_COVERAGE) {
            const messages = on(child, 'message', { signal: AbortSignal.timeout(5000) });
            child.send('coverage');
            for await (const [message] of messages) if (message.coverage === true) break;
          }
        } finally { child.kill(); }
      }
      if (exited) await exited;
    } finally {
      assert.equal(path.dirname(temp), path.resolve(os.tmpdir()));
      assert(path.basename(temp).startsWith('finstruct-upload-collisions-'));
      fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  }
}

for (const name of ['D4-PLD-001', 'd4-pld-001', 'legacy-upload', 'LEGACY-UPLOAD']) {
  test('same-name upload remains readable without replacing ' + name, () => withServer(async ({ upload, verify }) => {
    const value = envelope('new-run-' + name);
    const result = await upload([[name, value]]);
    assert.equal(result.ok, 1);
    assert.equal(await verify(result.results[0], value), name + '-2');
  }));
}

test('suffix allocation checks both batches and preserves every prior suffix', () => withServer(async ({ upload, verify }) => {
  const value = envelope('after-existing-suffixes');
  const result = await upload([['D4-PLD-001', value]]);
  assert.equal(await verify(result.results[0], value), 'D4-PLD-001-4');
}, [['data_unified/D4-PLD-001-2.json', 'frozen-suffix'], ['data/d4-pld-001-3.json', 'legacy-suffix']]));

test('several same-name files in one request each retain a distinct result', () => withServer(async ({ upload, verify }) => {
  const values = [0, 1, 2].map(i => envelope('same-request-' + i));
  const result = await upload(values.map(value => ['D4-PLD-001', value]));
  assert.equal(result.total, 3); assert.equal(result.ok, 3);
  const names = [];
  for (const [i, value] of values.entries()) names.push(await verify(result.results[i], value));
  assert.deepEqual(names, ['D4-PLD-001-2', 'D4-PLD-001-3', 'D4-PLD-001-4']);
}));

test('overlapping upload requests never overwrite each other or the primary sample', () => withServer(async ({ upload, verify }) => {
  const values = [0, 1, 2, 3].map(i => envelope('overlapping-' + i));
  const results = await Promise.all(values.map(value => upload([['D4-PLD-001', value]])));
  const names = [];
  for (const [i, value] of values.entries()) names.push(await verify(results[i].results[0], value));
  assert.equal(new Set(names.map(name => name.toLowerCase())).size, values.length);
}));

test('mixed valid and invalid same-name inputs report failure without hiding valid uploads', () => withServer(async ({ upload, verify }) => {
  const value = envelope('mixed-valid');
  const result = await upload([['D4-PLD-001', { schema_version: '0.3', events: [] }], ['D4-PLD-001', value]]);
  assert.equal(result.total, 2); assert.equal(result.ok, 1); assert.equal(result.failed, 1);
  assert.equal(result.results[0].ok, false);
  assert.equal(await verify(result.results[1], value), 'D4-PLD-001-2');
}));

test('new names retain their name and JSON can be imported again without replacing it', () => withServer(async ({ upload, verify }) => {
  const value = envelope('fresh-upload');
  const first = await upload([['fresh-sample', value]]);
  assert.equal(await verify(first.results[0], value), 'fresh-sample');
  const second = await upload([['fresh-sample', value]]);
  assert.equal(await verify(second.results[0], value), 'fresh-sample-2');
}));
