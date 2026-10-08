// _criteria_check.js —— 评判标准守卫（D14，可重跑，只读不发请求）
//
// ★ 为什么要它：判据本身是最容易"悄悄变松"的东西。
//   跑出一堆差异 → 有人加条归一化规则 → 差异变少 → 报告好看。
//   但那条规则可能是错的（把 100万元 和 100 判成一样），而**没人会注意到**，
//   因为数字确实变好看了。这正是 D10 造假的机制：判据被放松，结论就自动好看。
//
//   所以：**判据必须被双向测试**——
//     ① 书写差异必须判为「同」（否则真跑必然大面积假差异，报告没信息量）
//     ② 语义差异必须判为「异」（否则放松过头，真实缺陷被吞掉）
//   只测①会得到一个"永远 pass"的假判据；只测②会得到一个"永远 fail"的假判据。
//
//   ★ 特别注意：②里每条反例都是"看起来像①"的真实陷阱
//     （100万元 vs 100、2.5 vs 0.025、方向中文 vs 英文）。它们守的是底线。
//
// 用法：node demo/_criteria_check.js
"use strict";

const path = require("path");
const C = require(path.join(__dirname, "..", "bridge", "parity_criteria.js"));

let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) { pass++; console.log(`  PASS  ${n}${x ? "  — " + x : ""}`); } else { fail++; console.log(`  FAIL  ${n}${x ? "  — " + x : ""}`); } };

// ============================================================
console.log("\n【1】归一化规则：正例（书写差异 → 判同）");
const EQ_CASES = [
  // [字段, a, b, 说明]
  ["pledge_amount", "1.2亿元", "120000000元", "亿→元 换算"],
  ["pledge_amount", "12000万元", "120000000", "万→元 换算"],
  ["pledge_amount", "1.5亿元", "15000万元", "亿↔万 互转"],
  ["pledge_amount", "12,000,000", "12000000", "纯千分位"],
  ["pledge_amount", "-5万元", "-50000", "负数带单位"],
  ["pledge_amount", "1000000.00元", "1000000", "尾零"],
  ["pledged_shares_this_time", "1,200,000股", "1200000", "千分位+基准单位"],
  ["pledged_shares_this_time", "1200000股", "1200000", "基准单位剥离"],
  ["start_date", "2026年10月8日", "2026-10-08", "中文日期"],
  ["start_date", "2026/10/8", "2026-10-08", "斜杠日期"],
  ["start_date", "2026.10.08", "2026-10-08", "点分隔日期"],
  ["change_date", "2026-01-01~2026-12-31", "2026-01-01至2026-12-31", "区间分隔符"],
  ["pledged_ratio_this_time_of_held", "2.5%", "2.5", "百分号=百分点"],
  ["pledged_ratio_this_time_of_held", "百分之2.5", "2.5", "百分之词"],
  ["direction", "增持", "increase", "direction 中译英"],
  ["direction", "解除质押", "release", "direction 中译英"],
  ["pledgor", "　张三　", "张三", "全角空格+去空白"],
  ["pledgor", "张三", "张三", "完全相同"],
  ["purpose", "用于ＡＢＣ项目", "用于ABC项目", "全角字母"],
];
for (const [f, a, b, note] of EQ_CASES) {
  const j = C.judgeField(f, a, b);
  ok(j.equal, `${f}：「${a}」≡「${b}」`, `${j.kind}${j.applied.length ? " " + j.applied.join(",") : ""}｜${note}`);
}

// ============================================================
console.log("\n【2】★ 反例：语义差异必须判为「异」（这是判据的底线）");
const DIFF_CASES = [
  ["pledge_amount", "100万元", "100", "★「万」是真换算不是装饰，绝不能剥"],
  ["pledge_amount", "1.2亿元", "1.2万元", "量级差 1e4"],
  ["pledged_ratio_this_time_of_total", "2.5", "0.025", "★百分点 vs 分数，差 100 倍"],
  ["pledgee", "张三", "李四", "人名不同"],
  ["start_date", "2026-10-08", "2026-10-09", "日期差一天"],
  ["start_date", "2026-10-08", "2026-10-08", "日期相同（对照组，必须判同）", true],
  ["pledgor", "张三", "张三丰", "名字前缀相同但不同人"],
  ["pledge_amount", "0", "0.00", "零的不同写法（应判同）", true],
  ["direction", "increase", "decrease", "方向相反"],
  ["pledge_amount", "1200000", "1200001", "差 1 元"],
];
for (const [f, a, b, note, expectEq] of DIFF_CASES) {
  const j = C.judgeField(f, a, b);
  const want = expectEq === true;
  ok(j.equal === want, `${f}：「${a}」${want ? "≡" : "≠"}「${b}」`, `${j.kind}｜${note}`);
}

// ============================================================
console.log("\n【3】★ 不能靠归一化掩盖的空值与类型差异");
ok(C.judgeField("pledge_amount", null, "").equal === true, "null 与空串判同（都是「没有值」）");
ok(C.judgeField("pledge_amount", null, " ").equal === true, "null 与纯空白判同");
ok(C.judgeField("pledge_amount", null, "0").equal === false, "★null 与 0 不判同（0 是值，null 是缺）");
ok(C.judgeField("pledge_amount", "", "0").equal === false, "★空串与 0 不判同");
ok(C.judgeField("pledge_amount", null, "1.2亿元").equal === false, "★一边无值一边有值 ⇒ 判异（这是抽取率被吞）");
const tD = C.judgeField("pledge_amount", 1200000, "1200000");
ok(tD.equal === true && tD.kind === "type_only",
   "★number 与 string 数值同 ⇒ 判同但单列 type_only（schema 漂移要看得见，但不否决）", tD.kind);

// type_only 必须在信封级统计里出现，且不否决 S2
const eA = { events: [{ event_id: "E01", event_type: "pledge", fields: {
  pledgor: { value: "张三", evidence_id: "ev1" }, pledge_amount: { value: 1200000, evidence_id: "ev2" } } }] };
const eB = { events: [{ event_id: "E01", event_type: "pledge", fields: {
  pledgor: { value: "张三", evidence_id: "ev1" }, pledge_amount: { value: "1200000", evidence_id: "ev2" } } }] };
const rTD = C.judgeEnvelopes(eA, eB);
ok(rTD.verdict === "pass" && rTD.s2.type_drift === 1,
   "★信封级：type_drift 计数上报但不否决", `verdict=${rTD.verdict} type_drift=${rTD.s2.type_drift}`);

// ============================================================
console.log("\n【4】注册表真源（不在判据里手抄一份）");
const rs = C.registryStatus();
ok(rs.ok, "spec/v0.3/registry.mjs 可加载", `退出码路径 ${rs.path}`);
ok(rs.fields_loaded > 0, "字段注册表非空", `${rs.fields_loaded} 个字段`);
ok(JSON.stringify(rs.event_types) === JSON.stringify(["pledge", "equity_change", "award_contract"]),
   "事件类型与契约一致", rs.event_types.join(","));

// ============================================================
console.log("\n【5】五级判据结构 + 措辞纪律");
const evA = { events: [{ event_id: "E01", event_type: "pledge", fields: {
  pledgor: { value: "张三", status_override: null, evidence_id: "ev1" },
  pledge_amount: { value: "1.2亿元", status_override: null, evidence_id: "ev2" } } }] };
const evB = { events: [{ event_id: "E99", event_type: "pledge", fields: {
  pledgor: { value: "张三", status_override: null, evidence_id: "ev1" },
  pledge_amount: { value: "120000000", status_override: null, evidence_id: "ev2" } } }] };

const r1 = C.judgeEnvelopes(evA, evB);
ok(r1.verdict === "pass", "纯书写差异 ⇒ pass", `S2 format_only=${r1.s2.format_only}`);
ok(r1.s0.pass && r1.s1.pass && r1.s3.pass, "S0/S1/S3 全通过");
ok(r1.events[0] && r1.events[0].format_only.length === 1, "格式差异被单列成一类（可归因）",
   r1.events[0].format_only.map(x => `${x.field}:${x.a}→${x.b}`).join(", "));

// 注入真缺陷：事件数不同 → S0 否决
const evC = { events: evA.events.concat([{ event_id: "E02", event_type: "pledge", fields: {
  pledgor: { value: "李四", status_override: null, evidence_id: "ev3" } } }]) };
const r2 = C.judgeEnvelopes(evC, evB);
ok(r2.verdict === "mismatch" && !r2.s0.pass, "★多抽一条事件 ⇒ S0 否决（S0 差 ≠ 格式差）",
   `only_a=${r2.s0.only_a.length}`);

// 注入状态差异 → S1 否决
const evD = JSON.parse(JSON.stringify(evA));
evD.events[0].fields.pledge_amount.status_override = "not_disclosed";
const r3 = C.judgeEnvelopes(evA, evD);
ok(r3.verdict === "mismatch" && !r3.s1.pass, "★一边抽到一边弃权 ⇒ S1 否决");

// 注入取值差异 → S2 否决
const evE = JSON.parse(JSON.stringify(evA));
evE.events[0].fields.pledge_amount.value = "9.9亿元";
const r4 = C.judgeEnvelopes(evA, evE);
ok(r4.verdict === "mismatch" && !r4.s2.pass, "★值不同 ⇒ S2 否决",
   r4.events[0].value_diff.map(x => `${x.field}:${x.a}≠${x.b}`).join(","));

// 注入出处缺失 → S3 否决
const evF = JSON.parse(JSON.stringify(evA));
evF.events[0].fields.pledge_amount.evidence_id = null;
const r5 = C.judgeEnvelopes(evA, evF);
ok(r5.verdict === "mismatch" && !r3.s3.pass === false && !r5.s3.pass, "★一边无出处 ⇒ S3 否决");

// ★ 分级否决不可被软级别的高一致率掩盖
const evG = JSON.parse(JSON.stringify(evA));
evG.events[0].fields.pledge_amount.value = "1.2亿元";
evG.events.push({ event_id: "E77", event_type: "pledge", fields: {} });   // 多一条空事件
const r6 = C.judgeEnvelopes(evG, evB);
ok(r6.verdict === "mismatch" && r6.s2.value_diff === 0,
   "★只有 S0 差、S2 全同 ⇒ 仍判 mismatch（硬级别一票否决）",
   `s0pass=${r6.s0.pass} s2.value_diff=${r6.s2.value_diff}`);

// S4 恒不比
ok(r1.s4.pass === true && r1.s4.compared === 0, "S4 原文摘录恒不比（compared=0）");
ok(/不比对|不参与/.test(C.CRITERIA_META.levels[4] + r1.phrases.S4.not_proves),
   "S4 明写「不比」", r1.phrases.S4.not_proves.slice(0, 40));

// 措辞纪律：每层都有 proves + not_proves
for (const lvl of ["S0", "S1", "S2", "S3", "S4"]) {
  ok(r1.phrases[lvl] && r1.phrases[lvl].proves && r1.phrases[lvl].not_proves,
     `${lvl} 同时印「证明什么 / 不证明什么」`);
}

// ============================================================
console.log("\n【6】判据自身的可追溯性");
ok(!!C.CRITERIA_META.version, "有判据版本号", C.CRITERIA_META.version);
ok(Array.isArray(C.CRITERIA_META.required_attribution) && C.CRITERIA_META.required_attribution.length > 0,
   "★引用本判据的结论必须带的四项", C.CRITERIA_META.required_attribution.join(", "));
ok(C.CRITERIA_META.normalization.length >= 8, "归一化规则均已登记（可随报告输出）",
   `${C.CRITERIA_META.normalization.length} 条`);
ok(C.IGNORED_KEYS.has("run_id") && C.IGNORED_KEYS.has("elapsed_ms"),
   "运行时元数据列入「不比」（否则差异数随跑的次数变，判据不可重复）",
   `${C.IGNORED_KEYS.size} 个键`);
ok(Array.isArray(C.CRITERIA_META.not_covered_by_these) && C.CRITERIA_META.not_covered_by_these.length >= 3,
   "★明写这套判据「不覆盖什么」", C.CRITERIA_META.not_covered_by_these.length + " 条");

// ============================================================
console.log("\n=== 汇总 ===");
console.log(`  PASS ${pass} / FAIL ${fail}`);
if (fail) {
  console.log("\n★ 判据守卫有红项，**不要**改判据去迁就结果——先问「这条规则对不对」。");
}
process.exit(fail ? 1 : 0);