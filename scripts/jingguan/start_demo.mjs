#!/usr/bin/env node
/** Start the standalone FinStruct UI, result API and optional cold extraction service. */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { once } from 'node:events'

const root = resolve(import.meta.dirname, '../..')
const envFile = resolve(root, '.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)
const args = process.argv.slice(2), config = { ui: 8762, api: 8642, extract: 8788 }
let offline = false, check = false
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--offline') offline = true
  else if (args[i] === '--check') check = true
  else if (['--ui-port', '--api-port', '--extract-port'].includes(args[i])) {
    const name = args[i].split('-')[2], port = Number(args[++i])
    if (!Number.isInteger(port) || (port !== 0 && port < 1024) || port > 65535) throw Error('端口须为 1024–65535，或 0 自动分配')
    config[name] = port
  } else throw Error('未知参数：' + args[i])
}
const fixedPorts = Object.values(config).filter(p => p !== 0)
if (new Set(fixedPorts).size !== fixedPorts.length) throw Error('三个服务必须使用不同端口')
const keyReady = !!(process.env.JINGGUAN_LLM_API_KEY || process.env.DEEPSEEK_API_KEY)
const live = keyReady && !offline
const required = ['workspace/zhangzhibo/ui_redesign/server.js', 'workspace/cjh/page_prototype/server.js', 'scripts/jingguan/run_extract.mjs',
  'corpus/zhangzhibo/d4/parse-official/D4-PLD-001.parse.json', 'corpus/zhangzhibo/d5/parse-official/D5-EQC-002.parse.json', 'corpus/zhangzhibo/d6/parse-official/D6-AWD-002.parse.json']
for (const file of required) if (!existsSync(resolve(root, file))) throw Error('交付包缺少文件：' + file)
console.log(`Node ${process.version} · 输入文件齐备 · 密钥${keyReady ? '已配置' : '未配置'}（不显示内容）`)
if (check) process.exit(0)
const children = [], exits = []
let stopping = false
async function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) if (child.exitCode === null) child.kill()
  await Promise.allSettled(exits)
  process.exitCode = code
  if (process.connected) process.disconnect()
}
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
process.on('message', message => { if (message === 'stop') stop() })
async function launch(label, script, argv, extra) {
  const env = { ...process.env, ...extra }
  // Only the extraction service needs model credentials.
  if (label !== 'extract') for (const name of Object.keys(env)) if (/KEY|SECRET|TOKEN|PASSWORD/i.test(name)) delete env[name]
  const child = spawn(process.execPath, [resolve(root, script), ...argv], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
  children.push(child)
  const exited = once(child, 'exit'); exits.push(exited)
  let output = ''
  child.stdout.on('data', chunk => { output = (output + chunk).slice(-3000) })
  child.stderr.on('data', chunk => { output = (output + chunk).slice(-3000) })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  let ready
  try {
    ;[ready] = await Promise.race([once(child, 'message', { signal: controller.signal }), exited.then(() => { throw Error(`${label} 启动失败（可能端口占用）：${output}`) })])
  } finally { clearTimeout(timer); controller.abort() }
  if (ready.type !== 'ready' || !Number.isInteger(ready.port)) throw Error(`${label} 就绪消息无效`)
  config[label] = ready.port
  exited.then(([code]) => { if (!stopping) { console.error(`${label} 已退出（${code}）`); stop(code || 1) } })
}
try {
  // The extraction service has no offline substitute: /api/live/health reports unavailable.
  if (live) await launch('extract', 'scripts/jingguan/serve_extract.mjs', ['--port', String(config.extract), '--no-cache'], {})
  await launch('api', 'workspace/cjh/page_prototype/server.js', [], { PORT: String(config.api), ENGINE: 'file', EXTRACT_HTTP_URL: '', EXTRACT_CLI_PARSE_DIR: '', EXTRACT_CLI_TXT_DIR: '' })
  await launch('ui', 'workspace/zhangzhibo/ui_redesign/server.js', [], { PORT: String(config.ui), UPSTREAM: `http://127.0.0.1:${config.api}`, EXTRACT_SERVICE_URL: `http://127.0.0.1:${live ? config.extract : 0}` })
  console.log(`FinStruct 已启动：http://127.0.0.1:${config.ui}/`)
  console.log(live ? '真实抽取可用 · 每次禁用缓存 · Ctrl+C 停止全部服务' : '离线查看模式 · 可看结果及导出 · 配置密钥后重启才能真实抽取 · Ctrl+C 停止')
  process.send?.({ type: 'ready', url: `http://127.0.0.1:${config.ui}`, ports: config, live })
} catch (error) { console.error(error.message); await stop(1) }
