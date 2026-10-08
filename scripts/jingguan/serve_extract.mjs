#!/usr/bin/env node
/**
 * N09 抽取 HTTP 入口（D12，回应陈家浩"页面侧可调用的 CLI 抽取入口"）
 *
 * 背景：陈的页面（workspace/cjh/page_prototype）此前只能读现成 JSON 信封，无法发起真实抽取。
 * 本服务把 run_extract.mjs 包装成 HTTP 端点，页面/任意客户端 POST 输入即可拿 v0.3 信封——
 * Web 与 CLI 消费同一抽取器与同一缓存，独立重跑对照（宗 C3）由此可行。
 *
 * 用法（先设环境变量 JINGGUAN_LLM_API_KEY，绝不写文件）：
 *   node scripts/jingguan/serve_extract.mjs [--port 8788] [--cache-dir <目录>|--no-cache]
 *
 * 端点：
 *   GET  /health                → {ok:true, model, cache}
 *   POST /extract               body: {
 *     event_type: 'pledge'|'equity_change'|'award_contract',   // 必填
 *     parse_path: 'corpus/.../X.parse.json',                   // 三选一：仓库内解析文件相对路径
 *     parse: {…解析 JSON 对象},                                 //   或：直接传解析对象
 *     text: '公告全文', file_name: 'xxx.txt',                   //   或：纯文本＋文件名（file_name 用于类型兜底）
 *     cache_dir: '…'                                            // 可选：覆盖服务端默认缓存目录
 *   }
 *   → 200 {ok:true, run_id, envelope, call_log}
 *   → 4xx/5xx {ok:false, error}
 *
 * 默认缓存＝evaluation/D12/wei-runs/cache-snapshot-d12（D12 冻结快照）：
 * 同输入重放得到与 CLI 完全一致的模型响应字节（信封仅 run_id/时间戳类字段不同）——
 * 这正是 Web/CLI 对照的正确口径。要冷跑传 --no-cache 或 cache_dir 指向空目录。
 */
import { createServer } from 'node:http'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const RUNNER = join(REPO_ROOT, 'scripts/jingguan/run_extract.mjs')
const DEFAULT_CACHE = 'evaluation/D12/wei-runs/cache-snapshot-d12'
const TMP_DIR = join(REPO_ROOT, 'runs/_serve_tmp')
const BODY_LIMIT = 40 * 1024 * 1024

// ---------- 参数 ----------
const argv = process.argv.slice(2)
const args = { port: 8788, cacheDir: null, noCache: false }
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--port') args.port = Number(argv[++i])
  else if (argv[i] === '--cache-dir') args.cacheDir = argv[++i]
  else if (argv[i] === '--no-cache') args.noCache = true
  else { console.error(`未知参数：${argv[i]}`); process.exit(2) }
}

const model = process.env.JINGGUAN_LLM_MODEL ?? 'deepseek-chat'
if (!process.env.JINGGUAN_LLM_API_KEY && !process.env.DEEPSEEK_API_KEY) {
  console.error('缺少 JINGGUAN_LLM_API_KEY（或 DEEPSEEK_API_KEY）——抽取入口需要真实密钥，只走环境变量')
  process.exit(1)
}

// ---------- 抽取：构造临时输入后调 CLI（与 CLI 完全同路径，不复制逻辑） ----------
function runExtraction(body, reqId) {
  const { event_type, parse_path, parse, text, file_name, cache_dir } = body ?? {}
  if (!['pledge', 'equity_change', 'award_contract'].includes(event_type)) {
    return { status: 400, error: `event_type 必填（pledge/equity_change/award_contract），收到 ${JSON.stringify(event_type)}` }
  }
  mkdirSync(TMP_DIR, { recursive: true })
  const tag = `${reqId}-${event_type}`
  const cli = ['run_extract.mjs', '--event-type', event_type]
  try {
    if (typeof parse_path === 'string' && parse_path.trim()) {
      cli.push('--parse', parse_path.replace(/^\/+/, '')) // 仓库相对路径
    } else if (parse && typeof parse === 'object') {
      const tmp = join(TMP_DIR, `${tag}.parse.json`)
      writeFileSync(tmp, JSON.stringify(parse), 'utf8')
      cli.push('--parse', tmp)
    } else if (typeof text === 'string' && text.trim()) {
      const tmp = join(TMP_DIR, `${tag}-${file_name ?? 'input.txt'}`)
      writeFileSync(tmp, text, 'utf8')
      cli.push('--input', tmp)
    } else {
      return { status: 400, error: '三选一：parse_path（仓库相对路径）/ parse（对象）/ text＋file_name' }
    }
    cli.push('--out-dir', TMP_DIR)
    if (args.noCache || cache_dir === 'none') cli.push('--no-cache')
    else cli.push('--cache-dir', resolve(REPO_ROOT, cache_dir ?? args.cacheDir ?? DEFAULT_CACHE))

    const proc = spawnSync(process.execPath, [RUNNER, ...cli.slice(1)], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 200_000, env: process.env })
    if (proc.status !== 0) {
      return { status: 502, error: `抽取进程失败（exit ${proc.status}）：${String(proc.stderr || proc.stdout || '').slice(-500)}` }
    }
    // CLI 输出行的最后两个路径＝events.json 与 call_log.json
    const out = String(proc.stdout)
    const paths = [...out.matchAll(/\[输出\]\s*(\S+)|\[日志\]\s*(\S+)/g)].map((m) => m[1] ?? m[2])
    if (paths.length < 1) return { status: 500, error: `未找到产物路径：${out.slice(-300)}` }
    const eventsPath = resolve(REPO_ROOT, paths.find((p) => p.includes('events.json')))
    const envelope = JSON.parse(readFileSync(eventsPath, 'utf8'))
    let call_log = null
    try { call_log = JSON.parse(readFileSync(eventsPath.replace(/events\.json$/, 'call_log.json'), 'utf8')) } catch { /* 降级路径无 call_log 结构差异时容忍 */ }
    return { status: 200, envelope, call_log, stdout_tail: out.slice(-400) }
  } finally {
    // 清理本请求的临时输入；个体运行产物按仓库惯例不落库，由调用方留存返回值即可
    rmSync(join(TMP_DIR, `${tag}.parse.json`), { force: true })
  }
}

// ---------- 服务 ----------
let reqSeq = 0
createServer((req, res) => {
  const json = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)) }
  if (req.method === 'GET' && req.url === '/health') {
    return json(200, { ok: true, model, cache: args.noCache ? 'disabled' : (args.cacheDir ?? DEFAULT_CACHE) })
  }
  if (req.method === 'POST' && req.url === '/extract') {
    let body = ''
    req.on('data', (c) => {
      body += c
      if (body.length > BODY_LIMIT) { req.destroy(); }
    })
    req.on('end', () => {
      const reqId = String(Date.now()) + '-' + (++reqSeq)
      try {
        const parsed = JSON.parse(body || '{}')
        const result = runExtraction(parsed, reqId)
        json(result.status, result.status === 200
          ? { ok: true, run_id: result.envelope.run_id, envelope: result.envelope, call_log: result.call_log }
          : { ok: false, error: result.error })
      } catch (err) {
        json(400, { ok: false, error: `请求解析失败：${err.message}` })
      }
    })
    return
  }
  json(404, { ok: false, error: 'GET /health | POST /extract' })
}).listen(args.port, () => {
  console.log(`[N09 抽取入口] http://127.0.0.1:${args.port}/extract`)
  console.log(`  缓存：${args.noCache ? '禁用（每次真实调用）' : (args.cacheDir ?? DEFAULT_CACHE)}`)
  console.log('  陈侧接入：server.js 代理 /api/extract → POST http://127.0.0.1:' + args.port + '/extract')
})
