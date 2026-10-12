"use strict";
/**
 * R 段守卫 —— 宗博文 2026-10-09《指标单一真源裁决》的强制要求验收
 *   裁决原文：zongbowen@74f9505b
 *     evaluation/integration/指标单一真源裁决-20261009.md
 *     evaluation/integration/给陈-指标单一真源裁决-20261009.md
 *     evaluation/integration/权威批次锚点.json
 *
 *宗原文的验收标准（四条全部通过才算 R1–R4闭环）：
 *   1. 页面默认加载后，指标来源能对上 anchor_sha256；
 *   2. 页面任意指标旁可见批次标识（id + 日期 + 哈希前 12 位）；
 *   3. 同屏不存在两个不同批次的数字；
 *   4. 存在同 file_sha256 多份输出时，页面标注了同源变体关系。
 *
 * ★ 分级（宗指定，不是我的裁量）：
 *   R1–R4 → FAIL。这四条是代码/展示层可立即修复的，修完即绿，
 *            不会造成每日回归"常驻刷红"（宗已明确回应我原先的顾虑）。
 *   R5–R6 → WARN。涉及语义标注，机器只能判"是否缺标注"。
 *   --strict 把 WARN 一并翻成 FAIL，供封版前一次性收紧。
 *
 * ★ 与 _data_source_check.js 的分工：那份判"数据本身对不对"
 *   （结构、批次、字段规模、逐字节）；本份判"页面有没有按裁决把口径披露出来"。
 *   两者都绿才算完 —— 数据对但页面不说，评审依然看不到。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const STRICT = process.argv.includes("--strict");

let pass = 0, fail = 0, warn = 0;
function ok(cond, msg, extra) {
  if (cond) { pass++; console.log("  ✓ " + msg + (extra ? "  " + extra : "")); }
  else { fail++; console.log("  ✗ FAIL " + msg + (extra ? "  " + extra : "")); }
}
function w(cond, msg, extra) {
  if (cond) { pass++; console.log("  ✓ " + msg + (extra ? "  " + extra : "")); }
  else if (STRICT) { fail++; console.log("  ✗ FAIL(--strict) " + msg + (extra ? "  " + extra : "")); }
  else { warn++; console.log("  ! WARN " + msg + (extra ? "  " + extra : "")); }
}
function head(t) { console.log("\n【" + t + "】"); }

const ds = require("../bridge/data_source.js");
const { computeMetrics } = require("../bridge/metrics.js");

// ─────────────────────────────────────────────────────────
head("R 段★ R1：页面默认读权威批次（旧批次不得作默认）");
{
  const m = computeMetrics(ds.PRIMARY_ID);
  const legacyNames = new Set(ds.list().filter(e => e.batch !== ds.PRIMARY_ID).map(e => e.name));
  const primaryNames = new Set(ds.list().filter(e => e.batch === ds.PRIMARY_ID).map(e => e.name));

  ok(ds.PRIMARY_ID === "authoritative",
    "R1 默认口径批次 = 权威批次（authoritative）",
    "实际 " + ds.PRIMARY_ID);
  ok(m.summary.datasets === 31,
    "R1 默认实算份数 = 31（宗定义的权威份数）",
    "实得 " + m.summary.datasets);
  ok(m.summary.fields_total === 606,
    "R1 默认实算字段分母 = 606（已裁决的权威分母）",
    "实得 " + m.summary.fields_total);
  // 反证：默认口径里不能混进任何演示池的数据集
  const leaked = [...m.perDataset.map(d => d.dataset)].filter(n => legacyNames.has(n) && !primaryNames.has(n));
  ok(leaked.length === 0,
    "R1 默认口径未混入演示池数据集",
    leaked.length ? "混入 " + leaked.slice(0, 5).join(",") : "");
  // 反证：不能只对一半 —— 权威批 31 份必须全部在默认口径里
  const counted = m.perDataset.filter(d => d.counts_for_primary).length;
  ok(counted === 31, "R1 权威批次 31 份全部计入默认口径",
    "计入 " + counted + " / 31");
}

// ─────────────────────────────────────────────────────────
head("R 段★ R2：任何展示的指标必须带批次标识（id + 日期 + 锚点前 12 位）");
{
  const anc = ds.anchor();
  const d = ds.disclose();
  const tag = d.primary_tag || {};

  ok(anc.sha256 != null, "R2 锚点可实算（不是抄录值）", anc.sha256 ? anc.sha256.slice(0, 12) + "…" : "null");
  // ★ 这是 R2 的核心：本地实算必须等于宗登记的值。抄数字也能"看起来对"，
  //   但一旦批次漂移就发现不了 —— 所以这里比的是实算值。
  ok(anc.sha256 === anc.expected,
    "R2 本地实算锚点 = 宗登记锚点",
    `实算 ${String(anc.sha256).slice(0, 12)}… vs 登记 ${String(anc.expected).slice(0, 12)}…`);
  ok(anc.docs === 31 && anc.docs_match === true,
    "R2 锚点份数 = 31（DEMO-EQC-HL-0930 已排除）",
    `实得 ${anc.docs}，排除 ${anc.excluded.join("、") || "无"}`);
  ok(!!tag.batch_id && !!tag.batch_date && !!tag.anchor_short,
    "R2 primary_tag 三要素齐全（批次 id + 日期 + 锚点前 12）",
    tag.line || "缺字段");
  ok(anc.drift === false,
    "R2 锚点无漂移（批次仍处于冻结状态）",
    anc.drift ? anc.note : "");

  // 后端与前端都要能读到：响应里得有，前端渲染里也得显示
  const metricsPayload = (() => {
    // 不起服务进程，直接用 metrics 的组装结果核对字段存在性
    const src = require("fs").readFileSync(path.join(__dirname, "..", "bridge", "metrics.js"), "utf8");
    return src;
  })();
  ok(metricsPayload.includes("dataSource.disclose()"),
    "R2 /api/metrics 响应带 data_source 段（含批次标识与锚点）");
  const badge = require("fs").readFileSync(path.join(ROOT, "public", "js", "app.js"), "utf8");
  ok(/anchor_short|primary_tag/.test(badge),
    "R2 前端徽标渲染了锚点（不是只存在于JSON 里）");
  ok(/anchor_drift/.test(badge),
    "R2 前端对锚点漂移有显式报警分支");
}

// ─────────────────────────────────────────────────────────
head("R 段★ R3：不同批次的数字禁止同屏并列引用");
{
  const renderSrc = require("fs").readFileSync(
    path.join(ROOT, "public", "js", "render", "metrics.js"), "utf8");

  // 判据1：数据源卡片里不能出现"两批并列表"——那正是同屏并列的形态
  ok(!/is-secondary/.test(renderSrc),
    "R3 数据源卡片不再渲染两批并列表（无 is-secondary 行）");
  // 判据2：其他批次必须收进显式命名 + 默认折叠的对照区
  ok(/el\("details", "mx-ds-compare"\)/.test(renderSrc) &&
     /不计入本页任何数字/.test(renderSrc),
    "R3 其他批次收进显式命名的折叠对照区（默认不展开）");
  // 判据3：批次分组下拉必须每一批都有标题（不靠位置隐含）
  const appSrc = require("fs").readFileSync(path.join(ROOT, "public", "js", "app.js"), "utf8");
  ok(/当前指标口径/.test(appSrc) && /不计入指标口径/.test(appSrc),
    "R3 下拉对每一批都显式命名（权威=当前口径，其余=不计入）");
  // 判据4：默认响应里 legacy 数字不能与权威数字同处一个顶层字段
  const m = computeMetrics(ds.PRIMARY_ID);
  ok(m.summary.datasets === 31 && m.perDataset.every(d => d.batch === ds.PRIMARY_ID),
    "R3 默认响应中每个数据集都属同一批次（无跨批混列）");
}

// ─────────────────────────────────────────────────────────
head("R 段★ R4：同一 file_sha256 的多次抽取必须标为同源变体");
{
  const groups = ds.variantGroups();
  const list = ds.list();
  const withMark = list.filter(e => e.variant_group);

  ok(groups.length > 0,
    "R4 能按 file_sha256 自动检出同源组（不依赖人工登记）",
    "检出 " + groups.length + " 组");
  // 每组成员都必须带标记——漏一个就等于把它显示成独立 case
  const memberNames = new Set(groups.flatMap(g => g.variants.map(v => v.name)));
  const unmarked = [...memberNames].filter(n => {
    const e = list.find(x => x.name === n);
    return e && !e.variant_group;
  });
  ok(unmarked.length === 0,
    "R4 全部同源组成员都带variant 标记（无漏标）",
    unmarked.length ? "漏标 " + unmarked.join(",") : "");
  // P0-01 那组必须被识别为事件数不一致
  const p001 = groups.find(g => g.known_issue === "P0-01");
  ok(!!p001 && p001.event_count_mismatch === true,
    "R4 P0-01 组被识别为事件数不一致",
    p001 ? p001.variants.map(v => v.name + ":" + v.event_count).join(" / ") : "未检出");
  // 接口必须下发，否则前端拿不到
  // ★ 路径铁律：本脚本在 demo/ 下，page_prototype 根要退一级（不是两级）
  const serverSrc = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
  ok(/variant_group/.test(serverSrc), "R4 /api/datasets 下发 variant_group");
  const appSrc = require("fs").readFileSync(path.join(ROOT, "public", "js", "app.js"), "utf8");
  ok(/同源变体/.test(appSrc), "R4 前端渲染同源变体标记");
  // ★ 反证：不能只标 P0-01 一处 —— 20 组"事件数一致"的同源也必须标
  const consistent = groups.filter(g => !g.event_count_mismatch);
  ok(consistent.length > 0 && consistent.every(g => g.variants.length >= 2),
    "R4 事件数一致的同源组同样被登记（不只是 P0-01）",
    "一致组 " + consistent.length + " 组");
  console.log("  ★ D19 表述修正：「两目录文件名零重叠」只对文件名成立；");
  console.log("    内容上同源改名有 " + groups.length + " 组 —— 这才是两个数并列的真正来源。");
}

// ─────────────────────────────────────────────────────────
head("R 段 R5/R6（WARN 级：语义标注，封版前用 --strict 收紧）");
{
  const list = ds.list();
  // R5：合成输入必须标注。真 PDF vs 合成 txt 靠信封自带的 file_name 判断。
  const synth = list.filter(e => {
    if (e.role !== "frozen") return false;
    const j = JSON.parse(require("fs").readFileSync(e.file, "utf8"));
    const fn = String((j.source && j.source.file_name) || "");
    return /\.txt$/i.test(fn);
  });
  w(synth.length === 0,
    "R5 权威批次内无合成 txt 输入混入",
    synth.length ? "合成输入 " + synth.map(s => s.name).join(",") : "");
  const synthMarked = synth.every(e => e.note && /合成/.test(e.note));
  w(synthMarked, "R5 合成输入均带「合成样例」标注", synthMarked ? "" : "缺标注");

  // R6：字段规模不同时引用必须分别带来源
  const d = ds.disclose();
  const cs = d.batches[ds.PRIMARY_ID].caliber_split;
  w(cs && cs.resolved === true && cs.authoritative_denominator === 606,
    "R6 权威分母口径已裁决且页面标注来源（606，另615 为扩大口径）",
    cs ? "authoritative=" + cs.authoritative_denominator : "缺 caliber_split");
  w(/不能与上数同屏|不计入本页任何数字/.test(
      require("fs").readFileSync(path.join(ROOT, "public", "js", "render", "metrics.js"), "utf8")),
    "R6 其他批次数字明确标注「不计入本页数字」");
}

if (STRICT) {
  console.log("\n  --strict：WARN 已按 FAIL 计入（封版门禁模式）");
}

console.log("\n" + "=".repeat(60));
console.log("PASS " + pass + " / FAIL " + fail + " / WARN " + warn);
console.log("R1–R4 为 FAIL 级（宗指定）；R5–R6 为 WARN 级，--strict 可收紧。");
console.log("=".repeat(60));
process.exit(fail > 0 ? 1 : 0);