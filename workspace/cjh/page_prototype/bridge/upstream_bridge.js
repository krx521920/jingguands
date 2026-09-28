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

// 分母枚举中文（口径字典 §3）
const DENOMINATOR_TEXT = {
  total_share_capital: "公司总股本",
  holder_shares: "指定股东所持股份",
  net_assets: "指定口径净资产",
  other: "其他明确定义"
};

/** 判断 JSON 是否为上游格式（非契约对象）。契约对象以 schema_version + events 为特征。 */
function isUpstream(obj) {
  return !!obj && typeof obj === "object" &&
    !(typeof obj.schema_version === "string" && Array.isArray(obj.events));
}

/** 入口：契约对象原样返回；上游格式走转换；其他情况透传并留痕。 */
function toContract(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (!isUpstream(obj)) return obj;                       // 已是契约对象（v0.1/v0.2）
  if (obj.bridge === "fang-normalization-v0.1") return fromFangRecords(obj);
  return { ...obj, bridge: { passthrough: true, reason: "unknown upstream format（不猜测，原样透传）" } };
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
        unit: rec.unit ?? null,                          // 方已换算后的标准单位：元/股/%
        normalized: rec.value ?? null,                   // 标准化值：十进制字符串；比例=百分点，不乘 100
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
    schema_version: "0.2",
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

module.exports = { toContract, isUpstream, DENOMINATOR_TEXT };
