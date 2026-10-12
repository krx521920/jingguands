"use strict";
// 守卫：扫 API 响应里会 textContent 上屏的字符串是否残留 markdown 标记（textContent 不解析 markdown，`**x**` 会原样显示）。
// 用法：node demo/_scan_markdown.js [url]   —— 缺省取 server.js 的默认端口 PORT（=8642）。
//   ★ 原先这里写死 8652，而 server.js 实际监听 8642 ⇒ 默认调用永远连不上，
//     这道守卫等于形同虚设（静默 0 命中的老毛病）。改为与 server 同源取端口，
//     显式传参仍可覆盖。
const http = require("http");
const path = require("path");

const DEFAULT_PORT = (() => {
  // 直接读 server.js 导出的 PORT，保证与服务同步（不另抄一份数字）
  try { return require(path.join(__dirname, "..", "server.js")).PORT || 8642; }
  catch (e) { return 8642; }
})();

const url = process.argv[2] || ("http://127.0.0.1:" + (process.env.PORT || DEFAULT_PORT) + "/api/metrics");

function get(u) {
  return new Promise((res, rej) => {
    http.get(u, r => {
      let s = "";
      r.on("data", d => (s += d));
      r.on("end", () => res(s));
    }).on("error", rej);
  });
}

const MARKDOWN = /\*\*|^#{1,6} |\|-{3,}\|/;

function scan(o, p, out) {
  if (typeof o === "string") {
    if (MARKDOWN.test(o)) out.push(p + " :: " + o.slice(0, 80).replace(/\n/g, "\\n"));
    return;
  }
  if (Array.isArray(o)) { o.forEach((v, i) => scan(v, p + "[" + i + "]", out)); return; }
  if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) scan(v, p + "." + k, out);
}

(async () => {
  const raw = await get(url);
  const j = JSON.parse(raw);
  const bad = [];
  scan(j, "resp", bad);
  console.log("扫描目标:", url);
  console.log("残留 markdown 字段数 =", bad.length);
  bad.slice(0, 20).forEach(b => console.log("   " + b));
  if (!bad.length) console.log("   （干净）");
  const ds = j.data_source;
  if (ds) {
    console.log("\n--- 关键字段人工确认 ---");
    console.log("scope_note :", ds.scope_note);
    console.log("statement  :", ds.statement);
    console.log("batch line :", ds.primary_tag && ds.primary_tag.line);
    console.log("anchor     :", ds.anchor && ds.anchor.sha256, "matches =", ds.anchor && ds.anchor.matches);
    if (ds.batches && ds.batches.authoritative && ds.batches.authoritative.caliber_split) {
      console.log("note       :", ds.batches.authoritative.caliber_split.note);
    }
  }
})();