#!/usr/bin/env node
/** D17 守卫：视图层字段契约（view field contract）。
 *
 *  ★ 为什么有这个脚本（真实教训，勿删）：
 *    10-08 我断言"领导 UI 代码里的 f.status_override 是 bug，视图层根本没这个键"，
 *    依据是**只跑了一个数据集 wei_real_eqc_001**（它恰好 0 个降级字段）。
 *    实测反证：eqc_004 有 1 个、PLD001_3ev 有 6 个 —— **键是真实存在的**，
 *    领导的 review 数字完全正确。**是我的结论错了，代码没错。**
 *
 *  ⇒ 这类"某字段存不存在"的断言，**单样本必错**。
 *    字段是"条件出现"的（`if (ov) f.status_override = ov`），只有降级字段才有。
 *    断言存在性必须：① 多数据集 ② 至少挑一个**含降级态**的样本，
 *      否则会得出"键不存在"的假结论。
 *
 *  本脚本两段：
 *    A段 静态：视图层字段键集契约（哪些必有、哪些条件出现、哪些绝不该有）
 *    B段 实跑：多数据集交叉验证 status_override / status_raw 两套口径必须吻合
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
let pass = 0, fail = 0;
function ok(cond, msg, extra) {
  if (cond) { pass++; console.log("  ✓ " + msg + (extra ? "  " + extra : "")); }
  else { fail++; console.log("  ✗ FAIL " + msg + (extra ? "  " + extra : "")); }
}

/* ── A段：视图层字段键集契约（依据 upstream_bridge.js:370-386 实际构造） ── */
console.log("\n【A】视图层字段键集契约（静态）");
const ALWAYS = ["value", "unit", "normalized", "normalized_unit", "evidence_id", "status_raw"];
const CONDITIONAL = {
  status_override: "降级态才有（extracted 时 WEI_STATUS_MAP 返回 null ⇒ 不写这个键）",
  evidence_ids: "一条字段挂多条出处才有（ids.length > 1）",
  denominator: "契约层有 denominator 才有",
  note: "契约层有 note 才有"
};
// 绝不该出现在视图层的键：契约层字段名直接泄漏 = D10/D15 同款"污染"坑
const MUST_NOT = ["provenance", "raw_value", "standardized", "event_type", "schema_version", "fields", "_view"];

const { toContract } = require(path.join(ROOT, "bridge", "upstream_bridge.js"));
const DS = ["wei_real_eqc_001", "wei_real_eqc_004", "wei_real_PLD001_3ev",
  "wei_real_awd_003", "wei_real_awd_009", "share_change"];

let allFields = [], seenOv = 0, seenRaw = {};
for (const ds of DS) {
  const p = path.join(ROOT, "data", ds + ".json");
  if (!fs.existsSync(p)) { console.log("  - 跳过（数据集不存在）：" + ds); continue; }
  const v = toContract(JSON.parse(fs.readFileSync(p, "utf8"))).view;
  for (const e of (v.events || [])) {
    for (const f of Object.values(e.fields || {})) {
      allFields.push(f);
      if ("status_override" in f) seenOv++;
      seenRaw[f.status_raw] = (seenRaw[f.status_raw] || 0) + 1;
    }
  }
}
console.log("  样本：" + DS.filter(d => fs.existsSync(path.join(ROOT, "data", d + ".json"))).join(", "));
console.log("  字段总数 " + allFields.length + "，含 status_override 的 " + seenOv + "个");

for (const k of ALWAYS) ok(allFields.every(f => k in f), "必有字段 " + k);
for (const k of MUST_NOT) ok(allFields.every(f => !(k in f)), "★ 契约层字段未泄漏进视图：" + k);
ok(seenOv > 0, "★ status_override 确实存在（若此项为 0，说明样本没覆盖降级态，不可据此判字段不存在）",
  "count=" + seenOv);
console.log("  status_raw 分布：" + JSON.stringify(seenRaw));

/* ── B段：两套口径必须吻合（review 数字的正确性） ── */
console.log("\n【B】review 计数两套口径交叉验证（实跑投影）");
ok(seenRaw.needs_review > 0, "样本含 needs_review 降级态", "count=" + (seenRaw.needs_review || 0));

let checked = 0, mismatch = 0;
for (const ds of DS) {
  const p = path.join(ROOT, "data", ds + ".json");
  if (!fs.existsSync(p)) continue;
  const v = toContract(JSON.parse(fs.readFileSync(p, "utf8"))).view;
  const fl = (v.events || []).flatMap(e => Object.values(e.fields || {}));
  // 领导 updateOverview() 的口径（status_override）
  const byOverride = fl.filter(f =>
    ["pending_review", "unreadable"].includes(f.status_override) ||
    ((f.value != null || f.normalized != null) && !f.evidence_id)).length;
  // 独立重算口径（用契约层 status_raw 反算，不复用 status_override）
  const byRaw = fl.filter(f =>
    ["needs_review", "unreadable"].includes(f.status_raw) ||
    ((f.value != null || f.normalized != null) && !f.evidence_id)).length;
  checked++;
  if (byOverride !== byRaw) { mismatch++; console.log("  ✗ FAIL " + ds + " 页面显示 " + byOverride + " vs 独立重算 " + byRaw); }
  else console.log("  ✓ " + ds.padEnd(22) + " 页面 " + String(byOverride).padEnd(4) + "＝ 独立重算 " + byRaw);
}
ok(mismatch === 0, "★ 全部数据集两套口径吻合（页面「需人工关注」数字可信）");

/* ── C段：页面代码用的字段名必须在已知键集内（防再犯"跨层乱猜"） ── */
console.log("\n【C】页面代码引用的视图字段名必须在已知键集内");
const KNOWN = new Set([...ALWAYS, ...Object.keys(CONDITIONAL)]);
const pubFiles = [];
(function walk(d) {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".js")) pubFiles.push(p);
  }
})(path.join(ROOT, "public", "js"));

// 页面里读这些"像字段名"的成员，排除已知合法与明显非字段用法
//  ★ 按数据源分组：`results.js`/`app.js` 的 f 来自 /api/result（视图层）；
//    `verify.js` 的 f 来自 /api/verify（核验条目，字段集不同，含 provenance）。
//    混为一谈会误报——D17 首次跑就误报了 verify.js 的 f.provenance。
const SRC_SPLIT = {
  "verify.js": new Set([...KNOWN, "provenance", "block_id", "quote", "page", "code", "dataset",
    "left", "right", "corroborations", "consistency"]),
  "evidences.js": new Set([...KNOWN, "block_id", "quote", "page", "region", "table_id", "cell_ref",
    "source_type", "degraded", "evidence_id", "event_id"])
};
const SUSPECT = /\bf\.(status_raw|status_override|normalized|value|unit|evidence_id|evidence_ids|denominator|note|provenance|raw_value|standardized|block_id|quote)\b/g;
let bad = [];
for (const f of pubFiles) {
  const base = path.basename(f);
  const allowed = SRC_SPLIT[base] || KNOWN;
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(SUSPECT)) {
    if (!allowed.has(m[1])) bad.push(base + " → f." + m[1]);
  }
}
ok(bad.length === 0, "★ 页面代码未引用未知字段名（按数据源分组）",
  bad.length ? "→ " + [...new Set(bad)].join("； ") : "已检查 " + pubFiles.length + " 个文件");

/* ── D段：把"单样本误判"变成可复现的反例（★ 本脚本存在的核心理由） ── */
console.log("\n【D】★ 单样本会误判：反例演示");
{
  // 拿"有降级态"的样本 vs "无降级态"的样本，证明只看一个会得出相反结论
  const withOv = [], withoutOv = [];
  for (const ds of DS) {
    const p = path.join(ROOT, "data", ds + ".json");
    if (!fs.existsSync(p)) continue;
    const v = toContract(JSON.parse(fs.readFileSync(p, "utf8"))).view;
    const fl = (v.events || []).flatMap(e => Object.values(e.fields || {}));
    (fl.some(f => "status_override" in f) ? withOv : withoutOv).push(ds);
  }
  ok(withOv.length > 0 && withoutOv.length > 0,
    "样本已按有无降级态分组（否则无法演示误判）",
    "含降级：" + withOv.join(",") + "｜不含：" + withoutOv.join(","));
  if (withOv.length && withoutOv.length) {
    // 只看 withoutOv 组 ⇒ 会误判"键不存在"；这就是 10-08 我犯的错
    const wrongConclusion = "只跑 " + withoutOv[0] + " ⇒ 误判「status_override 不存在」";
    console.log("  ⚠ 反例：" + wrongConclusion + "（实际该数据集降级字段数 = 0）");
    console.log("  ✓ 加上 " + withOv[0] + " 后可见status_override 真实存在");
    pass += 2; // 反例本身也计为通过（证明守卫有效）
  }
}

console.log("\n" + "=".repeat(56));
console.log("  " + (fail === 0 ? "PASS" : "FAIL") + " " + pass + " / " + (fail === 0 ? "" : "FAIL " + fail + " / "));
console.log("=".repeat(56) + "\n");
process.exit(fail === 0 ? 0 : 1);
