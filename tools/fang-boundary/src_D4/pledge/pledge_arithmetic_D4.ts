/** D4 内部复用的 D3 算术基线，保留旧行为用于回归；公开调用应使用 checks_D4.ts。 */
import { normalize, type MeasureInput, type NormalizedMeasure } from "../normalization/normalization_D4.ts";

export type Basis = "holder_shares" | "total_share_capital" | "unknown";
export interface Fact {
  measure: MeasureInput;
  context: {
    companyId: string | null;
    holderId: string | null;
    asOf: string | null; // 原文口径日期 YYYY-MM-DD，不是文件上传日期。
    eventId: string | null; // 单次值必须一致；累计余额按主体、时点比较。
  };
  source: {
    document: string;
    sha256: string | null;
    page: number | null;
    locator: string;
    sampleType: "synthetic" | "real";
  };
}
export interface PledgeInput {
  id: string;
  shares: Fact | null;
  ratio: Fact | null;
  denominator: { kind: Basis; fact: Fact } | null;
  ratioPolicy: { mode: "exact" | "rounded"; decimalPlaces: number };
}
type NormalizedFact = Omit<Fact, "measure"> & { measure: NormalizedMeasure };
type Normalized = { shares: NormalizedFact | null; ratio: NormalizedFact | null; denominator: NormalizedFact | null };
interface Calculation {
  direction: "shares_to_ratio" | "ratio_to_shares";
  formula: string;
  operands: Record<string, string>;
  value: string | null;
  unit: "股" | "%";
  exactFraction: { numerator: string; denominator: string };
  interpretation: "exact" | "rounded_display" | "rounding_interval";
  possibleWholeShares: { min: string; max: string } | null;
  scope: MeasureInput["scope"];
  denominatorKind: Basis;
}
export interface PledgeResult {
  id: string | null;
  tool: "pledge_verify_D3";
  version: "0.3.0";
  status: "verified" | "mismatch" | "calculated" | "needs_review" | "invalid";
  reasons: { code: string; message: string }[];
  normalized: Normalized;
  calculation: Calculation | null;
  comparison: {
    reported: string;
    recomputed: string;
    rule: string;
    matches: boolean;
  } | null;
}

function object(value: unknown, keys: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} 必须为对象`);
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(record, key))) {
    throw new Error(`${label} 字段缺失或包含未知字段；要求 ${keys.join(", ")}`);
  }
  return record;
}
function text(value: unknown, label: string, nullable = false): asserts value is string | null {
  if (nullable && value === null) return;
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} 必须为非空字符串${nullable ? "或 null" : ""}`);
}
function member(value: unknown, values: readonly unknown[], label: string): void {
  if (!values.includes(value)) throw new Error(`${label} 不是支持的枚举值`);
}
function parseFact(value: unknown, label: string): Fact {
  const fact = object(value, ["measure", "context", "source"], label);
  const m = object(fact.measure, ["kind", "rawText", "rawValue", "sourceUnit", "qualifier", "scope", "status", "denominator"], `${label}.measure`);
  member(m.kind, ["shares", "ratio"], `${label}.kind`);
  member(m.status, ["present", "explicit_zero", "not_mentioned", "unreadable"], `${label}.status`);
  member(m.scope, ["single", "cumulative", "unknown"], `${label}.scope`);
  text(m.rawText, `${label}.rawText`, true);
  text(m.rawValue, `${label}.rawValue`, true);
  if (typeof m.rawValue === "string" && m.rawValue.length > 120) throw new Error("单个数值最多 120 字符");
  member(m.sourceUnit, ["股", "万股", "亿股", "%", null], `${label}.sourceUnit`);
  member(m.qualifier, ["exact", "approx", "at_most", null], `${label}.qualifier`);
  if (m.denominator !== null) {
    const d = object(m.denominator, ["kind", "definition"], `${label}.denominator`);
    member(d.kind, ["holder_shares", "total_share_capital", "net_assets", "other"], `${label}.denominator.kind`);
    text(d.definition, `${label}.denominator.definition`);
  }
  const c = object(fact.context, ["companyId", "holderId", "asOf", "eventId"], `${label}.context`);
  for (const key of ["companyId", "holderId", "asOf", "eventId"]) text(c[key], `${label}.${key}`, true);
  if (typeof c.asOf === "string") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.asOf)) throw new Error("asOf 必须为 YYYY-MM-DD 或 null");
    const date = new Date(`${c.asOf}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== c.asOf) throw new Error("asOf 日期不存在");
  }
  const s = object(fact.source, ["document", "sha256", "page", "locator", "sampleType"], `${label}.source`);
  text(s.document, `${label}.source.document`);
  text(s.locator, `${label}.source.locator`);
  if (s.sha256 !== null && (typeof s.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(s.sha256))) throw new Error("sha256 必须为 64 位十六进制或 null");
  if (s.page !== null && (!Number.isSafeInteger(s.page) || (s.page as number) < 1)) throw new Error("页码必须为正整数或 null");
  member(s.sampleType, ["synthetic", "real"], `${label}.source.sampleType`);
  return value as Fact;
}
export function parsePledgeInput(value: unknown): PledgeInput {
  const row = object(value, ["id", "shares", "ratio", "denominator", "ratioPolicy"], "input");
  text(row.id, "id");
  if (row.shares !== null) parseFact(row.shares, "shares");
  if (row.ratio !== null) parseFact(row.ratio, "ratio");
  if (row.denominator !== null) {
    const d = object(row.denominator, ["kind", "fact"], "denominator");
    member(d.kind, ["holder_shares", "total_share_capital", "unknown"], "denominator.kind");
    parseFact(d.fact, "denominator.fact");
  }
  const policy = object(row.ratioPolicy, ["mode", "decimalPlaces"], "ratioPolicy");
  member(policy.mode, ["exact", "rounded"], "ratioPolicy.mode");
  if (!Number.isInteger(policy.decimalPlaces) || (policy.decimalPlaces as number) < 0 || (policy.decimalPlaces as number) > 12) {
    throw new Error("decimalPlaces 必须是 0–12 的整数");
  }
  return value as PledgeInput;
}

// 财务数值仅用 BigInt 分子/分母；Number 只用于已校验的精度、页码等元数据。
function decimal(value: string): [bigint, bigint] {
  const [whole = "0", fraction = ""] = value.split(".");
  return [BigInt(whole + fraction), 10n ** BigInt(fraction.length)];
}
function formatScaled(value: bigint, places: number): string {
  const padded = value.toString().padStart(places + 1, "0");
  if (!places) return padded;
  return `${padded.slice(0, -places)}.${padded.slice(-places)}`;
}
function halfUp(n: bigint, d: bigint): bigint { return (2n * n + d) / (2n * d); }
function ceil(n: bigint, d: bigint): bigint { return (n + d - 1n) / d; }
function normalizeFact(fact: Fact | null): NormalizedFact | null {
  return fact === null ? null : { ...fact, measure: normalize(fact.measure) };
}

/** JSON/工具调用入口：返回结构化算术结论；invalid 不抛出，原始事实不被推导值覆盖。 */
export function verifyPledge(value: unknown): PledgeResult {
  const result: PledgeResult = {
    id: null, tool: "pledge_verify_D3", version: "0.3.0", status: "invalid", reasons: [],
    normalized: { shares: null, ratio: null, denominator: null }, calculation: null, comparison: null,
  };
  const stop = (status: PledgeResult["status"], code: string, message: string): PledgeResult => {
    result.status = status;
    result.reasons.push({ code, message });
    return result;
  };
  let input: PledgeInput;
  try {
    input = parsePledgeInput(value);
    result.id = input.id;
    result.normalized = {
      shares: normalizeFact(input.shares), ratio: normalizeFact(input.ratio),
      denominator: normalizeFact(input.denominator?.fact ?? null),
    };
  } catch (error) {
    return stop("invalid", "INVALID_INPUT", error instanceof Error ? error.message : String(error));
  }
  const { shares, ratio, denominator } = result.normalized;
  if ((shares && shares.measure.kind !== "shares") || (ratio && ratio.measure.kind !== "ratio") ||
      (denominator && denominator.measure.kind !== "shares")) {
    return stop("invalid", "FIELD_KIND_MISMATCH", "shares/denominator 必须是股数，ratio 必须是比例");
  }
  const s = shares?.measure.value ?? null;
  const r = ratio?.measure.value ?? null;
  const d = denominator?.measure.value ?? null;
  const basis = input.denominator?.kind ?? "unknown";
  if (s === null && r === null) return stop("needs_review", "NO_NUMERATOR", "股数和比例均无可计算数值；未提及、无法读取不等于零");
  if (basis === "unknown") return stop("needs_review", "UNKNOWN_DENOMINATOR", "未明确占持股还是占总股本，禁止默认或反推分母");
  if (d === null || !denominator) return stop("needs_review", "MISSING_DENOMINATOR", "缺少可用分母股数");
  const D = BigInt(d);
  if (D <= 0n) return stop("invalid", "NONPOSITIVE_DENOMINATOR", "分母股数必须大于零；0/0 也不可核验");
  const facts = [shares, ratio, denominator].filter((fact): fact is NormalizedFact => fact !== null && fact.measure.value !== null);
  if (facts.some(fact => fact.measure.value!.startsWith("-"))) return stop("invalid", "NEGATIVE_PLEDGE", "质押数量和余额必须非负；解除质押不能作为负余额传入");
  if (s !== null && BigInt(s) > D) return stop("invalid", "SHARES_EXCEED_DENOMINATOR", "质押股数大于同口径分母");
  if (r !== null) {
    const [rn, rd] = decimal(r);
    if (rn > 100n * rd) return stop("invalid", "RATIO_OUT_OF_RANGE", "质押比例必须在 0%–100% 内");
    if (ratio?.measure.denominator?.kind !== basis) return stop("needs_review", "DENOMINATOR_MISMATCH", "披露比例与供给分母的口径不同，禁止直接比较");
    if (input.ratioPolicy.mode === "rounded" && rn * 10n ** BigInt(input.ratioPolicy.decimalPlaces) % rd !== 0n) {
      return stop("invalid", "RATIO_PRECISION_MISMATCH", "披露比例无法按指定小数位表示；请核对原文精度");
    }
  }
  if (facts.some(fact => fact.measure.qualifier !== "exact")) return stop("needs_review", "NONEXACT_FACT", "约数或不超过值不能按精确股数核验；保留修饰词转人工");
  const numeratorFacts = [shares, ratio].filter((fact): fact is NormalizedFact => fact !== null && fact.measure.value !== null);
  const primary = numeratorFacts[0]!;
  const scope = primary.measure.scope;
  if (numeratorFacts.some(fact => fact.measure.scope === "unknown")) return stop("needs_review", "UNKNOWN_SCOPE", "单次/累计口径未确认");
  if (numeratorFacts.some(fact => fact.measure.scope !== scope)) return stop("needs_review", "SCOPE_MISMATCH", "单次与累计不可直接比较或相加");
  for (const fact of facts) {
    const c = fact.context;
    if (!c.companyId || !c.asOf) return stop("needs_review", "MISSING_CONTEXT", "缺公司标识或统计时点，不能确认同口径");
    if (c.companyId !== primary.context.companyId || c.asOf !== primary.context.asOf) {
      return stop("needs_review", "CONTEXT_MISMATCH", "公司或统计时点不一致，不能使用该分母");
    }
  }
  const holderFacts = basis === "holder_shares" ? facts : numeratorFacts;
  if (holderFacts.some(fact => !fact.context.holderId)) return stop("needs_review", "MISSING_HOLDER", "缺少指定股东/明确股东组标识");
  if (holderFacts.some(fact => fact.context.holderId !== primary.context.holderId)) return stop("needs_review", "HOLDER_MISMATCH", "股东或股东组不同，不能混用持股分母");
  if (scope === "single") {
    if (numeratorFacts.some(fact => !fact.context.eventId)) return stop("needs_review", "MISSING_EVENT", "本次质押缺少事件标识");
    if (numeratorFacts.some(fact => fact.context.eventId !== primary.context.eventId)) return stop("needs_review", "EVENT_MISMATCH", "本次股数与比例来自不同事件");
  }
  const places = input.ratioPolicy.decimalPlaces;
  const scale = 10n ** BigInt(places);
  if (s !== null) {
    const numerator = BigInt(s) * 100n;
    const displayed = formatScaled(halfUp(numerator * scale, D), places);
    result.calculation = {
      direction: "shares_to_ratio", formula: "质押比例(%) = 质押股数 / 分母股数 × 100",
      operands: { pledgedShares: s, denominatorShares: d, multiplier: "100" }, value: displayed, unit: "%",
      exactFraction: { numerator: numerator.toString(), denominator: d },
      interpretation: numerator * scale % D === 0n ? "exact" : "rounded_display",
      possibleWholeShares: null, scope, denominatorKind: basis,
    };
    if (r === null) return stop("calculated", "RATIO_DERIVED", "已计算比例；原文缺失/无法读取状态保留，推导结果不是披露事实");
    const [rn, rd] = decimal(r);
    const matches = input.ratioPolicy.mode === "exact"
      ? numerator * rd === rn * D
      : halfUp(numerator * scale, D) * rd === rn * scale;
    result.comparison = {
      reported: r, recomputed: displayed,
      rule: input.ratioPolicy.mode === "exact" ? "精确有理数交叉相乘；展示舍入不参与判断" : `ROUND_HALF_UP 到 ${places} 位小数后比较；无额外宽容阈值`,
      matches,
    };
    return stop(matches ? "verified" : "mismatch", matches ? "RATIO_MATCH" : "RATIO_MISMATCH", matches ? "同口径算术核验通过；不表示来源真实性已核验" : "同口径计算比例与披露值不一致");
  }
  // 此处分母已大于零，比例存在；反推结果始终放在 calculation，不回填原文。
  const [rn, rd] = decimal(r!);
  const numerator = rn * D;
  const divisor = rd * 100n;
  result.calculation = {
    direction: "ratio_to_shares", formula: "质押股数 = 比例百分点数 × 分母股数 / 100",
    operands: { reportedRatioPercent: r!, denominatorShares: d, divisor: "100" }, value: null, unit: "股",
    exactFraction: { numerator: numerator.toString(), denominator: divisor.toString() },
    interpretation: input.ratioPolicy.mode === "exact" ? "exact" : "rounding_interval",
    possibleWholeShares: null, scope, denominatorKind: basis,
  };
  if (input.ratioPolicy.mode === "exact") {
    if (numerator % divisor !== 0n) return stop("needs_review", "FRACTIONAL_DERIVED_SHARES", "精确比例反推为非整股，不擅自取整；请确认披露比例是否已舍入");
    result.calculation.value = (numerator / divisor).toString();
    return stop("calculated", "SHARES_DERIVED", "按已确认精确比例反推整股；结果仍是计算值");
  }
  // ROUND_HALF_UP 区间 [r-0.5ulp, r+0.5ulp)，与 [0%,100%] 相交后取整股。
  const q = rn * scale / rd;
  const lower = q === 0n ? 0n : (2n * q - 1n) * D;
  const upper = (2n * q + 1n) * D;
  const intervalDivisor = 200n * scale;
  const min = ceil(lower, intervalDivisor);
  const maxRaw = ceil(upper, intervalDivisor) - 1n;
  const max = maxRaw > D ? D : maxRaw;
  if (min > max) return stop("needs_review", "NO_WHOLE_SHARE_SOLUTION", "指定分母下没有任何整股数量能舍入为该披露比例");
  result.calculation.possibleWholeShares = { min: min.toString(), max: max.toString() };
  return stop("calculated", "SHARES_INTERVAL_DERIVED", "披露比例已经舍入，只返回可能整股区间，不把比例中心值当成事实股数");
}
