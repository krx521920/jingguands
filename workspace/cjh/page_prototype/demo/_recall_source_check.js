/**
 * demo/_recall_source_check.js —— 覆盖率分母「来源正确性」守卫（2026-10-15 新增）
 *
 * 为什么必须有这道守卫（反造假铁律：合规不能靠「没写代码」）：
 *   裁定明令「Gold 期望字段召回率的分母**只来自 Gold 清单**，禁止用引擎 status 反推，
 *   也不能靠改引擎 status 缩小分母」。但这条禁令只写在文档里的话，代码里悄悄改成
 *   「数引擎 extracted 当分母」没人会发现 —— 那种写法会让少抽一个字段分母自己缩一格，
 *   永远 100%，是最像成绩的假数。
 *
 * 本守卫做**双向证明**：
 *   正证 ①：分母由传入的 Gold 清单决定 —— 只给 1 个数据集 3 个期望字段，分母必须恰好 = 3。
 *   正证 ②：改 Gold 会动分母 —— 期望字段 +1，分母必须 +1。
 *   反证 ③：**改引擎 status 不动分母**（把 extracted 全改判 not_mentioned）——
 *           分母必须保持不变，而召回率的分子必须下降（漏抽要扣分，不是缩分母）。
 *   反证 ④：Gold 损坏 / 身份缺失必须显式记账（gold_bad / unpairable），不得静默当通过。
 *   反证 ⑤：分母为 0 必须判「未测」（pct=null），不得显示 100%。
 *
 * 只读：不改任何仓库文件、不写任何产物。失败即 exit 1 并打印实跑输出。
 * 用法：node demo/_recall_source_check.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const caliber = require(path.join(__dirname, "..", "bridge", "caliber.js"));

let pass = 0, fail = 0;
function assert(cond, label, detail) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else { fail++; console.log("  FAIL  " + label + (detail ? "\n        " + detail : "")); }
}

const envelopes = caliber.primaryEnvelopes();
if (!envelopes.length) { console.log("  FAIL  读不到权威批信封，守卫无法执行"); process.exit(1); }
const realIndex = caliber.loadGoldIndex();

console.log("=== 覆盖率分母来源守卫（正证 + 反证）===");
console.log("输入：权威批 " + envelopes.length + " 份信封；Gold 目录 " + caliber.goldDirs().length + " 个");

// ---------- 正证 ① 分母由传入的 Gold 清单决定 ----------
const oneEnv = envelopes[0];
const fid = oneEnv.json.source.file_id;
const fakeGold = {
  byFileId: new Map([[fid, {
    gold_case_id: "FAKE-CASE",
    gold: { events: [{ event_id: "E01", event_type: "pledge", fields: {
      pledgor: { status: "extracted", value: "甲", unit: "text" },
      pledgee: { status: "extracted", value: "乙", unit: "text" },
      pledge_amount: { status: "extracted", value: 100, unit: "股" },
    } }] },
  }]]),
  byCaseId: new Map(), bad: [],
};
const g1 = caliber.buildGoldExpected([oneEnv], fakeGold);
assert(g1.expected_total === 3, "正证① 分母＝传入 Gold 的期望字段数（期望 3，实得 " + g1.expected_total + "）",
  "若分母等于引擎 extracted 数，说明分母被引擎反推了");

// ---------- 正证 ② 改 Gold → 分母跟着动 ----------
const fakeGold3 = {
  byFileId: new Map([[fid, {
    gold_case_id: "FAKE-CASE",
    gold: { events: [{ event_id: "E01", event_type: "pledge", fields: {
      pledgor: { status: "extracted", value: "甲", unit: "text" },
      pledgee: { status: "extracted", value: "乙", unit: "text" },
      pledge_amount: { status: "extracted", value: 100, unit: "股" },
      pledge_start_date: { status: "extracted", value: "2026-01-01", unit: "date" },
    } }] },
  }]]),
  byCaseId: new Map(), bad: [],
};
const g2 = caliber.buildGoldExpected([oneEnv], fakeGold3);
assert(g2.expected_total === 4, "正证② Gold 期望 +1 ⇒ 分母 +1（期望 4，实得 " + g2.expected_total + "）");

// ---------- 反证 ③ 改引擎 status **不动分母**，只动分子 ----------
const mutated = JSON.parse(JSON.stringify([oneEnv]));
for (const ev of (mutated[0].json.events || [])) {
  for (const fv of Object.values(ev.fields || {})) {
    if (fv && typeof fv === "object" && fv.status === "extracted") fv.status = "not_mentioned";  // 伪造「引擎全弃权」
  }
}
const g3 = caliber.buildGoldExpected(mutated, fakeGold3);
assert(g3.expected_total === g2.expected_total,
  "反证③-a 引擎 status 全改 not_mentioned ⇒ 分母不动（期望仍 " + g2.expected_total + "，实得 " + g3.expected_total + "）",
  "分母若缩小，即触犯「不得靠改引擎 status 缩小分母」的裁定");
const baseRecall = caliber.buildGoldExpected(mutated, fakeGold3).recall_num;
assert(baseRecall < g2.expected_total,
  "反证③-b 引擎全弃权 ⇒ 分子下降（已抽 " + baseRecall + " < 分母 " + g3.expected_total + "）—— 漏抽必须扣分");
assert(g3.recall_miss.length >= 1, "反证③-c 漏抽（含整事件缺失）逐条记入 recall_miss，不静默吞掉（实得 " + g3.recall_miss.length + " 条）");

// ---------- 反证 ④ Gold 损坏 / 身份缺失必须显式记账 ----------
const badIndex = {
  byFileId: new Map([[fid, { gold_case_id: "BAD", gold: { events: [{ event_id: "E1", event_type: "pledge", fields: {} }] } }]]),
  byCaseId: new Map(), bad: [{ dataset: "X", why: "Gold 读取失败: 注入的坏件" }],
};
const g4 = caliber.buildGoldExpected([{ id: "缺身份的份", json: { events: [] } }, oneEnv], badIndex);
assert(g4.gold_bad.length === 1, "反证④-a Gold 损坏显式记账（gold_bad=" + g4.gold_bad.length + "）");
assert(g4.unpairable.length === 1, "反证④-b 缺 source.file_id 的信封判 unpairable，不静默跳过（实得 " + g4.unpairable.length + "）");

// ---------- 反证 ⑤ 分母为 0 ⇒ 判未测（pct=null），不得显示 100% ----------
const emptyGold = { byFileId: new Map(), byCaseId: new Map(), bad: [] };
const cal0 = caliber.buildGoldExpected([oneEnv], emptyGold);
assert(cal0.expected_total === 0 && cal0.no_gold.length === 1,
  "反证⑤-a 无 Gold ⇒ 期望全集为 0 且该份进 no_gold（" + cal0.no_gold.length + " 份），不进任何分母");
const den0 = cal0.expected_total, pct0 = den0 ? +(cal0.recall_num / den0 * 100).toFixed(2) : null;
assert(pct0 === null, "反证⑤-b 分母为 0 ⇒ 召回率判未测（null），不得显示 100%（实得 " + String(pct0) + "）");

// ---------- 真实数据自洽：分母 436＋多填 1、且与「槽位 extracted」两个数各自独立 ----------
const real = caliber.buildGoldExpected(envelopes, realIndex);
const slot = caliber.slotScope(envelopes);
const engineExtracted = slot.by_status["extracted"] || 0;
// ★ 2026-10-17 Gold v1.2：期望全集(436) 与 信封填值(437) 出现差集 ⇒ 多填 1 单列（宗答辩口径 §二）
assert(real.expected_total + (real.extra_filled || 0) === engineExtracted,
  "真实数据自洽：信封填值数 " + engineExtracted + " ＝ Gold 期望全集 " + real.expected_total + " ＋ 多填 " + (real.extra_filled || 0) + "（v1.2 差集单列，同值≠同源，见正证①②与反证③）");
assert((real.extra_filled || 0) === 1,
  "Gold v1.2 多填恰 1 条（D6-AWD-002 E01 formal_award_notice_received，实得 " + (real.extra_filled || 0) + "）");
assert(real.miss_events.length === 0, "本批无「Gold 有事件而信封无」的整事件缺失（实得 " + real.miss_events.length + " 处）——若有，其期望字段必须计入分母", JSON.stringify(real.miss_events.slice(0, 3)));

console.log("\n=== 汇总 ===  PASS " + pass + " / FAIL " + fail);
process.exit(fail ? 1 : 0);
