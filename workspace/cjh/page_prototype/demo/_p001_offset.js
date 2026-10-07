// 只读：统计信封 vs Gold 的 block_id 偏移量分布（P0-01 定案证据）
// D12-C2：evaluation/ 不再入库，路径解析与缺失处置集中到 _evals_paths.js
const fs = require("fs");
const path = require("path");
const ev = require("./_evals_paths.js");
const ENV = ev.LOCAL_ENVELOPES;
const GOLD = ev.goldDirs();
const gm = new Map();
for (const gd of GOLD) { if (!fs.existsSync(gd)) continue;
  for (const f of fs.readdirSync(gd).filter(x => x.endsWith(".envelope.json"))) {
    const g = JSON.parse(fs.readFileSync(path.join(gd, f), "utf8"));
    if (g.source && g.source.file_id) gm.set(g.source.file_id, g);
  }
}
const off = {}, stat = { regionSame: 0, regionDiff: 0, cellSame: 0, cellDiff: 0, quoteSame: 0, quoteDiff: 0, tot: 0, noQuote: 0 };
const perFile = {};
for (const f of fs.readdirSync(ENV).filter(x => x.endsWith(".json"))) {
  const j = JSON.parse(fs.readFileSync(path.join(ENV, f), "utf8"));
  if (j.is_mock) continue;
  const g = gm.get(j.source && j.source.file_id);
  if (!g) continue;
  const gp = new Map();
  for (const gev of g.events || []) for (const [n, gv] of Object.entries(gev.fields || {})) {
    const p = (gv.provenance || [])[0]; if (p && p.block_id) gp.set(n, p);
  }
  for (const ev of j.events || []) for (const [n, fv] of Object.entries(ev.fields || {})) {
    const g2 = gp.get(n); const p = (fv.provenance || [])[0];
    if (!g2 || !p || !p.block_id) continue;
    stat.tot++;
    perFile[f] = perFile[f] || { tot: 0, off: {} };
    perFile[f].tot++;
    const a = p.block_id.match(/b(\d+)$/), b = g2.block_id.match(/b(\d+)$/);
    if (a && b) { const d = parseInt(a[1], 10) - parseInt(b[1], 10); off[d] = (off[d] || 0) + 1; perFile[f].off[d] = (perFile[f].off[d] || 0) + 1; }
    if (JSON.stringify(p.region) === JSON.stringify(g2.region)) stat.regionSame++; else stat.regionDiff++;
    if (p.cell_ref === g2.cell_ref) stat.cellSame++; else stat.cellDiff++;
    if (p.quote == null || p.quote === "") stat.noQuote++;
    else if (String(p.quote) === String(g2.quote)) stat.quoteSame++; else stat.quoteDiff++;
  }
}
console.log("=== block_id 偏移量分布（信封 − Gold）===");
for (const k of Object.keys(off).map(Number).sort((a, b) => a - b)) {
  console.log(`  偏移 ${k > 0 ? "+" : ""}${k} : ${String(off[k]).padStart(4)} 条  ${(off[k] / stat.tot * 100).toFixed(1)}%`);
}
console.log("  合计", stat.tot);
console.log(`\n★ region 完全相同: ${stat.regionSame} (${(stat.regionSame / stat.tot * 100).toFixed(1)}%)  不同: ${stat.regionDiff}`);
console.log(`★ cell_ref  相同: ${stat.cellSame}  不同: ${stat.cellDiff}`);
console.log(`★ quote     相同: ${stat.quoteSame}  不同: ${stat.quoteDiff}  无quote: ${stat.noQuote}`);
console.log("\n=== 各文件偏移分布（前12）===");
for (const [f, v] of Object.entries(perFile).slice(0, 12)) {
  const s = Object.entries(v.off).map(([k, c]) => `${k > 0 ? "+" : ""}${k}:${c}`).join(" ");
  console.log(`  ${f.padEnd(26)} n=${String(v.tot).padStart(3)}  ${s}`);
}
fs.writeFileSync(path.join(__dirname, "_p001_offset.json"), JSON.stringify({ off, stat, perFile }, null, 2));
