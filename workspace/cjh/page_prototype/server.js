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
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
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
      try { sendJSON(res, upstream.statusCode || 200, JSON.parse(buf)); }
      catch { sendJSON(res, 502, { error: "remote response is not valid JSON" }); }
    });
  }).on("error", e => sendJSON(res, 502, { error: "remote fetch failed: " + e.message }));
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
    const file = path.join(DATA_DIR, dataset + ".json");
    if (!file.startsWith(DATA_DIR) || !fs.existsSync(file)) {   // 目录逃逸防护
      return sendJSON(res, 404, { error: "dataset not found: " + dataset });
    }
    try {
      return sendJSON(res, 200, JSON.parse(fs.readFileSync(file, "utf8")));
    } catch (e) {
      return sendJSON(res, 500, { error: "dataset parse failed: " + e.message });
    }
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
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
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
