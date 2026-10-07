// demo/_retest_unified.js —— D11 统一基线重测（唯一输入＝宗冻结的 31 份信封@292d252b）
// 目的：① 与 D11 首测（旧基线 4a8d0c33＋37afd2e3 信封）逐项对比，看指标有无变化
//       ② 与宗侧成绩（437/437）用同一批输入对账，定位口径差异来源
// 口径纪律：未核/无 Gold 标注的字段绝不计入任何命中率分母（首测守则③）
// 用法：node demo/_retest_unified.js   （在 page_prototype/ 下运行）
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");            // page_prototype/
const REPO = path.resolve(ROOT, "..", "..", "..");     // 仓库根 jingguands/（要退三级：page_prototype→cjh→workspace→repo）
// 输入目录优先用仓库内宗分支已入库的位置；未合流时回退到本地只读检出副本 data_unified/（不入库）
const CANDIDATE_ENV_DIRS = [
  path.join(REPO, "evaluation", "D11", "firsttest-envelopes"),
  path.join(ROOT, "data_unified")
];
const ENV_DIR = CANDIDATE_ENV_DIRS.find(d => fs.existsSync(d) && fs.readdirSync(d).some(f => f.endsWith(".json")));
if (!ENV_DIR) {
  console.error("找不到输入信封目录。请先检出：git show zongbowen@<sha>:evaluation/D11/firsttest-envelopes/<name> > data_unified/<name>");
  process.exit(2);
}
const GOLD_DIRS = ["D4", "D5", "D6"].map(d => path.join(REPO, "evaluation", d, "dev", "gold"));

// D11 首测基线（2026-10-07 19:42，commit 9240bd7b，冻结标签 v0.6-d11-firsttest@4a8d0c33）
const BASELINE = {
  extracted_pct: 71.53, extracted_n: 392, extracted_d: 548,
  standardized_pct: 69.87, std_n: 364, std_d: 521,
  prov_l1_pct: 73.18, l1_n: 401, l1_d: 548,
  anchor_n: 403, block_id_pct: 81.14, region_pct: 70.72, table_id_pct: 30.77, cell_ref_pct: 28.29
};

// ---------- 1. 读入信封 ----------
const envFiles = fs.readdirSync(ENV_DIR).filter(f => f.endsWith(".json")).sort();
const envelopes = [];
for (const f of envFiles) {
  const j = JSON.parse(fs.readFileSync(path.join(ENV_DIR, f), "utf8"));
  envelopes.push({ id: f.replace(/\.json$/, ""), json: j });
}

// ---------- 2. 读入 Gold（★按 source.file_id 配对，不能按 case_id/文件名） ----------
// 发现：Gold 的 source.file_name 沿用旧批次（D4-PLD-001 的 Gold 里写的是 D3-PLD-001.pdf），
// 只有 file_id（sha256）跨批次稳定 → 必须用 file_id 配对，否则 0 命中。
const goldById = new Map();
const goldByFileId = new Map();
for (const gd of GOLD_DIRS) {
  if (!fs.existsSync(gd)) continue;
  for (const f of fs.readdirSync(gd).filter(x => x.endsWith(".envelope.json"))) {
    const id = f.replace(/\.envelope\.json$/, "");
    if (goldById.has(id)) continue;
    try {
      const gj = JSON.parse(fs.readFileSync(path.join(gd, f), "utf8"));
      goldById.set(id, gj);
      const fid = gj.source && gj.source.file_id;
      if (fid) { if (!goldByFileId.has(fid)) goldByFileId.set(fid, { gold: gj, gold_case_id: id }); }
    } catch (e) { /* 跳过坏文件 */ }
  }
}

// ---------- 3. 枚举归一（宗侧自纠点②：布尔/数值字符串归一） ----------
function norm(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  if (s === "true" || s === "TRUE") return true;
  if (s === "false" || s === "FALSE") return false;
  if (s === "" || s === "null" || s === "undefined") return null;
  // 数值字符串 → 数字（"0.5" ≡ 0.5），非数值保持原样
  const n = Number(s.replace(/,/g, ""));
  if (!Number.isNaN(n) && /^[-+]?[\d.,]+$/.test(s)) return n;
  return s;
}
// 比例归一：带% 号与不带统一为百分点数值
function normRatio(v) {
  if (typeof v === "string" && v.includes("%")) { const n = Number(v.replace("%", "")); return Number.isNaN(n) ? v : n; }
  return norm(v);
}

// ---------- 4. 事件自然键（宗侧自纠点①：禁按序号配对） ----------
function evKey(ev, etype) {
  const f = ev.fields || {};
  const pick = (...ks) => { for (const k of ks) { const x = f[k]; if (x) { const v = x.value !== null && x.value !== undefined ? x.value : x.raw_value; if (v !== null && v !== undefined && v !== "") return String(v).trim(); } } return null; };
  if (etype === "pledge") return ["pledge", pick("pledgor"), pick("pledgee"), pick("direction") || "pledge"].join("|");
  if (etype === "equity_change") return ["equity_change", pick("holder"), pick("direction")].join("|");
  if (etype === "award_contract") return ["award_contract", pick("bidder"), pick("project_name")].join("|");
  return ["other", pick("bidder"), pick("holder")].join("|");
}

// ---------- 5. 逐份统计 ----------
const R = {
  files: envFiles.length,
  is_mock: 0, events_total: 0, fields_total: 0,
  extracted: 0, not_disclosed: 0, not_applicable: 0, not_mentioned: 0, unreadable: 0, needs_review: 0,
  std_yes: 0, std_no: 0, std_na: 0,           // 标准化：仅对 extracted 计
  prov_l1_hit: 0, prov_l1_den: 0,             // 溯源存在率 L1
  anchor: { n: 0, block_id: 0, page: 0, quote: 0, region: 0, table_id: 0, cell_ref: 0, source_type: 0 },
  l3_hit: 0, l3_den: 0,
  gold_pairs: 0, gold_no_env: 0, gold_no_gold: 0, gold_no_gold_ids: [], pair_by: [],
  gold_fields_total: 0, gold_match: 0, gold_mismatch: [], gold_missing: [],
  false_fill: 0, false_fill_den: 0, false_fill_list: [],
  unknown_status: []
};

for (const { id, json: j } of envelopes) {
  if (j.is_mock) R.is_mock++;
  const evs = j.events || [];
  R.events_total += evs.length;

  for (const ev of evs) {
    for (const [fname, fv] of Object.entries(ev.fields || {})) {
      R.fields_total++;
      const st = fv.status;
      if (st in R) R[st]++; else R.unknown_status.push(`${id}.${ev.event_id}.${fname}=${st}`);

      // 溯源存在率 L1：有无 provenance（这是"溯源存在"，与"字段抽取"是两个指标）
      const provs = Array.isArray(fv.provenance) ? fv.provenance : [];
      R.prov_l1_den++;
      if (provs.length > 0) R.prov_l1_hit++;

      // 锚点完备性：只在有出处时计
      if (provs.length > 0) {
        for (const p of provs) {
          R.anchor.n++;
          if (p.block_id) R.anchor.block_id++;
          if (p.page) R.anchor.page++;
          if (p.quote) R.anchor.quote++;
          if (p.region) R.anchor.region++;
          if (p.table_id) R.anchor.table_id++;
          if (p.cell_ref) R.anchor.cell_ref++;
          if (p.source_type) R.anchor.source_type++;
        }
        // L3 出处命中：有解析包来源 才算分母（有出处但来源不可核=不计）
        const parsed = j.source && j.source.parse_meta && j.source.parse_meta.page_count;
        if (parsed) { R.l3_den++; if (provs.some(p => p.block_id || (p.page && p.quote))) R.l3_hit++; }
      }

      // 标准化率：只对 extracted 计（needs_review 依据不足不算）
      if (st === "extracted") {
        R.std_na++;
        if (fv.standardized === true) R.std_yes++;
        else if (fv.standardized === false) R.std_no++;
      }

      // 错误填充率：非 extracted 却带 value（原文明示缺失状态却填了值）
      if (st !== "extracted" && fv.value !== null && fv.value !== undefined) {
        R.false_fill_den++;
        if (norm(fv.value) !== null && norm(fv.value) !== "" && norm(fv.value) !== 0) {
          R.false_fill++;
          R.false_fill_list.push(`${id}.${ev.event_id}.${fname} status=${st} value=${JSON.stringify(fv.value)}`);
        }
      }
    }
  }

  // ---------- 6. 与 Gold 对账（★按 file_id 配对 · 自然键配事件 · 布尔归一） ----------
  const fid = j.source && j.source.file_id;
  const hit = fid ? goldByFileId.get(fid) : null;
  const g = hit ? hit.gold : null;
  R.pair_by.push(hit ? "file_id" : "miss");
  if (!g) { R.gold_no_gold++; if (fid) R.gold_no_gold_ids.push(id); }
  else {
    const gEvs = g.events || [];
    const eMap = new Map();
    for (const ev of evs) {
      const k = evKey(ev, ev.event_type);
      if (!eMap.has(k)) eMap.set(k, []);
      eMap.get(k).push(ev);
    }
    const gMap = new Map();
    for (const ev of gEvs) {
      const k = evKey(ev, ev.event_type);
      if (!gMap.has(k)) gMap.set(k, []);
      gMap.get(k).push(ev);
    }
    for (const [k, gList] of gMap) {
      const eList = eMap.get(k);
      if (!eList) { R.gold_no_env++; R.gold_missing.push(`${id} [${k}] Gold 有事件但信封无（自然键未配对）`); continue; }
      const gEv = gList[0], eEv = eList[0];
      R.gold_pairs++;
      for (const [fname, gfv] of Object.entries(gEv.fields || {})) {
        // 只对 Gold 明确给出期望值（extracted）的字段计准确率分母
        if (gfv.status !== "extracted") continue;
        R.gold_fields_total++;
        const efv = (eEv.fields || {})[fname];
        if (!efv) { R.gold_mismatch.push(`${id}.${gEv.event_id}.${fname}: 信封缺该字段`); continue; }
        let ev2 = efv.value !== null && efv.value !== undefined ? efv.value : efv.raw_value;
        if (gvIsRatio(fname)) { ev2 = normRatio(ev2); } else { ev2 = norm(ev2); }
        const gv2 = gvIsRatio(fname) ? normRatio(gfv.value !== null && gfv.value !== undefined ? gfv.value : gfv.raw_value) : norm(gfv.value !== null && gfv.value !== undefined ? gfv.value : gfv.raw_value);
        if (String(ev2) === String(gv2)) R.gold_match++;
        else R.gold_mismatch.push(`${id}.${gEv.event_id}.${fname}: 信封=${JSON.stringify(ev2)} vs Gold=${JSON.stringify(gv2)}`);
      }
    }
  }
}
function gvIsRatio(f) { return /ratio|percent|rate|ratio_before|ratio_after/.test(f); }

// ---------- 7. 输出 ----------
const pct = (a, b) => b ? (a / b * 100) : null;
const fmt = v => v === null ? "—" : v.toFixed(2);
console.log("╔══════════════════════════════════════════════════════════════════╗");
console.log("║D11 统一基线重测 · 输入＝宗冻结 31 份信封 @292d252b                    ║");
console.log("╚══════════════════════════════════════════════════════════════════╝\n");

console.log("【输入】");
console.log(`  信封份数${R.files}（is_mock=${R.is_mock}）  事件 ${R.events_total}  字段 ${R.fields_total}`);
console.log(`  Gold 配对：成功 ${R.gold_pairs} 组 / 无Gold ${R.gold_no_gold} 份 / Gold 有但信封无 ${R.gold_no_env} 组`);
if (R.unknown_status.length) console.log(`  ⚠ 未知 status ${R.unknown_status.length} 处：${R.unknown_status.slice(0, 3).join("; ")}`);

console.log("\n【六状态分布】");
for (const k of ["extracted", "not_disclosed", "not_applicable", "not_mentioned", "unreadable", "needs_review"]) {
  const p = pct(R[k], R.fields_total);
  console.log(`  ${k.padEnd(18)} ${String(R[k]).padStart(4)}  ${fmt(p)}%`);
}

console.log("\n【核心指标 · 新 vs D11 首测旧基线】");
const rows = [
  ["字段抽取率", pct(R.extracted, R.fields_total), BASELINE.extracted_pct, `${R.extracted}/${R.fields_total}`, `${BASELINE.extracted_n}/${BASELINE.extracted_d}`],
  ["标准化率", pct(R.std_yes, R.std_na), BASELINE.standardized_pct, `${R.std_yes}/${R.std_na}`, `${BASELINE.std_n}/${BASELINE.std_d}`],
  ["溯源存在率 L1", pct(R.prov_l1_hit, R.prov_l1_den), BASELINE.prov_l1_pct, `${R.prov_l1_hit}/${R.prov_l1_den}`, `${BASELINE.l1_n}/${BASELINE.l1_d}`],
  ["出处命中率 L3", pct(R.l3_hit, R.l3_den), null, `${R.l3_hit}/${R.l3_den}`, "14/24"]
];
console.log("  指标名".padEnd(20) + "本次".padStart(9) + "首测".padStart(9) + "   变化" + "     本次分子/分母vs 首测");
for (const [name, nv, ov, nf, of] of rows) {
  const delta = (ov !== null && nv !== null) ? (nv - ov) : null;
  const ds = delta === null ? "—" : (delta >= 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2));
  console.log("  " + name.padEnd(18) + fmt(nv).padStart(9) + (ov === null ? "—" : ov.toFixed(2)).padStart(9) + ds.padStart(9) + "   " + nf + " vs " + of);
}

console.log("\n【锚点完备性】");
const a = R.anchor;
console.log(`  n=${a.n}（首测 n=${BASELINE.anchor_n}）`);
const baseKeys = { block_id: "block_id_pct", page: "page_pct", quote: "quote_pct", region: "region_pct", table_id: "table_id_pct", cell_ref: "cell_ref_pct", source_type: null };
for (const [k, label] of [["block_id", "block_id"], ["page", "page"], ["quote", "quote"], ["region", "region"], ["table_id", "table_id"], ["cell_ref", "cell_ref"], ["source_type", "source_type"]]) {
  const ov = BASELINE[baseKeys[k]];
  const nv = pct(a[k], a.n);
  const ds = (ov !== null && ov !== undefined && nv !== null) ? ((nv - ov >= 0 ? "+" : "") + (nv - ov).toFixed(2)) : "—（首测无此项）";
  console.log(`  ${label.padEnd(14)} ${fmt(nv)}%${ov != null ? "   首测 " + ov.toFixed(2) + "%  变化 " + ds : "   " + ds}`);
}

console.log("\n【与 Gold 对账（★按 file_id 配对 · 自然键配事件 · 布尔归一）】");
console.log(`  配对事件组 ${R.gold_pairs}   Gold 期望字段 ${R.gold_fields_total}   值一致 ${R.gold_match}   不一致 ${R.gold_mismatch.length}`);
console.log(`  ⇒ 准确率 ${fmt(pct(R.gold_match, R.gold_fields_total))}%   （宗侧同批输入报 437/437 = 100%）`);
console.log(`  配对方式：file_id 命中 ${R.pair_by.filter(x => x === "file_id").length} / 未命中 ${R.pair_by.filter(x => x === "miss").length}`);
if (R.gold_no_gold) console.log(`  无 Gold 的份（不计入任何分母）：${R.gold_no_gold_ids.join(", ")}`);
if (R.gold_mismatch.length) { console.log("  失配明细（前 15 条）："); R.gold_mismatch.slice(0, 15).forEach(m => console.log("· " + m)); }
if (R.gold_missing.length) { console.log("  未配对事件（前 10 条）："); R.gold_missing.slice(0, 10).forEach(m => console.log("· " + m)); }

console.log("\n【错误填充率】（非 extracted 却带值）");
console.log(`  ${R.false_fill} / ${R.false_fill_den}  = ${fmt(pct(R.false_fill, R.false_fill_den))}%   （宗侧报 0）`);
R.false_fill_list.slice(0, 10).forEach(m => console.log("  · " + m));

// 落盘
const out = { meta: { input_dir: ENV_DIR, input: "宗冻结31 份信封（D11 firsttest-envelopes），信封内 code_version=292d252b", gold_dirs: GOLD_DIRS, gold_pair_key: "source.file_id（★不能用 file_name：Gold 沿用旧批次文件名）", rule: "未核/无 Gold 标注字段不计入任何命中率分母" }, baseline: BASELINE, current: R, pct: { extracted: pct(R.extracted, R.fields_total), standardized: pct(R.std_yes, R.std_na), prov_l1: pct(R.prov_l1_hit, R.prov_l1_den), l3: pct(R.l3_hit, R.l3_den), gold_acc: pct(R.gold_match, R.gold_fields_total), false_fill: pct(R.false_fill, R.false_fill_den) } };
fs.writeFileSync(path.join(__dirname, "_retest_unified.json"), JSON.stringify(out, null, 2), "utf8");
console.log("\n→ " + path.join(__dirname, "_retest_unified.json"));
