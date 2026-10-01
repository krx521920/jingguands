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
      .filter(f => f.endsWith(".json"))
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

/** 读取 mock 数据集并过桥；失败抛错（NOT_FOUND / parse error），供 result 与 export 共用。 */
function readDataset(dataset) {
  const file = path.join(DATA_DIR, dataset + ".json");
  if (!file.startsWith(DATA_DIR) || !fs.existsSync(file)) {   // 目录逃逸防护
    const err = new Error("dataset not found: " + dataset);
    err.code = "NOT_FOUND";
    throw err;
  }
  return toContract(JSON.parse(fs.readFileSync(file, "utf8")));
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
