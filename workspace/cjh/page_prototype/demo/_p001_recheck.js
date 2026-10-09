// 只读：新标准下复验 D11-P0-01（几何法）
// P0-01 根因是 quote 文本与 block_id 的映射错误。因Gold/信封的 blocks[] 均为空数组（无法做文本包含核验），
// 改用几何一致性核验：同一份 PDF 内，不同字段若引用同一 block_id，其 region 应完全相同；
// 若同一 block_id 对应多个不同 region，说明 block↔region 映射自身不一致。
// 同时核验：quote 文本是否出现在 Gold 的 events 之外的可验证来源（此处退化为跨字段自洽性检查）。
const fs = require("fs");
const path = require("path");
// D12-C2：evaluation/ 不再入库，路径解析与缺失处置集中到 _evals_paths.js
const ev = require("./_evals_paths.js");
const ENV = ev.LOCAL_ENVELOPES;
const REPO = ev.REPO;
const GOLD = ev.goldDirs();

const gm = new Map();
for (const gd of GOLD) { if (!fs.existsSync(gd)) continue;
  for (const f of fs.readdirSync(gd).filter(x => x.endsWith(".envelope.json"))) {
    try { const g = JSON.parse(fs.readFileSync(path.join(gd, f), "utf8")); const id = g.source && g.source.file_id;
      if (id && !gm.has(id)) gm.set(id, g); } catch (e) { }
  }
}

const R = {
  datasets: 0, prov: 0,
  blockRegion: new Map(),      // block_id -> Set(region)  全局
  blockQuote: new Map(),       // block_id -> Set(quote)
  sameBlockDiffRegion: [],     // ★同block 不同 region = 映射不自洽
  sameBlockDiffQuote: [],      // ★同 block 不同 quote
  goldEmptyBlocks: 0, goldTotal: 0,
  crossSideBlockIdMatch: { checked: 0, same: 0, diff: 0, samples: [] },
};

for (const f of fs.readdirSync(ENV).filter(x => x.endsWith(".json"))) {
  const j = JSON.parse(fs.readFileSync(path.join(ENV, f), "utf8"));
  if (j.is_mock) continue;
  R.datasets++;
  const g = gm.get(j.source && j.source.file_id);

  // Gold blocks 是否为空（P0-01 根因的当前状态）
  if (g) { R.goldTotal++; if (!(g.blocks || []).length) R.goldEmptyBlocks++; }

  // 全局 block_id -> region/quote 一致性
  for (const ev of j.events || []) {
    for (const [n, fv] of Object.entries(ev.fields || {})) {
      for (const p of (Array.isArray(fv.provenance) ? fv.provenance : [])) {
        if (!p.block_id) continue;
        R.prov++;
        const rk = p.region ? p.region.join(",") : "(none)";
        if (!R.blockRegion.has(p.block_id)) R.blockRegion.set(p.block_id, new Map());
        const m = R.blockRegion.get(p.block_id);
        m.set(rk, (m.get(rk) || 0) + 1);
        if (!R.blockQuote.has(p.block_id)) R.blockQuote.set(p.block_id, new Map());
        const q = String(p.quote || "").trim();
        R.blockQuote.get(p.block_id).set(q, (R.blockQuote.get(p.block_id).get(q) || 0) + 1);
      }
    }
  }

  // 交叉核验：信封的 block_id/region 与 Gold 是否一致
  if (g) {
    const gm2 = new Map();
    for (const gev of g.events || []) for (const [n, gv] of Object.entries(gev.fields || {})) {
      for (const p of (Array.isArray(gv.provenance) ? gv.provenance : [])) {
        if (p.block_id) gm2.set(n, p);
      }
    }
    for (const ev of j.events || []) {
      for (const [n, fv] of Object.entries(ev.fields || {})) {
        const gp = gm2.get(n); if (!gp) continue;
        const pp = (Array.isArray(fv.provenance) ? fv.provenance : [])[0]; if (!pp) continue;
        R.crossSideBlockIdMatch.checked++;
        if (pp.block_id === gp.block_id) R.crossSideBlockIdMatch.same++;
        else { R.crossSideBlockIdMatch.diff++;
          if (R.crossSideBlockIdMatch.samples.length < 8)
            R.crossSideBlockIdMatch.samples.push({ file: f, field: n, env_block: pp.block_id, gold_block: gp.block_id, env_region: pp.region, gold_region: gp.region }); }
      }
    }
  }
}

console.log("=== P0-01 复验（几何 + 交叉核验）===");
console.log(`数据集 ${R.datasets}   有出处条目 ${R.prov}   唯一 block_id ${R.blockRegion.size}`);
console.log(`\n[1] Gold blocks 为空：${R.goldEmptyBlocks}/${R.goldTotal} 份★ P0-01 根因（cells 抽离为独立 block）在 Gold 侧同样存在`);

let diffR = 0, diffQ = 0;
for (const [b, m] of R.blockRegion) if (m.size > 1) { diffR++; if (R.sameBlockDiffRegion.length < 6) R.sameBlockDiffRegion.push({ block: b, regions: [...m.keys()] }); }
for (const [b, m] of R.blockQuote) if (m.size > 1) diffQ++;
console.log(`\n[2] 同一 block_id 对应多个 region：${diffR} 个 block★ 0 = block↔region 映射自洽`);
R.sameBlockDiffRegion.forEach(x => console.log("    ", x.block, "→", x.regions.join(" vs ")));
console.log(`[3] 同一 block_id 对应多个不同 quote：${diffQ} 个 block（正常：一个块可含多字段值）`);

const c = R.crossSideBlockIdMatch;
console.log(`\n[4] 信封 vs Gold 交叉核验：可比字段 ${c.checked}   block_id 相同 ${c.same}   不同 ${c.diff}`);
c.samples.forEach(s => console.log(`    ${s.file} ${s.field}\n      信封 ${s.env_block} ${JSON.stringify(s.env_region)}\n      Gold ${s.gold_block} ${JSON.stringify(s.gold_region)}`));

// 落盘（Map 不可序列化，转数组）
const out = { ...R, blockRegion: [...R.blockRegion].map(([b, m]) => ({ block: b, regions: [...m.keys()] })), blockQuote: [...R.blockQuote].map(([b, m]) => ({ block: b, quotes: [...m.keys()] })) };
fs.writeFileSync(path.join(__dirname, "_p001_recheck.json"), JSON.stringify(out, null, 2));
console.log("\n落盘: demo/_p001_recheck.json");
