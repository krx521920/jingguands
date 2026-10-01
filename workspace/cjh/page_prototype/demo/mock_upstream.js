// mock_upstream.js —— 演示 8 用：模拟魏的上游接口（零依赖）
// 用法：node demo/mock_upstream.js   →  http://127.0.0.1:9000/result?dataset=xxx
// 行为：按 dataset 名读 data/<dataset>.json 原样返回（模拟上游返回事件信封格式），
//       由页面 server 的 remote 模式拉取后自动过转接口归一。
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 9000;
const DATA_DIR = path.join(__dirname, "..", "data");

http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const dataset = url.searchParams.get("dataset") || "";
  if (!/^[a-z0-9_-]+$/i.test(dataset)) {
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    return res.end(JSON.stringify({ error: "invalid dataset name" }));
  }
  const file = path.join(DATA_DIR, dataset + ".json");
  if (!file.startsWith(DATA_DIR) || !fs.existsSync(file)) {
    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    return res.end(JSON.stringify({ error: "dataset not found: " + dataset }));
  }
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(fs.readFileSync(file, "utf8"));
}).listen(PORT, () => {
  console.log(`[mock-upstream] 模拟上游已启动 http://127.0.0.1:${PORT}/result`);
});
