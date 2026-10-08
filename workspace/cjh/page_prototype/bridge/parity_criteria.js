// parity_criteria.js —— Web/CLI 对照的**评判标准单一真源**（D14，L4 真跑前置）
//
// ============================================================
// ★ 为什么必须有这个文件（这是 L4 真跑前唯一的卡点）
//
//   现在的 diffEnvelopes() 用 `JSON.stringify(x.value) === JSON.stringify(y.value)`
//   逐字段比 value —— 也就是「逐字节全等」。这个判据对**确定性程序**成立，
//   对 LLM 抽取**必然大面积飘红**：同一个模型、同一份输入，两次跑出来的
//   「1,200,000股」与「1200000股」、「2026年10月8日」与「2026-10-08」、
//   「1.2亿元」与「12000万元」全都是语义相同、字节不同。
//
//   那就出现一个荒谬局面：真跑出 200 处差异，其中 190 处是格式差异，
//   报告上只能写「不一致」——这个结论**没有信息量**，也说服不了任何人。
//   反过来若为了好看把判据放松到"差不多就行"，那就是 D10 造假的同款漏洞
//   （判据一松，真缺陷和格式噪声一起被吞掉）。
//
//   所以判据必须**事先写死、分层、可复核**，而不是跑完看着结果再定。
//
// ============================================================
// ★ 五级判据（S0..S4），从"最硬"到"最软"，逐级放宽
//
//   级别  名称        比什么                期望结果        为什么放在这一级
//   ─────────────────────────────────────────────────────────────────────
//   S0    结构一致    事件配对数/ 事件键集合  必须相等       漏抽整条事件=P0
//   S1    存在性      字段在不在、状态 6 态  必须相等       抽取率/弃权是否正确
//   S2    取值一致    字段值（归一化后）    应当相等       抽出来的对不对
//   S3    出处一致    evidence 可回跳        应当可回跳     抽对了能不能验
//   S4    参考信息    原文 quote 摘录        **不比**       LLM 有温度，摘录必然不同
//
//   ★ S4「不比」是本文件最重要的决定：把原文摘录逐字相比，等于要求 LLM
//     连标点空格都复现。摘录不同**不构成抽取不一致**，只说明"两遍摘了同一段
//     原文的不同长度"。它归入 provenance 核验（`_evidence_quote_real.js`）
//     单独验，不混进 Web/CLI 对照。
//
// ============================================================
// ★ 归一化规则（只做语义等价的机械变换，不做任何"猜测修正"）
//
//   铁律：归一化**只允许**消除书写差异，不允许改变数值含义。
//   反例（禁止）：把「疑似 1.2亿」推成「120000000」——那是猜，不是归一化。
//   正例（允许）：「1.2亿元」→「120000000」（单位换算，值不变）
//
// 每条规则都配了正例/反例，由 demo/_criteria_check.js 双向断言。
//
// ============================================================
// ★ 与 Gold 对账的判据是**另一套**，不要混用
//
//   Web/CLI 对照：两侧都是同契约的抽取产物，比"结构与值"。
//   对Gold 比对：一边是人工标注，比"对不对"，还要按 source.file_id 配文件、
//                按 evKey 配事件（见 bridge/extractor.js 的 evKey）。
//   两者分母不同、结论含义不同，混用就是 D11「准确率 vs 覆盖率」那场架的复现。
"use strict";

const path = require("path");
// ★ 路径铁律：page_prototype/bridge/ → 仓库根要退三级（page_prototype → cjh → workspace → 根），
//   spec/v0.3 在 cjh/ 下所以退两级。退错不报错，只是 require 失败——所以下面有降级。
const REGISTRY_PATH = path.join(__dirname, "..", "..", "spec", "v0.3", "registry.mjs");
let registry = null;
try { registry = require(REGISTRY_PATH); }
catch (e) { registry = { __error: e.code || e.message, __path: REGISTRY_PATH }; }

// ============================================================
// 一、明确「不比」的字段 —— 运行时元数据，与抽取质量无关
// ============================================================
// run_id 每次都不同（含时间戳）、elapsed 是耗时、code_version 可能一侧有另一侧无。
// 拿这些去比，差异数会随"跑了几次"变化，判据就没有可重复性。
const IGNORED_KEYS = new Set([
  "run_id", "run_meta", "generated_at", "created_at", "timestamp",
  "elapsed_ms", "duration_ms", "code_version", "upstream_run_id",
  "source_path", "trace", "debug", "_debug",
]);

// ============================================================
// 二、归一化规则表
// ============================================================
// 每条：{ id, 名称, 适用范围(字段名正则, 空=全部), 变换 }
const RULES = [
  {
    id: "R1_fullwidth",
    name: "全角转半角",
    scope: null,                                  // 全部字段
    apply: s => s.replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
                   .replace(/　/g, " "),
  },
  {
    id: "R2_trim_space",
    name: "去首尾空白 + 折叠连续空白",
    scope: null,
    apply: s => s.trim().replace(/\s+/g, " "),
  },
  {
    //★ 真实数据抓出来的规则：cross_batch 验证发现 method/contract_signed 等
    //   文本字段在两批里差一个句末句号（“…被动稀释” vs “…被动稀释。”）。
    //   句末标点不改变语义，属书写差异；若不归一，真跑会把这类全报成不一致。
    //   ★ 只去**句末**标点，不动句中的 —— "A，B" 与 "A.B" 语义可能不同，不能乱动。
    id: "R2b_trailing_punct",
    name: "去句末标点（中英文句号/分号）",
    scope: null,
    apply: s => s.replace(/[。；;．.\s]+$/, ""),
  },
  {
    id: "R3_number_format",
    name: "数值书写归一（去千分位/去尾零/去前导零）",
    scope: null,
    // 只在"整体就是一个数"时才动，避免把「合计3 项」里的3 抽出来改写。
    apply: s => {
      const m = /^([+-]?)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?$/.exec(s);
      if (!m) return s;
      const sign = m[1] === "-" ? "-" : "";       // ★ "+1200" 与 "1200" 不视作等价
      const num = m[2].replace(/,/g, "");
      const dec = (m[3] || "").replace(/0+$/, "").replace(/\.$/, "");
      const int = num.replace(/^0+(?=\d)/, "");
      return sign + int + dec;
    },
  },
  {
    id: "R4_ratio_percent",
    name: "比例归一（百分号写法 = 百分点写法）",
    // 契约规定比例的 normalized 是百分点字符串（"2.5" 表示 2.5%，不乘100）。
    // 所以 "2.5%" 与 "2.5" 语义相同；"2.5" 与 "0.025" 则是**不同**（后者是被换算错了）。
    scope: /(^|_)(ratio|percent)(_|$)/,
    apply: s => s.replace(/%$/, ""),
  },
  {
    id: "R5_unit_convert",
    name: "中文数量单位换算到基准单位（含去千分位）",
    scope: /(amount|shares|capital|value|bid|price|money)/i,
    // 「1.2亿元」与「12000万元」与「120000000元」必须等价；
    // 「1,200,000股」与「1200000」也必须等价 —— 所以数字部分要允许千分位。
    // ★ 元/股/份是基准单位（乘数 1），剥掉它们不改变数值；万/亿是真换算，必须乘。
    //   反例（禁止）：把「100万元」剥成「100」——那是错值，不是格式差异。
    apply: s => {
      const m = /^([+-]?)(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(亿元|亿|万元|万|元|股|份)(?:\s*(?:人民币|RMB|CNY))?$/.exec(s);
      if (!m) return s;
      const sign = m[1] === "-" ? "-" : "";
      const n = Number(m[2].replace(/,/g, ""));
      if (!isFinite(n)) return s;
      const mul = { "亿元": 1e8, "亿": 1e8, "万元": 1e4, "万": 1e4, "元": 1, "股": 1, "份": 1 }[m[3]];
      const out = n * mul;
      if (!isFinite(out)) return s;
      return sign + (Number.isInteger(out) ? String(out) : String(out));
    },
  },
  {
    id: "R6_date",
    name: "日期归一（YYYY年M月D日 / YYYY-M-D / YYYY/M/D → YYYY-MM-DD）",
    scope: /(^|_)(date|day|start|end|until|from|to)(_|$)/i,
    apply: s => {
      let m = /^(\d{4})\s*[年\-/.]\s*(\d{1,2})\s*[月\-/.]\s*(\d{1,2})\s*日?$/.exec(s);
      if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
      m = /^(\d{4})\s*[年\-/.]\s*(\d{1,2})\s*月?$/.exec(s);      // 只有年月
      if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}`;
      return s;
    },
  },
  {
    id: "R7_date_range",
    name: "区间归一（分隔符统一为 ~）",
    //★ 适用范围不能只看字段名：契约里 change_date 的 unit 是 date_range，
    //   字段名里没有 range/period，照名字猜会整条漏掉（R6 也救不了它——它只认单个日期）。
    //   所以下面 normalizeValue 会用注册表的 unit 追加适用范围。
    scope: null,
    apply: s => s.replace(/\s*(?:~|～|至|到|—|–)\s*/g, "~"),
  },
  {
    id: "R8_direction_zh",
    name: "direction 中译英（契约只允许英文枚举，中文须等价看待）",
    scope: /^direction$/,
    // 契约：equity_change.direction ∈ {increase, decrease}；pledge ∈ {pledge, release}。
    // 上游若填中文「增持」，语义正确但违规（upstream_bridge 会记 notes 并标 pending_review）。
    // 对照判据上，中文「增持」与英文 increase **判为同值**——否则会把"写法违规"
    // 混进"抽取不一致"里，两种缺陷混成一种数，就归不了因。
    apply: s => ({
      "增持": "increase", "减持": "decrease", "增加": "increase", "减少": "decrease",
      "质押": "pledge", "解除质押": "release", "解质押": "release",
    }[s] || s),
  },
  {
    id: "R9_pct_word",
    name: "百分比词写法",
    scope: /(^|_)(ratio|percent)(_|$)/,
    apply: s => s.replace(/百分之([\d.]+)/, "$1"),
  },
];

// ============================================================
// 三、字段分类（读registry —— 不在这里手抄一份事件类型/字段表）
// ============================================================
let FIELD_META = null;      // 懒加载 + 缓存
let REGISTRY_OK = false;
function fieldMeta() {
  if (FIELD_META) return FIELD_META;
  FIELD_META = {};
  REGISTRY_OK = !!(registry && registry.FIELD_REGISTRY);
  if (!REGISTRY_OK) return FIELD_META;
  const R = registry.FIELD_REGISTRY || {};
  for (const [type, fields] of Object.entries(R)) {
    for (const [fname, def] of Object.entries(fields || {})) {
      FIELD_META[fname] = Object.assign({ event_type: type }, def);
    }
  }
  return FIELD_META;
}
/** 注册表是否可用。★ 不可用时判据仍能跑（归一化规则不依赖它），
 *  但报告里必须带这个标记 —— 否则"忘了部署 spec 副本"会静悄悄变成"少了两条规则"。 */
function registryStatus() {
  fieldMeta();
  return {
    ok: REGISTRY_OK,
    path: REGISTRY_PATH,
    fields_loaded: Object.keys(FIELD_META).length,
    event_types: REGISTRY_OK ? (registry.EVENT_TYPES || []) : [],
    error: registry && registry.__error ? String(registry.__error) : null,
  };
}

// ============================================================
// 四、核心：归一化一个字段值
// ============================================================
/**
 * 把字段值归一化为可比较的规范形式。
 * @param {string} field 字段名（决定哪些规则适用）
 * @param {*} value 原始值（null/undefined 原样返回）
 * @returns {{norm:*, applied:string[]}} norm=归一后值；applied=命中的规则 id（用于差异归因）
 */
function normalizeValue(field, value) {
  if (value === null || value === undefined) {
    return { norm: value, applied: [] };
  }
  let s = String(value);
  const applied = [];
  //★ 注册表补充适用范围：unit 决定该字段是什么形态的值。
  //   这是「不手抄一份真源」的用处 —— change_date 的 date_range 只有注册表知道。
  const meta = fieldMeta()[field];
  const unit = meta && meta.unit;
  for (const r of RULES) {
    let applies = r.scope ? r.scope.test(field) : true;
    if (!applies && r.id === "R7_date_range" && unit === "date_range") applies = true;
    if (!applies && r.id === "R4_ratio_percent" && unit === "percent") applies = true;
    if (!applies && r.id === "R5_unit_convert" && (unit === "shares" || unit === "cny")) applies = true;
    if (!applies && r.id === "R6_date" && (unit === "date" || unit === "date_range")) applies = true;
    if (!applies) continue;
    const before = s;
    try { s = r.apply(s); } catch (e) { s = before; }     // 单条规则失败不影响整体
    if (s !== before) applied.push(r.id);
  }
  // 数值结果统一去掉 ".0" 这类无意义差异（120000000 与 1.2e8 同值）
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (isFinite(n)) {
      const t = Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(10)));
      if (t !== s) { applied.push("R3_number_format"); s = t; }
    }
  }
  return { norm: s, applied };
}

/**
 * 单字段判等。**返回差异分类**，不只是 true/false——
 * 不同类差异归不同因，混在一起就归不了因（这是 D11 混用指标那次的教训）。
 *
 * @returns {{equal:boolean, kind:string, a:*, b:*, applied:string[]}}
 *   kind: "same"（字节相同）| "value_format_only"（归一后相同：书写差异）
 *        | "both_empty"（两侧都无值）| "type_only"（数值同但JSON 类型不同：schema 漂移）
 *        | "type"（类型不同且数值不同）| "value"（归一后仍不同：真差异）
 *
 * ★ 为什么 "type_only" 单独归类且**不判异**：
 *   LLM 输出 JSON 时，同一个数字这次给number、下次给 string，是常见波动。
 *   若因此判异，真跑会凭空多出一批「不一致」，报告噪声压过信号；
 *   若完全忽略，schema 漂移就没人看见。折中是：**单列一类、计数上报、不否决**，
 *   报告里能看到「有 N 处 number/string 写法漂移」，需要时再追。
 *   这与"真差异"必须分开——混进 value_diff 就是把噪声当缺陷。
 */
function judgeField(field, a, b) {
  const na = normalizeValue(field, a), nb = normalizeValue(field, b);

  if (a === b) return { equal: true, kind: "same", a, b, applied: [] };

  // 两侧都「没有值」：null / undefined / 空串 / 纯空白 —— 缺证据与缺值同义
  const emptyOf = v => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
  const aEmpty = emptyOf(a), bEmpty = emptyOf(b);
  if (aEmpty && bEmpty) return { equal: true, kind: "both_empty", a, b, applied: [] };
  if (aEmpty !== bEmpty) {
    // 一边有值一边没有 —— 这是最严重的差异之一（抽取率/弃权被吞），单独一类
    return { equal: false, kind: aEmpty ? "b_has_value_a_empty" : "a_has_value_b_empty", a, b, applied: na.applied };
  }

  if (na.norm === nb.norm) {
    // 归一后相同 ⇒ 书写差异，不是抽取差异
    const typeDrift = typeof a !== typeof b;
    return { equal: true, kind: typeDrift ? "type_only" : "value_format_only", a, b, applied: na.applied };
  }
  if (typeof a !== typeof b) return { equal: false, kind: "type", a, b, applied: na.applied };
  return { equal: false, kind: "value", a: na.norm, b: nb.norm, applied: na.applied };
}

// ============================================================
// 五、事件级与信封级判据（S0 / S1 / S2）
// ============================================================
/** 业务键：必须与 extractor.evKey 一致（那边是过桥后，这份是同源） */
function evKeyOf(ev) {
  const f = ev.fields || {};
  const g = n => { const v = f[n]; return v == null ? "" : String(v.value ?? v.raw_value ?? ""); };
  if (ev.event_type === "pledge") return `pledge|${g("pledgor")}|${g("pledgee")}|${g("direction")}`;
  if (ev.event_type === "equity_change") return `equity_change|${g("holder")}|${g("direction")}`;
  return `award_contract|${g("bidder")}|${g("project_name")}`;
}

/**
 * 字段状态：契约 6 态。
 *
 * ★ 踩坑（真实数据抓出来的，不是想当然）：优先级写反过一次。
 *   最初写成 `status_override || status_raw || "extracted"`，
 *   而魏信封 v0.3 的真实字段是 **`status`**（6 态直接放这），`status_override` 根本不存在。
 *   结果所有 not_mentioned / not_applicable / not_disclosed 全被读成 "extracted"，
 *   A侧 not_mentioned vs B侧 not_disclosed 这种**真状态词差异被判为"相同"** ——
 *   一次就把 S1 判据整个废掉了，而表面看是 pass。
 *   教训与 D10 同源：**判据默认值不能是"最宽松的那个"**，
 *   读不到就该显式标记"状态未知"，而不是悄悄当成 extracted。
 *
 * 现在的优先级（依据实测）：
 *   status_override（页面过桥产物带的覆盖状态，优先）
 *   → status（魏信封 6 态原值）
 *   → status_raw（旧契约的原始状态）
 *   → 显式标 "unknown_status"（★ 不是 extracted）
 */
function statusOf(fv) {
  if (!fv || typeof fv !== "object") return "unknown_status";
  const o = fv.status_override || fv.status || fv.status_raw;
  return o ? String(o) : "unknown_status";
}

/**
 * 逐事件比对两个信封，按五级判据给结论。
 * @returns {{s0:object, s1:object, s2:object, s3:object, verdict:string, events:[]}}
 */
function judgeEnvelopes(envA, envB) {
  const rowsA = new Map(), rowsB = new Map();
  for (const ev of envA.events || []) {
    const k = evKeyOf(ev);
    if (!rowsA.has(k)) rowsA.set(k, {});
    const b = rowsA.get(k);
    for (const [n, fv] of Object.entries(ev.fields || {})) {
      b[n] = { status: statusOf(fv), value: fv.raw_value ?? fv.value ?? null, evidence_id: fv.evidence_id || null, evidence_ids: fv.evidence_ids || null };
    }
  }
  for (const ev of envB.events || []) {
    const k = evKeyOf(ev);
    if (!rowsB.has(k)) rowsB.set(k, {});
    const b = rowsB.get(k);
    for (const [n, fv] of Object.entries(ev.fields || {})) {
      b[n] = { status: statusOf(fv), value: fv.raw_value ?? fv.value ?? null, evidence_id: fv.evidence_id || null, evidence_ids: fv.evidence_ids || null };
    }
  }

  // ---- S0 结构 ----
  const keysA = new Set(rowsA.keys()), keysB = new Set(rowsB.keys());
  const onlyA = [...keysA].filter(k => !keysB.has(k));
  const onlyB = [...keysB].filter(k => !keysA.has(k));
  const paired = [...keysA].filter(k => keysB.has(k));

  // ---- S1 存在性 / S2 取值 / S3 出处 ----
  const events = [];
  const s1 = { compared: 0, missing_in_b: 0, missing_in_a: 0, status_diff: 0, same: 0 };
  const s2 = { compared: 0, equal: 0, format_only: 0, value_diff: 0, type_diff: 0,
               type_drift: 0, one_side_empty: 0 };
  const s3 = { compared: 0, both_have: 0, one_missing: 0, both_missing: 0 };

  for (const k of paired) {
    const fa = rowsA.get(k), fb = rowsB.get(k);
    const names = new Set([...Object.keys(fa), ...Object.keys(fb)]);
    const row = { ev: k, fields: [], presence_diff: [], status_diff: [], value_diff: [],
                  format_only: [], type_drift: [], one_side_empty: [], evidence_diff: [] };
    for (const n of names) {
      // S1a 存在性
      if (!fb[n]) { s1.missing_in_b++; row.presence_diff.push({ field: n, side: "b_missing" }); continue; }
      if (!fa[n]) { s1.missing_in_a++; row.presence_diff.push({ field: n, side: "a_missing" }); continue; }
      s1.compared++;
      // S1b 状态
      if (fa[n].status !== fb[n].status) {
        s1.status_diff++; row.status_diff.push({ field: n, a: fa[n].status, b: fb[n].status });
      } else { s1.same++; }
      // S2 取值
      s2.compared++;
      const j = judgeField(n, fa[n].value, fb[n].value);
      if (j.kind === "value_format_only") { s2.format_only++; row.format_only.push({ field: n, a: j.a, b: j.b, rules: j.applied }); }
      else if (j.kind === "type_only") {
        // 数值相同但JSON 类型不同（number vs string）：计数上报，不否决
        s2.type_drift++; row.type_drift.push({ field: n, a_type: typeof fa[n].value, b_type: typeof fb[n].value });
        s2.equal++;
      }
      else if (j.kind === "same" || j.kind === "both_empty") { s2.equal++; }
      else if (j.kind === "a_has_value_b_empty" || j.kind === "b_has_value_a_empty") {
        s2.one_side_empty++; s2.value_diff++;
        row.one_side_empty.push({ field: n, a: fa[n].value, b: fb[n].value });
      }
      else if (j.kind === "type") { s2.type_diff++; s2.value_diff++; row.value_diff.push({ field: n, kind: "type", a: j.a, b: j.b }); }
      else { s2.value_diff++; row.value_diff.push({ field: n, kind: "value", a: j.a, b: j.b, rules: j.applied }); }
      // S3 出处（只判"有没有"，不判"引用的 quote 文字是否相同"——那是 S4）
      s3.compared++;
      const ea = !!(fa[n].evidence_id || (fa[n].evidence_ids || []).length);
      const eb = !!(fb[n].evidence_id || (fb[n].evidence_ids || []).length);
      if (ea && eb) s3.both_have++;
      else if (ea || eb) { s3.one_missing++; row.evidence_diff.push({ field: n, a: ea, b: eb }); }
      else s3.both_missing++;
    }
    events.push(row);
  }

  // ---- 裁决：分级否决 —— 硬级别不通过就不过，不许用软级别的高一致率去掩盖 ----
  const s0pass = onlyA.length === 0 && onlyB.length === 0;
  const s1pass = s1.status_diff === 0 && s1.missing_in_a === 0 && s1.missing_in_b === 0;
  const s2pass = s2.value_diff === 0 && s2.type_diff === 0;      // ★ type_drift 不参与否决
  const s3pass = s3.one_missing === 0;
  const s4pass = true;                                  // ★ 恒真：摘录不比

  const verdict = (s0pass && s1pass && s2pass && s3pass && s4pass) ? "pass" : "mismatch";

  return {
    verdict,
    s0: { pass: s0pass, a_events: keysA.size, b_events: keysB.size, paired: paired.length, only_a: onlyA, only_b: onlyB },
    s1: Object.assign({ pass: s1pass }, s1),
    s2: Object.assign({ pass: s2pass }, s2),
    s3: Object.assign({ pass: s3pass }, s3),
    s4: { pass: true, compared: 0, note: "原文 quote 摘录不参与 Web/CLI 对照（LLM 有温度，摘录必然不同）；其核验走 demo/_evidence_quote_real.js" },
    // 措辞纪律：报告里每层都要印「证明什么/不证明什么」，与 parity_report.js 同一纪律
    phrases: {
      S0: { proves: "两侧抽出的事件条数与业务键集合相同", not_proves: "不证明每条事件里的字段抽对了" },
      S1: { proves: "字段的存在性与 6 态状态相同（没有一边抽到一边弃权）", not_proves: "不证明字段值相同" },
      S2: { proves: "字段值在归一化后相同（书写差异已单列，不算不一致）", not_proves: "不证明出处能回跳原文" },
      S3: { proves: "有值字段在两侧都挂了出处锚点", not_proves: "不证明锚点指向的原文正确（那是出处核验的事）" },
      S4: { proves: "（不比对）", not_proves: "原文摘录逐字相同——本就不比对，要求它成立等于要求 LLM 复现标点" },
    },
    events,
  };
}

// ============================================================
// 六、判据自身的元信息（写进报告脚注，别人才能复核"按什么判的"）
// ============================================================
const CRITERIA_VERSION = "1.0";
const CRITERIA_META = {
  version: CRITERIA_VERSION,
  //★ 引用本判据的任何结论，都必须同时给出这四项，否则不可复现
  required_attribution: ["criteria_version", "s2.value_diff", "s2.format_only", "s2.type_drift", "cases_ran"],
  levels: ["S0 结构", "S1 存在性+状态", "S2 取值（归一化）", "S3 出处存在", "S4 原文摘录（不比）"],
  normalization: RULES.map(r => ({ id: r.id, name: r.name, scope: r.scope ? String(r.scope) : "全部字段" })),
  ignored_keys: [...IGNORED_KEYS],
  registry_source: "spec/v0.3/registry.mjs（事件类型与字段注册表不在本文件手抄，避免两份真源）",
  registry: registryStatus(),
  // ★ 明写不做什么，防止后来者以为这套判据万能
  not_covered_by_these: [
    "跨批召回缺口（两个抽取批的事件数差异属S0，但本页只判Web/CLI 两侧）",
    "对 Gold 的正确性（那是另一套判据：按 source.file_id 配文件 + evKey 配事件）",
    "出处 quote 是否真能在 block.text 里定位（走 demo/_evidence_quote_real.js）",
  ],
  // ★ 单列上报但不否决的项 —— 报告里必须能看到它们，不能因为不否决就消失
  reported_not_vetoed: {
    type_drift: "字段值数值相同但 JSON 类型不同（number vs string）：LLM 输出的常见波动。计数上报、**不否决**，否则凭空多出一批假不一致",
    format_only: "书写差异（1.2亿元 vs 120000000）：归一后相同。计入 s2.format_only，**不否决**，但必须报告 —— 差异全是这类就等于没跑",
  },
};

module.exports = {
  CRITERIA_VERSION, CRITERIA_META,
  RULES, IGNORED_KEYS,
  normalizeValue, judgeField, judgeEnvelopes, evKeyOf, statusOf, fieldMeta, registryStatus,
};