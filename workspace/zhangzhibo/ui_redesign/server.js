// server.js —— ui_redesign 本地服务器（零依赖）
// 静态托管本目录 + 把 /api/* 反向代理到真实 page_prototype（默认 127.0.0.1:8642）
// 用法：node server.js   →  http://127.0.0.1:8762
//   UPSTREAM=http://127.0.0.1:8642 PORT=8762 可用环境变量覆盖
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const UPSTREAM = new URL(process.env.UPSTREAM || "http://127.0.0.1:8642");
const PORT = process.env.PORT || 8762;
const ROOT = __dirname;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

http.createServer((req, res) => {
  // ---- /api/* → 反向代理到真实服务（同源，无 CORS） ----
  if (req.url.startsWith("/api/")) {
    const up = http.request({
      hostname: UPSTREAM.hostname,
      port: UPSTREAM.port,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: UPSTREAM.host }
    }, prs => {
      res.writeHead(prs.statusCode, prs.headers);
      prs.pipe(res);
    });
    up.on("error", e => {
      res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "上游不可达（请先启动 page_prototype: node server.js 于 8642）：" + e.message }));
    });
    req.pipe(up);
    return;
  }

  // ---- 静态文件 ----
  let p = decodeURIComponent((req.url || "/").split("?")[0]);
  if (p === "/") p = "/index.html";
  const file = path.join(ROOT, path.normalize(p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end("forbidden"); }
  fs.readFile(file, (e, d) => {
    if (e) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("404 not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(d);
  });
}).listen(PORT, "0.0.0.0", () => {
  console.log(`[ui_redesign] http://127.0.0.1:${PORT}  ·  /api → ${UPSTREAM.href}`);
  try {
    const os = require("os");
    const ip = Object.values(os.networkInterfaces()).flat().find(i => i && i.family === "IPv4" && !i.internal);
    if (ip) console.log(`[ui_redesign] 局域网访问 http://${ip.address}:${PORT}（需与 page_prototype 同机运行）`);
  } catch (e) {}
});
