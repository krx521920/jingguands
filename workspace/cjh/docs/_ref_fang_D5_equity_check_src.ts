/** D5 股权变动核验：消费 v0.3 信封，只输出旁路报告，不修写原始字段。 */
// D4 标准化模块内联副本，方便单文件调试；原 D4 文件保持不变。
/** D2 标准化函数：十进制单位/百分比换算，区分缺失、零、无法读取。
 *  输入是「已定位到原文并确认过的事实字段」，不是待猜测的文本。本函数只换算，不抽取、不核验出处。 */
export type Kind = "amount" | "shares" | "ratio";
export type Status = "present" | "not_mentioned" | "explicit_zero" | "unreadable";
export type Scope = "single" | "cumulative" | "unknown";
export type Qualifier = "exact" | "approx" | "at_most";
export type DenominatorKind = "total_share_capital" | "holder_shares" | "net_assets" | "other";

export interface MeasureInput {
  kind: Kind;
  rawText: string | null;
  rawValue: string | null; // 纯十进制字符串，无千位分隔符。
  sourceUnit: "元" | "万元" | "亿元" | "股" | "万股" | "亿股" | "%" | null;
  qualifier: Qualifier | null;
  scope: Scope;
  status: Status;
  denominator: { kind: DenominatorKind; definition: string } | null;
}

export interface NormalizedMeasure extends MeasureInput {
  value: string | null; // 精确十进制字符串；null 永远不是零。
  unit: "元" | "股" | "%";
}

const factors: Record<Kind, Record<string, number>> = {
  amount: { 元: 0, 万元: 4, 亿元: 8 },
  shares: { 股: 0, 万股: 4, 亿股: 8 },
  ratio: { "%": 0 },
} as const;

const canonicalUnits = { amount: "元", shares: "股", ratio: "%" } as const;
const statuses: Status[] = ["present", "not_mentioned", "explicit_zero", "unreadable"];
const scopes: Scope[] = ["single", "cumulative", "unknown"];
const qualifiers: Qualifier[] = ["exact", "approx", "at_most"];
const denominators: DenominatorKind[] = ["total_share_capital", "holder_shares", "net_assets", "other"];

/** 十进制小数点移位，等价于 raw × 10^places，全程字符串运算，杜绝二进制浮点误差。 */
function shiftDecimal(raw: string, places: number): string {
  const negative = raw.startsWith("-");
  const [whole = "", fraction = ""] = (negative ? raw.slice(1) : raw).split(".");
  const point = whole.length + places;
  const digits = (whole + fraction).padEnd(point + 1, "0");
  const integer = digits.slice(0, point).replace(/^0+(?=\d)/, "");
  const decimal = digits.slice(point).replace(/0+$/, "");
  const normalized = integer + (decimal ? `.${decimal}` : "");
  return negative && normalized !== "0" ? `-${normalized}` : normalized;
}

/** 默认保持 D2 行为；D4 可保留未知分母的比例标准值，仅做单位标准化，不授权关系计算。 */
export function normalize(input: MeasureInput, options: { allowUnknownRatioDenominator?: boolean } = {}): NormalizedMeasure {
  if (!Object.hasOwn(factors, input.kind) || !statuses.includes(input.status) || !scopes.includes(input.scope)) {
    throw new Error("Invalid kind, status or scope");
  }
  const unit = canonicalUnits[input.kind];
  if (input.kind === "ratio" && (input.status === "present" || input.status === "explicit_zero")) {
    if (input.denominator === null && options.allowUnknownRatioDenominator === true) {
      // 保留 null；不填入假定分母，也不反推分母。
    } else if (!input.denominator || !denominators.includes(input.denominator.kind) || !input.denominator.definition.trim()) {
      throw new Error("Ratio denominator must be explicit");
    }
  } else if (input.denominator !== null) {
    throw new Error("Denominator only applies to a stated ratio");
  }
  if (input.status === "not_mentioned" || input.status === "unreadable") {
    if (input.rawValue !== null || input.sourceUnit !== null || input.qualifier !== null) {
      throw new Error("Missing or unreadable values cannot carry a number");
    }
    return { ...input, value: null, unit };
  }
  if (!input.rawText?.trim() || input.rawValue === null ||
      !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(input.rawValue) ||
      !input.sourceUnit || !Object.hasOwn(factors[input.kind], input.sourceUnit) ||
      !input.qualifier || !qualifiers.includes(input.qualifier)) {
    throw new Error("Invalid stated numeric value, unit or qualifier");
  }
  const places = factors[input.kind][input.sourceUnit];
  if (places === undefined) throw new Error("Unsupported source unit");
  const value = shiftDecimal(input.rawValue, places);
  if (input.kind === "shares" && value.includes(".")) throw new Error("Shares must be whole shares");
  if (input.status === "explicit_zero" && (value !== "0" || input.qualifier !== "exact")) {
    throw new Error("Explicit zero requires an exact stated zero");
  }
  if (input.status === "present" && value === "0" && input.qualifier === "exact") {
    throw new Error("Exact stated zero requires explicit_zero status");
  }
  return { ...input, value, unit };
}
// D4 标准化模块结束。

type ObjectValue = Record<string, unknown>;
/** 核验状态，与输入的六种字段状态分别保存。 */
export type CheckStatus = "verified" | "mismatch" | "needs_review" | "invalid" | "skipped";
/** 可定位到原字段的问题，不改写原字段状态。 */
export interface Finding {
  code: string;
  severity: "error" | "conflict" | "review";
  fields: string[];
  message: string;
}
/** 每个事件独立计算，event_index 保留原数组位置。 */
export interface EventCheck {
  event_index: number;
  event_id: string | null;
  holder: string | null;
  status: CheckStatus;
  findings: Finding[];
  observed: Record<string, unknown>;
  calculations: {
    shares_delta: string | null;
    ratio_delta_pp: string | null;
    inferred_share_direction: "increase" | "decrease" | null;
    reported_direction: string | null;
    change_shares_matches: boolean | null;
    ratio_arithmetic: "not_checked_no_denominator_values";
  };
}
/** 旁路核验报告，不作为公共 EventEnvelope 输出。 */
export interface CheckReport {
  tool: "equity_check_D5";
  version: "0.5.0";
  input_schema_version: string | null;
  run_id: string | null;
  source: unknown;
  status: CheckStatus;
  findings: Finding[];
  events: EventCheck[];
  audit: {
    evidenceMode: "required" | "synthetic_test";
    sourceContentsVerified: false;
    fullEnvelopeSchemaValidated: false;
    inputMutated: false;
    legalJudgment: false;
    thresholdPolicy: "no_registered_threshold_fields";
  };
}
const UNITS: Record<string, string> = {
  holder: "text", direction: "text", shares_before: "shares", shares_after: "shares",
  ratio_before: "percent", ratio_after: "percent", change_shares: "shares", method: "text", change_date: "date_range",
};
const STATES = ["extracted", "needs_review", "not_mentioned", "not_disclosed", "not_applicable", "unreadable"];
const BASES = ["total_share_capital", "holder_shares", "net_assets", "other"];
function object(v: unknown): v is ObjectValue { return v !== null && typeof v === "object" && !Array.isArray(v); }
function text(v: unknown): v is string { return typeof v === "string" && v.trim().length > 0; }
function status(findings: Finding[]): CheckStatus {
  return findings.some(f => f.severity === "error") ? "invalid" : findings.some(f => f.severity === "conflict") ? "mismatch" : findings.length ? "needs_review" : "verified";
}
function validDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
function validPeriod(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const parts = v.split("/");
  return (parts.length === 1 || parts.length === 2) && parts.every(validDate) && (parts.length === 1 || parts[0]! <= parts[1]!);
}
function scaled(v: string, places: number): bigint {
  const [w = "0", f = ""] = v.replace(/^-/, "").split(".");
  return BigInt(w + f.padEnd(places, "0")) * (v.startsWith("-") ? -1n : 1n);
}
function difference(after: string, before: string): string {
  const places = Math.max(after.split(".")[1]?.length ?? 0, before.split(".")[1]?.length ?? 0);
  const delta = scaled(after, places) - scaled(before, places);
  const digits = (delta < 0n ? -delta : delta).toString().padStart(places + 1, "0");
  const absolute = places ? `${digits.slice(0, -places)}.${digits.slice(-places)}`.replace(/\.?0+$/, "") : digits;
  return `${delta < 0n ? "-" : ""}${absolute}`;
}
function sign(v: string): number { return /^-?0(?:\.0+)?$/.test(v) ? 0 : v.startsWith("-") ? -1 : 1; }

/**
 * 核验魏文宇 v0.3 信封中的每个 equity_change 事件。非股权事件单列 skipped。
 * @param input JSON 输入；数字字符串用于保留超出 JS 安全整数范围的股数。
 * @param options 合成数据必须显式选择 synthetic_test；真实字段不允许使用该模式。
 * @returns 独立报告；原始信封及六种 FieldValue 状态均不改变。
 */
export function checkEquityEnvelope(input: unknown, options: { evidenceMode?: "required" | "synthetic_test" } = {}): CheckReport {
  const report: CheckReport = {
    tool: "equity_check_D5", version: "0.5.0", input_schema_version: null, run_id: null, source: null,
    status: "invalid", findings: [], events: [],
    audit: { evidenceMode: "required", sourceContentsVerified: false, fullEnvelopeSchemaValidated: false, inputMutated: false, legalJudgment: false, thresholdPolicy: "no_registered_threshold_fields" },
  };
  const fail = (code: string, message: string): CheckReport => {
    report.findings.push({ code, severity: "error", fields: [], message });
    return report;
  };
  if (!object(options) || Object.keys(options).some(k => k !== "evidenceMode") ||
    (options.evidenceMode !== undefined && !["required", "synthetic_test"].includes(options.evidenceMode))) return fail("INVALID_OPTIONS", "仅接受 evidenceMode=required/synthetic_test");
  const mode = options.evidenceMode ?? "required";
  report.audit.evidenceMode = mode;
  if (!object(input) || input.schema_version !== "0.3" || !text(input.run_id) || typeof input.is_mock !== "boolean" || !object(input.source) || !Array.isArray(input.events)) {
    return fail("INVALID_ENVELOPE", "需要 schema_version=0.3、run_id、is_mock、source 和 events；页面 mock share_change 不是上游信封");
  }
  report.input_schema_version = input.schema_version;
  report.run_id = input.run_id;
  report.source = structuredClone(input.source);
  const locatedSource = text(input.source.file_sha256) && /^[a-f0-9]{64}$/i.test(input.source.file_sha256) && text(input.source.file_name) && text(input.source.file_id);
  const ids = new Set<string>();
  input.events.forEach((ev: unknown, index: number) => {
    const result: EventCheck = {
      event_index: index, event_id: object(ev) && text(ev.event_id) ? ev.event_id : null, holder: null,
      status: "invalid", findings: [], observed: {},
      calculations: { shares_delta: null, ratio_delta_pp: null, inferred_share_direction: null, reported_direction: null, change_shares_matches: null, ratio_arithmetic: "not_checked_no_denominator_values" },
    };
    report.events.push(result);
    const add = (code: string, severity: Finding["severity"], fields: string[], message: string): void => { result.findings.push({ code, severity, fields, message }); };
    if (!object(ev) || !result.event_id || !/^E\d+$/.test(result.event_id) || !object(ev.fields)) {
      add("INVALID_EVENT", "error", [], "事件必须包含合法 event_id 和 fields 对象"); return;
    }
    if (ids.has(result.event_id)) { add("DUPLICATE_EVENT_ID", "error", [], "同信封事件 ID 重复，禁止合并或覆盖"); return; }
    ids.add(result.event_id);
    if (ev.event_type !== "equity_change") {
      if (["pledge", "award_contract"].includes(String(ev.event_type))) result.status = "skipped";
      else add("UNSUPPORTED_EVENT_TYPE", "error", [], "事件类型未注册");
      return;
    }
    const fields = ev.fields;
    result.observed = structuredClone(fields);
    for (const name of Object.keys(fields)) if (!Object.hasOwn(UNITS, name)) add("UNREGISTERED_FIELD", "review", [name], "字段不在已对齐的股权变动九字段范围内，保留但不评判；不增加阈值或法律规则");
    const sourceAllowed = mode === "synthetic_test" ? input.is_mock === true && ev.extraction_method === "mock" : input.is_mock === false && ev.extraction_method !== "mock" && locatedSource;
    if (!sourceAllowed) add("EVIDENCE_MODE_BLOCKED", "review", [], "真实模式需文件哈希与真实来源；合成模式只接受显式 mock 信封和事件");
    const usable = new Set<string>();
    for (const [name, unit] of Object.entries(UNITS)) {
      const f = fields[name];
      if (!object(f)) { add("MISSING_FIELD", "review", [name], "字段缺失，保留未知，不填零"); continue; }
      if (!STATES.includes(String(f.status)) || f.unit !== unit || (f.standardized !== undefined && typeof f.standardized !== "boolean")) {
        add("INVALID_FIELD", "error", [name], "状态、单位或 standardized 不符合共享接口"); continue;
      }
      if (!["extracted", "needs_review"].includes(String(f.status))) {
        if (f.value !== null) add("MISSING_WITH_VALUE", "error", [name], "缺失状态携带了残留值");
        continue;
      }
      if (f.status === "needs_review" || f.standardized === false || (["shares", "percent"].includes(unit) && f.standardized !== true)) { add("UNCONFIRMED_FIELD", "review", [name], "候选值或未确认标准化的数值字段不参与等式判断"); continue; }
      if (f.value === null || !text(f.raw_value)) { add("INVALID_FIELD", "error", [name], "extracted 需要数值/文本和 raw_value"); continue; }
      if (unit !== "percent" && f.denominator != null) { add("UNEXPECTED_DENOMINATOR", "error", [name], "非比例字段不应带分母"); continue; }
      if (unit === "percent" && !BASES.includes(String(f.denominator))) { add("UNKNOWN_RATIO_BASIS", "review", [name], "比例分母种类不明确，不默认总股本"); continue; }
      const refs = f.provenance;
      const evidenceOK = Array.isArray(refs) && refs.length > 0 && refs.every(p => {
        if (!object(p) || !text(p.quote) || !Number.isSafeInteger(p.page) || (p.page as number) < 1) return false;
        if (p.degraded === true || ["table", "scan_region", "document"].includes(String(p.source_type))) return false;
        if (p.source_type === "cell" && (!text(p.table_id) || !text(p.cell_ref) || !text(p.block_id))) return false;
        if (p.region != null && (!Array.isArray(p.region) || p.region.length !== 4 || !p.region.every(x => typeof x === "number" && Number.isFinite(x)) || p.region[0] < 0 || p.region[1] < 0 || p.region[0] >= p.region[2] || p.region[1] >= p.region[3])) return false;
        return true;
      });
      if (!evidenceOK) { add("INCOMPLETE_OR_DEGRADED_EVIDENCE", "review", [name], "出处缺失、单元格定位不全或来源降级"); continue; }
      if (sourceAllowed) usable.add(name);
    }
    const get = (name: string): ObjectValue => object(fields[name]) ? fields[name] : {};
    const numbers: Record<string, string> = {};
    for (const name of ["shares_before", "shares_after", "change_shares", "ratio_before", "ratio_after"]) {
      const f = get(name);
      if (!usable.has(name)) continue;
      const ratio = name.startsWith("ratio");
      const value = f.value;
      if ((typeof value !== "string" && typeof value !== "number") || (typeof value === "number" && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER || (!ratio && !Number.isSafeInteger(value))))) {
        add("UNSAFE_NUMBER", "error", [name], "数值非法或超出安全整数范围；大股数请提供十进制字符串"); continue;
      }
      const raw = String(value);
      if (raw.length > 120 || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw)) { add("INVALID_NUMBER", "error", [name], "只接受最多 120 字符的十进制数值"); continue; }
      if (/约|大约|不超过|至多|至少|以上|以下|[<>≤≥~～]/.test(String(f.raw_value))) { add("NONEXACT_FIELD", "review", [name], "约数、上下界不能作为精确余额"); continue; }
      try {
        const n = normalize({ kind: ratio ? "ratio" : "shares", rawText: String(f.raw_value), rawValue: raw, sourceUnit: ratio ? "%" : "股", qualifier: "exact", scope: "cumulative", status: /^-?0(?:\.0+)?$/.test(raw) ? "explicit_zero" : "present", denominator: null }, { allowUnknownRatioDenominator: true }).value!;
        if (n.startsWith("-")) {
          add(name === "change_shares" ? "SIGNED_CHANGE_REQUIRES_MAPPING" : "NEGATIVE_BALANCE", name === "change_shares" ? "review" : "error", [name], name === "change_shares" ? "当前评测口径为非负绝对量；有符号输入需上游显式适配，不静默取绝对值" : "持股余额和持股比例不能为负"); continue;
        }
        if (ratio && sign(difference(n, "100")) > 0) { add("RATIO_OUT_OF_RANGE", "error", [name], "持股比例不在 0%–100% 数值范围内"); continue; }
        numbers[name] = n;
      } catch (error) { add("INVALID_NUMBER", "error", [name], error instanceof Error ? error.message : String(error)); }
    }
    if (usable.has("holder") && text(get("holder").value)) result.holder = String(get("holder").value);
    else add("MISSING_HOLDER", "review", ["holder"], "股东未确认，不跨主体拼接字段");
    const periodOK = usable.has("change_date") && validPeriod(get("change_date").value);
    if (!periodOK) add("MISSING_OR_INVALID_PERIOD", "review", ["change_date"], "缺少有效变动日期/区间；不以公告日期补齐");
    const direction = usable.has("direction") ? get("direction").value : null;
    if (direction !== "increase" && direction !== "decrease") add("MISSING_OR_INVALID_DIRECTION", "review", ["direction"], "方向需明确为 increase/decrease；不从比例或变动量符号补写");
    else result.calculations.reported_direction = direction;
    // 事件分组由抽取层提供；缺主体/期间时禁止关系计算，但 observed 原样保留。
    if (!result.holder || !periodOK || !sourceAllowed) { result.status = status(result.findings); return; }
    const b = numbers.shares_before, a = numbers.shares_after;
    if (b !== undefined && a !== undefined) {
      const delta = difference(a, b);
      result.calculations.shares_delta = delta;
      const d = sign(delta);
      if (d !== 0) {
        const inferred = d > 0 ? "increase" : "decrease";
        result.calculations.inferred_share_direction = inferred;
        if (result.calculations.reported_direction && direction !== inferred) add("DIRECTION_MISMATCH", "conflict", ["shares_before", "shares_after", "direction"], "前后股数与披露方向反转，保留原值供核对");
      } else add("EQUAL_SHARES_NO_DIRECTION", "review", ["shares_before", "shares_after"], "股数相等不能推出无变动或增减方向，可能存在被动稀释或期间净额为零");
      if (numbers.change_shares !== undefined) {
        const match = numbers.change_shares === delta.replace(/^-/, "");
        result.calculations.change_shares_matches = match;
        if (!match) add("CHANGE_SHARES_MISMATCH", "conflict", ["shares_before", "shares_after", "change_shares"], "披露变动绝对量与 |后股数－前股数| 不符；需核对是否为同期间净额");
      } else add("MISSING_CHANGE_SHARES", "review", ["change_shares"], "缺少可确认的变动绝对量，不填入推导值");
    } else add("MISSING_SHARE_PAIR", "review", ["shares_before", "shares_after"], "前后股数不全，不能判断股数方向");
    const rb = numbers.ratio_before, ra = numbers.ratio_after;
    if (rb !== undefined && ra !== undefined) {
      if (get("ratio_before").denominator !== get("ratio_after").denominator || !["total_share_capital", "holder_shares"].includes(String(get("ratio_before").denominator))) {
        add("RATIO_BASIS_MISMATCH", "review", ["ratio_before", "ratio_after"], "比例分母种类不同或不属于支持的股份分母，不相减");
      } else {
        const rd = difference(ra, rb);
        result.calculations.ratio_delta_pp = rd;
        const sd = result.calculations.shares_delta;
        if (sd !== null && sign(rd) !== 0 && sign(sd) !== 0 && sign(rd) !== sign(sd)) add("RATIO_DIRECTION_CONFLICT", "review", ["shares_before", "shares_after", "ratio_before", "ratio_after"], "股数与披露比例反向变化，需核对分母变动；不自动推翻股数方向");
        if (sd !== null && sign(sd) === 0 && sign(rd) !== 0) add("RATIO_CHANGED_WITH_EQUAL_SHARES", "review", ["ratio_before", "ratio_after"], "股数不变但比例改变，需核对被动稀释或分母时点");
      }
    } else add("MISSING_RATIO_PAIR", "review", ["ratio_before", "ratio_after"], "比例前后值不全或依据不足，不填零、不反推分母");
    result.status = status(result.findings);
  });
  const all = [...report.findings, ...report.events.flatMap(e => e.findings)];
  report.status = all.length ? status(all) : report.events.some(e => e.status !== "skipped") ? "verified" : "skipped";
  return report;
}
