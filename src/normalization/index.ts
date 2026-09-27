/** D1 numeric contract. Inputs are extracted facts, not text to be guessed from. */
export type Kind = "amount" | "shares" | "ratio";
export type Status = "present" | "not_mentioned" | "explicit_zero" | "unreadable";
export type Scope = "single" | "cumulative" | "unknown";
export type Qualifier = "exact" | "approx" | "at_most";
export type DenominatorKind = "total_share_capital" | "holder_shares" | "net_assets" | "other";

export interface MeasureInput {
  kind: Kind;
  rawText: string | null;
  rawValue: string | null; // Plain decimal string, with no thousands separator.
  sourceUnit: "元" | "万元" | "亿元" | "股" | "万股" | "亿股" | "%" | null;
  qualifier: Qualifier | null;
  scope: Scope;
  status: Status;
  denominator: { kind: DenominatorKind; definition: string } | null;
}

export interface NormalizedMeasure extends MeasureInput {
  value: string | null; // Exact decimal string; null is never zero.
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

function shiftDecimal(raw: string, places: number): string {
  const negative = raw.startsWith("-");
  const [whole, fraction = ""] = (negative ? raw.slice(1) : raw).split(".");
  const point = whole.length + places;
  const digits = (whole + fraction).padEnd(point + 1, "0");
  const integer = digits.slice(0, point).replace(/^0+(?=\d)/, "");
  const decimal = digits.slice(point).replace(/0+$/, "");
  const normalized = integer + (decimal ? `.${decimal}` : "");
  return negative && normalized !== "0" ? `-${normalized}` : normalized;
}

export function normalize(input: MeasureInput): NormalizedMeasure {
  if (!Object.hasOwn(factors, input.kind) || !statuses.includes(input.status) || !scopes.includes(input.scope)) {
    throw new Error("Invalid kind, status or scope");
  }
  const unit = canonicalUnits[input.kind];
  if (input.kind === "ratio" && (input.status === "present" || input.status === "explicit_zero")) {
    if (!input.denominator || !denominators.includes(input.denominator.kind) || !input.denominator.definition.trim()) {
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
