/** 方轩诚 D4 公共入口：先审查比较依据，再调用 D3 算术核验。 */
import { normalize } from "../normalization/normalization_D4.ts";
import { parsePledgeInput, verifyPledge as calculate, type PledgeResult as ArithmeticResult, type PledgeInput } from "./pledge_arithmetic_D4.ts";
export type { Fact, PledgeInput, Basis } from "./pledge_arithmetic_D4.ts";
export { parsePledgeInput };

export interface CheckOptions {
  evidenceMode?: "required" | "synthetic_test";
}
export interface Anomaly {
  code: string;
  severity: "error" | "review";
  field: string;
  message: string;
}
export interface CheckResult extends Omit<ArithmeticResult, "tool" | "version"> {
  tool: "pledge_check_D4";
  version: "0.4.0";
  anomalies: Anomaly[];
  audit: {
    evidenceMode: "required" | "synthetic_test";
    evidenceStatus: "not_checked" | "incomplete" | "located" | "synthetic";
    prerequisitesMet: boolean;
    sourceContentsVerified: false;
  };
}
export type PledgeResult = CheckResult;

/** 同 D3 六字段输入。默认要求完整真实来源引用；synthetic_test 仅接受合成字段。 */
export function checkPledge(value: unknown, options: CheckOptions = {}): CheckResult {
  const result: CheckResult = {
    id: null, tool: "pledge_check_D4", version: "0.4.0", status: "invalid", reasons: [],
    normalized: { shares: null, ratio: null, denominator: null }, calculation: null, comparison: null,
    anomalies: [], audit: { evidenceMode: "required", evidenceStatus: "not_checked", prerequisitesMet: false, sourceContentsVerified: false },
  };
  const add = (code: string, severity: Anomaly["severity"], field: string, message: string): void => {
    result.anomalies.push({ code, severity, field, message });
  };
  const blocked = (): CheckResult => {
    result.status = result.anomalies.some(item => item.severity === "error") ? "invalid" : "needs_review";
    result.reasons = result.anomalies.map(({ code, message }) => ({ code, message }));
    // 被阻断时从未调用 calculate，不能泄露部分关系计算结果。
    return result;
  };
  if (!options || typeof options !== "object" || Array.isArray(options) ||
      Object.keys(options).some(key => key !== "evidenceMode") ||
      (options.evidenceMode !== undefined && !["required", "synthetic_test"].includes(options.evidenceMode))) {
    add("INVALID_OPTIONS", "error", "options", "evidenceMode 仅支持 required 或 synthetic_test；不接受其他选项");
    return blocked();
  }
  const mode = options.evidenceMode ?? "required";
  result.audit.evidenceMode = mode;
  let input: PledgeInput;
  try {
    input = parsePledgeInput(value);
    result.id = input.id;
  } catch (error) {
    add("INVALID_INPUT", "error", "input", error instanceof Error ? error.message : String(error));
    return blocked();
  }
  const inputs = { shares: input.shares, ratio: input.ratio, denominator: input.denominator?.fact ?? null };
  for (const field of ["shares", "ratio", "denominator"] as const) {
    const fact = inputs[field];
    if (!fact) continue;
    try {
      result.normalized[field] = { ...fact, measure: normalize(fact.measure, { allowUnknownRatioDenominator: true }) };
      const kind = field === "ratio" ? "ratio" : "shares";
      if (fact.measure.kind !== kind) add("FIELD_KIND_MISMATCH", "error", field, `${field} 必须是 ${kind}`);
    } catch (error) {
      add("INVALID_MEASURE", "error", field, error instanceof Error ? error.message : String(error));
    }
  }
  if (result.anomalies.length) return blocked();
  const { shares, ratio, denominator } = result.normalized;
  const s = shares?.measure.value ?? null;
  const r = ratio?.measure.value ?? null;
  const d = denominator?.measure.value ?? null;
  const basis = input.denominator?.kind ?? "unknown";
  const active = (["shares", "ratio", "denominator"] as const)
    .flatMap(field => {
      const fact = result.normalized[field];
      return fact !== null && fact.measure.value !== null ? [{ field, fact }] : [];
    });
  const numerators = active.filter(row => row.field !== "denominator");
  const primary = numerators[0]?.fact;

  // 单字段合法性不依赖其他字段；禁止先做 S>D 这类需要同口径依据的关系检查。
  for (const { field, fact } of active) {
    if (fact.measure.qualifier !== "exact") {
      add("NONEXACT_FACT", "review", field, "约数或上界不是已发生精确值，不参与等式/大小关系核验");
      continue;
    }
    if (fact.measure.value!.startsWith("-")) add("NEGATIVE_VALUE", "error", field, "质押数量、比例及分母不能为负；本接口不是变动量接口");
  }
  if (d === "0" && denominator?.measure.qualifier === "exact") add("ZERO_DENOMINATOR", "error", "denominator", "分母明确为零，不可除法；0/0 也不能推定为 0%");
  if (r !== null && !r.startsWith("-")) {
    const [whole = "0", fraction = ""] = r.split(".");
    const n = BigInt(whole + fraction);
    const scale = 10n ** BigInt(fraction.length);
    if (ratio!.measure.qualifier === "exact" && n > 100n * scale) add("RATIO_OUT_OF_RANGE", "error", "ratio", "质押比例必须在 0%–100% 内");
    if (ratio!.measure.qualifier === "exact" && input.ratioPolicy.mode === "rounded" && n * 10n ** BigInt(input.ratioPolicy.decimalPlaces) % scale !== 0n) {
      add("RATIO_PRECISION_MISMATCH", "error", "ratioPolicy", "披露比例无法按指定小数位表示，不自动调整精度");
    }
    if (ratio!.measure.denominator === null) add("UNKNOWN_RATIO_DENOMINATOR", "review", "ratio", "比例原文分母未明确；即使提供了某个股数也不猜它就是该比例的分母");
    else if (basis !== "unknown" && ratio!.measure.denominator.kind !== basis) {
      add("DENOMINATOR_MISMATCH", "review", "ratio", "占持股、占总股本或其他分母口径不同，不能直接比较");
    }
  }
  if (s === null && r === null) add("NO_NUMERATOR", "review", "shares,ratio", "没有可用股数或比例；缺失和无法读取不填零");
  if (basis === "unknown") add("UNKNOWN_DENOMINATOR", "review", "denominator", "分母种类未知，禁止通过股数÷比例反推后继续核验");
  else if (d === null) add("MISSING_DENOMINATOR", "review", "denominator", "分母数值未提及、无法读取或未提供，不参与关系计算");

  for (const { field, fact } of numerators) {
    if (fact.measure.scope === "unknown") add("UNKNOWN_SCOPE", "review", field, "单次/累计未确认");
  }
  const scopes = new Set(numerators.map(row => row.fact.measure.scope).filter(scope => scope !== "unknown"));
  if (scopes.size > 1) add("SCOPE_MISMATCH", "review", "shares,ratio", "单次与累计不能相互比较或替换");
  for (const { field, fact } of active) {
    const c = fact.context;
    if (!c.companyId || !c.asOf) add("MISSING_CONTEXT", "review", field, "缺少公司标识或统计时点；不得使用上传日期补齐");
    if (primary && ((c.companyId && primary.context.companyId && c.companyId !== primary.context.companyId) ||
        (c.asOf && primary.context.asOf && c.asOf !== primary.context.asOf))) {
      add("CONTEXT_MISMATCH", "review", field, "主体或统计时点不同，不能认定为同口径数值矛盾");
    }
    if (field !== "denominator" || basis === "holder_shares") {
      if (!c.holderId) add("MISSING_HOLDER", "review", field, "缺股东/明确股东组标识");
      else if (primary?.context.holderId && c.holderId !== primary.context.holderId) add("HOLDER_MISMATCH", "review", field, "股东或股东组不一致");
    }
  }
  if (numerators.length && numerators.every(row => row.fact.measure.scope === "single")) {
    for (const { field, fact } of numerators) {
      if (!fact.context.eventId) add("MISSING_EVENT", "review", field, "单次值缺少事件标识");
      else if (primary?.context.eventId && fact.context.eventId !== primary.context.eventId) add("EVENT_MISMATCH", "review", field, "不是同一个单次事件");
    }
  }

  let sourceIssues = false;
  for (const { field, fact } of active) {
    const source = fact.source;
    if (mode === "synthetic_test") {
      if (source.sampleType !== "synthetic") {
        sourceIssues = true;
        add("REAL_DATA_IN_SYNTHETIC_MODE", "review", field, "合成测试模式不处理 real 字段，不能用它绕过真实来源引用要求");
      }
    } else if (source.sampleType !== "real") {
      sourceIssues = true;
      add("SYNTHETIC_EVIDENCE", "review", field, "合成数据不能作为真实来源依据；仅显式 synthetic_test 模式可用于测试");
    } else if (source.sha256 === null || source.page === null) {
      sourceIssues = true;
      add("MISSING_SOURCE_REFERENCE", "review", field, "缺少来源 SHA-256 或页码；不根据数字搜索补造出处");
    }
  }
  result.audit.evidenceStatus = !active.length ? "not_checked" : sourceIssues ? "incomplete" : mode === "synthetic_test" ? "synthetic" : "located";
  if (result.anomalies.length) return blocked();

  result.audit.prerequisitesMet = true;
  const arithmetic = calculate(input);
  result.status = arithmetic.status;
  result.calculation = arithmetic.calculation;
  result.comparison = arithmetic.comparison;
  result.reasons = arithmetic.reasons;
  if (["mismatch", "needs_review", "invalid"].includes(arithmetic.status)) {
    result.anomalies = arithmetic.reasons.map(reason => ({ ...reason, field: "relationship", severity: arithmetic.status === "needs_review" ? "review" : "error" }));
  }
  return result;
}

/** 保留 D3 调用者熟悉的函数名；采用 D4 更严格的依据检查，不提供静默降级通道。 */
export const verifyPledge = checkPledge;
