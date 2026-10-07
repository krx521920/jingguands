// 只读：对比两种事件配对口径，定位 583 vs 437 的差异来源
// D12-C2：evaluation/ 不再入库，路径解析与缺失处置集中到 _evals_paths.js
const fs = require("fs");
const path = require("path");
const ev = require("./_evals_paths.js");

const ENV = ev.LOCAL_ENVELOPES;
const GOLD = ev.goldDirs();

const gm = new Map();
for (const gd of GOLD) {
  if (!fs.existsSync(gd)) continue;
  for (const f of fs.readdirSync(gd).filter(x => x.endsWith(".envelope.json"))) {
    try {
      const g = JSON.parse(fs.readFileSync(path.join(gd, f), "utf8"));
      const id = g.source && g.source.file_id;
      if (id && !gm.has(id)) gm.set(id, { g, file: f });
    } catch (e) { /* skip */ }
  }
}

const strictCnt = {}, looseCnt = {};
let goldEvTotal = 0, envEvTotal = 0, strictPairs = 0, strictMiss = 0, loosePairs = 0;
const missSamples = [];

for (const f of fs.readdirSync(ENV).filter(x => x.endsWith(".json"))) {
  const j = JSON.parse(fs.readFileSync(path.join(ENV, f), "utf8"));
  if (j.is_mock) continue;
  const h = gm.get(j.source && j.source.file_id);
  if (!h) continue;
  envEvTotal += (j.events || []).length;
  goldEvTotal += (h.g.events || []).length;

  // 严格：按 event_id
  const em = new Map();
  for (const ev of j.events || []) em.set(ev.event_id, ev);
  for (const gev of h.g.events || []) {
    if (em.has(gev.event_id)) {
      strictPairs++;
      const fv = em.get(gev.event_id).fields || {};
      for (const [n, gv] of Object.entries(gev.fields || {})) {
        if (gv.status !== "extracted") continue;
        const st = fv[n] ? fv[n].status : "(缺字段)";
        strictCnt[st] = (strictCnt[st] || 0) + 1;
      }
    } else {
      strictMiss++;
      if (missSamples.length < 6) missSamples.push({ file: f, gold_event: gev.event_id });
    }
  }

  // 宽松：原脚本口径 evKey = event_type + 序号（复刻）
  const bucket = (arr) => {
    const b = new Map();
    arr.forEach((ev, i) => {
      const k = ev.event_type + "#" + arr.slice(0, i + 1).filter(x => x.event_type === ev.event_type).length;
      if (!b.has(k)) b.set(k, []);
      b.get(k).push(ev);
    });
    return b;
  };
  const eB = bucket(j.events || []), gB = bucket(h.g.events || []);
  for (const [k, gList] of gB) {
    const eL = eB.get(k);
    if (!eL) continue;
    loosePairs++;
    const fv = (eL[0].fields) || {};
    for (const [n, gv] of Object.entries((gList[0].fields) || {})) {
      if (gv.status !== "extracted") continue;
      const st = fv[n] ? fv[n].status : "(缺字段)";
      looseCnt[st] = (looseCnt[st] || 0) + 1;
    }
  }
}

const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
console.log("=== 事件配对 ===");
console.log("Gold 事件", goldEvTotal, " 信封事件", envEvTotal);
console.log("严格(event_id) 配对成功", strictPairs, " 未配对", strictMiss);
console.log("宽松(type#序号) 配对成功", loosePairs);
console.log("未配对样本:", JSON.stringify(missSamples));

console.log("\n=== 严格口径：Gold(extracted) 字段的信封状态 ===");
console.log(JSON.stringify(strictCnt, null, 1), "合计", sum(strictCnt));
console.log("\n=== 宽松口径（=已提交的 437）===");
console.log(JSON.stringify(looseCnt, null, 1), "合计", sum(looseCnt));
