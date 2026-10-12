// 只读：evKey 业务键在全量上的撞键检测 + 真实值一致率复算
// D12-C2：evaluation/ 不再入库，路径解析与缺失处置集中到 _evals_paths.js
const fs = require("fs");
const path = require("path");
const ev = require("./_evals_paths.js");
const ENV = ev.LOCAL_ENVELOPES;
const GOLD = ev.goldDirs();

function evKey(ev, etype) {
  const f = ev.fields || {};
  const pick = (...ks) => { for (const k of ks) { const x = f[k]; if (x) { const v = x.value !== null && x.value !== undefined ? x.value : x.raw_value; if (v !== null && v !== undefined && v !== "") return String(v).trim(); } } return null; };
  if (etype === "pledge") return ["pledge", pick("pledgor"), pick("pledgee"), pick("direction") || "pledge"].join("|");
  if (etype === "equity_change") return ["equity_change", pick("holder"), pick("direction")].join("|");
  if (etype === "award_contract") return ["award_contract", pick("bidder"), pick("project_name")].join("|");
  return ["other", pick("bidder"), pick("holder")].join("|");
}
const gm = new Map();
for (const gd of GOLD) { if (!fs.existsSync(gd)) continue;
  for (const f of fs.readdirSync(gd).filter(x => x.endsWith(".envelope.json"))) {
    try { const g = JSON.parse(fs.readFileSync(path.join(gd, f), "utf8")); const id = g.source && g.source.file_id;
      if (id && !gm.has(id)) gm.set(id, g); } catch (e) { }
  }
}
const norm = v => String(v === null || v === undefined ? "" : v).replace(/\s+/g, "").trim();
const isRatio = f => /(^|_)(ratio|percent|rate)($|_)/.test(f);   // ★不能用 /rate/ ——du**rate** 会误命中中文文本字段
function val(fv) { if (!fv) return undefined; return fv.value !== null && fv.value !== undefined ? fv.value : fv.raw_value; }
function eq(fname, a, b) {
  if (a === undefined || b === undefined) return false;
  if (isRatio(fname)) return Math.abs(Number(a) - Number(b)) < 1e-6;
  if (typeof a === "boolean" || typeof b === "boolean") return norm(a) === norm(b) || (!!a === !!b);
  return norm(a) === norm(b);
}

let dupCases = [], ambiguous = 0, totalEv = 0;
let strictHit = 0, strictDen = 0;      // 严格：业务键唯一时逐值核
let bestHit = 0, bestDen = 0;          // 最优匹配：同键多候选时穷举取最优
const unresolved = [];

for (const f of fs.readdirSync(ENV).filter(x => x.endsWith(".json"))) {
  const j = JSON.parse(fs.readFileSync(path.join(ENV, f), "utf8"));
  if (j.is_mock) continue;
  const g = gm.get(j.source && j.source.file_id);
  if (!g) continue;
  const eB = new Map();
  for (const ev of j.events || []) {
    const k = evKey(ev, ev.event_type);
    if (!eB.has(k)) eB.set(k, []);
    eB.get(k).push(ev);
  }
  for (const gev of g.events || []) {
    const k = evKey(gev, gev.event_type);
    const cands = eB.get(k) || [];
    totalEv++;
    if (cands.length === 0) { strictDen++; unresolved.push({ file: f, gold: gev.event_id, key: k, cands: 0 }); continue; }
    if (cands.length > 1) {
      dupCases.push({ file: f, key: k, cands: cands.map(c => c.event_id), gold: gev.event_id });
      ambiguous++;
    }
    // 严格：取第一个；最优：穷举所有候选取匹配最多者
    const gF = gev.fields || {};
    const gNames = Object.keys(gF).filter(n => gF[n].status === "extracted");
    const score = ev => gNames.filter(n => eq(n, val(ev.fields[n]), val(gF[n]))).length;
    const first = score(cands[0]);
    const best = Math.max(...cands.map(score));
    strictHit += first; strictDen += gNames.length;
    bestHit += best; bestDen += gNames.length;
    if (best < gNames.length) unresolved.push({ file: f, gold: gev.event_id, key: k, best, of: gNames.length });
  }
}
console.log("=== 业务键撞键（同键多候选）===");
console.log("撞键事件数:", ambiguous, "/", totalEv);
dupCases.slice(0, 8).forEach(d => console.log("  ", d.file, "key=", d.key, "信封候选=", d.cands.join("/")));
console.log("\n=== 逐值核对 ===");
console.log(`  严格（取首个候选）: ${strictHit}/${strictDen} = ${(strictHit / strictDen * 100).toFixed(2)}%`);
console.log(`  最优（穷举取最优）: ${bestHit}/${bestDen} = ${(bestHit / bestDen * 100).toFixed(2)}%`);
console.log("\n=== 仍无法全匹配的 Gold 事件 ===", unresolved.length);
unresolved.slice(0, 10).forEach(u => console.log("  ", u.file, "gold=" + u.gold, "key=" + u.key, `最优 ${u.best}/${u.of}`));
