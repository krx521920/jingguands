"use strict";
/**
 * D19 数据源对账守卫 —— 把"页面跑的是哪批数据"这件事变成可执行断言
 *
 * ★ 为什么必须有这个脚本（反造假铁律第4 条"产出不可见"的变体）
 *   2026-10-09 查实：页面 `/api/metrics` 与数据集下拉**都只读 `data/`**，
 *   而权威冻结批次在 `data_unified/`（与魏 D11 首测信封逐字节 31/31 相同）。
 *   两目录**零重叠**。后果：
 *     - 页面"质量报告"31 数据集 / 548 字段 / 抽取率 71.53% —— 全部跑在 09-29 的旧抽取上；
 *     - `data/` 里的 D4 批次只有 2 份，且输入是 `D3-PLD-00x.txt`（合成 txt），不是真 PDF；
 *     - 领导在页面上看到的数字与材料里的 437/437 不是同一批数据算出来的。
 *   指标本身是真的（caliber_discipline 说的"实算"没骗人），但**样本选错了**——
 *   "实算旧数据"和"实算当前数据"在页面上长得一模一样。
 *
 * ★ 本脚本的判据（全部基于磁盘真实文件，不读接口、不猜）
 *   A段：权威性——`data_unified/` 与魏冻结批次逐字节一致（`--wei <sha>` 可选，默认只查结构）
 *   B段：★ 核心——页面口径与权威口径的**重叠度**必须显式登记，不允许悄悄为 0
 *   C段：D4 批次覆盖率——页面侧 D4 份数 vs 权威侧 10 份
 *   D段：数据新鲜度——按 `run_meta.started_at` 排序，暴露最新/最旧
 *
 * 用法：
 *   node demo/_data_source_check.js                    # 结构对账（不需要网络/git）
 *   node demo/_data_source_check.js --wei 5959761a     # 额外与魏分支逐字节对比
 *   node demo/_data_source_check.js --strict           # 重叠度为 0 时判 FAIL（默认只 WARN）
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data");
const UNIFIED = path.join(ROOT, "data_unified");

const argv = process.argv.slice(2);
const WEI_SHA = argv.includes("--wei") ? argv[argv.indexOf("--wei") + 1] : null;
const STRICT = argv.includes("--strict");

let pass = 0, fail = 0, warn = 0;
function ok(cond, msg, extra) {
  if (cond) { pass++; console.log("  ✓ " + msg + (extra ? "  " + extra : "")); }
  else { fail++; console.log("  ✗ FAIL " + msg + (extra ? "  " + extra : "")); }
}
function w(cond, msg, extra) {
  if (cond) { pass++; console.log("  ✓ " + msg + (extra ? "  " + extra : "")); }
  else { warn++; console.log("  ! WARN " + msg + (extra ? "  " + extra : "")); }
}
function head(t) { console.log("\n【" + t + "】"); }

function envelopes(dir) {
  if (!fs.existsSync(dir)) return new Map();
  const m = new Map();
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json") || f.endsWith(".check.json") || f === "upstream_case.json") continue;
    const name = f.replace(/\.json$/, "");
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      m.set(name, {
        name,
        sha: (j.source && j.source.file_sha256) || null,
        file: (j.source && j.source.file_name) || null,
        sv: j.schema_version || null,
        events: Array.isArray(j.events) ? j.events.length : 0,
        fields: (j.events || []).reduce((n, e) => n + Object.keys(e.fields || {}).length, 0),
        isMock: j.is_mock === true || (j.run_meta && j.run_meta.is_mock === true),
        at: (j.run_meta && j.run_meta.started_at) || null,
        model: (j.run_meta && j.run_meta.model) || null,
        bytes: fs.statSync(path.join(dir, f)).size
      });
    } catch (e) { m.set(name, { name, parseError: String(e.message).slice(0, 60) }); }
  }
  return m;
}

const page = envelopes(DATA);        // 页面下拉 + /api/metrics 读的就是它
const auth = envelopes(UNIFIED);      // 权威冻结批次（重测脚本读它）
const pageNames = new Set(page.keys());
const authNames = new Set(auth.keys());
const overlap = [...pageNames].filter(n => authNames.has(n));

// ─────────────────────────────────────────────────────────
head("A 段权威性：data_unified/ 是不是魏的冻结批次");
ok(auth.size >= 31, "data_unified/ 份数 ≥ 31", "实得 " + auth.size);
const authSv = new Set([...auth.values()].map(v => v.sv));
ok(authSv.size === 1 && authSv.has("0.3"),
  "全部为契约 v0.3（无旧版混入）", "schema_version=" + [...authSv].join("/"));
const authMock = [...auth.values()].filter(v => v.isMock);
ok(authMock.length === 0, "权威批次无 mock（真实抽取产出）",
  authMock.length ? "mock: " + authMock.map(m => m.name).join(",") : "");

if (WEI_SHA) {
  const FROZEN = "evaluation/D11/firsttest-envelopes";
  let same = 0, diff = 0; const diffList = [], extra = [];
  for (const name of auth.keys()) {
    let remote = "";
    try {
      remote = execFileSync("git", ["show", `${WEI_SHA}:${FROZEN}/${name}.json`],
        { cwd: path.join(ROOT, "..", "..", ".."), encoding: "utf8", maxBuffer: 1e8 }).trim();
    } catch (e) { extra.push(name); continue; }   // 本地多出的演示件，不算 diff
    const mine = fs.readFileSync(path.join(UNIFIED, name + ".json"), "utf8").trim();
    if (mine === remote) same++;
    else { diff++; diffList.push(name); }
  }
  ok(diff === 0 && same >= 31,
    "★ 与魏冻结批次逐字节一致（" + same + " 份）",
    (diff || same < 31) ? `diff=${diff} 相同=${same} ${diffList.slice(0, 3).join(",")}` : "");
  console.log("  · 本地额外 " + extra.length + " 份（不在魏冻结批次内，属本地演示件）：" +
              (extra.join(", ") || "无"));
  ok(extra.every(n => /^DEMO-/.test(n)),
    "★ 额外份均为 DEMO- 前缀的本地演示件（不会混进权威口径）", extra.join(", "));
} else {
  console.log("  · 跳过逐字节对比（加 --wei <sha> 开启）");
}

// ─────────────────────────────────────────────────────────
head("B 段★ 核心：页面口径与权威口径的重叠度");
console.log("  页面 data/ = " + page.size + " 份｜权威 data_unified/ = " + auth.size +
            " 份｜同名重叠 = " + overlap.length + " 份");
ok(page.size > 0 && auth.size > 0, "两侧目录均非空");
if (overlap.length === 0) {
  w(false,
    "★ 页面样本与权威批次零重叠 —— 页面指标跑在旧抽取上（不是造假，但样本选错）",
    "页面 " + [...pageNames].slice(0, 3).join("/") + "… vs 权威 " + [...authNames].slice(0, 3).join("/") + "…");
  if (STRICT) { fail++; console.log("    （--strict：判 FAIL）"); }
  else console.log("    → 不判 FAIL：这是待领导裁决的口径问题，不是代码缺陷。" +
    "  解法见交付文档。默认 WARN 以免每日回归被此条常驻刷红。");
} else {
  ok(true, "页面与权威批次存在同名样本", overlap.slice(0, 5).join(","));
}
// 页面侧是否有任何机制能读到权威批次
const pubHits = [];
(function walk(d) {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|html)$/.test(e.name)) {
      const s = fs.readFileSync(p, "utf8");
      if (s.includes("data_unified")) pubHits.push(path.relative(ROOT, p));
    }
  }
})(path.join(ROOT, "public"));
ok(pubHits.length === 0,
  "★ 前端未引用 data_unified（证实权威批次在页面上完全不可见）",
  pubHits.length ? pubHits.join(",") : "");

// ─────────────────────────────────────────────────────────
head("C 段 D4 批次覆盖率");
const D4 = n => [...n.values()].filter(v => /^D4-PLD-\d+$/.test(v.name)).length;
const pageD4 = D4(page), authD4 = D4(auth);
console.log("  D4-PLD-xxx：权威 " + authD4 + " 份｜页面同名 " + pageD4 + " 份");
ok(authD4 === 10, "权威侧 D4 批次 10 份齐全", "实得 " + authD4);
w(pageD4 === authD4, "页面侧 D4 批次是否齐全",
  pageD4 < authD4 ? `缺 ${authD4 - pageD4} 份` : "");
// 页面侧那两个"像 D4"的文件实际是什么
const fakeD4 = [...page.values()].filter(v => /^wei_real_PLD/.test(v.name) || /^wei_real_pledge/.test(v.name));
console.log("  页面侧承担 D4 角色的文件（真实来源）：");
for (const f of fakeD4) {
  console.log("    " + f.name.padEnd(26) + " file=" + String(f.file).padEnd(18) +
              " ev=" + f.events + " at=" + String(f.at).slice(0, 19));
}
const txtInput = fakeD4.filter(f => /\.txt$/i.test(f.file || ""));
w(txtInput.length === 0,
  "★ 页面 D4 角色文件用的是真 PDF（而非 D3 合成 txt）",
  txtInput.length ? "txt 输入: " + txtInput.map(f => f.name + "(" + f.file + ")").join(", ") : "");

// ─────────────────────────────────────────────────────────
head("D 段数据新鲜度");
const dated = [...page.values()].filter(v => v.at).sort((a, b) => String(a.at).localeCompare(String(b.at)));
const undated = [...page.values()].filter(v => !v.at);
if (dated.length) {
  console.log("  页面数据时间跨度：" + String(dated[0].at).slice(0, 10) + " → " +
              String(dated[dated.length - 1].at).slice(0, 10));
}
const authDated = [...auth.values()].filter(v => v.at).sort((a, b) => String(a.at).localeCompare(String(b.at)));
if (authDated.length) {
  console.log("  权威批次时间跨度：" + String(authDated[0].at).slice(0, 10) + " → " +
              String(authDated[authDated.length - 1].at).slice(0, 10));
}
ok(undated.length / Math.max(1, page.size) < 0.2,
  "页面数据多数带 started_at（可判断新鲜度）", "无时间戳 " + undated.length + " 份");
const pageNewest = dated.length ? String(dated[dated.length - 1].at).slice(0, 10) : null;
const authNewest = authDated.length ? String(authDated[authDated.length - 1].at).slice(0, 10) : null;
w(pageNewest && authNewest && pageNewest >= authNewest,
  "★ 页面数据不旧于权威批次",
  pageNewest && authNewest ? `页面 ${pageNewest} vs 权威 ${authNewest}` : "无法比较");

// ─────────────────────────────────────────────────────────
head("E 段字段规模：解释两个数字为何不同");
const pf = [...page.values()].reduce((n, v) => n + v.fields, 0);
const af = [...auth.values()].reduce((n, v) => n + v.fields, 0);
console.log("  页面 data/ 字段合计 = " + pf + "（这正是 /api/metrics 的 fields_total）");
console.log("  权威 data_unified/ 字段合计 = " + af + "（重测脚本的分子/分母来源）");
ok(pf > 0 && af > 0, "两侧字段均可统计",
  "★ 这两个数出自不同样本，引用时必须带数据来源，不能混着说");

console.log("\n" + "=".repeat(60));
console.log("PASS " + pass + " / FAIL " + fail + " / WARN " + warn);
console.log("=".repeat(60));
process.exit(fail > 0 ? 1 : 0);
