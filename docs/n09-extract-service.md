# N09 抽取 HTTP 入口（serve_extract.mjs）· D12 · 2026-10-08

回应陈家浩 D12 交付说明的阻塞项："Web/CLI 独立抽取一致性未测，阻塞在魏交抽取入口＋原始 PDF"。

## 这是什么

`scripts/jingguan/serve_extract.mjs`：把 A 流抽取器 `run_extract.mjs` 包装成本地 HTTP 端点。
**页面侧不需要管线代码，只需要能发 HTTP 请求**——Web 与 CLI 从此消费同一抽取器、同一缓存，
独立重跑对照（宗 C3 口径）可行。

## 启动（陈侧）

```bash
# 密钥只走环境变量（永不入库）：
export JINGGUAN_LLM_API_KEY=sk-…   # Windows PowerShell: $env:JINGGUAN_LLM_API_KEY="sk-…"
node scripts/jingguan/serve_extract.mjs --port 8788
# 默认缓存＝evaluation/D12/wei-runs/cache-snapshot-d12（D12 冻结快照）
# 冷跑：--no-cache；自选缓存：--cache-dir <目录>
```

## 端点

**GET /health** → `{"ok":true,"model":"deepseek-chat","cache":"…"}`

**POST /extract**，body 三选一输入：

```jsonc
// ① 仓库内解析文件（推荐，C3 对照就用这条）
{"event_type":"pledge","parse_path":"corpus/zhangzhibo/d4/parse-official/D4-PLD-001.parse.json"}
// ② 直接传解析对象（页面有 parse JSON 时）
{"event_type":"pledge","parse":{ …evidence/0.9 解析 JSON… }}
// ③ 纯文本
{"event_type":"award_contract","text":"公告全文…","file_name":"award-001.txt"}
```

响应：`{"ok":true,"run_id":"…","envelope":{v0.3 信封},"call_log":{…}}`

## 陈侧接入（server.js 加一段代理即可）

```js
// POST /api/extract → 转发到本地抽取入口
app.post('/api/extract', async (req, res) => {
  const r = await fetch('http://127.0.0.1:8788/extract', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body),
  })
  res.status(r.status).json(await r.json())
})
```

## 已验证（2026-10-08，本机）

- `POST /extract`（D4-PLD-001，默认冻结缓存）：cache hit，3 事件，
  **events 与 D12-A（CLI --jobs 1 冷跑后重放）逐字节一致**——Web/CLI 同源同缓存即同结果的实证。
- 与 CLI 的差异仅在 `run_id`/`run_meta.started_at`/`duration_ms` 等时间戳类字段（任何两次运行必然不同）。

## 关于"原始 PDF"

抽取器输入是**解析 JSON 或文本，不吃 PDF**（PDF→解析是张智博 finstruct 的链路）。
C3 的 Web/CLI 对照用 parse JSON 输入即可闭环；若页面要支持 PDF 上传，需要另接张的解析服务，
不在本入口范围。仓库目前无任何 PDF（全仓 find 无 *.pdf），原始 PDF 入库归张/宗议。

## 并发与限制

- 单请求内部串行（与 CLI 单文档一致）；页面并发请对端点做排队或起多实例
- 请求体上限 40MB；抽取进程 200s 超时（对齐 CLI 的 180s 调用超时＋余量）
- 临时输入写在 `runs/_serve_tmp/`，用后即删；信封产物以响应返回为准，不在服务端留存
