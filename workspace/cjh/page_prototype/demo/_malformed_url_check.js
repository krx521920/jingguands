// 守卫：畸形 URL（非法 percent-encoding）不得打挂服务（2026-10-17 M-10）
// 缺陷原状：`GET /%` ⇒ handleStatic 的 decodeURIComponent 抛 `URIError: URI malformed`，
//   无捕获 + 无进程兜底 ⇒ **服务崩溃退出**（实测端口立即无监听，客户端 ECONNRESET）。
// 判据：
//   MU_SRC    server.js 两处防护都在（handleStatic 解码 try/catch ＋ createServer 入口 try/catch）
//   MU_ALIVE  守卫开始前服务确实在跑（否则后面全是无意义的绿灯）
//   MU_PCT    `/%`         ⇒ 400（不是崩溃、不是静默回落首页）
//   MU_PCT2   `/%zz`       ⇒ 400
//   MU_PCT3   `/%E4%`      ⇒ 400（截断的中文编码，同样致命）
//   MU_SURVIVE 三次畸形请求后服务仍存活（`/api/datasets` 仍 200）——**核心判据**
//   MU_THROW  反证：`decodeURIComponent('/%')` 必抛 URIError —— 证明该输入在无捕获时真的会崩
// 依赖：服务在跑（批跑器统一保证；单独跑请先 `node server.js`）
const http = require('http');
const fs = require('fs');
const path = require('path');

const PP = path.resolve(__dirname, '..');
const BASE = 'http://127.0.0.1:8642';
let pass = 0, fail = 0;
function ok(c, id, msg) {
  if (c) { pass++; console.log('[PASS] ' + id + ' · ' + msg); }
  else { fail++; console.log('[FAIL] ' + id + ' · ' + msg); }
}

function req(pathname) {
  return new Promise(resolve => {
    const r = http.request(BASE + pathname, { method: 'GET', timeout: 8000 }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ status: res.statusCode, body, alive: true }));
    });
    r.on('error', e => resolve({ status: 0, error: e.code || e.message, alive: false }));
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, error: 'timeout', alive: false }); });
    r.end();
  });
}

(async () => {
  // ── MU_SRC：源码两处防护
  const src = fs.readFileSync(path.join(PP, 'server.js'), 'utf8');
  const staticSeg = src.slice(src.indexOf('function handleStatic'), src.indexOf('function handleStatic') + 900);
  ok(/try\s*\{[\s\S]{0,200}?decodeURIComponent/.test(staticSeg) || /malformed URI/.test(staticSeg),
    'MU_SRC', 'handleStatic 解码有 try/catch 且回 400（malformed URI）');
  const srvSeg = src.slice(src.indexOf('http.createServer'), src.indexOf('http.createServer') + 900);
  ok(/try\s*\{/.test(srvSeg) && /unhandled error/.test(srvSeg),
    'MU_SRC', 'createServer 入口有 try/catch 且如实打印异常');

  // ── MU_ALIVE：服务必须在跑（否则后面的绿灯是假的）
  const before = await req('/api/datasets');
  ok(before.alive && before.status === 200, 'MU_ALIVE', '守卫前服务在跑（/api/datasets=' + before.status + '）');
  if (!before.alive) {
    ok(false, 'MU_FATAL', '服务未运行 —— 后续判据全部跳过（先起 node server.js）');
    console.log('=== 汇总 === PASS ' + pass + ' / FAIL ' + fail);
    process.exit(1);
  }

  // ── MU_PCT / MU_PCT2 / MU_PCT3：三类畸形 URL 都得 400
  for (const [id, p] of [['MU_PCT', '/%'], ['MU_PCT2', '/%zz'], ['MU_PCT3', '/%E4%']]) {
    const r = await req(p);
    ok(r.status === 400, id, 'GET ' + p + ' ⇒ ' + r.status + '（期望 400，' +
      (r.status === 0 ? '崩溃/无响应' : '') + '）');
  }

  // ── MU_SURVIVE：核心判据 —— 打完之后服务必须还活着
  const after = await req('/api/datasets');
  ok(after.alive && after.status === 200, 'MU_SURVIVE',
    '三次畸形请求后服务仍存活（/api/datasets=' + after.status + '）');

  // ── MU_THROW 反证：证明这个输入真的会抛（守卫不是恒真的绿灯）
  let threw = false, name = '';
  try { decodeURIComponent('/%'); } catch (e) { threw = true; name = e.name; }
  ok(threw && name === 'URIError', 'MU_THROW',
    "反证：decodeURIComponent('/%') 抛 " + (name || '(未抛，判据失效)') + ' —— 无捕获必崩');

  console.log('=== 汇总 === PASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})();
