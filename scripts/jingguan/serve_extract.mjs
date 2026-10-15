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
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { spawnSync, spawn } from 'node:child_process'
import { resolve, dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sideResolve } from './lib/side_paths.mjs'

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
// W2（两天冲刺）：异步化（spawn，不阻塞事件循环——抽取期间 /health 仍响应）；
// 每请求独立 outDir（req<id>/，杜绝同秒同哈希 run_id 互相覆写）；并发受限＋失败单列见服务段
async function runExtraction(body, reqId) {
  const { event_type, parse_path, parse, text, file_name, cache_dir } = body ?? {}
  if (!['pledge', 'equity_change', 'award_contract'].includes(event_type)) {
    return { status: 400, error: `event_type 必填（pledge/equity_change/award_contract），收到 ${JSON.stringify(event_type)}` }
  }
  mkdirSync(TMP_DIR, { recursive: true })
  const tag = `${reqId}-${event_type}`
  const outDir = join(TMP_DIR, `req${reqId}`) // 每请求独立产物目录（W2：20 并发输入＝20 份独立结果）
  let tmpTextPath = null // 本请求的 text 临时输入（finally 统一清理）
  const cli = ['run_extract.mjs', '--event-type', event_type]
  try {
    if (typeof parse_path === 'string' && parse_path.trim()) {
      // D16 验收缺陷②：路径守卫——只允许仓库内相对路径（拒绝绝对路径/.. 穿越逃出仓库），
      // 且须真实存在（原实现对缺失路径回吐子进程栈痕迹，既是噪音也是信息泄漏面）
      const rel = parse_path.replace(/^\/+/, '').replaceAll('\\', '/')
      const norm = resolve(REPO_ROOT, rel)
      if (!norm.startsWith(REPO_ROOT + sep) || rel.split('/').includes('..')) {
        return { status: 400, error: 'parse_path 只接受仓库内相对路径（禁止绝对路径或 .. 穿越）' }
      }
      if (!existsSync(norm)) {
        return { status: 400, error: `parse_path 不存在：${rel}（仓库内相对路径）` }
      }
      cli.push('--parse', parse_path.replace(/^\/+/, '')) // 仓库相对路径
    } else if (parse && typeof parse === 'object') {
      const tmp = join(TMP_DIR, `${tag}.parse.json`)
      writeFileSync(tmp, JSON.stringify(parse), 'utf8')
      cli.push('--parse', tmp)
    } else if (typeof text === 'string' && text.trim()) {
      // W1（两天冲刺）：file_name 客户端可控——只取 basename 并做字符白名单，
      // 杜绝 ../../ 或绝对路径把 text 写到临时目录之外（写入越界）
      const safeName = String(file_name ?? 'input.txt').replaceAll('\\', '/').split('/').pop()
        .replace(/[^\w.\-\u4e00-\u9fff]/g, '_') || 'input.txt'
      tmpTextPath = join(TMP_DIR, `${tag}-${safeName}`)
      writeFileSync(tmpTextPath, text, 'utf8')
      cli.push('--input', tmpTextPath)
    } else {
      return { status: 400, error: '三选一：parse_path（仓库相对路径）/ parse（对象）/ text＋file_name' }
    }
    cli.push('--out-dir', outDir)
    if (args.noCache || cache_dir === 'none') cli.push('--no-cache')
    else {
      // W1：cache_dir 同样客户端可控——与 parse_path 同一守卫（仓库内相对路径），
      // 防止绝对路径把缓存未命中时的写入引到仓库之外；sideResolve 兼容并包树镜像（原址缺失自动落 run-side）
      const rel = String(cache_dir ?? args.cacheDir ?? DEFAULT_CACHE).replace(/^\/+/, '').replaceAll('\\', '/')
      const norm = resolve(REPO_ROOT, rel)
      if (!norm.startsWith(REPO_ROOT + sep) || rel.split('/').includes('..')) {
        return { status: 400, error: 'cache_dir 只接受仓库内相对路径（禁止绝对路径或 .. 穿越）' }
      }
      cli.push('--cache-dir', sideResolve(REPO_ROOT, rel, false))
    }

    const proc = await new Promise((resolveProc) => {
      const p = spawn(process.execPath, [RUNNER, ...cli.slice(1)], { cwd: REPO_ROOT, env: process.env })
      let stdout = '', stderr = ''
      const killer = setTimeout(() => { try { p.kill() } catch { /* 已退出的容忍 */ } }, 200_000)
      p.stdout.on('data', (c) => { stdout += c })
      p.stderr.on('data', (c) => { stderr += c })
      p.on('close', (code) => { clearTimeout(killer); resolveProc({ status: code, stdout, stderr }) })
      p.on('error', (err) => { clearTimeout(killer); resolveProc({ status: -1, stdout, stderr: String(err) }) })
    })
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
    // 清理本请求的临时输入与产物目录（parse 件、text 件、req<id>/ 全清）；
    // 个体运行产物按仓库惯例不落库，由调用方留存返回值即可
    rmSync(join(TMP_DIR, `${tag}.parse.json`), { force: true })
    if (tmpTextPath) rmSync(tmpTextPath, { force: true })
    rmSync(outDir, { recursive: true, force: true })
  }
}

// ---------- 服务 ----------
let reqSeq = 0
// W2：并发受限（同时在跑 ≤ MAX，超额排队不丢弃——20 输入＝20 独立结果；队列上限溢出才 429）
// ＋失败单列（/health 可查，最近 20 条）
const MAX_CONCURRENT = Number(process.env.N09_MAX_CONCURRENT ?? 2) || 2
const MAX_QUEUE = Number(process.env.N09_MAX_QUEUE ?? 50) || 50
let active = 0
const waitQueue = []
const failures = []
function recordFailure(reqId, status, error) {
  failures.push({ ts: new Date().toISOString(), reqId, status, error: String(error).slice(0, 160) })
  if (failures.length > 20) failures.shift()
}
async function withSlot(fn) {
  while (active >= MAX_CONCURRENT) await new Promise((r) => waitQueue.push(r))
  active++
  try { return await fn() } finally {
    active--
    const next = waitQueue.shift()
    if (next) next()
  }
}
createServer((req, res) => {
  const json = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)) }
  if (req.method === 'GET' && req.url === '/health') {
    return json(200, {
      ok: true, model,
      cache: args.noCache ? 'disabled' : (args.cacheDir ?? DEFAULT_CACHE),
      active, max_concurrent: MAX_CONCURRENT, queued: waitQueue.length, failures_total: failures.length, failures,
    })
  }
  if (req.method === 'POST' && req.url === '/extract') {
    let body = ''
    req.on('data', (c) => {
      body += c
      if (body.length > BODY_LIMIT) { req.destroy(); }
    })
    req.on('end', () => {
      const reqId = String(Date.now()) + '-' + (++reqSeq)
      const finish = (result) => {
        if (result.status === 200) {
          json(200, { ok: true, run_id: result.envelope.run_id, envelope: result.envelope, call_log: result.call_log })
        } else {
          recordFailure(reqId, result.status, result.error)
          json(result.status, { ok: false, error: result.error })
        }
      }
      if (waitQueue.length >= MAX_QUEUE) {
        return finish({ status: 429, error: `队列已满（${MAX_QUEUE}）：请稍后重试` })
      }
      let parsed = {}
      try { parsed = JSON.parse(body || '{}') } catch (err) { return finish({ status: 400, error: `请求解析失败：${err.message}` }) }
      withSlot(() => runExtraction(parsed, reqId))
        .then(finish)
        .catch((err) => finish({ status: 500, error: String(err?.message ?? err).slice(0, 200) }))
    })
    return
  }
  json(404, { ok: false, error: 'GET /health | POST /extract' })
// W1（两天冲刺）：显式仅本机监听——不绑 0.0.0.0，抽取入口不接受局域网直连
}).listen(args.port, '127.0.0.1', () => {
  console.log(`[N09 抽取入口] http://127.0.0.1:${args.port}/extract（仅本机监听）`)
  console.log(`  缓存：${args.noCache ? '禁用（每次真实调用）' : (args.cacheDir ?? DEFAULT_CACHE)}`)
  console.log('  陈侧接入：server.js 代理 /api/extract → POST http://127.0.0.1:' + args.port + '/extract')
})
