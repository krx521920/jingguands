// _criteria_verify_local.js —— ★本地验证：拿真实信封跑判据，不发任何 API 请求（D14）
//
// ============================================================
// ★ 这份脚本回答什么
//
//   判据写完不能只跑合成用例（那是自证）。必须拿**仓库里真实存在的两批信封**
//   过一遍，看两件事：
//     ① 严格判据（逐字节）会报多少差异 —— 用来量化"逐字节全等"有多不可用
//     ② 本判据（S0..S4）报多少差异 —— 用来确认它没有把真差异一起吞掉
//
//   两个数一起看才有意义：
//     若严格 200 差异 / 本判据 3 差异 ⇒ 归一化确实消除了格式噪声
//     若本判据 0 差异而严格 200 ⇒ ★危险：判据放松过头，真实不一致被吞掉了
//     若两数接近 ⇒ 归一化没起作用，是判据写错了
//
// ★ 数据来源只用仓库里已有的产物（data/ 与 data_unified/ 两批抽取信封），
//   **不发模型请求、不花 token**。真跑 L4 是另一件事（见 demo/_l4_preflight.js）。
//
// 用法：node demo/_criteria_verify_local.js [--limit N]
"use strict";

const fs = require("fs");
const path = require("path");
const C = require(path.join(__dirname, "..", "bridge", "parity_criteria.js"));
const extractor = require(path.join(__dirname, "..", "bridge", "extractor.js"));

const ROOT = path.resolve(__dirname, "..");
const A_DIR = path.join(ROOT, "data");
const B_DIR = path.join(ROOT, "data_unified");
const LIMIT = (() => {
  const i = process.argv.indexOf("--limit");
  return i > 0 ? Number(process.argv[i + 1]) : 999;
})();

// ============================================================
// 严格判据（对照组：原来的 diffEnvelopes 逻辑，逐字节 JSON.stringify）
// ============================================================
function strictDiff(a, b) {
  const d = extractor.diffEnvelopes(a, b);
  return { compared: d.compared, same: d.same, diff: d.diff.length, unpaired: d.only_a.length + d.only_b.length };
}

function load(dir, name) {
  const f = path.join(dir, name + ".json");
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return null; }
}

// ============================================================
// 收集两侧信封。data/ 与 data_unified/ 的命名不同（D4-PLD-001 vs wei_real_PLD001_3ev），
//   这里**按 source.file_id 配对** —— 绝不用 case_id / file_name
//   （Gold 的 file_name 跨批次沿用旧名，按名配对会 0 命中并误判"Gold 缺失"）。
//
// ★ file_id 在两种信封里位置不同（踩过）：
//     魏信封 v0.3：source.file_id，形如 "sha256:97a2d7e1e4acedbe..."
//     契约对象：  source_file.file_id，形如 "mock-file-001"
//   只读 source_file.file_id 会让魏信封侧全部 0 命中 —— 而"0 命中"很容易被
//   误读成"没有可比对象"，实际是取错了字段。两种都读，并剥掉 "sha256:" 前缀。
// ============================================================
function fileIdOf(j) {
  const raw = (j.source && j.source.file_id) || (j.source_file && j.source_file.file_id) || null;
  if (!raw) return null;
  return String(raw).replace(/^sha256:/, "").trim() || null;
}

function indexBy(dir) {
  const m = new Map();
  if (!fs.existsSync(dir)) return m;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json") || f.endsWith(".check.json") || f === "upstream_case.json") continue;
    const name = f.replace(/\.json$/, "");
    const j = load(dir, name);
    if (!j || !Array.isArray(j.events)) continue;
    const fid = fileIdOf(j);
    if (!fid) continue;
    m.set(fid, { name, env: j });
  }
  return m;
}

console.log("=== 本地验证：真实信封 × 评判标准（不发API 请求）===\n");

const A = indexBy(A_DIR), B = indexBy(B_DIR);
console.log(`【数据】page data 信封 ${A.size} 份（有 file_id）｜ unified 信封 ${B.size} 份`);
const shared = [...A.keys()].filter(k => B.has(k));
console.log(`【配对】按 source.file_id(sha256) 配对，命中 ${shared.length} 对\n`);

if (!shared.length) {
  console.log("⚠ 两侧无共同 file_id，无法验证。请先跑 demo/_retest_unified.js 生成对照输入。");
  process.exit(0);
}

// ============================================================
const cases = shared.slice(0, LIMIT);
const agg = {
  strict: { compared: 0, same: 0, diff: 0, unpaired: 0 },
  criteria: { verdict_pass: 0, verdict_mismatch: 0, compared: 0, equal: 0, format_only: 0,
              type_drift: 0, value_diff: 0, type_diff: 0, one_side_empty: 0,
              s0_fail: 0, s1_fail: 0, s2_fail: 0, s3_fail: 0 },
};
const rows = [];

for (const fid of cases) {
  const a = A.get(fid).env, b = B.get(fid).env;
  const s = strictDiff(a, b);
  const r = C.judgeEnvelopes(a, b);

  agg.strict.compared += s.compared; agg.strict.same += s.same;
  agg.strict.diff += s.diff; agg.strict.unpaired += s.unpaired;

  const j = r.s2;
  agg.criteria.compared += j.compared; agg.criteria.equal += j.equal;
  agg.criteria.format_only += j.format_only; agg.criteria.type_drift += j.type_drift;
  agg.criteria.value_diff += j.value_diff; agg.criteria.type_diff += j.type_diff;
  agg.criteria.one_side_empty += j.one_side_empty;
  if (r.verdict === "pass") agg.criteria.verdict_pass++; else agg.criteria.verdict_mismatch++;
  if (!r.s0.pass) agg.criteria.s0_fail++;
  if (!r.s1.pass) agg.criteria.s1_fail++;
  if (!r.s2.pass) agg.criteria.s2_fail++;
  if (!r.s3.pass) agg.criteria.s3_fail++;

  rows.push({
    pair: `${A.get(fid).name} ↔ ${B.get(fid).name}`,
    strict_diff: s.diff + s.unpaired,
    criteria_verdict: r.verdict,
    s0: r.s0.pass, s1: r.s1.pass, s2: r.s2.pass, s3: r.s3.pass,
    compared: j.compared, equal: j.equal, format_only: j.format_only,
    type_drift: j.type_drift, value_diff: j.value_diff, one_side_empty: j.one_side_empty,
  });
}

// ============================================================
console.log("【逐对明细】(前 25对)");
console.log("  对照对".padEnd(52) + "严格差  判定   S0 S1 S2 S3  比过/格式/漂移/真差");
for (const r of rows.slice(0, 25)) {
  const flags = [r.s0, r.s1, r.s2, r.s3].map(b => b ? " ✓" : " ✗").join(" ");
  console.log("  " + r.pair.padEnd(50) +
    String(r.strict_diff).padStart(4) + "   " +
    (r.criteria_verdict === "pass" ? "pass    " : "mismatch") + " " + flags + "  " +
    `${r.equal}/${r.format_only}/${r.type_drift}/${r.value_diff}`);
}

// ============================================================
console.log("\n【汇总】");
const S = agg.strict, K = agg.criteria;
const pct = (a, b) => b ? (100 * a / b).toFixed(2) + "%" : "—";
console.log(`  对照对数            ${cases.length}`);
console.log(`  ── 严格判据（逐字节，对照组）──`);
console.log(`  字段比较数          ${S.compared}`);
console.log(`  字节完全相同        ${S.same}  (${pct(S.same, S.compared)})`);
console.log(`  ★报为差异          ${S.diff}  (${pct(S.diff, S.compared)})`);
console.log(`  事件未配对          ${S.unpaired}`);
console.log(`  ── 本判据（S0..S4）──`);
console.log(`  字段比较数          ${K.compared}`);
console.log(`  判同                ${K.equal}  (${pct(K.equal, K.compared)})  含格式差异 ${K.format_only}、类型漂移 ${K.type_drift}`);
console.log(`  ★判异(值/类型/单边空)${String(K.value_diff + K.type_diff + K.one_side_empty).padEnd(4)} (${pct(K.value_diff + K.type_diff + K.one_side_empty, K.compared)})`);
console.log(`  判定 pass / mismatch ${K.verdict_pass} / ${K.verdict_mismatch}`);
console.log(`  各级否决：S0 ${K.s0_fail}｜S1 ${K.s1_fail}｜S2 ${K.s2_fail}｜S3 ${K.s3_fail}`);
console.log(`  判据版本            ${C.CRITERIA_VERSION}`);
console.log(`  注册表              ${C.registryStatus().ok ? "已加载 " + C.registryStatus().fields_loaded + " 字段" : "★未加载"}`);

// ============================================================
//★ 自检：三个数摆一起看，结论必须讲得通，否则是判据写坏了
// ============================================================
console.log("\n=== 三方对照自检 ===");
const realDiff = K.value_diff + K.type_diff + K.one_side_empty;
const notes = [];
let bad = 0;

if (S.diff > 0 && realDiff === 0) {
  bad++;
  notes.push("★★危险：严格判据有差异而本判据为 0 —— 归一化可能放松过头，真差异被吞。必须逐条列出 format_only 人工抽查。");
} else {
  notes.push(`严格 ${S.diff} → 本判据 ${realDiff}：归一化消除了 ${S.diff - realDiff} 处书写差异${realDiff > 0 ? `，保留 ${realDiff} 处真差异` : ""}。`);
}
if (K.format_only > 0 && realDiff === 0) {
  notes.push(`⚠ ${K.format_only} 处全是格式差异（占比 ${pct(K.format_only, K.compared)}）：判据形同虚设，等于没比。须抽查若干条确认归一化没做错。`);
}
if (S.diff === realDiff && S.diff > 0) {
  bad++;
  notes.push("★归一化未起作用（两数相同）：检查字段名到规则的适用范围是否匹配。");
}
if (K.s0_fail > 0) notes.push(`S0 结构差异 ${K.s0_fail} 对：事件条数/业务键集合不同 —— 这是召回缺口，比字段差异更严重。`);
if (K.one_side_empty > 0) notes.push(`单边空值 ${K.one_side_empty} 处：一侧抽到值一侧为空，等于抽取率被吞，须单独归因。`);

// 抽 3 条格式差异给人眼核对
if (K.format_only > 0) {
  notes.push("\n  格式差异抽样（人工核对，确认没归一过头）：");
  let shown = 0;
  for (const fid of cases.slice(0, LIMIT)) {
    const r = C.judgeEnvelopes(A.get(fid).env, B.get(fid).env);
    for (const ev of r.events) {
      for (const f of ev.format_only) {
        if (shown++ >= 5) break;
        notes.push(`    ${A.get(fid).name}｜${ev.ev.split("|")[0]}｜${f.field}：「${f.a}」≡「${f.b}」 by ${f.rules.join(",")}`);
      }
    }
    if (shown >= 5) break;
  }
}

for (const n of notes) console.log("  " + n);
console.log(`\n=== ${bad ? "★ 自检有疑点 " + bad + " 项（见上）" : "自检通过（判据行为与数据一致）"} ===`);

// 落盘，供报告与页面引用
const out = path.join(__dirname, "_criteria_verify_local.json");
fs.writeFileSync(out, JSON.stringify({
  generated_at: new Date().toISOString(),
  criteria_version: C.CRITERIA_VERSION,
  registry: C.registryStatus(),
  data: { a_dir: "page_prototype/data", b_dir: "page_prototype/data_unified", pairing: "source.file_id(sha256)", pairs: cases.length },
  strict: S,
  criteria: K,
  rows,
  self_check: { bad, notes },
}, null, 2));
console.log(`\n落盘：${path.relative(ROOT, out)}`);
process.exit(0);