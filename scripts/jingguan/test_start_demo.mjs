import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, sep } from 'node:path'
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/KEY|SECRET|TOKEN|PASSWORD/i.test(key)))
const configured = process.argv.includes('--configured')
if (configured) env.JINGGUAN_LLM_API_KEY = 'test-health-only-no-model-call'
const child = fork(new URL('./start_demo.mjs', import.meta.url), [...(configured ? [] : ['--offline']), '--ui-port', '0', '--api-port', '0', '--extract-port', '0'], { env, silent: true })
const exited = once(child, 'exit')
let output = ''
child.stderr.on('data', c => output += c)
try {
  const [ready] = await Promise.race([once(child, 'message', { signal: AbortSignal.timeout(20000) }), exited.then(() => { throw Error(output) })])
  assert.equal(ready.live, configured)
  const response = await fetch(ready.url + '/api/live/health')
  assert.equal((await response.json()).ready, configured)
  const datasets = await (await fetch(ready.url + '/api/datasets')).json()
  assert(datasets.datasets.includes('D6-AWD-002'))
  const page = await (await fetch(ready.url)).text()
  assert(page.includes('开始真实抽取'))
  child.send('stop')
  await exited
  await assert.rejects(fetch(ready.url))
  await assert.rejects(fetch('http://127.0.0.1:' + ready.ports.api))
  if (configured) await assert.rejects(fetch('http://127.0.0.1:' + ready.ports.extract))
  console.log('PASS one-command startup: offline truth, bundled samples, UI, IPC readiness, clean child shutdown')
} finally {
  if (child.exitCode === null) { child.kill(); await exited }
}

// Team members may unzip under a directory containing spaces.
const temp = mkdtempSync(join(tmpdir(), 'finstruct path with spaces-'))
let service, serviceExit
try {
  const script = join(temp, 'scripts/jingguan/serve_extract.mjs')
  mkdirSync(dirname(script), { recursive: true }); mkdirSync(join(dirname(script), 'lib'))
  copyFileSync(new URL('./serve_extract.mjs', import.meta.url), script)
  copyFileSync(new URL('./lib/side_paths.mjs', import.meta.url), join(dirname(script), 'lib/side_paths.mjs'))
  writeFileSync(join(dirname(script), 'run_extract.mjs'), `import fs from 'node:fs'; import path from 'node:path';
const out=path.join(process.argv[process.argv.indexOf('--out-dir')+1], 'test-run'); fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'events.json'),JSON.stringify({run_id:'path-test',events:[]}));
fs.writeFileSync(path.join(out,'call_log.json'),'{}');
console.log('[输出] '+path.join(out,'events.json')); console.log('[日志] '+path.join(out,'call_log.json'));`)
  service = fork(script, ['--port', '0', '--no-cache'], { env: { ...env, JINGGUAN_LLM_API_KEY: 'test-only', JINGGUAN_LLM_BASE_URL: 'http://127.0.0.1:1' }, silent: true })
  serviceExit = once(service, 'exit')
  const [ready] = await Promise.race([once(service, 'message', { signal: AbortSignal.timeout(10000) }), serviceExit.then(() => { throw Error('fixture service exited') })])
  const response = await fetch('http://127.0.0.1:' + ready.port + '/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_type: 'award_contract', text: 'fixture only', cache_dir: 'none' }) })
  assert.equal(response.status, 200, await response.clone().text())
  assert.equal((await response.json()).envelope.run_id, 'path-test')
  console.log('PASS extraction service handles output paths containing spaces (local fixture, no model)')
} finally {
  if (service && service.exitCode === null) { service.kill(); await serviceExit }
  assert(resolve(temp).startsWith(resolve(tmpdir()) + sep))
  rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
