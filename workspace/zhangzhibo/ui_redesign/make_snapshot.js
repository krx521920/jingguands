// make_snapshot.js —— 把 page_prototype(8642) 的全部接口数据烘焙成静态快照
// 用法：先启动 8642，然后  node make_snapshot.js  →  生成 snapshot.js
// 之后整个 ui_redesign 目录是纯静态站：双击 index.html 之外，也可部署到 GitHub Pages / Vercel
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const UP = { host: "127.0.0.1", port: process.env.UPSTREAM_PORT || 8642 };

function get(p) {
  return new Promise((resolve, reject) => {
    http.get({ ...UP, path: p }, res => {
      let b = "";
      res.on("data", c => b += c);
      res.on("end", () => {
        if (res.statusCode !== 200) return reject(new Error(`${p} → ${res.statusCode}`));
        try { resolve(JSON.parse(b)); } catch (e) { reject(new Error(`${p} 非 JSON`)); }
      });
    }).on("error", reject);
  });
}

(async () => {
  const snap = {};
  console.log("拉取 /api/datasets …");
  const ds = await get("/api/datasets");
  snap.datasets = ds;
  snap.results = {};
  for (const name of ds.datasets || []) {
    process.stdout.write(`  结果 ${name} …\r`);
    try { snap.results[name] = await get(`/api/result?dataset=${encodeURIComponent(name)}`); }
    catch (e) { console.error(`  跳过 ${name}: ${e.message}`); }
  }
  for (const [k, p] of [["pairs", "/api/pairs"], ["verify", "/api/verify"], ["integration", "/api/integration"], ["metrics", "/api/metrics"]]) {
    console.log(`拉取 /api/${k} …`);
    snap[k] = await get(p);
  }
  const out = `// snapshot.js —— 由 make_snapshot.js 生成的静态数据快照（${new Date().toISOString()}）\n// 部署静态托管时，app.js 在 /api 不可达时自动回退到本文件\nwindow.__FS_SNAPSHOT = ${JSON.stringify(snap)};\n`;
  const file = path.join(__dirname, "snapshot.js");
  fs.writeFileSync(file, out);
  console.log(`\n完成 → ${file}（${(out.length / 1024).toFixed(0)} KB · ${Object.keys(snap.results).length} 个数据集结果）`);
  console.log("静态部署：把 ui_redesign 目录推到 GitHub Pages / Vercel 即可；双击 index.html 也可离线浏览。");
})().catch(e => { console.error("生成失败：", e.message, "\n请确认 page_prototype 已在 8642 运行。"); process.exit(1); });
