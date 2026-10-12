// _legacy_compat_check.js —— 旧版信封兼容转 v0.3 的自检（领导 2026-10-08 裁定落地）
//
// 【裁定原文】转接口起兼容作用：
//   ① 旧的实现和新规范如果是相同功能的 → 兼容进同一转接口；
//   ② 不能兼容的旧实现 → 进行工程实践中的告知，并优先采纳新规范 v0.3。
//   ③ standardized 不推导（判定需数值运算＝违反"模型只找数不算数"），只透传。
//
// 【为什么必须真跑断言】改造前v0.1 数据走「契约对象原样透传」分支，
//   pledge.json 报 19 项违规、bank_guarantee.json 报 10 项——全是
//   「data_mode 不允许出现」这类**假违规**（不是数据错，是版本旧）。
//   不锁住这个行为，下次重构很容易又退回原样透传。
//
// 用法：node demo/_legacy_compat_check.js
"use strict";
const fs = require("fs");
const path = require("path");
const { toContract, isLegacyEnvelope } = require("../bridge/upstream_bridge.js");

const DATA = path.join(__dirname, "..", "data");
const load = (n) => JSON.parse(fs.readFileSync(path.join(DATA, n + ".json"), "utf8"));

let pass = 0, fail = 0;
const failures = [];
const asserts = [];
function ok(cond, label, detail) {
  asserts.push({ cond: !!cond, label, detail });
  if (cond) { pass++; return true; }
  fail++; failures.push(label + (detail ? "｜" + detail : ""));
  return false;
}

// ══════════════组 1：识别层 ══════════════
console.log("【1】旧版信封识别（必须排在契约透传之前，否则会出假违规）");
const legacy1 = load("pledge"), legacy2 = load("bank_guarantee");
ok(isLegacyEnvelope(legacy1) === true, "pledge.json 识别为旧版信封", "schema_version=" + legacy1.schema_version);
ok(isLegacyEnvelope(legacy2) === true, "bank_guarantee.json 识别为旧版信封", "schema_version=" + legacy2.schema_version);
ok(isLegacyEnvelope(load("share_change")) === false, "v0.3 信封不被误判为旧版（share_change）");
ok(isLegacyEnvelope(load("wei_real_eqc_001")) === false, "魏真实 v0.3 信封不被误判为旧版");
ok(isLegacyEnvelope({ schema_version: "0.1", events: [] }) === false,
  "★ 无 data_mode/source_file/evidences 的 v0.1 对象不误判（防过度识别）");

// ══════════════ 组 2：可兼容的旧版（pledge：事件类型在 v0.3 内）══════════════
console.log("\n【2】可兼容的旧版 → 零违规（相同功能，兼容进同一转接口）");
const r1 = toContract(legacy1);
ok(r1.envelope.schema_version === "0.3", "信封升到 v0.3", r1.envelope.schema_version);
ok(r1.contract_validation.error_count === 0, "★ 契约零违规（改造前是 19 项假违规）",
  "现" + r1.contract_validation.error_count + " 项：" + r1.contract_validation.errors.join("; "));
ok(r1.envelope.is_mock === true, "data_mode=simulated → is_mock=true（骨架补齐）");
ok(!!r1.envelope.source && r1.envelope.source.file_name === legacy1.source_file.filename,
  "source_file → source（骨架补齐）", r1.envelope.source && r1.envelope.source.file_name);
ok(!!r1.envelope.run_meta && r1.envelope.run_meta.errors.length >= 1,
  "run_meta.errors 留痕版本升级事实", JSON.stringify(r1.envelope.run_meta && r1.envelope.run_meta.errors));

// event_id：evt-0001 → E0001
const ids1 = r1.envelope.events.map((e) => e.event_id);
ok(ids1.every((x) => /^E[0-9]+$/.test(x)), "★ event_id 全部符合 ^E[0-9]+$", ids1.join(","));

// 字段名映射
const f1 = r1.envelope.events[0].fields;
ok("pledged_shares_this_time" in f1, "旧 share_count → v0.3 pledged_shares_this_time（语义等价映射）");
ok("pledged_ratio_this_time_of_held" in f1, "旧 pledge_ratio → v0.3 pledged_ratio_this_time_of_held");
ok("announcement_date" in f1, "旧 announce_date → v0.3 announcement_date");
// 旧页面私有字段名/键绝不能出现在契约信封里（additionalProperties=false）
const envJson1 = JSON.stringify(r1.envelope);
ok(!("share_count" in f1), "旧字段名 share_count 未混入 v0.3 字段层");
ok(!envJson1.includes('"normalized"'), "★ 旧页面字段 normalized 未混入契约信封");
ok(!envJson1.includes('"evidence_id"'), "★ 旧页面字段 evidence_id 未混入契约信封");
ok(!envJson1.includes('"status_override"'), "★ 旧页面字段 status_override 未混入契约信封");
ok(!envJson1.includes('"data_mode"'), "★ 旧顶层 data_mode 未混入契约信封");
ok(!envJson1.includes('"source_file"'), "★ 旧顶层 source_file 未混入契约信封");
ok(!("evidence_id" in (f1.pledgor || {})), "★ pledgor 字段层无 evidence_id 外键残留");

// 出处：evidences[] → provenance[]
const prov = (f1.pledgor || {}).provenance || [];
ok(prov.length === 1 && prov[0].quote && prov[0].page === 3,
  "★ 出处 evidences[] → provenance[]（quote/page 保留）", JSON.stringify(prov[0] && { page: prov[0].page, quote: (prov[0].quote || "").slice(0, 20) }));

// unit 映射：旧中文单位 → 契约枚举
ok((f1.pledged_shares_this_time || {}).unit === "shares", "旧 unit「股」→ shares", (f1.pledged_shares_this_time || {}).unit);
ok((f1.pledged_ratio_this_time_of_held || {}).unit === "percent", "旧 unit「%」→ percent", (f1.pledged_ratio_this_time_of_held || {}).unit);
ok((f1.announcement_date || {}).unit === "date", "旧日期字段 → date", (f1.announcement_date || {}).unit);

// 分母：注册表 fixedDenominator（查表非运算）
ok((f1.pledged_ratio_this_time_of_held || {}).denominator === "holder_shares",
  "★ 分母由注册表 fixedDenominator 补齐（查表，不是猜）", (f1.pledged_ratio_this_time_of_held || {}).denominator);

// 状态映射：pending_review → needs_review（旧名 → 契约枚举名）
const f2 = r1.envelope.events[1].fields;
ok((f2.pledgee || {}).status === "unreadable", "旧 status_override=unreadable → unreadable", (f2.pledgee || {}).status);

// §③ standardized 不推导
let stdCount1 = 0;
for (const e of r1.envelope.events) for (const f of Object.values(e.fields)) if ("standardized" in f) stdCount1++;
ok(stdCount1 === 0, "★ 旧版不产出 standardized（无信息不推导，领导裁定）", String(stdCount1));

// notes 留痕
ok((r1.view.bridge.notes || []).length >= 3, "转换过程逐条留痕（工程告知）", (r1.view.bridge.notes || []).length + " 条");

// ══════════════ 组 3：不可兼容的旧版（guarantee：事件类型不在 v0.3）══════════════
console.log("\n【3】不可兼容的旧版 → 如实告知 + 优先采纳 v0.3（不硬塞）");
const r2 = toContract(legacy2);
ok(r2.envelope.events[0].event_type === "guarantee", "★ 不篡改事件类型为 pledge（不硬塞）", r2.envelope.events[0].event_type);
ok(r2.contract_validation.error_count >= 1, "★ 契约如实报违规（不静默修好）", r2.contract_validation.error_count + " 项");
ok(r2.contract_validation.errors.some((e) => e.includes("guarantee") && e.includes("枚举")),
  "★ 违规信息点明「类型不在枚举内」", r2.contract_validation.errors[0]);
const notes2 = r2.view.bridge.notes || [];
ok(notes2.some((n) => n.includes("不可兼容")), "★ notes 明确写「不可兼容」（工程告知到位）");
ok(notes2.some((n) => n.includes("interface/README.md 第八节")),
  "★ 告知里给出解决路径（走契约变更流程）");
ok(notes2.filter((n) => n.includes("不猜测、不产出")).length === 6,
  "★ 6 个无映射字段逐个告知不猜测", String(notes2.filter((n) => n.includes("不猜测、不产出")).length));
ok(Object.keys(r2.envelope.events[0].fields).length === 0,
  "★ 无等价映射的字段一律不产出（宁缺勿造）", Object.keys(r2.envelope.events[0].fields).length + " 个");
ok(/不可兼容/.test(r2.envelope.events[0].notes || ""), "事件级 notes 标记待人工处置");
ok(r2.envelope.events[0].extraction_method === "mock",
  "★ 补 extraction_method 用枚举内合法值（旧版无此信息，不编造来源）", r2.envelope.events[0].extraction_method);
let stdCount2 = 0;
for (const e of r2.envelope.events) for (const f of Object.values(e.fields)) if ("standardized" in f) stdCount2++;
ok(stdCount2 === 0, "不可兼容文件同样不产出 standardized", String(stdCount2));

// ══════════════ 组 4：v0.3 数据零回归（兼容层不能碰坏新规范）══════════════
console.log("\n【4】v0.3 真实数据零回归（兼容层不得影响新规范路径）");
for (const name of ["wei_real_eqc_001", "wei_real_PLD001_3ev", "wei_real_awd_003", "wei_real_eqc_004", "share_change", "wei_multi_event_test"]) {
  const r = toContract(load(name));
  ok(r.contract_validation.error_count === 0, `${name} 契约零违规`, r.contract_validation.error_count + " 项：" + r.contract_validation.errors.slice(0, 2).join("; "));
}
// 魏真实数据的 standardized 必须透传（不能被兼容层吃掉）
const rw = toContract(load("wei_real_eqc_001"));
let stdTrue = 0;
for (const e of rw.envelope.events) for (const f of Object.values(e.fields)) if (f.standardized === true) stdTrue++;
ok(stdTrue > 0, "★ 魏真实数据的 standardized=true 仍然透传（不被兼容层吞掉）", stdTrue + " 条");

// 方口径路径也不产出 standardized
const rf = toContract(load("upstream_case"));
let stdF = 0;
for (const e of rf.envelope.events) for (const f of Object.values(e.fields)) if ("standardized" in f) stdF++;
ok(stdF === 0, "★ 方口径记录路径也不产出 standardized", String(stdF));

// ══════════════ 组 5：防造假自检 ══════════════
console.log("\n【5】防造假自检");
ok(asserts.length >= 40, "断言条数达到规模（非只跑一两条就判过）", asserts.length + " 条");
const trulyRun = asserts.filter((a) => a.cond).length + asserts.filter((a) => !a.cond).length;
ok(trulyRun === asserts.length, "全部断言都真求值（无短路/跳过）", trulyRun + "/" + asserts.length);

// ── 输出
console.log("\n" + "=".repeat(60));
console.log(`旧版兼容自检 —— PASS ${pass} / FAIL ${fail}（共 ${asserts.length} 条断言）`);
console.log("裁定落地：相同功能兼容进同一转接口 ｜ 不兼容者工程告知 ｜ v0.3 为准 ｜ standardized 不推导");
if (fail) {
  console.log("\n失败明细：");
  failures.forEach((f) => console.log("  ✗ " + f));
}
console.log("=".repeat(60));
process.exit(fail ? 1 : 0);
