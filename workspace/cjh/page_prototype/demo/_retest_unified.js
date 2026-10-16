// demo/_retest_unified.js —— D11 统一基线重测（输入＝宗冻结信封；入口径 31 份）
// 目的：① 以权威批独立复算页面原始计数（437/606、449/606、锚点），与宗侧成绩单对账
//       ② 标准化与出处命中两项**不在本脚本重算**——旧口径（std 只对 extracted 计 /
//          L3 只查有无锚点）与现行裁定（D17 / 强判据 quote∈block.text）不同，
//          重算即产「同名两个数」；权威值分别读 demo/_standardized_real.json 与
//          demo/_evidence_check.json（与页面卡片同源）。
// ★ 2026-10-15 领导裁定「不走首测了，真删」：D11 首测旧基线（548 分母系列自测值）
//   已全部作废，本脚本不再做任何首测对比、不再列举旧值。
// ★ 2026-10-15 口径修复（方轩诚反馈 + 领导「动手修复并落地」）：
//   ① 先建 **Gold 期望全集** 再逐字段对账（分母只由 Gold 决定，不由引擎 status 反推）；
//   ② Gold 有事件而信封无对应事件时**不丢分母**（旧实现 `continue` 把应抽字段一起跳过）；
//   ③ 同键多事件按组内序号配对（旧实现只取 gList[0]/eList[0]）；
//   ④ 口径算法收敛到 bridge/caliber.js 单一真源（本脚本不再自带一份实现）。
// 口径纪律：未核/无 Gold 标注的字段绝不计入任何命中率分母
// 用法：node demo/_retest_unified.js   （在 page_prototype/ 下运行）
const fs = require("fs");
const path = require("path");
const ev = require("./_evals_paths.js");   // D12-C2：evaluation/ 不再入库，路径与缺失处置集中在此

const ROOT = path.resolve(__dirname, "..");            // page_prototype/
const REPO = ev.REPO;                                // 仓库根 jingguands/
// 输入目录：仓库内 evaluation/D11/firsttest-envelopes/ 优先，回退本地只读检出 data_unified/；
// 两者都无 → 显式报错退出（绝不静默 0 命中，那会被误读成"Gold 缺失"）
let ENV_DIR, GOLD_DIRS;
try {
  ENV_DIR = ev.envDir();
  GOLD_DIRS = ev.goldDirs();
} catch (e) {
  console.error("[中止] " + e.message);
  process.exit(2);
}

// ★ 2026-10-15：D11 首测基线常量已随「不走首测了，真删」裁定整体删除——旧值不再作为
//   任何对照，本脚本只报权威批实算值。物证不删：P0-01 两份数据集按领导 10-09
//   裁定②留在旧池 data/ 并标注，核对走 demo/_evidence_check.js → p001_witness 段。

// ---------- 1. 读入信封（★入口径过滤：与页面 /api/metrics 同一份名单） ----------
// 物理目录可能有 32 份（含演示件 DEMO-EQC-HL-0930 与原文缺陷件 pledge-scan-degrade），
// 口径只算 31 份——名单单一真源取 bridge/data_source.js，不在此另维护一套。
let primaryNames = new Set();
try {
  const ds = require(path.join(ROOT, "bridge", "data_source.js"));
  primaryNames = new Set(ds.primaryEntries().filter(e => e.counts_for_primary).map(e => e.name));
} catch (e) {
  console.error("[中止] 无法加载 bridge/data_source.js（入口径名单单一真源）：" + e.message);
  process.exit(2);
}
// ★ 2026-10-15：口径算法（Gold 期望全集构建 / 归一 / 业务键）统一取 bridge/caliber.js
//   单一真源——本脚本不再自带一份实现（两处各算一次必然重演「同名两个值」）。
const caliber = require(path.join(ROOT, "bridge", "caliber.js"));

const envFilesAll = fs.readdirSync(ENV_DIR).filter(f => f.endsWith(".json")).sort();
const envFiles = envFilesAll.filter(f => primaryNames.has(f.replace(/\.json$/, "")));
const excludedFiles = envFilesAll.filter(f => !primaryNames.has(f.replace(/\.json$/, "")));
const envelopes = [];
for (const f of envFiles) {
  const j = JSON.parse(fs.readFileSync(path.join(ENV_DIR, f), "utf8"));
  envelopes.push({ id: f.replace(/\.json$/, ""), json: j });
}

// ---------- 2. 读入 Gold（★按 source.file_id 配对，不能按 case_id/文件名） ----------
// 发现：Gold 的 source.file_name 沿用旧批次（D4-PLD-001 的 Gold 里写的是 D3-PLD-001.pdf），
// 只有 file_id（sha256）跨批次稳定 → 必须用 file_id 配对，否则 0 命中。
// ★ 2026-10-15：Gold 索引与「期望全集」构建收敛到 bridge/caliber.js（单一真源），
//   本脚本不再自带一份 —— 两份实现必然漂移，且旧实现有「缺整事件丢分母」缺陷。
const goldIndex = caliber.loadGoldIndex();
if (!GOLD_DIRS || !GOLD_DIRS.length) { console.error("[中止] Gold 目录为空：无法判期望全集"); process.exit(2); }

// ---------- 3. 枚举归一（宗侧自纠点②：布尔/数值字符串归一） ----------
// ★ 实现已收敛到 bridge/caliber.js（单一真源）：本脚本只做别名，不再自带一份。
const norm = caliber.norm;
const normRatio = caliber.normRatio;
const gvIsRatio = caliber.isRatioField;

// ---------- 4. 事件自然键（宗侧自纠点①：禁按序号配对） ----------
const evKey = caliber.evKey;

// ---------- 5. 逐份统计 ----------
const R = {
  files: envFiles.length,
  is_mock: 0, events_total: 0, fields_total: 0,
  extracted: 0, not_disclosed: 0, not_applicable: 0, not_mentioned: 0, unreadable: 0, needs_review: 0,
  std_yes: 0, std_no: 0, std_na: 0,           // 标准化：仅对 extracted 计
  prov_l1_hit: 0, prov_l1_den: 0,             // 溯源存在率 L1
  anchor: { n: 0, block_id: 0, page: 0, quote: 0, region: 0, table_id: 0, cell_ref: 0, source_type: 0 },
  l3_hit: 0, l3_den: 0,
  gold_pairs: 0, gold_paired_datasets: 0,
  gold_no_env: 0, gold_no_gold: 0, gold_no_gold_ids: [], pair_by: [],
  gold_fields_total: 0, gold_match: 0, gold_mismatch: [], gold_missing: [],
  // ★ 2026-10-15 新增：Gold 期望字段召回率（值一致率另计，两者当前同值但分子条件不同）
  recall_num: 0, recall_miss_n: 0, extra_candidates: [], pending_gold: 0, pending_engine: 0,
  status_diff: [], gold_bad: [], unpairable: [], no_gold_fields: 0,
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
        // L3 弱计数（只统计「有锚点」，**不作命中率上屏**——强判据 quote∈block.text
        // 见 demo/_evidence_check.js → l3_scope，与页面出处命中率同源）
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

  // ---------- 6. 与 Gold 的**配对情况**逐份记录（对账本体见 §6b，全部读完再统一做） ----------
  //   ★ 旧实现在循环内直接对账，且 Gold 事件配不上信封时 `continue` —— 那会连
  //     「该事件应抽的字段」一起从分母丢掉（漏抽被静默吞掉）。现改为先收齐
  //     全部信封，再以 **Gold 期望全集** 为基准逐字段查（见 §6b）。
  const fid = j.source && j.source.file_id;
  const hit = fid ? goldIndex.byFileId.get(fid) : null;
  R.pair_by.push(hit ? "file_id" : (fid ? "miss" : "no_file_id"));
}

// ---------- 6b. Gold 期望全集对账（★分母只由 Gold 决定） ----------
//   ① 先建 Gold 期望全集（Gold 判 extracted 的字段），再逐字段看信封侧有没有抽出来；
//   ② Gold 有事件而信封无对应事件 ⇒ 该事件期望字段**仍进分母**并记 miss；
//   ③ 同键多事件按组内序号一一配对，不只取首个；
//   ④ 多抽候选 / 未裁定 pending / 无 Gold 不可核 全部单列，不混入已裁定召回率。
const gold = caliber.buildGoldExpected(envelopes, goldIndex);
R.gold_pairs = gold.pairs;
R.gold_paired_datasets = gold.paired_datasets;
R.gold_no_env = gold.miss_events.length;                    // ★ 不再 continue 丢分母
R.gold_missing = gold.miss_events.map(m => `${m.dataset} [${m.key}] #${m.index + 1} Gold 有事件但信封无（期望字段仍计分母）`)
  .concat(gold.recall_miss);
R.gold_no_gold = gold.no_gold.length;
R.gold_no_gold_ids = gold.no_gold.map(x => x.dataset);
R.gold_fields_total = gold.expected_total;                  // 期望全集（召回率分母）
R.gold_match = gold.value_match_num;                        // 值+单位一致
R.gold_mismatch = gold.value_mismatch;
R.recall_num = gold.recall_num;                             // 有效抽出（status=extracted 且有值）
R.recall_miss_n = gold.recall_miss.length;
R.extra_candidates = gold.extra_candidates;
R.pending_gold = gold.pending_gold;
R.pending_engine = gold.pending_engine;
R.status_diff = gold.status_diff;
R.gold_bad = gold.gold_bad;
R.unpairable = gold.unpairable;
R.no_gold_fields = gold.no_gold_fields;

// ---------- 6c. 三档范围（606 / 592 / 437）与槽位口径：同一真源 bridge/caliber.js ----------
const CAL = caliber.computeCaliber(envelopes, { goldIndex });
const ranges = CAL.ranges;

// ---------- 7. 输出 ----------
const pct = (a, b) => b ? (a / b * 100) : null;
const fmt = v => v === null ? "—" : v.toFixed(2);
console.log("╔══════════════════════════════════════════════════════════════════╗");
console.log("║D11 统一基线重测 · 输入＝宗冻结信封（入口径 31 份）                   ║");
console.log("╚══════════════════════════════════════════════════════════════════╝\n");

console.log("【输入】");
console.log(`  信封：物理 ${envFilesAll.length} 份 → 入口径 ${R.files} 份` +
  (excludedFiles.length ? `（排除 ${excludedFiles.map(f => f.replace(/\.json$/, "")).join("、")}——演示件/原文缺陷件，按 2026-10-15 口径不计；名单取 bridge/data_source.js）` : ""));
console.log(`  事件 ${R.events_total}  字段 ${R.fields_total}（is_mock=${R.is_mock}）`);
console.log(`  Gold 配对：成功 ${R.gold_pairs} 组 / 无Gold ${R.gold_no_gold} 份 / Gold 有但信封无 ${R.gold_no_env} 组`);
if (R.unknown_status.length) console.log(`  ⚠ 未知 status ${R.unknown_status.length} 处：${R.unknown_status.slice(0, 3).join("; ")}`);

console.log("\n【六状态分布】");
for (const k of ["extracted", "not_disclosed", "not_applicable", "not_mentioned", "unreadable", "needs_review"]) {
  const p = pct(R[k], R.fields_total);
  console.log(`  ${k.padEnd(18)} ${String(R[k]).padStart(4)}  ${fmt(p)}%`);
}

console.log("\n【核心指标（权威批实算，与页面同口径；首测基线已作废）】");
const rows = [
  ["全字段槽位有值率(历史)", pct(R.extracted, R.fields_total), `${R.extracted}/${R.fields_total}（${ranges.frozen_slot.datasets} 份槽位口径）`],
  ["核心文本槽位有值率", pct(R.extracted, ranges.core_text.fields), `${R.extracted}/${ranges.core_text.fields}（${ranges.core_text.datasets} 份有 Gold 核心文本）`],
  ["Gold 期望字段召回率", pct(R.recall_num, R.gold_fields_total), `${R.recall_num}/${R.gold_fields_total}（条件口径）`],
  ["溯源存在率 L1", pct(R.prov_l1_hit, R.prov_l1_den), `${R.prov_l1_hit}/${R.prov_l1_den}`],
];
console.log("  指标名".padEnd(20) + "本次".padStart(9) + "   分子/分母");
for (const [name, nv, nf] of rows) {
  console.log("  " + name.padEnd(18) + fmt(nv).padStart(9) + "   " + nf);
}
// 标准化 / 出处命中：本脚本不重算（旧口径与现行裁定不同，重算即同名两个数）——读同源产物
const stdReal = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, "_standardized_real.json"), "utf8")); } catch (e) { return null; } })();
const evChk = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, "_evidence_check.json"), "utf8")); } catch (e) { return null; } })();
const refRow = (name, obj) => {
  const v = obj && obj.pct !== undefined ? fmt(obj.pct) : "未测";
  const f = obj && obj.num !== undefined ? `${obj.num}/${obj.den}` : "缺档";
  console.log("  " + name.padEnd(18) + String(v).padStart(9) + "   " + f);
};
if (stdReal && stdReal.accuracy) refRow("标准化正确率", stdReal.accuracy);
else console.log("  标准化正确率" + " ".repeat(8) + "未测（demo/_standardized_real.json 缺档；D17 口径，不在此重算）");
if (evChk && evChk.l3_scope) refRow("出处命中率 L3", { pct: evChk.l3_scope.hit_rate_pct, num: evChk.l3_scope.hit, den: evChk.l3_scope.checked });
else console.log("  出处命中率 L3" + " ".repeat(6) + "未测（demo/_evidence_check.json 缺档；强判据，不在此重算）");

console.log("\n【锚点完备性】");
const a = R.anchor;
console.log(`  n=${a.n}`);
for (const [k, label] of [["block_id", "block_id"], ["page", "page"], ["quote", "quote"], ["region", "region"], ["table_id", "table_id"], ["cell_ref", "cell_ref"], ["source_type", "source_type"]]) {
  console.log(`  ${label.padEnd(14)} ${fmt(pct(a[k], a.n))}%`);
}

console.log("\n【与 Gold 对账（★先建 Gold 期望全集 · 按 file_id 配对 · 业务键配事件）】");
console.log(`  配对份数 ${R.gold_paired_datasets}  配对事件组 ${R.gold_pairs}   Gold 期望字段全集 ${R.gold_fields_total}`);
console.log(`  ⇒ Gold 期望字段召回率 ${fmt(pct(R.recall_num, R.gold_fields_total))}%  （${R.recall_num}/${R.gold_fields_total}；未抽到 ${R.recall_miss_n} 项已计入分母）`);
console.log(`  ⇒ Gold 期望字段值一致率 ${fmt(pct(R.gold_match, R.gold_fields_total))}%  （${R.gold_match}/${R.gold_fields_total}；分子条件与召回率不同，当前恰好同值，不得合并）`);
console.log(`  限定语（必须同行引用）：当前 Gold 条件口径；公开语料冻结回放；不外推泛化；${caliber.QUALIFIER.pending_note}`);
console.log(`  配对方式：file_id 命中 ${R.pair_by.filter(x => x === "file_id").length} / 未命中 ${R.pair_by.filter(x => x === "miss").length} / 缺身份 ${R.pair_by.filter(x => x === "no_file_id").length}`);
if (R.gold_no_env) console.log(`  ⚠ Gold 有事件而信封无 ${R.gold_no_env} 处（期望字段仍计入分母，不丢）：见 miss 明细`);
if (R.extra_candidates.length) console.log(`  多抽候选 ${R.extra_candidates.length} 处（Gold 判无值而引擎填值，不得挪入分子）`);
console.log(`  未裁定 pending：Gold ${R.pending_gold} 项 / 引擎 needs_review ${R.pending_engine} 项（单列，不得记「正确弃权」）；状态分歧 ${R.status_diff.length} 处`);
if (R.status_diff.length) R.status_diff.forEach(m => console.log("    · " + m));
if (R.gold_no_gold) console.log(`  无 Gold 的份（不可核，${R.no_gold_fields} 字段，不计入任何分母）：${R.gold_no_gold_ids.join(", ")}`);
if (R.gold_bad.length) console.log(`  ⚠ Gold 损坏/身份缺失 ${R.gold_bad.length} 处（阻断正式统计）：${R.gold_bad.map(x => x.dataset + "：" + x.why).join("；")}`);
if (R.unpairable.length) console.log(`  ⚠ 对齐歧义 ${R.unpairable.length} 处：${R.unpairable.map(x => x.dataset + "：" + x.why).join("；")}`);
if (R.gold_mismatch.length) { console.log("  值不一致明细（前 15 条）："); R.gold_mismatch.slice(0, 15).forEach(m => console.log("· " + m)); }
if (R.gold_missing.length) { console.log("  期望未抽到 / 事件未配对（前 10 条）："); R.gold_missing.slice(0, 10).forEach(m => console.log("· " + m)); }

console.log("\n【错误填充率】（非 extracted 却带值）");
console.log(`  ${R.false_fill} / ${R.false_fill_den}  = ${fmt(pct(R.false_fill, R.false_fill_den))}%   （宗侧报 0）`);
R.false_fill_list.slice(0, 10).forEach(m => console.log("  · " + m));

// 落盘
// ★ 2026-10-15：口径算法改由 bridge/caliber.js 提供（单一真源），本产物新增
//   ranges（606/592/437 三档范围）与 gold_caliber（召回率/值一致率/pending/不可核）。
const out = {
  meta: {
    input_dir: ENV_DIR,
    input: "宗冻结信封（D11 firsttest-envelopes），入口径 31 份（名单取 bridge/data_source.js）",
    gold_dirs: GOLD_DIRS,
    gold_pair_key: "source.file_id（★不能用 file_name：Gold 沿用旧批次文件名）",
    rule: "未核/无 Gold 标注字段不计入任何命中率分母；Gold 期望全集分母只由 Gold 决定，不由引擎 status 反推",
    caliber_source: "bridge/caliber.js（口径单一真源：卡片 / 注册表 / 本脚本 / _evidence_check 共用）",
    qualification: caliber.QUALIFIER,
    note: "2026-10-15 领导裁定「不走首测了，真删」：首测基线常量已删除；标准化/出处命中不在此重算（口径与现行裁定不同），权威值读 demo/_standardized_real.json 与 demo/_evidence_check.json",
  },
  primary_filter: { physical: envFilesAll.length, primary: envFiles.length, excluded: excludedFiles.map(f => f.replace(/\.json$/, "")) },
  ranges,
  current: R,
  pct: {
    slot_value_rate: pct(R.extracted, R.fields_total),
    prov_l1: pct(R.prov_l1_hit, R.prov_l1_den),
    expected_field_recall: pct(R.recall_num, R.gold_fields_total),
    gold_value_match: pct(R.gold_match, R.gold_fields_total),
    false_fill: pct(R.false_fill, R.false_fill_den),
  },
};
fs.writeFileSync(path.join(__dirname, "_retest_unified.json"), JSON.stringify(out, null, 2), "utf8");
console.log("\n→ " + path.join(__dirname, "_retest_unified.json"));
