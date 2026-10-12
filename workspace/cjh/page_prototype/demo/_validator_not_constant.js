// 反证脚本：证明契约校验器不是恒返回 0（防"永远合规"的假判据）
// 用法：node demo/_validator_not_constant.js
// 退出码 0＝校验器对违规信封确实报错（证明判据有效）；退出码 1＝恒真，判据作废。
"use strict";
const { validate } = require("../bridge/contract_validate.js");

// 构造三份各含一类违规的信封
const mk = (mutate) => {
  const env = {
    schema_version: "0.3", run_id: "x", is_mock: false,
    source: { file_name: "t.txt", file_id: null, file_sha256: null },
    events: [{
      event_id: "E01", event_type: "pledge",
      fields: {
        pledgor: { raw_value: "张三", value: "张三", unit: "text", status: "extracted", provenance: [{ page: 1, quote: "张三" }] }
      }
    }],
    run_meta: { entry: "cli", model: null, started_at: "", duration_ms: null, code_version: "", interface_version: "v0.3", errors: [] }
  };
  mutate(env);          // mutate 就地改并return env；返回值不用，直接用闭包里的 env
  return env;
};

const CASES = [
  { name: "合法信封（对照：应零违规）", expectOk: true, env: mk((e) => e) },
  { name: "event_id 不匹配 ^E[0-9]+$", expectOk: false, env: mk((e) => { e.events[0].event_id = "BAD-1"; }) },
  { name: "unit 与注册表不符（text→percent）", expectOk: false, env: mk((e) => { e.events[0].fields.pledgor.unit = "percent"; }) },
  { name: "有值但 provenance 为空", expectOk: false, env: mk((e) => { e.events[0].fields.pledgor.provenance = []; }) },
  { name: "顶层塞入非契约字段（data_mode）", expectOk: false, env: mk((e) => { e.data_mode = "real"; }) },
  { name: "quote 为空（禁止事后反搜）", expectOk: false, env: mk((e) => { e.events[0].fields.pledgor.provenance[0].quote = ""; }) },
  { name: "字段不在注册表", expectOk: false, env: mk((e) => { e.events[0].fields.not_in_registry = { raw_value: "x", value: "x", unit: "text", status: "extracted", provenance: [{ page: 1, quote: "x" }] }; }) },
  { name: "错误填充：not_mentioned 却带值", expectOk: false, env: mk((e) => { e.events[0].fields.pledgor.status = "not_mentioned"; }) },
];

let bad = 0;
console.log("校验器反证 —— 证明它对违规信封确实报错（不是恒返回 0）\n");
for (const c of CASES) {
  const r = validate(c.env);
  const works = r.ok === c.expectOk;
  if (!works) bad++;
  const tag = works ? "PASS" : "FAIL";
  console.log(`  [${tag}] ${c.name}`);
  console.log(`         ok=${r.ok} error_count=${r.error_count} layers=${JSON.stringify(r.layers)}`);
  if (r.errors && r.errors.length) console.log(`         首条：${r.errors[0]}`);
}
console.log(`\n共 ${CASES.length} 例（含 1 例合法对照），判据失效 ${bad} 例`);
console.log(bad === 0
  ? "结论：校验器对 6 类违规全部报错、对合法信封放行 —— 判据有效"
  : "结论：★ 校验器存在恒真/恒假路径，判据不可信，必须修");
process.exit(bad === 0 ? 0 : 1);
