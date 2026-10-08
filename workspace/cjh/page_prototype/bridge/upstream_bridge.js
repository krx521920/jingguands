// upstream_bridge.js —— 转接口（上游格式 → 契约 v0.3）
//
// ★★★ 契约优先（2026-10-08 D15，按领导指示 + 项目计划书建议性文件改造）★★★
//
// 【为什么改成契约优先】改造前本文件产出的是「页面私有约定」：
//   顶层 data_mode / source_file / evidences / bridge / integrity，字段层value/unit/
//   normalized/evidence_id/status_override —— **与interface/event-envelope.schema.json
//   正式契约的字段名和结构全不一致**（契约要is_mock/source/run_meta，字段要
//   raw_value/standardized/status/provenance[]）。计划书 §三/§四 的可核验设计
//   （出处随数据生成、口径作为数据字段、错误填充率单列）全部以正式契约为载体，
//   页面私有字段无法被机器校验，也无法直接入库给下游。
//
// 【现在的做法】契约本体 + 视图投影，两层分离：
//   envelope —— 严格符合 event-envelope.schema.json v0.3（additionalProperties=false），
//               可机器校验（bridge/contract_validate.js）、可直接入库、可给评测方；
//               信封的§九「输出格式合规率 100%」由此可核。
//   view     —— 页面渲染用的投影层（normalized/evidence_id/status_override/evidences[]/
//               integrity…），**从 envelope 派生**，不是独立真源。前端零改动。
//   ★ 视图字段绝不写进 envelope：契约 additionalProperties=false，塞进去即违规。
//
// 【原则】继承口径字典 + 计划书 §四：
//   - 数值一律十进制字符串，禁止二进制浮点；
//   - 比例 normalized = 百分点字符串（"2.5" 表示 2.5%），不乘 100；
//   - not_mentioned 不猜不留空；unreadable 诚实降级；
//   - 模型只找数不算数（计划书 §四.1）—— 转接口不做任何数值运算，只搬运与标注；
//   - 出处随数据生成（§四.2）—— 转接口只搬运 provenance，绝不事后按数字反搜 quote。
"use strict";

const { validate: validateContract, REGISTRY, NO_VALUE_STATUS } = require("./contract_validate.js");

// 方口径 status → 页面处理策略
//   present       → 正常产出（success）
//   explicit_zero → 正常产出（success，value="0"）
//   not_mentioned → 不产出字段，记入 bridge.notes（缺失≠零）
//   unreadable    → 产出字段但 status_override=unreadable（诚实降级）
const KIND_DEFAULT_FIELD = { amount: "amount", shares: "share_count", ratio: "pledge_ratio" };

// 魏文宇信封 v0.3b：unit 枚举 → 页面显示单位（date/date_range/text/count 不拼单位后缀）
// date_range（D3 增补）：ISO 区间 "start/end"，展示原样
const WEI_UNIT_TEXT = { shares: "股", cny: "元", percent: "%", date: null, date_range: null, text: null, count: null };

// v0.4 D4 增补：direction 业务方向（宗 17:30 裁决）——pledge/release
// D5/D6 增补：equity_change 方向 increase/decrease（与 results.js 的 DIRECTION_TEXT 保持同步）
const DIRECTION_TEXT = { pledge: "质押", release: "解除质押", increase: "增持", decrease: "减持" };

// 契约 registry.mjs：equity_change.direction「必须填英文枚举 increase 或 decrease，禁止中文」
// 页面不做静默兜底（results.js 原本会原样显示中文，等于替上游掩盖契约违规）——
// 非英文枚举时记入 bridge.notes 并把该事件标pending_review，让违规可见（2026-10-07 契约复核 GAP-03）
const DIRECTION_ENUM_BY_TYPE = {
  equity_change: ["increase", "decrease"],
  pledge: ["pledge", "release"]
};

/** direction 是否为契约允许的英文枚举；null/空值视为未填（交由状态机处理，不在此报错） */
function directionViolatesContract(eventType, rawValue) {
  const allowed = DIRECTION_ENUM_BY_TYPE[eventType];
  if (!allowed) return false;                // award_contract 注册表无 direction 字段
  if (rawValue == null || rawValue === "") return false;
  return !allowed.includes(String(rawValue).trim());
}

// v0.3b D3：provenance.source_type 枚举（与张智博 finstruct 对齐）
const SOURCE_TYPE_TEXT = {
  paragraph: "段落", cell: "表格单元格", table: "表格兜底（降权）",
  scan_region: "扫描区域", document: "整份文档"
};

// 魏文宇信封 v0.3：6 状态 → 页面处理策略（README §四：6 态全渲染）
//   extracted      → 正常产出（无 override）
//   needs_review   → status_override=pending_review（可有候选值）
//   unreadable     → status_override=unreadable
//   not_disclosed  → status_override=not_disclosed（原文明示未披露，不推断）
//   not_applicable → status_override=not_applicable（结构性不适用）
//   not_mentioned  → status_override=not_mentioned（原文未提及；信封要求 6 态全渲染，
//                     与方口径记录的 not_mentioned"不产出"规则不同——各自忠实体源语义）
const WEI_STATUS_MAP = {
  extracted: null,
  needs_review: "pending_review",
  unreadable: "unreadable",
  not_disclosed: "not_disclosed",
  not_applicable: "not_applicable",
  not_mentioned: "not_mentioned"
};

// 分母枚举中文（口径字典 §3）
const DENOMINATOR_TEXT = {
  total_share_capital: "公司总股本",
  holder_shares: "指定股东所持股份",
  net_assets: "指定口径净资产",
  other: "其他明确定义"
};

/** 判断是否魏文宇事件信封 v0.3（interface/event-envelope.schema.json）。 */
function isWeiEnvelope(obj) {
  return !!obj && typeof obj === "object" &&
    obj.schema_version === "0.3" && Array.isArray(obj.events) && typeof obj.is_mock === "boolean";
}

/** 判断 JSON 是否为上游格式（非契约对象）。契约对象以 schema_version + events 为特征。 */
function isUpstream(obj) {
  return !!obj && typeof obj === "object" &&
    !(typeof obj.schema_version === "string" && Array.isArray(obj.events));
}

/** 判断是否 D1 骨架期的旧版信封（v0.1/v0.2，页面私有约定）。
 *  特征：schema_version 是 0.1/0.2 + 顶层有 data_mode/source_file/evidences（v0.3 已无这些）。
 *  ★ 这类对象会被 isUpstream 判false（它有 schema_version + events），
 *    所以必须**先于**契约透传分支识别，否则会被当v0.3 契约对象原样放行、报出一堆
 *    「additionalProperties 不允许 data_mode」的假违规。 */
function isLegacyEnvelope(obj) {
  if (!obj || typeof obj !== "object" || !Array.isArray(obj.events)) return false;
  const sv = String(obj.schema_version || "");
  if (!/^0\.[12]$/.test(sv)) return false;
  // v0.3 顶层6 项必填里没有 data_mode/source_file/evidences —— 有则是旧版
  return "data_mode" in obj || "source_file" in obj || "evidences" in obj;
}

/** 旧版字段名 → v0.3 注册表字段名（**只映射语义等价的**，不做近似猜测）。
 *  依据是三方对齐过的口径：旧 share_count 就是本次质押股数，pledge_ratio 就是占其所持比例。
 *  ★ 不在表里的旧字段名一律不猜 —— 上表没有的进notes 上报，由人决定。 */
const LEGACY_FIELD_ALIAS = {
  pledge: {
    pledgor: "pledgor",
    pledgee: "pledgee",
    share_count: "pledged_shares_this_time",
    pledge_ratio: "pledged_ratio_this_time_of_held",
    announce_date: "announcement_date",
    start_date: "start_date",
    end_date: "end_date",
    purpose: "purpose"
  }
};

/** 旧版单位写法（中文/百分号/裸数字）→ v0.3 契约 unit 枚举。
 *  ★ 映射按"值长什么样"而不是"字段叫什么"—— 旧版 unit 是给人看的显示值。 */
function legacyUnitToContract(oldUnit, value, eventType, fieldName) {
  const spec = (REGISTRY.FIELD_REGISTRY[eventType] || {})[fieldName];
  if (spec) return spec.unit;               // 注册表是唯一真源，优先于一切猜测
  const u = String(oldUnit == null ? "" : oldUnit).trim();
  if (["shares", "cny", "percent", "date", "date_range", "text", "count"].includes(u)) return u;
  if (u === "股") return "shares";
  if (u === "元") return "cny";
  if (u === "%") return "percent";
  if (u === "股数") return "shares";
  if (u === "金额") return "cny";
  if (u === "比例") return "percent";
  if (u === "日期" || u === "时间") return "date";
  if (u === "天") return "count";
  if (!u && typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return "date";
  return "text";
}

/** 旧版 status_override → v0.3 契约 status。
 *  旧版语义：null=正常产出、pending_review=待复核、unreadable=读不出、not_disclosed=未披露。 */
const LEGACY_STATUS_MAP = {
  pending_review: "needs_review",       // 旧"待复核" → 新needs_review（契约枚举名不同，语义同）
  unreadable: "unreadable",
  not_disclosed: "not_disclosed",
  not_applicable: "not_applicable",
  not_mentioned: "not_mentioned",
  extracted: "extracted"
};

/** D1 骨架期旧版信封（v0.1/v0.2页面私有约定）→ 契约 v0.3 信封本体。
 *
 *【领导 2026-10-08 裁定】转接口起**兼容作用**：
 *   - 旧实现与新规范**功能相同**的 → 兼容进同一个转接口（本函数就是）；
 *   - **不能兼容**的旧实现 → 做工程实践上的**告知**（记notes + 事件标 needs_review），
 *     优先采纳新规范 v0.3，不为了迁就旧数据而违反契约。
 *
 * 【为什么必须转而不是原样透传】旧版信封顶层有 data_mode/source_file/evidences、
 *   字段层有 normalized/evidence_id/status_override/event_id 用 `evt-0001`——
 *   全部违反 v0.3（additionalProperties=false + event_id pattern ^E[0-9]+$）。
 *   原样透传会让「输出格式合规率」永远不可能到 100%。
 *
 *  ★ 不做的事：不猜语义（无映射的字段名直接记 notes 上报）、
 *   不做数值运算（旧版 normalized 只是字符串，原样搬进 value）、
 *   不动取值（模型只找数不算数）。
 */
function fromLegacyEnvelope(up) {
  const notes = [];
  const evById = new Map(up.evidences || []).constructor === Map
    ? new Map((up.evidences || []).map((e) => [e.evidence_id, e]))
    : new Map();

  const events = (up.events || []).map((ev, evIndex) => {
    // 旧 event_id `evt-0001` → 契约要求 ^E[0-9]+$。取尾部数字，无数字则按序号。
    const digits = String(ev.event_id || "").match(/(\d+)\s*$/);
    const newId = "E" + (digits ? digits[1] : String(evIndex + 1));
    if (newId !== ev.event_id) {
      notes.push(`events[${evIndex}].event_id: 旧版「${ev.event_id}」→ 契约「${newId}」（契约要求 ^E[0-9]+$；不改会导致格式合规率永远不到 100%）`);
    }

    // ★ 不可兼容的硬判定：事件类型不在 v0.3 三类内 → 告知，不硬塞进 pledge
    const evType = ev.event_type;
    const typeKnown = (REGISTRY.EVENT_TYPES || []).includes(evType);
    if (!typeKnown) {
      notes.push(`events[${evIndex}](${ev.event_id}).event_type=「${evType}」不在 v0.3 事件类型 [${(REGISTRY.EVENT_TYPES || []).join(" / ")}] 内 —— `
        + `**不可兼容，已如实告知不强行映射**。优先采纳 v0.3：需该类型请走契约变更流程（interface/README.md 第八节）扩事件类型与注册表。`);
    }

    const alias = LEGACY_FIELD_ALIAS[evType] || {};
    const fields = {};
    for (const [oldName, f] of Object.entries(ev.fields || {})) {
      const newName = alias[oldName];
      if (!newName) {
        // 字段名无等价映射 → 告知，不猜（猜错＝制造假数据，比缺字段更糟）
        notes.push(`events[${evIndex}].${oldName}: 旧版字段名在 v0.3 ${evType} 注册表中无等价映射 —— **不猜测、不产出**，`
          + `该字段需人工确认后补入注册表或改上游字段名`);
        continue;
      }
      if (typeKnown && !(REGISTRY.FIELD_REGISTRY[evType] || {})[newName]) {
        notes.push(`events[${evIndex}].${oldName}→${newName}: 目标字段不在 v0.3 ${evType} 注册表内，字段未产出`);
        continue;
      }

      const status = LEGACY_STATUS_MAP[f.status_override || "extracted"] || "needs_review";
      const evd = evById.get(f.evidence_id);
      // 出处：旧版 evidences[] → 契约 provenance[]。旧版 evidence_id 是外键，必须真能查到，
      // 查不到就如实留空（有值无出处会被契约校验器判违规，正是我们要暴露的问题）。
      const provenance = evd ? [{
        block_id: evd.block_id ?? null,
        source_type: evd.source_type ?? (evd.cell_ref ? "cell" : "paragraph"),
        page: evd.page ?? null,
        region: evd.bbox ?? evd.region ?? null,
        table_id: evd.table_id ?? null,
        cell_ref: evd.cell_ref ?? null,
        quote: evd.quote ?? ""
      }] : [];
      if (!evd && f.evidence_id) {
        notes.push(`events[${evIndex}].${newName}:引用 evidence_id「${f.evidence_id}」在旧版 evidences[] 中查不到 —— 出处留空（如实上报，不编造）`);
      }

      const hasValue = f.value !== null && f.value !== undefined && f.value !== "";
      const nf = {
        raw_value: hasValue ? String(f.value) : null,
        value: hasValue ? f.value : null,
        unit: legacyUnitToContract(f.unit, f.value, evType, newName),
        status,
        provenance
      };
      // ★ standardized 不推导（领导裁定）：判定"是否已标准化"需要做数值运算，
      //   违反"模型只找数不算数"。旧版根本没有这个信息 → 一律不产出。
      if (nf.unit === "percent" && nf.status === "extracted") {
        // 分母由字段名固定（注册表 fixedDenominator）——这是查表不是运算
        const spec = (REGISTRY.FIELD_REGISTRY[evType] || {})[newName] || {};
        if (spec.fixedDenominator) nf.denominator = spec.fixedDenominator;
      }
      if (f.status_override) nf.note = `旧版 status_override=${f.status_override}`;
      fields[newName] = nf;
    }

    const out = { event_id: newId, event_type: evType, fields };
    if (!typeKnown) {
      // 不可兼容的事件：仍交付（不丢数据），但明确标记待人工处置
      out.notes = `事件类型「${evType}」不在 v0.3 契约内 —— 不可兼容，如实告知；v0.3 为准`;
      out.extraction_method = "mock";        // 契约枚举内的合法值；旧版无此信息，不编造来源
    }
    return out;
  });

  const envelope = {
    schema_version: "0.3",
    run_id: up.run_id || "legacy-run-0001",
    is_mock: up.data_mode === "simulated",
    source: {
      file_id: up.source_file?.file_id ?? null,
      file_name: up.source_file?.filename || "unknown",
      file_sha256: up.source_file?.sha256 ?? null,
      parse_meta: null
    },
    events,
    run_meta: {
      entry: "tool",
      model: null,
      started_at: "",
      duration_ms: null,
      code_version: "",
      interface_version: "v0.3",
      errors: [`旧版信封 schema_version=${up.schema_version}（v0.1/v0.2 页面私有约定）已由转接口升到 v0.3`]
    }
  };
  notes.unshift(`旧版信封 v${up.schema_version} → v0.3：兼容转换 ${events.length} 个事件`
    + `（顶层骨架补齐 is_mock/source/run_meta，字段名按注册表映射，出处 evidences[]→provenance[]）`);
  return { envelope, notes, integrity: null, check_report: null };
}

/** 入口：识别顺序——旧版 v0.1/v0.2 信封 → wei v0.3 信封 → 契约对象透传 → 方口径记录 → 未知透传留痕。
 *  ★ 旧版必须**排在契约对象透传之前**：旧版也有 schema_version + events，
 *    放后面会被当v0.3 原样放行，报出一堆「data_mode 不允许出现」的假违规。
 *  返回 { envelope, view }：envelope 是契约本体，view 是页面投影。 */
function toContract(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (isLegacyEnvelope(obj)) return finalize(fromLegacyEnvelope(obj));
  if (isWeiEnvelope(obj)) return finalize(fromWeiEnvelope(obj));
  if (!isUpstream(obj)) return finalize({ envelope: obj });     // 已是契约对象（v0.1/v0.2/v0.3）
  if (obj.bridge === "fang-normalization-v0.1") return finalize(fromFangRecords(obj));
  // 未知上游格式：不猜测，原样透传并留痕（信封按契约骨架包一层，notes 说明无法判定）
  return finalize({
    envelope: {
      schema_version: "0.3",
      run_id: obj.run_id || "unknown-upstream",
      is_mock: false,
      source: { file_id: null, file_name: (obj.source_file && obj.source_file.filename) || "unknown", file_sha256: null, parse_meta: null },
      events: [],
      run_meta: { entry: "tool", model: null, started_at: "", duration_ms: null, code_version: "", interface_version: "v0.3", errors: [] }
    },
    notes: ["unknown upstream format（不猜测，原样透传；事件未进入契约）"],
    passthrough: obj
  });
}

/** 两层封口：补齐契约必填项→ 机器校验 → 派生 view。
 *  ★ 契约不合法时**不抛异常也不静默**：envelope 照原样交付，
 *    contract_validation 带全部违规项，由消费方（页面/导出/评测）自行决定是否采信。
 *    理由：转接口是通道不是裁判——它如实报告"这份数据不合契约"，比替上游改数据更诚实。 */
function finalize(built) {
  const envelope = built.envelope;
  const validation = validateContract(envelope);
  const view = projectView(envelope, { notes: built.notes || [], passthrough: built.passthrough || null, integrity: built.integrity || null, check_report: built.check_report || null });
  view.contract_validation = validation;
  // 视图挂在 envelope 上会破坏 additionalProperties=false ⇒ 只在返回对象上并列
  return { envelope, view, contract_validation: validation };
}

/** 契约本体 → 页面视图投影。
 *  页面要的 normalized/evidence_id/status_override/evidences[] 全部在这里从契约派生，
 *  保证「页面所见 = 契约所载」，不存在两份真源。
 *  ★★ 严禁往 envelope 上写任何东西（含 `_view` 这类内部标记）：
 *     契约 additionalProperties=false，事后挂标记＝绕过自己的校验器，
 *     且会让"校验通过"变成假象（与 D10 造假同款：先过检后动手）。
 *     需要中间态就用局部 Map，不碰信封对象。 */
function projectView(envelope, extra = {}) {
  const evidences = [];
  // Map<EventFieldObject, string[]>：证据 id 只存在视图侧的旁路表里，不回写信封
  const evidenceIdsOf = new Map();
  // ★ 错误填充线索（计划书 §四.4）：status 说"未提及/未披露"却带着值 —— 幻觉的机械证据。
  //   **如实上报，绝不静默抹值**：抹掉＝替上游改数据＝掩盖错误填充率这个一级指标。
  const phantomHits = [];
  for (const ev of envelope.events || []) {
    for (const [name, fv] of Object.entries(ev.fields || {})) {
      const provs = Array.isArray(fv.provenance) ? fv.provenance : [];
      const ids = [];
      for (const p of provs) {
        const eid = "ev-" + String(evidences.length + 1).padStart(4, "0");
        evidences.push({
          evidence_id: eid,
          block_id: p.block_id ?? null,
          page: p.page ?? null,
          bbox: p.region ?? null,
          source_type: p.source_type ?? null,
          table_id: p.table_id ?? null,
          cell_ref: p.cell_ref ?? null,
          quote: p.quote ?? ""
        });
        ids.push(eid);
      }
      evidenceIdsOf.set(fv, ids);
      if (NO_VALUE_STATUS.has(fv.status) && fv.value !== null && fv.value !== undefined && fv.value !== "") {
        phantomHits.push({ field: `${ev.event_id}.${name}`, status: fv.status, value: fv.value });
      }
    }
  }
  // 事件/字段视图：把契约 6 态映射为页面 status_override（渲染层只认这一套）
  const events = (envelope.events || []).map((ev) => {
    const out = { event_id: ev.event_id, event_type: ev.event_type, status: "success", fields: {} };
    if (ev.extraction_method) out.extraction_method = ev.extraction_method;
    for (const [name, fv] of Object.entries(ev.fields || {})) {
      const ids = evidenceIdsOf.get(fv) || [];
      const f = {
        value: fv.raw_value ?? fv.value ?? null,
        unit: null,
        normalized: fv.value === null || fv.value === undefined ? null : String(fv.value),
        normalized_unit: WEI_UNIT_TEXT[fv.unit] ?? null,
        evidence_id: ids[0] || null
      };
      if (ids.length > 1) f.evidence_ids = ids;
      // raw_value 自带单位时不重复拼 display unit
      if (fv.raw_value == null) f.unit = WEI_UNIT_TEXT[fv.unit] ?? null;
      f.status_raw = fv.status;
      const ov = WEI_STATUS_MAP[fv.status];
      if (ov) f.status_override = ov;
      if (fv.denominator) f.denominator = { kind: fv.denominator, kind_text: DENOMINATOR_TEXT[fv.denominator] || fv.denominator, definition: null };
      if (fv.note) f.note = fv.note;
      out.fields[name] = f;
    }
    const ovs = Object.values(out.fields).map((f) => f.status_override);
    if (ovs.includes("unreadable") || ovs.includes("pending_review") || out.direction_contract_violation) out.status = "pending_review";
    return out;
  });
  //direction 契约违规标记从信封 notes 回挂（视图层消费，契约本体不放）
  for (const ev of events) {
    if ((extra.notes || []).some((n) => n.startsWith(ev.event_id + ".direction:"))) ev.direction_contract_violation = true;
  }
  const view = {
    run_id: envelope.run_id,
    schema_version: envelope.schema_version,
    data_mode: envelope.is_mock ? "simulated" : "real",
    source_file: {
      file_id: envelope.source?.file_id ?? null,
      filename: envelope.source?.file_name ?? null,
      sha256: envelope.source?.file_sha256 ?? null,
      parse_status: "success"
    },
    events,
    evidences,
    bridge: {
      from: "contract-v0.3",
      rules: "契约为本体，view 为投影；6 状态全渲染；percent=百分点；provenance[]→多证据；region 原样保留",
      notes: extra.notes || []
    },
    contract_validation: null            // 由 finalize 回填
  };
  if (envelope.run_meta) view.run_meta = envelope.run_meta;
  if (envelope.source?.parse_meta) view.source_file.parse_meta = envelope.source.parse_meta;
  // ★ 字段位恒在（无 sidecar 时为 null），不能"有时不设"：
  //   消费方无法区分「这份数据没有方核验报告」与「投影漏挂了」——
  //   前者是事实，后者是bug，混成undefined 就把 bug 藏起来了。
  view.check_report = extra.check_report || null;
  view.integrity = extra.integrity || checkIntegrity(events, evidences);
  // ★ 错误填充率的一级指标线索（计划书 §四.4）。单列成块，不混进字段——
  //   它是"对整份信封的判断"，不是某个字段的属性。
  view.error_fill_audit = {
    phantom_count: phantomHits.length,
    fields_compared: Object.values(view.events).reduce((n, ev) => n + Object.keys(ev.fields || {}).length, 0),
    phantom_fields: phantomHits.slice(0, 20),
    reads: "状态声明「原文未提及/未披露/不适用」却带着取值 —— 属计划书 §四.4 的错误填充，原样上报不抹除",
  };
  return view;
}

/** 张智博 evidence/0.9 缺失原因码 → 中文（扫描降级块：只断言"读不出字"，无原文可引） */
const MISSING_REASON_TEXT = {
  NOT_PARSED: "该区域无文本层（扫描件）",
  ILLEGIBLE: "字迹不可辨认",
  DEGRADED: "来源质量降级"
};

/** 断链/错位完整性检查（D3：与魏/张修断链错位的落地；D4 增补扫描降级检查）。
 *  返回 { ok, issues[] }；issue = { level, where, what }，level: error（断链）| warn（降权）。 */
function checkIntegrity(events, evidences) {
  const issues = [];
  const idSet = new Set(evidences.map(e => e.evidence_id));

  for (const ev of events) {
    for (const [name, f] of Object.entries(ev.fields)) {
      const where = `${ev.event_id}.${name}`;
      // ① 有值字段必须有出处（not_mentioned 等空态除外）
      const hasValueState = !f.status_override || f.status_override === "pending_review";
      if (hasValueState && f.normalized != null && !f.evidence_id) {
        issues.push({ level: "error", where, what: "有值但无出处（断链）" });
      }
      // ② 引用的 evidence_id 必须存在于 evidences[]（引用完整）
      for (const eid of [f.evidence_id, ...(f.evidence_ids || [])]) {
        if (eid && !idSet.has(eid)) issues.push({ level: "error", where, what: `引用不存在的证据 ${eid}` });
      }
      // ③ D4：有值字段的所有出处都是扫描降级块 → 值缺乏可核验原文（warn 降权，不算断链）
      if (hasValueState && f.normalized != null && f.evidence_id) {
        const evs = (f.evidence_ids || [f.evidence_id]).map(id => evidences.find(e => e.evidence_id === id)).filter(Boolean);
        if (evs.length && evs.every(e => e.source_type === "scan_region" || e.degraded)) {
          issues.push({ level: "warn", where, what: "值仅由扫描降级块支撑（无文本层原文可核验，建议降权/人工复核）" });
        }
      }
    }
  }
  // ④ 表格单元格出处必须带 table_id + cell_ref（契约：表格证据不许丢失）
  for (const e of evidences) {
    if (e.source_type === "cell" && (!e.table_id || !e.cell_ref)) {
      issues.push({ level: "error", where: e.evidence_id, what: "cell 出处缺 table_id/cell_ref（表格证据丢失）" });
    }
    if (e.source_type === "table") {
      // 张智博 D3 约定：table 兜底块必带 degraded:true，消费方降权
      issues.push({ level: "warn", where: e.evidence_id, what: "table 兜底块出处（未归入检出单元格，建议降权）" });
    }
    if (e.source_type === "scan_region" && e.degraded && !e.missing_reason) {
      // 张智博 evidence/0.9：扫描降级块必须带 missing_reason，缺失说明上游结构不完整
      issues.push({ level: "warn", where: e.evidence_id, what: "扫描降级块缺 missing_reason（降级原因未声明）" });
    }
  }
  return { ok: !issues.some(i => i.level === "error"), issues };
}

/** 魏文宇事件信封 v0.3 → 契约 v0.3 信封本体（字段只增不改）。
 *  ★ 输入输出同构：魏信封本身已符合契约，本函数做的是①规范化②补 run_meta③记 notes，
 *    **不改数值、不改状态语义**（模型只找数不算数，计划书 §四.1）。
 *  D5：up.check_report（方的 equity_check_D5 旁路核验报告）→ 事件挂 checks[]。 */
function fromWeiEnvelope(up) {
  const notes = [];

  // 方冲突码报告：按 event_id / event_index 建索引（信封内事件 id 可重复于多文件合并场景，索引优先）
  const checksBy = new Map();
  if (up.check_report && Array.isArray(up.check_report.events)) {
    for (const c of up.check_report.events) {
      if (typeof c.event_index === "number") checksBy.set("#" + c.event_index, c);
      if (c.event_id) checksBy.set(c.event_id, c);
    }
  }

  const events = up.events.map((ev, evIndex) => {
    const out = {
      event_id: ev.event_id,
      event_type: ev.event_type,             // v0.3：pledge | equity_change | award_contract（bid_won 已改名）
      fields: {}
    };
    if (ev.extraction_method) out.extraction_method = ev.extraction_method;

    // 方核验 findings 挂事件（code/severity/fields/message 原样，不猜测不翻译码值）
    // ★ findings 不进契约 fields ——契约 additionalProperties=false，挂在事件 notes 里留痕
    const c = checksBy.get(ev.event_id) ?? checksBy.get("#" + evIndex);
    const checkLines = [];
    if (c && Array.isArray(c.findings) && c.findings.length) {
      for (const f of c.findings) checkLines.push(`[方核验] code=${f.code} severity=${f.severity} fields=${(f.fields || []).join("/")} ${f.message || ""}`);
    }
    if (c && c.calculations) checkLines.push(`[方核验计算] ${JSON.stringify(c.calculations).slice(0, 300)}`);

    for (const [name, fv] of Object.entries(ev.fields || {})) {
      if (WEI_STATUS_MAP[fv.status] === undefined) {
        notes.push(`${ev.event_id}.${name}: 未知 status=${fv.status}（不猜测，字段未产出）`);
        continue;
      }

      //契约字段（field_value）：raw_value / value / unit / standardized / status / provenance / denominator / note
      const f = {
        raw_value: fv.raw_value ?? null,
        value: fv.value ?? null,
        unit: fv.unit,                                   // 契约枚举，原样保留（不猜不补）
        status: fv.status,                               // 契约 6 态，原样保留
        provenance: Array.isArray(fv.provenance) ? fv.provenance.map((p) => ({
          block_id: p.block_id ?? null,
          source_type: p.source_type ?? null,
          page: p.page ?? null,
          region: p.region ?? null,                       // [l,t,r,b] PDF 点、左上原点、y 向下
          table_id: p.table_id ?? null,
          cell_ref: p.cell_ref ?? null,
          quote: p.quote ?? ""
        })) : []
      };
      // standardized：契约定义为 boolean —— 由上游声明是否已标准化。
      // ★ 转接口不自行判定（那需要做数值运算＝违反"模型只找数不算数"），只在上游明确给出时透传
      if (typeof fv.standardized === "boolean") f.standardized = fv.standardized;
      if (fv.denominator) f.denominator = fv.denominator; // v0.3 四值枚举
      if (fv.note) f.note = fv.note;

      // GAP-03：direction 违反契约英文枚举 → 记 notes（不在契约里造字段，只让违规可见）
      if (name === "direction" && directionViolatesContract(ev.event_type, fv.value)) {
        notes.push(`${ev.event_id}.direction: 值「${fv.value}」不在契约枚举 [${DIRECTION_ENUM_BY_TYPE[ev.event_type].join(" / ")}] 内（registry 要求英文枚举，禁止中文）`);
        // 契约要求 6 态之一；needs_review 是契约合法态，用它承载"待人工确认"而非新增状态
        if (f.status === "extracted") f.status = "needs_review";
      }

      if (checkLines.length) f.note = [f.note, ...checkLines].filter(Boolean).join("；");
      out.fields[name] = f;
    }
    if (checkLines.length && !Object.values(out.fields).some((f) => f.note)) out.notes = checkLines.join("；");

    return out;
  });

  const envelope = {
    schema_version: "0.3",
    run_id: up.run_id || "wei-run-0001",
    is_mock: up.is_mock === true,
    source: {
      file_id: up.source?.file_id ?? null,
      file_name: up.source?.file_name || "unknown",
      file_sha256: up.source?.file_sha256 ?? null,
      parse_meta: up.source?.parse_meta ?? null
    },
    events,
    run_meta: Object.assign({
      entry: "cli",
      model: null,
      started_at: "",
      duration_ms: null,
      code_version: "",
      interface_version: "v0.3",
      errors: []
    }, up.run_meta || {})
  };
  // ★ 方核验报告全文**不进信封**：契约 additionalProperties=false，往envelope 挂
  //   `__check_report` 会让「输出格式合规率 100%」永远不可能达成（校验器必报违规）。
  //   与 D15 projectView 往信封写 `_view` 是同一个坑（先过检后动手绕过自己的校验器）。
  //   报告全文由 projectView 从 check_report 参数投影进视图侧，全仓库无人读 envelope.__check_report。
  return {
    envelope,
    notes,
    integrity: null,   // 完整性检查在 projectView 里对着视图做（视图才有 evidence_id）
    check_report: up.check_report || null
  };
}

/** 方口径标准化记录 → 契约 v0.3 信封本体。
 *  ★ 方口径的三态（present/explicit_zero/not_mentioned/unreadable）必须映射到**契约 6 态**，
 *    映射表写死在这里，不猜测：present→extracted、explicit_zero→extracted(0)、
 *    not_mentioned→not_mentioned（契约允许该态直接进fields，不产出字段是页面私有约定，违反契约）、
 *    unreadable→unreadable。 */
const FANG_STATUS_MAP = {
  present: "extracted",
  explicit_zero: "extracted",
  not_mentioned: "not_mentioned",
  unreadable: "unreadable"
};

/** 方口径 rec → 契约 unit 枚举。
 *  ★ 优先级：注册表按字段名查（契约唯一真源）→ 上游声明但与注册表冲突时**采用注册表并留痕**。
 *    查注册表而不是按 kind 猜：kind 是方口径的分类（amount/shares/ratio），
 *    与契约 unit（cny/shares/percent/text…）不是一套词表，按 kind 映射迟早对不上。
 *  ★ 用返回值而不是模块级变量记冲突：模块级数组在并发请求下会串味。 */
function resolveUnit(rec, event_type, field, notes) {
  const spec = (REGISTRY.FIELD_REGISTRY[event_type] || {})[field];
  if (!spec) {
    if (rec.unit) notes.push(`${field}: 不在 ${event_type} 注册表中，unit 沿用上游 "${rec.unit}"（契约校验器会报越界）`);
    return rec.unit || "text";
  }
  if (rec.unit && rec.unit !== spec.unit) {
    notes.push(`${field}: 上游 unit="${rec.unit}" 与注册表 "${spec.unit}" 不一致 —— 采用注册表（契约优先）`);
  }
  return spec.unit;
}

/** 方口径标准化记录 → 契约 v0.3 信封本体。 */
function fromFangRecords(up) {
  const notes = [];
  const eventsBy = new Map();   // event_id → event

  for (const rec of up.records || []) {
    const eid = rec.event_id || "evt-unknown";
    if (!eventsBy.has(eid)) {
      eventsBy.set(eid, {
        event_id: eid.replace(/^evt-/, "") === eid ? eid : eid,   // event_id 契约要求 ^E[0-9]+$
        event_type: rec.event_type || "pledge",
        fields: {}
      });
    }
    const ev = eventsBy.get(eid);

    // 方口径 evidence → 契约 provenance[]（单元格级出处必须带 table_id/cell_ref）
    const provenance = [];
    if (rec.evidence && typeof rec.evidence === "object") {
      provenance.push({
        block_id: rec.evidence.block_id ?? null,
        source_type: rec.evidence.source_type ?? (rec.evidence.cell_ref ? "cell" : "paragraph"),
        page: rec.evidence.page ?? null,
        region: rec.evidence.region ?? rec.evidence.bbox ?? null,   // 张的 bbox 结构未冻结，取不到就 null 降级
        table_id: rec.evidence.table_id ?? null,
        cell_ref: rec.evidence.cell_ref ?? null,
        quote: rec.evidence.quote ?? ""
      });
    }

    const field = rec.field || KIND_DEFAULT_FIELD[rec.kind] || rec.kind || "unknown_field";
    const status = FANG_STATUS_MAP[rec.status];
    if (!status) { notes.push(`${ev.event_id}.${field}: 未知 status=${rec.status}（不猜测，字段未产出）`); continue; }

    const f = {
      raw_value: rec.rawText ?? rec.rawValue ?? null,
      value: rec.value ?? null,                      // 标准化值：十进制字符串；比例=百分点，不乘 100
      unit: resolveUnit(rec, ev.event_type, field, notes),   // ★ 查注册表定 unit，不猜、不手抄
      status,
      provenance
    };
    if (rec.qualifier && rec.qualifier !== "exact") f.note = `qualifier=${rec.qualifier}`;   // approx / at_most
    if (rec.scope && rec.scope !== "unknown") f.note = [f.note, `scope=${rec.scope}`].filter(Boolean).join("；");
    if (rec.kind === "ratio" && rec.denominator) {
      f.denominator = rec.denominator.kind ?? null;
      f.note = [f.note, `分母定义=${rec.denominator.definition || "未声明"}`].filter(Boolean).join("；");
    }
    if (status === "not_mentioned") {
      // ★ 与改造前不同：契约允许 not_mentioned 态进 fields（6 态全渲染），
      //   改造前"不产出字段"是页面私有约定，会让契约层看不到"这条明确未提及"的信息。
      f.raw_value = null; f.value = null; f.provenance = [];
      notes.push(`${ev.event_id}.${field}: not_mentioned（原文未提及，契约 6 态显式记录，不填 0、不猜）`);
    }
    if (status === "unreadable") {
      notes.push(`${ev.event_id}.${field}: unreadable（来源存在但无法可靠读取，转人工复核，不猜测）`);
    }
    ev.fields[field] = f;
  }

  const envelope = {
    schema_version: "0.3",
    run_id: up.run_id || up.source_file?.file_id || "bridge-run-0001",
    is_mock: up.data_mode === "simulated",
    source: {
      file_id: up.source_file?.file_id ?? null,
      file_name: up.source_file?.filename || "unknown",
      file_sha256: up.source_file?.sha256 ?? null,
      parse_meta: null
    },
    events: [...eventsBy.values()],
    run_meta: { entry: "tool", model: null, started_at: "", duration_ms: null, code_version: "", interface_version: "v0.3", errors: [] }
  };
  return { envelope, notes, integrity: null, check_report: null };
}

module.exports = { toContract, projectView, isUpstream, isWeiEnvelope, isLegacyEnvelope, checkIntegrity, DENOMINATOR_TEXT, SOURCE_TYPE_TEXT, DIRECTION_TEXT, MISSING_REASON_TEXT };
