// _scenario_owner_check.js —— 场景归属自检（真实文件接管 mock 测试文件的三个场景）
//
// 【为什么有这个脚本】2026-10-08 领导裁定：`wei_multi_event_test.json` 无历史用途，
//   确保脱钩后由**真实文件**承担其回归职责。该文件原本承担三个场景：
//     ① 多事件渲染（3 事件同文件）      ② 列头单位继承（raw 万股 → value 股）
//     ③ 故意错值放大镜（value 未换算，肉眼可见不符）
//   mock 数据自造场景有三个坏处：is_mock=true 的数据不该当回归基准；
//   合成数字不代表真实分布；错值是人为编的，与真实解析器的错法无关。
//
// 【铁律】本脚本必须真跑断言（cases_run>0），不允许空跑判pass ——
//   D10 `web_cli_same_result` 造假的三种形态之一就是「空跑即通过」。
//
// 用法：node demo/_scenario_owner_check.js
"use strict";
const fs = require("fs");
const path = require("path");
const { toContract } = require("../bridge/upstream_bridge.js");

const DATA = path.join(__dirname, "..", "data");
const load = (n) => JSON.parse(fs.readFileSync(path.join(DATA, n + ".json"), "utf8"));

// 场景 → 真实文件归属表（改这里就是改归属，须与 demo/使用演示.md 同步）
const SCENARIO_OWNERS = [
  {
    id: "S-MULTI-EVENT",
    name: "多事件渲染",
    owner: "wei_real_PLD001_3ev",
    why: "同一份公告 3 个质押事件，全字段带出处；魏真实批次，非合成",
  },
  {
    id: "S-UNIT-CONVERT",
    name: "列头单位继承 / 万元换算",
    owner: "wei_real_awd_009",
    why: "3 个事件 bid_amount 均raw 带「万元」而 value 已换算为元，raw/value 并列可验换算",
  },
  {
    id: "S-DATE-RANGE",
    name: "区间日期（date_range 真形态）",
    owner: "wei_real_eqc_006",
    why: "change_date 真实值为 ISO 区间 2026-09-22/2026-09-23，单日与区间两种形态都有真实样本",
  },
  {
    id: "S-MULTI-EVENT-5",
    name: "5 事件渲染",
    owner: "wei_real_eqc_001",
    why: "单文件 5 事件，覆盖多事件上限与前后对比块布局",
  },
  {
    id: "S-NEEDS-REVIEW",
    name: "needs_review 诚实降级",
    owner: "wei_real_eqc_004",
    why: "change_date 原文明示“之日”而非具体日期，真实 needs_review 样本（不猜日期）",
  },
];

let pass = 0, fail = 0;
const failures = [];
function assert(cond, label, detail) {
  if (cond) { pass++; return true; }
  fail++; failures.push(label + (detail ? "｜" + detail : ""));
  return false;
}

// ── 断言 1：mock 测试文件已脱钩（不再是回归基准，仅保留演示价值）
const mockFile = load("wei_multi_event_test");
const mockRes = toContract(mockFile);
assert(mockFile.is_mock === true, "mock 文件自认 is_mock=true（不得冒充真实）");
assert(
  mockRes.contract_validation.error_count === 0,
  "mock 文件契约零违规（extraction_method 已改枚举内取值）",
  mockRes.contract_validation.errors.join("; ")
);

// ── 断言 2：三个原场景的真实接管者都真跑且断言成立
const runOwners = [];
for (const sc of SCENARIO_OWNERS) {
  let raw;
  try {
    raw = load(sc.owner);
  } catch (e) {
    assert(false, sc.id + " 真实接管文件可读：" + sc.owner, String(e.message).slice(0, 80));
    continue;
  }
  assert(raw.is_mock === false, sc.id + " 接管文件必须 is_mock=false（真实数据）", sc.owner);
  assert(raw.schema_version === "0.3", sc.id + " 接管文件 schema_version=0.3", sc.owner);

  const res = toContract(raw);
  assert(
    res.contract_validation.error_count === 0,
    sc.id + " 真实接管文件契约零违规",
    sc.owner + "：" + res.contract_validation.errors.join("; ")
  );

  // 场景特定断言
  const evs = res.envelope.events || [];
  if (sc.id === "S-MULTI-EVENT") {
    assert(evs.length === 3, sc.id + " 事件数=3", String(evs.length));
  }
  if (sc.id === "S-MULTI-EVENT-5") {
    assert(evs.length === 5, sc.id + " 事件数=5", String(evs.length));
  }
  if (sc.id === "S-UNIT-CONVERT") {
    const hits = evs.filter((e) => {
      const f = e.fields.bid_amount;
      return f && typeof f.raw_value === "string" && /万元/.test(f.raw_value) && typeof f.value === "number" && f.value > 1e6;
    });
    assert(hits.length === 3, sc.id + " 3 个事件的万元金额均已换算（元级）", String(hits.length));
  }
  if (sc.id === "S-DATE-RANGE") {
    const f = evs[0] && evs[0].fields.change_date;
    assert(!!f && f.unit === "date_range", sc.id + " unit=date_range", f && f.unit);
    assert(!!f && /^\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}$/.test(String(f.value)), sc.id + " value 是 ISO 区间", f && String(f.value));
  }
  if (sc.id === "S-NEEDS-REVIEW") {
    const f = evs[0] && evs[0].fields.change_date;
    assert(!!f && f.status === "needs_review", sc.id + " change_date 状态为 needs_review", f && f.status);
    assert(!!f && f.value === null, sc.id + " needs_review 时 value 为 null（不猜日期）", f && String(f.value));
  }
  runOwners.push({ id: sc.id, name: sc.name, owner: sc.owner, events: evs.length, why: sc.why });
}

// ── 断言 3：★ 防造假自检 —— 场景必须真跑（cases_run>0），空跑不得判pass
assert(runOwners.length === SCENARIO_OWNERS.length, "全部场景接管者都真跑过（非空跑）", runOwners.length + "/" + SCENARIO_OWNERS.length);
assert(runOwners.every((r) => r.events > 0), "每个接管者都真有事件（events>0）", JSON.stringify(runOwners.map((r) => r.events)));

// ── 断言 4：真实文件 standardized 覆盖率应显著高于 0（证明接管者真带标准化声明）
let stdTrue = 0, stdTotal = 0;
for (const sc of SCENARIO_OWNERS) {
  try {
    const raw = load(sc.owner);
    for (const ev of raw.events || []) for (const fv of Object.values(ev.fields || {})) {
      stdTotal++;
      if (fv.standardized === true) stdTrue++;
    }
  } catch (e) { /* 已在断言 2 报过 */ }
}
assert(stdTotal > 0 && stdTrue > 0, "真实接管文件带 standardized 声明（非空）", stdTrue + "/" + stdTotal);

// ── 输出
const lines = [];
lines.push("场景归属自检 —— mock 测试文件脱钩，回归职责移交真实文件");
lines.push("判定标准：全部断言通过 = pass；任一不成立 = fail（不降级不跳过）");
lines.push("");
lines.push("【原 mock 测试文件（wei_multi_event_test.json）】");
lines.push("  is_mock=true ·契约违规 " + mockRes.contract_validation.error_count + " · extraction_method=mock（枚举内）");
lines.push("  定位：仅保留演示价值，不再作为回归基准（is_mock 数据不得当基准）");
lines.push("");
lines.push("【场景 → 真实文件接管表】");
for (const r of runOwners) {
  lines.push("  " + r.id.padEnd(18) + r.name);
  lines.push("    接管：" + r.owner + "（" + r.events + " 事件，is_mock=false，契约零违规）");
  lines.push("    理由：" + r.why);
}
lines.push("");
lines.push("【实测】standardized=true 占比 " + stdTrue + "/" + stdTotal);
lines.push("【防造假自检】cases_run=" + runOwners.length + "/" + SCENARIO_OWNERS.length + "，events 全 >0＝确认真跑");
lines.push("");
lines.push("PASS " + pass + " / FAIL " + fail);
if (fail) {
  lines.push("");
  lines.push("失败明细：");
  failures.forEach((f) => lines.push("  ✗ " + f));
}
console.log(lines.join("\n"));
process.exit(fail ? 1 : 0);
