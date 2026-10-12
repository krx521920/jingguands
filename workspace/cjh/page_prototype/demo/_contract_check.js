// _contract_check.js —— 转接口契约守卫
//
// 存在理由：转接口是「所有数据进页面的唯一通道」。它一旦悄悄产出不合契约的结构，
//   上游看不出来、下游看不出来，直到评测那天才炸——那时候已无法定位是哪一步坏的。
//   所以这里把契约的每一条要求都变成断言：schema 层 + registry 层 + 计划书 §四 的可核验设计。
//
// 运行：node demo/_contract_check.js
"use strict";

const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");

const bridge = require(path.join(ROOT, "bridge", "upstream_bridge.js"));
const V = require(path.join(ROOT, "bridge", "contract_validate.js"));

let pass = 0, fail = 0;
const ok = (cond, label, detail) => {
  if (cond) { pass++; console.log(`  [PASS] ${label}${detail ? "  —— " + detail : ""}`); }
  else { fail++; console.log(`  [FAIL] ${label}${detail ? "  —— " + detail : ""}`); }
};
const sec = (t) => console.log(`\n【${t}】`);

// ══════════════════════════════════════════════════════════════
sec("1 校验器自身可信（不能只会说 OK）");
{
  const good = { schema_version: "0.3", run_id: "r1", is_mock: false, source: { file_name: "a.pdf" }, events: [], run_meta: {} };
  ok(V.validate(good).ok, "合规信封判pass");

  const bads = [
    [{ ...good, schema_version: "0.2" }, "schema_version 非 0.3"],
    [{ ...good, is_mock: "no" }, "is_mock 类型错"],
    [{ ...good, source: {} }, "source 缺 file_name"],
    [{ ...good, extra: 1 }, "顶层多余字段（additionalProperties=false）"],
    [{ ...good, events: [{ event_id: "X1", event_type: "pledge", fields: {} }] }, "event_id 违反 ^E[0-9]+$"],
    [{ ...good, events: [{ event_id: "E1", event_type: "bank_guarantee", fields: {} }] }, "event_type 不在枚举"],
    [{ ...good, events: [{ event_id: "E1", event_type: "pledge", fields: { nope: { raw_value: "1", value: "1", unit: "text", status: "extracted", provenance: [] } } }] }, "字段不在注册表"],
    [{ ...good, events: [{ event_id: "E1", event_type: "pledge", fields: { pledgor: { raw_value: "a", value: "a", unit: "shares", status: "extracted", provenance: [] } } }] }, "unit 与注册表不符"],
  ];
  let allCaught = true;
  for (const [env, why] of bads) if (V.validate(env).ok) { allCaught = false; console.log("    未抓到：" + why); }
  ok(allCaught, `8 类违规全部被抓（${bads.length}/8）`, "校验器漏抓＝守卫形同虚设");

  const R = V.REGISTRY;
  ok(R.EVENT_TYPES.length === 3 && Object.keys(R.FIELD_REGISTRY).length === 3,
    "注册表直读成功（3 事件类型）", `${V.registry_status().field_count} 字段`);
}

// ══════════════════════════════════════════════════════════════
sec("2 转接口产出：envelope 必须是干净契约本体");
{
  const A = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "wei_real_pledge_ce37.json"), "utf8"));
  const r = bridge.toContract(A);

  ok(Object.keys(r).sort().join(",") === "contract_validation,envelope,view", "返回三件套 envelope/view/contract_validation");
  ok(r.envelope.schema_version === "0.3" && r.envelope.run_id && typeof r.envelope.is_mock === "boolean"
    && r.envelope.source && Array.isArray(r.envelope.events) && r.envelope.run_meta,
    "★ 契约 6 项必填齐备（schema_version/run_id/is_mock/source/events/run_meta）");

  // ★ 关键守卫：视图字段绝不能漏进信封
  const forbidden = ["data_mode", "source_file", "evidences", "bridge", "integrity", "contract_validation", "_view"];
  const topLeak = forbidden.filter((k) => k in r.envelope);
  ok(topLeak.length === 0, "★ 信封顶层无视图字段", topLeak.length ? "泄漏：" + topLeak.join(",") : "additionalProperties=false 未被破坏");

  const fieldForbidden = ["normalized", "normalized_unit", "evidence_id", "evidence_ids", "status_override", "status_raw", "_view", "qualifier", "scope"];
  let fieldLeak = [];
  for (const ev of r.envelope.events) for (const [n, fv] of Object.entries(ev.fields || {}))
    fieldLeak.push(...fieldForbidden.filter((k) => k in fv).map((k) => `${n}.${k}`));
  ok(fieldLeak.length === 0, "★ 信封字段层无视图字段", fieldLeak.length ? "泄漏：" + fieldLeak.slice(0, 5).join(",") : "field_value 结构未被污染");

  // 独立复验（不走转接口自带的校验器，防止自己给自己打分）
  const re = V.validate(r.envelope);
  ok(re.ok, "信封独立复验通过", `错误 ${re.error_count} 条`);
  re.errors.slice(0, 5).forEach((e) => console.log("      ✗ " + e));
}

// ══════════════════════════════════════════════════════════════
sec("3 视图投影：页面字段齐全且能从契约派生");
{
  const A = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "wei_real_pledge_ce37.json"), "utf8"));
  const r = bridge.toContract(A);
  const v = r.view;

  ok(v.data_mode && v.source_file && Array.isArray(v.events) && Array.isArray(v.evidences),
    "视图顶层齐备（data_mode/source_file/events/evidences）");
  ok(v.run_id === r.envelope.run_id, "视图 run_id 与信封一致");
  ok(v.contract_validation !== null, "★ 视图带contract_validation（页面可显示契约合规状态）");

  const f = v.events[0].fields.pledgor;
  ok("normalized" in f && "evidence_id" in f && "status_raw" in f,
    "视图字段保留前端所需三件（normalized/evidence_id/status_raw）", Object.keys(f).join(","));

  // 视图 evidence_id 必须能在视图evidences[] 里找到（不能是悬空 id）
  const idSet = new Set(v.evidences.map((e) => e.evidence_id));
  let dangling = 0;
  for (const ev of v.events) for (const fv of Object.values(ev.fields || {}))
    for (const id of [fv.evidence_id, ...(fv.evidence_ids || [])]) if (id && !idSet.has(id)) dangling++;
  ok(dangling === 0, "视图 evidence_id 无悬空引用", dangling ? `${dangling} 个悬空` : "");

  // 完整性检查仍生效
  ok(v.integrity && typeof v.integrity.ok === "boolean", "断链自检仍产出", v.integrity ? `${v.integrity.issues.length} 项` : "");

  // ★ 信封纯净性：非契约字段一个都不许出现在 envelope 里。
  //   这条锁的是「先过检、后往信封挂内部标记」那类漏洞 —— 契约 additionalProperties=false，
  //   挂一个 `__check_report` / `_view` 就让「输出格式合规率 100%」永远达不到，
  //   而且校验器自己被绕过，等于把判据作废（D10 同款）。
  //   2026-10-08 实测抓到过：fromWeiEnvelope 往 envelope 挂 __check_report，
  //   带 .check.json sidecar 的 10 份魏信封全部因此报违规。
  ok(!("_view" in r.envelope), "★ envelope 无 _view 内部标记");
  ok(!("__check_report" in r.envelope), "★ envelope 无 __check_report 内部标记");
  ok(!("check_report" in r.envelope), "★ envelope 无 check_report 键");
  const envKeys = Object.keys(r.envelope).sort().join(",");
  ok(envKeys === "events,is_mock,run_id,run_meta,schema_version,source",
    "★ envelope 顶层恰为契约 6 项（不多不少）", envKeys);
  ok(!JSON.stringify(r.envelope).includes('"_view"'), "★ 信封序列化后不含 _view");
  // 视图侧保留 check_report 字段位（无 sidecar 时为 null，不该是 undefined——
//  // 那样消费方分不清"没有报告"和"投影漏了"。带 sidecar 的样本在 3b 组断言）
  ok("check_report" in v, "视图保留 check_report 字段位（无 sidecar 时为 null 而非缺字段）",
    v.check_report === null ? "null" : typeof v.check_report);
}

// ══════════════════════════════════════════════════════════════
sec("3b 带 .check.json sidecar 的信封必须零违规（回归 2026-10-08 实测 bug）");
{
  // 背景：wei_real_eqc_001 等 10 份带 sidecar。改造前 fromWeiEnvelope 把方核验报告
  // 挂成 envelope.__check_report ⇒ 这 10 份**全部**报 additionalProperties 违规，
  // 但直接调 toContract(单文件) 是 0 违规 —— 只有走接口同款路径才暴露。
  //   教训：验收必须走真实链路（含 sidecar 合并），不能只单测纯函数。
  const sidecars = fs.readdirSync(path.join(ROOT, "data"))
    .filter((f) => f.endsWith(".check.json"));
  ok(sidecars.length > 0, "存在 sidecar 样本（否则本组断言无意义）", sidecars.length + " 份");
  let bad = 0, checked = 0;
  const detail = [];
  for (const sf of sidecars) {
    const base = sf.replace(/\.check\.json$/, "");
    const main = path.join(ROOT, "data", base + ".json");
    if (!fs.existsSync(main)) continue;
    const raw = JSON.parse(fs.readFileSync(main, "utf8"));
    raw.check_report = JSON.parse(fs.readFileSync(path.join(ROOT, "data", sf), "utf8"));
    const res = bridge.toContract(raw);
    checked++;
    if (!res.contract_validation.ok) {
      bad++;
      detail.push(base + ": " + (res.contract_validation.errors[0] || ""));
    }
    ok(!("__check_report" in res.envelope), `${base} 信封无 __check_report 残留`);
    ok(res.view.check_report != null, `${base} 核验报告投影进视图侧`);
  }
  ok(bad === 0, `★ ${checked} 份带 sidecar 信封全部零违规`, detail.join(" | "));
  ok(checked >= 10, "★ sidecar 样本量足够（不是只测了 1 份就算过）", checked + " 份");
}

// ══════════════════════════════════════════════════════════════
sec("4 契约 6 态全渲染（不猜不留空）");
{
  const mk = (status) => ({
    schema_version: "0.3", run_id: "t", is_mock: false, source: { file_name: "t.pdf" },
    events: [{ event_id: "E1", event_type: "pledge", fields: { pledgor: { raw_value: "张三", value: "张三", unit: "text", status, provenance: [{ page: 1, quote: "张三" }] } } }],
    run_meta: {}
  });
  for (const st of V.REGISTRY.STATUSES) {
    const v = bridge.toContract(mk(st)).view;
    const f = v.events[0].fields.pledgor;
    ok(f.status_raw === st, `6 态 ${st} 原样保留不丢失`, `status_override=${f.status_override === undefined ? "(无)" : f.status_override}`);
  }
  // ★ not_mentioned 却带值 = 计划书 §四.4 的错误填充。
  //   正确处置是**如实上报不抹除**（抹掉＝替上游改数据＝掩盖这个一级指标）。
  //   这也是本守卫要防的"转接口悄悄把数据改好"——那与 D10 同款。
  const rNM = bridge.toContract(mk("not_mentioned"));
  const aud = rNM.view.error_fill_audit;
  ok(aud && aud.phantom_count === 1, "★ not_mentioned 带值被计入错误填充率", JSON.stringify(aud && aud.phantom_fields));
  ok(rNM.envelope.events[0].fields.pledgor.value === "张三",
    "★ 原值原样保留（转接口不替上游抹值，抹了错误填充率就测不出来了）");
  ok(rNM.view.events[0].fields.pledgor.status_override === "not_mentioned",
    "状态仍为 not_mentioned（页面照实渲染，不美化）");
}

// ══════════════════════════════════════════════════════════════
sec("5 计划书 §四 的可核验设计落到机器断言");
{
  const A = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "wei_real_pledge_ce37.json"), "utf8"));
  const r = bridge.toContract(A);

  // §四.1 模型只找数不算数：转接口不得改动数值
  let numericDrift = 0;
  for (const evIn of A.events) for (const [n, fvIn] of Object.entries(evIn.fields || {})) {
    const fvOut = (r.envelope.events.find((e) => e.event_id === evIn.event_id) || { fields: {} }).fields[n];
    if (!fvOut) continue;
    if (String(fvIn.value) !== String(fvOut.value)) numericDrift++;
    if (String(fvIn.raw_value) !== String(fvOut.raw_value)) numericDrift++;
  }
  ok(numericDrift === 0, "§四.1 转接口零数值运算（value/raw_value 原样搬运）", numericDrift ? `${numericDrift} 处被改` : "模型只找数不算数");

  // §四.2 出处随数据生成：有值字段必有 provenance 且 quote 非空
  let noProv = 0, emptyQuote = 0;
  for (const ev of r.envelope.events) for (const [n, fv] of Object.entries(ev.fields || {})) {
    if (fv.status !== "extracted" && fv.status !== "needs_review") continue;
    if (!Array.isArray(fv.provenance) || !fv.provenance.length) { noProv++; continue; }
    if (fv.provenance.some((p) => !p.quote || !String(p.quote).trim())) emptyQuote++;
  }
  ok(noProv === 0, "§四.2 有值字段全部带出处（不事后反搜）", noProv ? `${noProv} 个字段无出处` : "");
  ok(emptyQuote === 0, "§四.2 出处 quote 全部非空（点开就能看到原文）", emptyQuote ? `${emptyQuote} 个 quote 空` : "");

  // 四级出处：文件/页码/页面区域/表格行列 —— 表格单元格必须定位到格
  const cellIssues = r.view.integrity.issues.filter((i) => i.what.includes("cell_ref"));
  ok(cellIssues.length === 0, "§四.2 表格出处定位到单元格", cellIssues.length ? `${cellIssues.length} 处缺table_id/cell_ref` : "");
}

// ══════════════════════════════════════════════════════════════
sec("6 方口径路径同样走契约");
{
  const fang = {
    bridge: "fang-normalization-v0.1",
    run_id: "fang-1",
    source_file: { file_id: "sha256:abc", filename: "x.pdf", sha256: "sha256:abc" },
    records: [
      { event_id: "E1", event_type: "pledge", kind: "amount", field: "pledge_amount", status: "present", rawText: "1.2亿元", value: "120000000", unit: "cny", evidence: { block_id: "b1", page: 2, quote: "1.2亿元" } },
      { event_id: "E1", event_type: "pledge", kind: "ratio", field: "pledged_ratio_this_time_of_held", status: "present", rawText: "2.5%", value: "2.5", unit: "percent", denominator: { kind: "holder_shares", definition: "其所持股份" }, evidence: { block_id: "b2", page: 2, quote: "占其所持股份比例的2.5%" } },
      { event_id: "E1", event_type: "pledge", kind: "shares", field: "pledged_shares_cumulative", status: "not_mentioned", evidence: { block_id: "b3", page: 3, quote: "［核验范围］" } },
      { event_id: "E1", event_type: "pledge", kind: "text", field: "purpose", status: "unreadable", rawText: null, evidence: { block_id: "b4", page: 3, quote: "" } }
    ]
  };
  const r = bridge.toContract(fang);
  ok(r.envelope.schema_version === "0.3" && r.envelope.source.file_name === "x.pdf", "方口径 → 契约信封（顶层齐备）");
  const re = V.validate(r.envelope);
  ok(re.ok, "方口径产出通过契约校验", re.errors.slice(0, 3).join(" | "));

  const ev = r.envelope.events[0];
  ok(ev.fields.pledge_amount.value === "120000000", "十进制字符串原样搬运（1.2亿元→120000000，未做运算）");
  const nm = ev.fields.pledged_shares_cumulative;
  ok(nm.status === "not_mentioned" && nm.value === null, "★ not_mentioned 显式进fields（契约6态），且不填值");
  ok(ev.fields.pledge_amount.provenance[0].quote === "1.2亿元", "provenance quote 搬运未改写（禁止事后反搜）");
  ok(r.view.bridge.notes.some((n) => n.includes("not_mentioned")), "方口径转换留痕（notes 可查）");
}

// ══════════════════════════════════════════════════════════════
sec("7 不合规数据必须被如实报告，而不是被转接口悄悄改好");
{
  const bad = {
    schema_version: "0.3", run_id: "b", is_mock: false,
    source: { file_name: "b.pdf" },
    events: [{ event_id: "E1", event_type: "pledge", fields: {
      pledgor: { raw_value: "张三", value: "张三", unit: "percent", status: "extracted", provenance: [] }
    } }],
    run_meta: {}
  };
  const r = bridge.toContract(bad);
  ok(r.contract_validation.ok === false, "★ 不合规信封被标不合规（未静默修好）");
  ok(r.contract_validation.errors.length > 0, "违规项逐条列出", `${r.contract_validation.error_count} 条：${r.contract_validation.errors[0]}`);
  // view 仍可渲染（转接口是通道不是裁判）
  ok(Array.isArray(r.view.events) && r.view.events.length === 1, "不合规数据仍产出视图（页面可显示但带违规标记）");
}

// ══════════════════════════════════════════════════════════════
console.log(`\n${"=".repeat(56)}\nPASS ${pass} / FAIL ${fail}\n${"=".repeat(56)}`);
process.exit(fail ? 1 : 0);