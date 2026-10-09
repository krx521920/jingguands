// upstream_bridge.js —— 转接口（上游格式 → 页面契约 v0.2）
// 职责：把上游产物（当前：方轩诚《金融数据口径字典 v0.1》定义的标准化记录）
//       无损映射为 page_prototype 数据契约；契约字段只增不改。
// 原则（继承口径字典）：
//   - 数值一律十进制字符串，禁止二进制浮点；
//   - 比例 normalized = 百分点字符串（"2.5" 表示 2.5%），不乘 100；
//   - not_mentioned 不产出字段、不填 0；unreadable 降级展示；不猜数字。
"use strict";

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

/** 入口：识别顺序——wei v0.3 信封 → 契约对象透传 → 方口径记录 → 未知透传留痕。 */
function toContract(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (isWeiEnvelope(obj)) return fromWeiEnvelope(obj);
  if (!isUpstream(obj)) return obj;                       // 已是契约对象（v0.1/v0.2）
  if (obj.bridge === "fang-normalization-v0.1") return fromFangRecords(obj);
  return { ...obj, bridge: { passthrough: true, reason: "unknown upstream format（不猜测，原样透传）" } };
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

/** 魏文宇事件信封 v0.3 → 契约 v0.3（字段只增不改）。
 *  D5 增补：up.check_report（方的 equity_check_D5 旁路核验报告）→ 事件挂 checks[]，契约挂 check_report 全文。 */
function fromWeiEnvelope(up) {
  const notes = [];
  const evidences = [];
  const events = [];

  // 方冲突码报告：按 event_id / event_index 建索引（信封内事件 id 可重复于多文件合并场景，索引优先）
  const checksBy = new Map();
  if (up.check_report && Array.isArray(up.check_report.events)) {
    for (const c of up.check_report.events) {
      if (typeof c.event_index === "number") checksBy.set("#" + c.event_index, c);
      if (c.event_id) checksBy.set(c.event_id, c);
    }
  }

  up.events.forEach((ev, evIndex) => {
    const out = {
      event_id: ev.event_id,
      event_type: ev.event_type,             // v0.3：pledge | equity_change | award_contract（bid_won 已改名）
      status: "success",
      fields: {}
    };
    if (ev.extraction_method) out.extraction_method = ev.extraction_method;

    // 方核验 findings 挂事件（code/severity/fields/message 原样，不猜测不翻译码值）
    const c = checksBy.get(ev.event_id) ?? checksBy.get("#" + evIndex);
    if (c && Array.isArray(c.findings) && c.findings.length) out.checks = c.findings;
    if (c && c.calculations) out.check_calculations = c.calculations;

    for (const [name, fv] of Object.entries(ev.fields || {})) {
      let override = WEI_STATUS_MAP[fv.status];
      if (override === undefined) { notes.push(`${ev.event_id}.${name}: 未知 status=${fv.status}（不猜测，字段未产出）`); continue; }

      // GAP-03：direction 违反契约英文枚举约束 → 记notes + 事件标 pending_review（不静默美化）
      if (name === "direction" && directionViolatesContract(ev.event_type, fv.value)) {
        notes.push(`${ev.event_id}.direction: 值「${fv.value}」不在契约枚举 [${DIRECTION_ENUM_BY_TYPE[ev.event_type].join(" / ")}] 内（registry 要求英文枚举，禁止中文）`);
        if (override === null) override = "pending_review";
        out.direction_contract_violation = true;
      }

      const f = { value: null, unit: null, normalized: null, normalized_unit: null, evidence_id: null };
      f.status_raw = fv.status;                // v0.3b D3：保留信封原始 6 态（溯源/导出用），展示状态看 status_override
      const hasValue = fv.status === "extracted" || fv.status === "needs_review";
      if (hasValue) {
        // 原文口径优先（raw_value 通常自带单位，display unit 置空避免重复拼接）
        f.value = fv.raw_value ?? (fv.value === null ? null : fv.value);
        f.normalized = fv.value === null ? null : String(fv.value);        // 标准化：十进制字符串；percent=百分点数值
        f.normalized_unit = WEI_UNIT_TEXT[fv.unit] ?? null;
        if (fv.raw_value == null) f.unit = WEI_UNIT_TEXT[fv.unit] ?? null;
      }
      if (override) f.status_override = override;

      // provenance 是数组：全部入 evidences[]，字段挂第一条（多于一条时附 evidence_ids）
      const provs = Array.isArray(fv.provenance) ? fv.provenance : [];
      const ids = [];
      for (const p of provs) {
        const eid = "ev-" + String(evidences.length + 1).padStart(4, "0");
        evidences.push({
          evidence_id: eid,
          block_id: p.block_id ?? null,
          page: p.page ?? null,
          bbox: p.region ?? null,            // v0.3 冻结语义：[left,top,right,bottom] PDF 点、左上原点、y 向下
          source_type: p.source_type ?? null, // v0.3b D3：出处块类型（paragraph/cell/table/scan_region/document/null）
          table_id: p.table_id ?? null,      // 表格证据（v0.2 新增，不丢失）
          cell_ref: p.cell_ref ?? null,
          header_path: p.header_path ?? null, // v0.7+：多层表头完整列名（区分同名子列）
          degraded: p.degraded ?? null,      // v0.8：降级标志（table 兜底/扫描区域）
          missing_reason: p.missing_reason ?? null, // v0.8：缺失原因码（NOT_PARSED/ILLEGIBLE/DEGRADED）
          continues: p.continues ?? null,    // v0.7：跨页续表碎片（接上一页同列单元格）
          covers: p.covers ?? null,          // v0.9：合并单元格覆盖的其它位置
          quote: p.quote ?? ""
        });
        ids.push(eid);
      }
      if (ids.length) { f.evidence_id = ids[0]; if (ids.length > 1) f.evidence_ids = ids; }

      if (fv.denominator) {   // v0.3 四值枚举：holder_shares | total_share_capital | net_assets | other
        f.denominator = { kind: fv.denominator, kind_text: DENOMINATOR_TEXT[fv.denominator] || fv.denominator, definition: null };
      }
      if (fv.note) f.note = fv.note;
      out.fields[name] = f;
    }

    // 事件级状态：有字段无法读取/待复核/direction 违反契约 → 待复核
    const ov = Object.values(out.fields).map(f => f.status_override);
    if (ov.includes("unreadable") || ov.includes("pending_review") || out.direction_contract_violation) out.status = "pending_review";
    events.push(out);
  });

  const contract = {
    run_id: up.run_id || "wei-run-0001",
    schema_version: "0.3",
    data_mode: up.is_mock ? "simulated" : "real",   // is_mock=true 仅联调，页面显式标"模拟"
    source_file: {
      file_id: up.source?.file_id ?? null,
      filename: up.source?.file_name ?? null,
      sha256: up.source?.file_sha256 ?? null,
      parse_status: "success"
    },
    events,
    evidences,
    bridge: {
      from: "wei-event-envelope-v0.3",
      rules: "6 状态全渲染；percent=百分点；provenance[]→多证据；region 原样保留（PDF 点左上原点）",
      notes
    }
  };
  if (up.run_meta) contract.run_meta = up.run_meta;
  if (up.source?.parse_meta) contract.source_file.parse_meta = up.source.parse_meta;
  if (up.check_report) contract.check_report = up.check_report;   // D5：方 equity_check_D5 旁路报告全文（只增不改）
  contract.integrity = checkIntegrity(events, evidences);   // D3：断链/错位自检
  return contract;
}

/** 方口径标准化记录 → 契约 v0.2。 */
function fromFangRecords(up) {
  const notes = [];
  const evidences = [];
  const eventsBy = new Map();   // event_id → event

  for (const rec of up.records || []) {
    const eid = rec.event_id || "evt-unknown";
    if (!eventsBy.has(eid)) {
      eventsBy.set(eid, {
        event_id: eid,
        event_type: rec.event_type || "unknown",
        status: "success",
        fields: {}
      });
    }
    const ev = eventsBy.get(eid);

    // 证据：record.evidence → 契约 evidences[]（最低要求 evidence_id+block_id+page+quote）
    let evidenceId = null;
    if (rec.evidence && typeof rec.evidence === "object") {
      evidenceId = "ev-" + String(evidences.length + 1).padStart(4, "0");
      evidences.push({
        evidence_id: evidenceId,
        block_id: rec.evidence.block_id ?? null,
        page: rec.evidence.page ?? null,
        bbox: rec.evidence.bbox ?? null,       // 张的坐标结构未冻结，保持 null 降级
        quote: rec.evidence.quote ?? ""
      });
    }

    const field = rec.field || KIND_DEFAULT_FIELD[rec.kind] || rec.kind || "unknown_field";

    if (rec.status === "not_mentioned") {
      // 缺失不等于零：不产出字段，只留痕
      notes.push(`${ev.event_id}.${field}: not_mentioned（原文未提及，不填 0；核验范围见${evidenceId || "出处记录"}）`);
      if (evidenceId) evidences[evidences.length - 1].quote = (evidences[evidences.length - 1].quote || "") + "［核验范围记录］";
      continue;
    }

    if (rec.status === "unreadable") {
      ev.fields[field] = {
        value: rec.rawText ?? null,
        unit: null,
        normalized: null,
        status_override: "unreadable",
        evidence_id: evidenceId
      };
      notes.push(`${ev.event_id}.${field}: unreadable（来源存在但无法可靠读取，已转人工复核，不猜测）`);
      continue;
    }

    if (rec.status === "present" || rec.status === "explicit_zero") {
      const f = {
        value: rec.rawText ?? rec.rawValue ?? null,      // 原文口径（优先原文文本）
        unit: rec.rawText == null ? (rec.unit ?? null) : null,   // rawText 已含单位，避免重复拼接
        normalized: rec.value ?? null,                   // 标准化值：十进制字符串；比例=百分点，不乘 100
        normalized_unit: rec.unit ?? null,
        evidence_id: evidenceId
      };
      if (rec.qualifier && rec.qualifier !== "exact") f.qualifier = rec.qualifier;   // approx / at_most
      if (rec.scope && rec.scope !== "unknown") f.scope = rec.scope;                 // single / cumulative
      if (rec.kind === "ratio" && rec.denominator) {
        f.denominator = {
          kind: rec.denominator.kind ?? null,
          kind_text: DENOMINATOR_TEXT[rec.denominator.kind] || rec.denominator.kind || null,
          definition: rec.denominator.definition ?? null
        };
      }
      ev.fields[field] = f;
      continue;
    }

    notes.push(`${ev.event_id}.${field}: 未知 status=${rec.status}（不猜测，字段未产出）`);
  }

  const events = [...eventsBy.values()];

  const contract = {
    run_id: up.run_id || up.source_file?.file_id || "bridge-run-0001",
    // v0.3 契约：方 records 也经页面统一契约出口，版本号与魏信封路径(:213)保持一致
    // （原为 "0.2"，导致页头显示"schema v0.2"与官方信封混淆——2026-10-07 契约复核 GAP-01）
    schema_version: "0.3",
    data_mode: up.data_mode || "real",
    source_file: {
      file_id: up.source_file?.file_id ?? null,
      filename: up.source_file?.filename ?? null,
      sha256: up.source_file?.sha256 ?? null,            // 口径字典 §6：离线核验用文件哈希
      parse_status: up.source_file?.parse_status ?? "success"
    },
    events,
    evidences,
    bridge: {
      from: "fang-normalization-v0.1",
      rules: "十进制字符串；比例 normalized=百分点；not_mentioned 不产出；unreadable 降级",
      notes
    }
  };

  // 事件级状态：有字段 unreadable → 待复核
  for (const ev of events) {
    const overrides = Object.values(ev.fields).map(f => f.status_override);
    if (overrides.includes("unreadable")) ev.status = "pending_review";
  }
  return contract;
}

module.exports = { toContract, isUpstream, isWeiEnvelope, checkIntegrity, DENOMINATOR_TEXT, SOURCE_TYPE_TEXT, DIRECTION_TEXT, MISSING_REASON_TEXT };
