// server.js —— 零依赖本地服务器：静态资源 + 数据接口
// 相对路径实现：所有路径基于本文件位置推导（__dirname），无绝对路径、无外部依赖。
// 数据源模式：
//   mock   （默认）：读取 data/<dataset>.json —— 本地模拟数据，页面显式标"模拟"
//   remote          ：反向代理到上游真实接口（魏文宇的事件 JSON 服务），通过环境变量配置
// 用法：node server.js  →  http://127.0.0.1:8642
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { toContract } = require("./bridge/upstream_bridge.js");   // 转接口：上游格式 → 契约 v0.3

const ROOT = __dirname;                       // 工程根（相对锚点）
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const LOG_DIR = path.join(ROOT, "logs");      // D6：上传日志（JSONL，逐文件一行）
const LOG_FILE = path.join(LOG_DIR, "upload_log.jsonl");

const PORT = process.env.PORT || 8642;
const DATA_SOURCE = process.env.DATA_SOURCE || "mock";        // mock | remote
const REMOTE_API_URL = process.env.REMOTE_API_URL || "";      // remote 模式的上游地址

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8"
};

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj, null, 2);
  // no-store：演示时杜绝浏览器拿旧缓存数据（D5 教训）
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}

// ---- D3：导出（JSON / CSV）----
// CSV 扁平化：每字段一行；quote 内含逗号/引号/换行按 RFC 4180 转义；BOM 保证 Excel 打开中文不乱码。
const CSV_COLUMNS = [
  "run_id", "data_mode", "event_id", "event_type", "field", "status", "status_raw",
  "value", "normalized", "normalized_unit", "denominator",
  "evidence_id", "block_id", "page", "table_id", "cell_ref", "source_type", "quote"
];

function csvEscape(v) {
  if (v == null) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function contractToCsvRows(data) {
  const rows = [];
  for (const ev of data.events || []) {
    for (const [name, f] of Object.entries(ev.fields || {})) {
      // 一字段可挂多条证据：主证据一行，其余证据各补一行（evidence_ids 展开，不错位）
      const eids = f.evidence_ids || (f.evidence_id ? [f.evidence_id] : []);
      if (!eids.length) eids.push(null);
      for (const eid of eids) {
        const e = eid ? (data.evidences || []).find(x => x.evidence_id === eid) || {} : {};
        rows.push([
          data.run_id, data.data_mode, ev.event_id, ev.event_type, name,
          f.status_override || "success",          // D3：字段级状态（status_raw 保留信封原始 6 态）
          f.status_raw ?? "",
          f.value, f.normalized, f.normalized_unit ?? f.unit,
          f.denominator ? (f.denominator.kind_text || f.denominator.kind) : "",
          eid ?? "", e.block_id ?? "", e.page ?? "", e.table_id ?? "", e.cell_ref ?? "",
          e.source_type ?? "", e.quote ?? ""
        ]);
      }
    }
  }
  return rows;
}

function handleExport(res, urlObj, readDataset) {
  const dataset = urlObj.searchParams.get("dataset") || "";
  const format = (urlObj.searchParams.get("format") || "csv").toLowerCase();
  if (!/^[a-z0-9_-]+$/i.test(dataset)) return sendJSON(res, 400, { error: "invalid dataset name" });
  if (!["json", "csv"].includes(format)) return sendJSON(res, 400, { error: "format must be json|csv" });

  let data;
  try { data = readDataset(dataset); }
  catch (e) {
    if (e && e.code === "NOT_FOUND") return sendJSON(res, 404, { error: "dataset not found: " + dataset });
    return sendJSON(res, 500, { error: "dataset parse failed: " + e.message });
  }

  if (format === "json") {
    const body = JSON.stringify(data, null, 2);
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${dataset}.json"`
    });
    return res.end(body);
  }
  const lines = [CSV_COLUMNS.join(","), ...contractToCsvRows(data).map(r => r.map(csvEscape).join(","))];
  const body = "\uFEFF" + lines.join("\r\n");
  res.writeHead(200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${dataset}.csv"`
  });
  res.end(body);
}

// ---- 数据接口：/api/datasets 与 /api/result?dataset=xxx ----
function listDatasets() {
  try {
    return fs.readdirSync(DATA_DIR)
      .filter(f => f.endsWith(".json") && !f.endsWith(".check.json"))   // D5：.check.json 是方的旁路核验 sidecar，不是数据集
      .map(f => path.basename(f, ".json"));
  } catch {
    return [];
  }
}

function fetchRemote(dataset, res) {
  const url = REMOTE_API_URL + (REMOTE_API_URL.includes("?") ? "&" : "?") + "dataset=" + encodeURIComponent(dataset);
  http.get(url, upstream => {
    let buf = "";
    upstream.on("data", c => (buf += c));
    upstream.on("end", () => {
      try { sendJSON(res, upstream.statusCode || 200, toContract(JSON.parse(buf))); }   // 上游格式过桥
      catch { sendJSON(res, 502, { error: "remote response is not valid JSON" }); }
    });
  }).on("error", e => sendJSON(res, 502, { error: "remote fetch failed: " + e.message }));
}

/** 读取 mock 数据集并过桥；失败抛错（NOT_FOUND / parse error），供 result 与 export 共用。
 *  D5：同名 .check.json（方的 equity_check_D5 旁路核验报告）若存在，挂到 check_report 由转接口合并。 */
function readDataset(dataset) {
  const file = path.join(DATA_DIR, dataset + ".json");
  if (!file.startsWith(DATA_DIR) || !fs.existsSync(file)) {   // 目录逃逸防护
    const err = new Error("dataset not found: " + dataset);
    err.code = "NOT_FOUND";
    throw err;
  }
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  const checkFile = path.join(DATA_DIR, dataset + ".check.json");
  if (fs.existsSync(checkFile)) {
    try { parsed.check_report = JSON.parse(fs.readFileSync(checkFile, "utf8")); }
    catch { /* sidecar 坏了不阻塞主数据，留痕 */ parsed.check_report_error = "check sidecar parse failed"; }
  }
  return toContract(parsed);
}

// ---- D6：批量上传闭环（零依赖 multipart/form-data 解析）----
// 口径：每个文件独立入报告——坏文件（非 JSON / 缺 events / 过桥失败）也必须出现在失败列表，
// 绝不允许"坏文件从批次报告消失"（D6 复盘优先修复项 1）。
const UPLOAD_BATCH_ID = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14) + "-" + process.pid;

/** 解析 multipart/form-data 请求体 → [{ filename, data(Buffer) }]。零依赖：按 boundary 手工切分。 */
function parseMultipart(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  if (!m) { const e = new Error("multipart boundary missing"); e.code = "BAD_REQUEST"; throw e; }
  const boundary = Buffer.from("--" + (m[1] || m[2]).trim());
  const parts = [];
  let pos = buf.indexOf(boundary);
  while (pos !== -1) {
    const next = buf.indexOf(boundary, pos + boundary.length);
    if (next === -1) break;
    // part 内容：跳过 boundary 行的 \r\n，去掉结尾 \r\n
    const chunk = buf.subarray(pos + boundary.length + 2, next - 2);
    const headerEnd = chunk.indexOf("\r\n\r\n");
    if (headerEnd !== -1) {
      const headers = chunk.subarray(0, headerEnd).toString("utf8");
      const body = chunk.subarray(headerEnd + 4);
      const fn = /filename="([^"]*)"/i.exec(headers);
      if (fn) parts.push({ filename: fn[1], data: body });
    }
    pos = next;
  }
  return parts;
}

/** 文件名 → 安全数据集名：非 [a-z0-9_-] 归一为 -，与 /api/result 的名称校验对齐。 */
function safeDatasetName(filename) {
  return path.basename(filename).replace(/\.json$/i, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "upload";
}

/** 数据集名查重：data/ 下已存在则追加 -2、-3…，绝不静默覆盖既有数据集。 */
function dedupeDatasetName(base) {
  if (!fs.existsSync(path.join(DATA_DIR, base + ".json"))) return base;
  for (let i = 2; ; i++) if (!fs.existsSync(path.join(DATA_DIR, base + "-" + i + ".json"))) return base + "-" + i;
}

/** 单文件入账：校验 → 过桥 → 落 data/。返回报告条目（ok 或失败原因，二者必有其一）。 */
function processUploadFile(filename, data) {
  const entry = { filename, size: data.length, batch_id: UPLOAD_BATCH_ID, ts: new Date().toISOString() };
  try {
    if (!/\.json$/i.test(filename)) entry.error = "仅接受 .json 信封文件";
    if (!entry.error && (!data || data.length === 0)) entry.error = "空文件";
    if (!entry.error) {
      const parsed = JSON.parse(data.toString("utf8"));   // 坏 JSON 在此显式失败并进报告
      if (!Array.isArray(parsed.events)) entry.error = "缺少 events 数组（非事件信封）";
      else if (!parsed.schema_version) entry.error = "缺少 schema_version";
      if (!entry.error) {
        toContract(parsed);   // 过桥干跑：转换失败即上传失败（真实闭环的校验闸门）
        const dataset = dedupeDatasetName(safeDatasetName(filename));
        fs.writeFileSync(path.join(DATA_DIR, dataset + ".json"), JSON.stringify(parsed, null, 2) + "\n");
        entry.ok = true;
        entry.dataset = dataset;
        entry.events = parsed.events.length;
      }
    }
  } catch (e) {
    entry.error = e instanceof SyntaxError ? "JSON 解析失败：" + e.message.slice(0, 160) : String(e.message || e).slice(0, 160);
  }
  appendUploadLog(entry);
  return entry;
}

/** 上传日志：JSONL 追加（逐文件一行，含失败项），供 /api/upload/log 下载。 */
function appendUploadLog(entry) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n");
  } catch { /* 日志落盘失败不阻塞上传响应 */ }
}

function handleUpload(req, res) {
  const ct = req.headers["content-type"] || "";
  if (!/multipart\/form-data/i.test(ct)) return sendJSON(res, 400, { error: "content-type must be multipart/form-data" });
  const chunks = [];
  req.on("data", c => chunks.push(c));
  req.on("end", () => {
    let parts;
    try { parts = parseMultipart(Buffer.concat(chunks), ct); }
    catch (e) { return sendJSON(res, 400, { error: e.message }); }
    if (!parts.length) return sendJSON(res, 400, { error: "no file part in request" });
    const results = parts.map(p => processUploadFile(p.filename, p.data));   // 坏文件也进报告
    const ok = results.filter(r => r.ok).length;
    sendJSON(res, 200, {
      batch_id: UPLOAD_BATCH_ID, total: results.length, ok, failed: results.length - ok,
      log: "/api/upload/log",
      results
    });
  });
  req.on("error", () => sendJSON(res, 500, { error: "upload stream error" }));
}

/** 上传日志下载：text/plain 附件（逐行 JSONL，可直接人工排查失败原因）。 */
function handleUploadLog(res) {
  if (!fs.existsSync(LOG_FILE)) {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": 'attachment; filename="upload_log.jsonl"' });
    return res.end("(空) 尚无上传记录\n");
  }
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": 'attachment; filename="upload_log.jsonl"' });
  res.end(fs.readFileSync(LOG_FILE));
}

function handleApi(req, res, urlObj) {
  if (urlObj.pathname === "/api/datasets") {
    return sendJSON(res, 200, { source: DATA_SOURCE, datasets: listDatasets() });
  }
  if (urlObj.pathname === "/api/result") {
    const dataset = urlObj.searchParams.get("dataset") || "pledge";
    if (!/^[a-z0-9_-]+$/i.test(dataset)) {
      return sendJSON(res, 400, { error: "invalid dataset name" });
    }
    if (DATA_SOURCE === "remote") return fetchRemote(dataset, res);
    try {
      return sendJSON(res, 200, readDataset(dataset));   // mock 也过桥（上游格式数据集自动转换）
    } catch (e) {
      if (e.code === "NOT_FOUND") return sendJSON(res, 404, { error: e.message });
      return sendJSON(res, 500, { error: "dataset parse failed: " + e.message });
    }
  }
  if (urlObj.pathname === "/api/export") {
    return handleExport(res, urlObj, readDataset);   // D3：导出当前数据集为 JSON/CSV（与页面同源同桥）
  }
  if (urlObj.pathname === "/api/upload" && req.method === "POST") {
    return handleUpload(req, res);                   // D6：批量上传（坏文件进失败列表，不消失）
  }
  if (urlObj.pathname === "/api/upload/log") {
    return handleUploadLog(res);                     // D6：上传日志下载
  }
  sendJSON(res, 404, { error: "unknown api" });
}

// ---- 静态资源 ----
function handleStatic(res, urlObj) {
  let rel = decodeURIComponent(urlObj.pathname);
  if (rel === "/" || rel === "") rel = "/index.html";
  const file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("404 Not Found");
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
  res.end(fs.readFileSync(file));
}

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, "http://127.0.0.1");
  if (urlObj.pathname.startsWith("/api/")) return handleApi(req, res, urlObj);
  return handleStatic(res, urlObj);
});

server.listen(PORT, "127.0.0.1", () => {
  const openDemo = process.argv.includes("--open-demo");
  console.log(`[cjh-page-prototype] http://127.0.0.1:${PORT}${openDemo ? "/demo.html" : "/"}`);
  console.log(`[cjh-page-prototype] 数据源: ${DATA_SOURCE}${DATA_SOURCE === "remote" ? ` → ${REMOTE_API_URL}` : " → data/*.json（模拟）"}`);
  console.log(`[cjh-page-prototype] 数据集: ${listDatasets().join(", ") || "（空）"}`);
});
