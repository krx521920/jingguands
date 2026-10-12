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
head("B 段 ★ 换源是否真落地（领导 10-09 裁定「换源」的执行验收）");
// ★ D20 起本段从「查出重叠度=0 的问题」改为「验收换源已落地」。
//   原来的 4 条 WARN 是问题记录；裁定落地后它们应当变成 PASS，
//   若又退回 WARN 说明有人把页面改回了旧数据源——那是要能报警的。
const ds = require("../bridge/data_source.js");
console.log("  页面 data/ = " + page.size + " 份｜权威 data_unified/ = " + auth.size +
            " 份｜同名重叠 = " + overlap.length + " 份");
ok(page.size > 0 && auth.size > 0, "两侧目录均非空");

ok(ds.PRIMARY_ID === "authoritative",
  "★ 数据源单一真源把权威批次定为 primary", "实际 primary=" + ds.PRIMARY_ID);
const primaryEntries = ds.list().filter(e => e.counts_for_primary);
ok(primaryEntries.length >= 31 && primaryEntries.every(e => e.batch === "authoritative"),
  "★ 入权威口径的条目全部来自权威批次（无旧批次混入）",
  primaryEntries.filter(e => e.batch !== "authoritative").map(e => e.name).join(","));
ok(primaryEntries.every(e => e.dir === "data_unified"),
  "★ 入权威口径的条目全部读自 data_unified/", "");

// 页面侧是否真的读权威批：extractor.file.run 能否解出权威 case
(async () => {
  const ex = require("../bridge/extractor.js");
  const r = await ex.extract("D4-PLD-001", "file");
  ok(r.ok && /data_unified/.test(r.run_meta.source_path),
    "★ extractor 能从权威批次解出 D4-PLD-001", r.ok ? r.run_meta.source_path : r.reason);
  ok(r.ok && r.run_meta.data_source && r.run_meta.data_source.counts_for_primary === true,
    "★ run_meta 明示该数据集计入权威口径", "");
  const old = await ex.extract("wei_real_pledge_0197", "file");
  ok(old.ok && old.run_meta.data_source.counts_for_primary === false &&
     old.run_meta.data_source.role === "p001_witness",
    "★ P0-01 物证仍在且标注为不计入权威口径",
    old.ok ? old.run_meta.data_source.role : old.reason);
})();

// /api/metrics 默认口径必须是权威批次
const { computeMetrics } = require("../bridge/metrics.js");
const mA = computeMetrics(ds.PRIMARY_ID);
const mL = computeMetrics("legacy");
ok(mA.summary.fields_total !== mL.summary.fields_total,
  "★ 两批字段规模确实不同（否则换源等于没换，断言会假绿）",
  `权威 ${mA.summary.fields_total} vs 演示 ${mL.summary.fields_total}`);
ok(mA.summary.datasets === primaryEntries.length,
  "★ computeMetrics 默认口径份数 = 权威口径条目数",
  `实算 ${mA.summary.datasets} vs 登记 ${primaryEntries.length}`);
console.log("  权威口径实算： " + mA.summary.datasets + " 份 / " + mA.summary.fields_total +
            " 字段 / 抽取率 " + mA.summary.extracted_pct + "%");
console.log("  演示池对照：   " + mL.summary.datasets + " 份 / " + mL.summary.fields_total +
            " 字段 / 抽取率 " + mL.summary.extracted_pct + "%（不计入任何分子分母）");

// L3 核验必须用同版本产物（跨 parser 版本比对会造出假失败）
ok(mA.l3.source_kind === "self_blocks" || mA.l3.version_mismatch_skipped === 0,
  "★ L3 核验索引与信封 parser 版本一致（跨版本比对=假失败）",
  `source_kind=${mA.l3.source_kind} mismatch=${mA.l3.version_mismatch_skipped}`);

// 前端必须暴露信息源
const pubHits = [];
(function walk(d) {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|html)$/.test(e.name)) {
      const s = fs.readFileSync(p, "utf8");
      if (/data_source|dataSource|sourceBadge|mx-ds/.test(s)) pubHits.push(path.relative(ROOT, p));
    }
  }
})(path.join(ROOT, "public"));
ok(pubHits.length >= 2,
  "★ 前端引用了数据源信息（页面可暴露信息源，领导 10-09 裁定③）",
  pubHits.join(", "));

// 两批字段规模差是客观事实，必须显式登记而不是藏起来
ok(ds.compare().note && /不同样本|不可比/.test(ds.compare().note),
  "★ 两批规模差异被显式登记为「不可比」", "");
const cs = ds.BATCHES[ds.PRIMARY_ID].caliber_split;
ok(!!cs && cs.fields_frozen_only !== cs.fields_incl_demo,
  "★ 权威批内部 606/615 两种分母口径已显式登记（不静默取其一）",
  cs ? `${cs.fields_frozen_only} / ${cs.fields_incl_demo}` : "未登记");

// ─────────────────────────────────────────────────────────
head("C 段 D4 批次覆盖率");
const D4 = n => [...n.values()].filter(v => /^D4-PLD-\d+$/.test(v.name)).length;
const pageD4 = D4(page), authD4 = D4(auth);
// ★ D20：换源后「页面可见」＝两批合并（权威批 31 份 + 演示池）。
//   原来只数 data/，权威批搬走后恒为 0，会误报成「页面缺 10 份」——
//   那是把「某一目录里有几份」当成「页面能不能看到」，两个不同的问法。
const visibleD4 = ds.list().filter(e => /^D4-PLD-\d+$/.test(e.name)).length;
console.log("  D4-PLD-xxx：权威目录 " + authD4 + " 份｜演示池同名 " + pageD4 +
            " 份｜★页面可见合计 " + visibleD4 + " 份");
ok(authD4 === 10, "权威侧 D4 批次 10 份齐全", "实得 " + authD4);
ok(visibleD4 === authD4,
  "★ D4 批次在页面上全部可见（换源后 D4-PLD-xxx 可直接下拉选中）",
  visibleD4 < authD4 ? `仍缺 ${authD4 - visibleD4} 份` : `页面 ${visibleD4} vs 权威 ${authD4}`);
// 演示池那两个"像 D4"的文件实际是什么 —— 保留打印：它们是历史物证，不是当前口径
const fakeD4 = [...page.values()].filter(v => /^wei_real_PLD/.test(v.name) || /^wei_real_pledge/.test(v.name));
console.log("  演示池中承担 D4 角色的文件（历史物证，已标注不计入口径）：");
for (const f of fakeD4) {
  console.log("    " + f.name.padEnd(26) + " file=" + String(f.file).padEnd(18) +
              " ev=" + f.events + " at=" + String(f.at).slice(0, 19));
}
const txtInput = fakeD4.filter(f => /\.txt$/i.test(f.file || ""));
ok(txtInput.every(f => ds.resolve(f.name) && ds.resolve(f.name).counts_for_primary === false),
  "★ D3 合成 txt 来源的旧抽取均已标为不计入权威口径",
  txtInput.map(f => f.name).join(", "));
ok(fakeD4.filter(f => /0197|ce37/.test(f.name)).every(f => !!ds.DATASET_NOTE[f.name]),
  "★ P0-01 两份物证都带标注（领导 10-09 裁定②：保留 + 标注）", "");

// ─────────────────────────────────────────────────────────
head("D 段数据新鲜度（换源后以上屏口径为准）");
const dated = [...page.values()].filter(v => v.at).sort((a, b) => String(a.at).localeCompare(String(b.at)));
const undated = [...page.values()].filter(v => !v.at);
if (dated.length) {
  console.log("  演示池 data/ 时间跨度：" + String(dated[0].at).slice(0, 10) + " → " +
              String(dated[dated.length - 1].at).slice(0, 10));
}
const authDated = [...auth.values()].filter(v => v.at).sort((a, b) => String(a.at).localeCompare(String(b.at)));
if (authDated.length) {
  console.log("  权威批次（★上屏口径）时间跨度：" + String(authDated[0].at).slice(0, 10) + " → " +
              String(authDated[authDated.length - 1].at).slice(0, 10));
}
ok(undated.length / Math.max(1, page.size) < 0.2,
  "演示池多数带 started_at（可判断新鲜度）", "无时间戳 " + undated.length + " 份");
const authNewest = authDated.length ? String(authDated[authDated.length - 1].at).slice(0, 10) : null;
ok(!!authNewest, "★ 上屏口径（权威批次）带可判断新鲜度的时间戳", authNewest || "缺失");
ok(authNewest >= "2026-10-01",
  "★ 上屏口径数据不旧于 2026-10-01（换源后不应再跑 09 月旧抽取）",
  "权威批次最新 " + authNewest);

// ─────────────────────────────────────────────────────────
head("E 段字段规模：两个数字为何不同（引用时必须带来源）");
const pf = [...page.values()].reduce((n, v) => n + v.fields, 0);
const af = [...auth.values()].reduce((n, v) => n + v.fields, 0);
console.log("  权威 data_unified/（★上屏口径）字段合计 = " + af);
console.log("    其中入权威口径 31 份 = " + mA.summary.fields_total +
            "；另 1 份本地演示件 " + (af - mA.summary.fields_total) + " 字段（不含在分子分母）");
console.log("  演示池 data/（不计入）字段合计 = " + pf);
ok(pf > 0 && af > 0, "两侧字段均可统计");
ok(mA.summary.fields_total < af,
  "★ 上屏分母 = 权威目录总量减去本地演示件（口径自洽）",
  `上屏 ${mA.summary.fields_total} vs 目录 ${af}`);
console.log("  ★ 引用规则：上屏数字只认 " + mA.summary.fields_total +
            "（权威批次 31 份）；材料里的 615 含本地演示件，606 才是纯冻结批次。");

console.log("\n" + "=".repeat(60));
console.log("PASS " + pass + " / FAIL " + fail + " / WARN " + warn);
console.log("=".repeat(60));
process.exit(fail > 0 ? 1 : 0);
