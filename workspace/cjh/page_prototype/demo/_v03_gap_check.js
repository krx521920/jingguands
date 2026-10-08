// demo/_v03_gap_check.js —— v0.3 契约复核三处 GAP 的实跑验证（只读，不改数据）
// 用法：node demo/_v03_gap_check.js
// 验证：GAP-01 schema_version 出口统一 0.3 / GAP-03 direction 非英文枚举被拦截 / GAP-02 历史键仍在
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const bridge = require(path.join(ROOT, "bridge", "upstream_bridge.js"));
const { toContract, isWeiEnvelope } = bridge;

let pass = 0, fail = 0;
const ok = (cond, label, extra) => {
  if (cond) { pass++; console.log("  PASS  " + label + (extra ? "  → " + extra : "")); }
  else { fail++; console.log("  FAIL  " + label + (extra ? "  → " + extra : "")); }
};

console.log("=== GAP-01：schema_version 出口统一 0.3 ===");
// ★ D15 起转接口返回 {envelope, view, contract_validation}：断言改看**契约本体**，
//   schema_version 是契约字段，看视图层会掩盖问题（视图是投影，不是契约）。

// 1a 魏信封路径
const wei = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "wei_real_eqc_002.json"), "utf8"));
ok(isWeiEnvelope(wei), "wei_real_eqc_002 识别为 v0.3 信封");
const c1 = toContract(wei);
ok(c1.envelope.schema_version === "0.3", "魏信封 → 契约 schema_version", c1.envelope.schema_version);

// 1b 方 records 路径（此前硬编码 0.2）
const fangRec = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "upstream_case.json"), "utf8"));
ok(fangRec.bridge === "fang-normalization-v0.1", "upstream_case.json 为方 records 格式", fangRec.bridge);
const c2 = toContract(fangRec);
ok(c2.envelope.schema_version === "0.3", "方 records → 契约 schema_version", c2.envelope.schema_version);
ok(Array.isArray(c2.envelope.events) && c2.envelope.events.length > 0, "方 records → 事件数", String(c2.envelope.events && c2.envelope.events.length));

// 1c check.json 是核验报告（非抽取数据），应走 passthrough 原样透传，不伪造 schema_version
const chk = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "wei_real_eqc_001.check.json"), "utf8"));
const c3 = toContract(chk);
ok(Array.isArray(c3.envelope.events) && c3.envelope.events.length === 0, "check.json 不伪造事件（不猜格式）");
ok(c3.view.bridge.notes.some((n) => n.includes("unknown upstream format")), "check.json 走 passthrough（notes 留痕）");

console.log("\n=== GAP-03：direction 非英文枚举被拦截 ===");

const mkEnvelope = (eventType, directionValue) => ({
  schema_version: "0.3", run_id: "t-run", is_mock: false,
  source: { file_id: "sha256:t", file_name: "t.txt" },
  events: [{
    event_id: "E01", event_type: eventType, extraction_method: "model",
    fields: {
      direction: {
        raw_value: String(directionValue), value: directionValue, unit: "text",
        status: "extracted", provenance: [{ page: 1, quote: "方向原文" }]
      }
    }
  }],
  run_meta: { started_at: "2026-10-07T00:00:00Z" }
});

// ★ D15：断言改看 view 层（页面渲染投影）与 envelope 层（契约本体）各自的职责。

// 合规：英文枚举 → 不得报警
const good = toContract(mkEnvelope("equity_change", "increase"));
ok(good.view.events[0].status !== "pending_review", "英文枚举 increase 不触发拦截", good.view.events[0].status);
ok(!(good.view.bridge.notes || []).some((n) => n.includes("direction")), "合规值不产生 notes");

// 违规：中文枚举 → 必须被拦截
const bad = toContract(mkEnvelope("equity_change", "增持"));
const badNotes = (bad.view.bridge && bad.view.bridge.notes) || [];
ok(bad.view.events[0].status === "pending_review", "中文「增持」→ 事件标 pending_review", bad.view.events[0].status);
ok(badNotes.some((n) => n.includes("direction") && n.includes("增持")), "中文「增持」→ 记入 bridge.notes");
ok(bad.view.events[0].direction_contract_violation === true, "事件带 direction_contract_violation 标记");
// ★ D15 新增：违规必须在**契约本体**里也留痕（改成契约合法的 needs_review 态，不新增非法状态）
ok(bad.envelope.events[0].fields.direction.status === "needs_review",
  "★ 契约本体用合法态 needs_review 承载（不新造非法状态）", bad.envelope.events[0].fields.direction.status);

// pledge 侧同理
const badP = toContract(mkEnvelope("pledge", "解除"));
ok(badP.view.events[0].status === "pending_review", "pledge 中文「解除」→ 拦截", badP.view.events[0].status);
const goodP = toContract(mkEnvelope("pledge", "release"));
ok(goodP.view.events[0].status !== "pending_review", "pledge 英文 release → 放行", goodP.view.events[0].status);

// 空值不误报
const empty = toContract(mkEnvelope("equity_change", null));
ok(empty.view.events[0].status !== "pending_review", "direction 为 null → 不误报", empty.view.events[0].status);

// award_contract 注册表无 direction → 不应拦截
const awd = toContract(mkEnvelope("award_contract", "任意值"));
ok(awd.view.events[0].status !== "pending_review", "award_contract 无 direction 约束 → 不拦截", awd.view.events[0].status);

console.log("\n=== GAP-02：consortium 历史键仍保留（有意兼容） ===");
// results.js 是 ESM（浏览器模块），此处只做源码文本校验，不 require
const resultsSrc = fs.readFileSync(path.join(ROOT, "public", "js", "render", "results.js"), "utf8");
ok(/consortium_members:\s*"联合体成员名单"/.test(resultsSrc), "consortium_members 映射在位");
ok(/consortium_shares:\s*"联合体份额"/.test(resultsSrc), "consortium_shares 映射在位");
ok(/consortium:\s*"联合体及份额"/.test(resultsSrc), "consortium 历史键仍保留（兼容旧数据）");
ok(/新数据不应产出此键/.test(resultsSrc), "consortium 已标注「新数据不应产出」");

// 附加：确认页面已无 bid_won 残留
ok(!/event_type:\s*["']bid_won/.test(resultsSrc) && !/["']bid_won["']\s*:/.test(resultsSrc),
   "页面无 bid_won 残留（v0.3 已改名 award_contract）");

console.log("\n=== 汇总 ===");
console.log("  PASS " + pass + " / FAIL " + fail);
process.exit(fail === 0 ? 0 : 1);
