// demo/_standardized_real.js —— standardized 两项指标实算（D17 判据）
//
// 依据（评测侧裁定，不可自创口径）：
//   evaluation/D17/裁定-standardized判据-20261010.md
//   evaluation/D17/check-standardized.mjs（正反两向都验的检查器）
//
// 为什么要这个脚本：
//   卡片与注册表曾各写一个数（卡片 71.62% ＝ 434/606，注册表 99.1% ＝ 442/446），
//   同名不同值、分母都不同。D17 裁定后口径唯一，但**数值仍必须实算**——
//   抄裁定正文里的 229/229 等于把别人的结论当自己的测量，出错时无法追责。
//
// 主口径（覆盖率）：
//   分母＝非 text 有值字段（value 非空 且 unit !== "text"）
//   分子＝其中 standardized === true
//正确率：
//   分母＝非 text 有值字段中「有 Gold 期望值」的那部分
//   分子＝其中 value 与 Gold 一致者（按 source.file_id 配对文件 + 业务键配事件）
//   ★ 目标 98% 只挂正确率；覆盖率不挂目标（它不是准确率）。
//
// 纪律：
//   ① text 字段不入分母、不上屏（D13-C2 已裁）。
//   ② 弃权字段不得标 true —— 发现即单列，不静默修好（修属抽取侧）。
//   ③ 有值字段缺布尔 standardized 属缺陷，单列，不进分母。
//   ④ Gold 缺失 ⇒ 正确率判「未测」，不按 100% 填充。
//   ⑤ 禁按case_id / file_name 配对（Gold 沿用旧批次文件名），只用 source.file_id。
//
// 用法：
//   node demo/_standardized_real.js            实算并写 demo/_standardized_real.json
//   node demo/_standardized_real.js --check    只校验既有 json 与当前实算是否一致
"use strict";
const fs = require("fs");
const path = require("path");
const ev = require("./_evals_paths.js");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(__dirname, "_standardized_real.json");
const CHECK_ONLY = process.argv.includes("--check");

// ---------- 定位权威信封目录（优先仓库内，回退本地 data_unified/） ----------
let ENV_DIR;
try { ENV_DIR = ev.envDir(); }
catch (e) {
  console.error("[中止] " + e.message);
  process.error = 1;
  process.exit(2);
}
const GOLD_DIRS = ev.goldDirs();

// ---------- 值层归一（布尔/数值字符串/千分位） ----------
function norm(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean" || typeof v === "number") return v;
  const s = String(v).trim();
  if (s === "true" || s === "TRUE") return true;
  if (s === "false" || s === "FALSE") return false;
  if (s === "" || s === "null" || s === "undefined") return null;
  const n = Number(s.replace(/,/g, ""));
  if (!Number.isNaN(n) && /^[-+]?[\d.,]+$/.test(s)) return n;
  return s;
}
function normRatio(v) {
  if (typeof v === "string" && v.includes("%")) {
    const n = Number(v.replace("%", ""));
    return Number.isNaN(n) ? v : n;
  }
  return norm(v);
}
// ★ 正则铁律：/ratio|percent|rate/ 会误命中 duration（du**rate**）。
//   必须用带词边界的形式，只认真比率字段。
function isRatioField(f) { return /(^|_)(ratio|percent|rate)($|_)/.test(f); }

// ---------- 业务键（事件配对禁按序号） ----------
function evKey(ev, etype) {
  const f = ev.fields || {};
  const pick = (...ks) => {
    for (const k of ks) {
      const x = f[k];
      if (!x) continue;
      const v = x.value !== null && x.value !== undefined ? x.value : x.raw_value;
      if (v !== null && v !== undefined && v !== "") return String(v).trim();
    }
    return null;
  };
  if (etype === "pledge") return ["pledge", pick("pledgor"), pick("pledgee"), pick("direction") || "pledge"].join("|");
  if (etype === "equity_change") return ["equity_change", pick("holder"), pick("direction")].join("|");
  if (etype === "award_contract") return ["award_contract", pick("bidder"), pick("project_name")].join("|");
  return ["other", pick("bidder"), pick("holder")].join("|");
}

// ---------- 载入 Gold（按 source.file_id 配对） ----------
const goldByFileId = new Map();
let gold_files = 0;
for (const gd of GOLD_DIRS) {
  if (!fs.existsSync(gd)) continue;
  for (const f of fs.readdirSync(gd).filter((x) => x.endsWith(".envelope.json"))) {
    try {
      const gj = JSON.parse(fs.readFileSync(path.join(gd, f), "utf8"));
      const fid = gj.source && gj.source.file_id;
      if (fid && !goldByFileId.has(fid)) { goldByFileId.set(fid, gj); gold_files++; }
    } catch (e) { /* 坏文件跳过 */ }
  }
}

// ---------- 逐份实算 ----------
const envFiles = fs.readdirSync(ENV_DIR).filter((f) => f.endsWith(".json") && f !== "DEMO-EQC-HL-0930.json").sort();

const R = {
  files: envFiles.length, fields_total: 0,
  valued: 0, nontext_valued: 0, nontext_true: 0, nontext_false: 0,
  text_valued: 0, text_true: 0, text_false: 0,
  abstain: 0, abstain_true: [],          // ★ 弃权却标 true（抽取侧缺陷，单列）
  missing_bool_on_valued: [],// ★ 有值却缺布尔（标注缺陷，单列）
  by_unit: {},
  gold_files: gold_files, gold_paired_files: 0, gold_no_gold: [],
  acc_den: 0, acc_hit: 0, acc_miss: [],   // 正确率（非 text 有值 ∧ 有 Gold 期望）
};
const goldEnvMaps = [];  // 配对成功的事件映射，留到第二轮比对

for (const f of envFiles) {
  const j = JSON.parse(fs.readFileSync(path.join(ENV_DIR, f), "utf8"));
  const evs = Array.isArray(j.events) ? j.events : [];
  for (const ev of evs) {
    for (const [fname, fv] of Object.entries(ev.fields || {})) {
      R.fields_total++;
      const st = fv.status;
      const hasVal = st === "extracted" && fv.value !== null && fv.value !== undefined && fv.value !== "";
      const unit = fv.unit === undefined || fv.unit === null ? null : String(fv.unit);

      if (hasVal) {
        R.valued++;
        if (typeof fv.standardized !== "boolean") {
          R.missing_bool_on_valued.push(`${f}#${ev.event_id}.${fname}`);
        }
        if (unit === "text") {
          // ★ D13-C2：text 字段的 standardized 键无契约含义 —— 只统计，不上屏、不入分母
          R.text_valued++;
          if (fv.standardized === true) R.text_true++; else if (fv.standardized === false) R.text_false++;
        } else {
          R.nontext_valued++;
          const u = unit || "(无unit)";
          R.by_unit[u] = (R.by_unit[u] || 0) + 1;
          if (fv.standardized === true) R.nontext_true++;
          else if (fv.standardized === false) R.nontext_false++;
        }
      } else {
        R.abstain++;
        // ★ 弃权字段不得标 true —— 语义错误，不进任何分母，但必须暴露
        if (fv.standardized === true) R.abstain_true.push(`${f}#${ev.event_id}.${fname}(${st})`);
      }
    }
  }

  // 事件映射留给正确率比对
  const fid = j.source && j.source.file_id;
  const g = fid ? goldByFileId.get(fid) : null;
  if (!g) { if (fid) R.gold_no_gold.push(f); }
  else {
    R.gold_paired_files++;
    const eMap = new Map();
    for (const ev of evs) {
      const k = evKey(ev, ev.event_type);
      if (!eMap.has(k)) eMap.set(k, []);
      eMap.get(k).push(ev);
    }
    const gMap = new Map();
    for (const ev of (g.events || [])) {
      const k = evKey(ev, ev.event_type);
      if (!gMap.has(k)) gMap.set(k, []);
      gMap.get(k).push(ev);
    }
    goldEnvMaps.push({ id: f, eMap, gMap });
  }
}

// ---------- 正确率：非 text 有值 ∧ Gold 给出 extracted 期望 ----------
for (const { id, eMap, gMap } of goldEnvMaps) {
  for (const [k, gList] of gMap) {
    const eList = eMap.get(k);
    if (!eList || !eList.length) continue;
    const gEv = gList[0], eEv = eList[0];
    for (const [fname, gfv] of Object.entries(gEv.fields || {})) {
      if (gfv.status !== "extracted") continue;         // Gold 未给期望值 ⇒ 不入分母
      const efv = (eEv.fields || {})[fname];
      if (!efv) continue;
      // ★ 只对「非 text 有值」计正确率（与覆盖率同分母口径）
      if (!(efv.status === "extracted" && efv.value !== null && efv.value !== undefined && efv.value !== "")) continue;
      if (String(efv.unit) === "text") continue;
      R.acc_den++;
      const ratio = isRatioField(fname);
      const e2 = ratio ? normRatio(efv.value) : norm(efv.value);
      const g2 = ratio ? normRatio(gfv.value !== null && gfv.value !== undefined ? gfv.value : gfv.raw_value)
        : norm(gfv.value !== null && gfv.value !== undefined ? gfv.value : gfv.raw_value);
      if (String(e2) === String(g2)) R.acc_hit++;
      else R.acc_miss.push(`${id}.${gEv.event_id}.${fname}: 信封=${JSON.stringify(e2)} vs Gold=${JSON.stringify(g2)}`);
    }
  }
}

const pct = (a, b) => (b ? +(a / b * 100).toFixed(2) : null);
const out = {
  meta: {
    generated_at: new Date().toISOString(),
    input_dir: ENV_DIR,
    input_note: "权威批次（排除 DEMO-EQC-HL-0930）",
    ruling: "evaluation/D17/裁定-standardized判据-20261010.md",
    judge: "evaluation/D17/check-standardized.mjs",
    gold_pair_key: "source.file_id（★禁按 case_id / file_name）",
    ev_key: "业务键（禁按 event_id / 序号）",
  },
  coverage: {
    // 主口径＝覆盖率：非 text 有值字段中 standardized===true 的比例
    num: R.nontext_true, den: R.nontext_valued, pct: pct(R.nontext_true, R.nontext_valued),
    target: null,   // ★ 覆盖率不挂目标（它不是准确率）
    denominator_rule: "非 text 有值字段（value 非空 且 unit !== text）",
    by_unit: R.by_unit,
  },
  accuracy: {
    // 正确率：非 text 有值 ∧ 有 Gold 期望 的字段中，value 与 Gold 一致的比例
    num: R.acc_hit, den: R.acc_den, pct: pct(R.acc_hit, R.acc_den),
    target: 98,     // ★ 总规划 98% 只挂这一项
    evidence_kind: R.acc_den ? "field_by_field_vs_gold" : null,
    note: R.acc_den
      ? "按 source.file_id 配对文件 + 业务键配事件，逐字段比对 Gold 规范值"
      : "★ 未测：本机无 Gold 或无配对，分母为 0 —— 不得按 100% 填充",
  },
  context: {
    fields_total: R.fields_total, valued: R.valued,
    text_valued: R.text_valued, text_true: R.text_true, text_false: R.text_false,
    abstain: R.abstain,
    aux_pct: pct(R.valued ? R.nontext_true + R.text_true : 0, R.valued),
    annot_complete_pct: pct(R.valued - R.missing_bool_on_valued.length, R.valued),
    gold_files: R.gold_files, gold_paired_files: R.gold_paired_files,
    gold_no_gold: R.gold_no_gold,
  },
  violations: {
    // ★ 两类违规单列，不进分母、不静默修好（修属抽取侧）
    abstain_true: R.abstain_true,
    missing_bool_on_valued: R.missing_bool_on_valued,
  },
  detail: { acc_miss: R.acc_miss },
};

if (CHECK_ONLY) {
  if (!fs.existsSync(OUT)) { console.error("[FAIL] 产物不存在，先实算：" + OUT); process.exit(1); }
  const prev = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const checks = [
    ["coverage 分子", prev.coverage && prev.coverage.num, out.coverage.num],
    ["coverage 分母", prev.coverage && prev.coverage.den, out.coverage.den],
    ["accuracy 分子", prev.accuracy && prev.accuracy.num, out.accuracy.num],
    ["accuracy 分母", prev.accuracy && prev.accuracy.den, out.accuracy.den],
  ];
  let bad = 0;
  for (const [name, was, now] of checks) {
    const same = eq(was, now);
    if (!same) bad++;
    console.log(`${same ? "PASS" : "FAIL"} ${name}：产物=${JSON.stringify(was)} 实算=${JSON.stringify(now)}`);
  }
  console.log(bad ? `\n结果：FAIL（${bad} 项漂移）` : "\n结果：PASS（产物与实算一致）");
  process.exit(bad ? 1 : 0);
}

fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify({
  result: "OK",
  files: out.context.files_total, fields: out.context.fields_total,
  coverage: `${out.coverage.num}/${out.coverage.den} = ${out.coverage.pct}%（不挂目标）`,
  accuracy: out.accuracy.den ? `${out.accuracy.num}/${out.accuracy.den} = ${out.accuracy.pct}%（目标 98）` : "未测（分母 0）",
  aux_pct: out.context.aux_pct, text_valued: out.context.text_valued, abstain: out.context.abstain,
  violations: out.violations.abstain_true.length + out.violations.missing_bool_on_valued.length,
}, null, 2));
if (out.violations.abstain_true.length) console.log("\n弃权却标 true：" + out.violations.abstain_true.join("; "));
if (out.violations.missing_bool_on_valued.length) console.log("有值缺布尔：" + out.violations.missing_bool_on_valued.join("; "));
if (out.detail.acc_miss.length) console.log("\n正确率未命中：" + out.detail.acc_miss.join("; "));