/** D7 标准化适配：修复首数字提取、无单位默认、失败残留标准化标志。 */
import { normalize, type MeasureInput } from './decimal_D7.mts';
export { normalize } from './decimal_D7.mts';
/** 公共 JSON 对象；跨 JSON 边界逐项检查。 */
export type Obj = Record<string, unknown>;
/** 可选上下文仅来自同一事件及已定位表头。 */
export interface Context { currency?: unknown; currencyRaw?: unknown; eventType?: unknown; direction?: unknown }
/** 一字段审计结果，input 始终保持原样。 */
export interface NormalizationResult { status: 'normalized' | 'blocked' | 'not_applicable'; code: string; value: string | null; qualifier: string | null; source_unit: string | null; field: Obj }
export const isObject = (x: unknown): x is Obj => x !== null && typeof x === 'object' && !Array.isArray(x);
const KINDS = { shares: 'shares', cny: 'amount', percent: 'ratio' } as const;
const STATES = ['extracted', 'needs_review', 'not_mentioned', 'not_disclosed', 'not_applicable', 'unreadable'];
const currencyAliases: Record<string, string> = { CNY: 'CNY', RMB: 'CNY', 人民币: 'CNY', USD: 'USD', 美元: 'USD', 美金: 'USD', HKD: 'HKD', 港币: 'HKD', 港元: 'HKD', EUR: 'EUR', 欧元: 'EUR', JPY: 'JPY', 日元: 'JPY', AED: 'AED', 阿联酋迪拉姆: 'AED', 迪拉姆: 'AED', GBP: 'GBP', 英镑: 'GBP' };
const currency = (v: unknown): string | null => typeof v === 'string' ? currencyAliases[v.trim().toUpperCase()] ?? null : null;
function currencies(raw: string): string[] { return [...new Set((raw.match(/人民币|美元|美金|港币|港元|欧元|日元|阿联酋迪拉姆|迪拉姆|英镑|\b(?:CNY|RMB|USD|HKD|EUR|JPY|AED|GBP)\b/gi) ?? []).map(s => currency(s)!))]; }
/** 保留完全十进制值，不把 null/空串转零。
 * @param v 数字或十进制字符串。
 * @returns 规范字符串，超安全范围数字返回 null。
 */
export function canonicalDecimal(v: unknown): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  if (typeof v === 'number' && (!Number.isFinite(v) || Math.abs(v) > Number.MAX_SAFE_INTEGER)) return null;
  const s = String(v); if (s.length > 120 || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(s)) return null;
  const n = s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
  return n === '-0' ? '0' : n;
}
/** 独立复算，不改变输入；有歧义时只降级副本，保留候选值和原文。
 * @param name 公共字段名。
 * @param input v0.3 FieldValue。
 * @param unitHint 同字段已定位表头单位，不能来自相邻列猜测。
 * @param context 同事件币种与方向。
 * @returns 原文复算结果与可供下游使用的字段副本。
 */
export function inspectField(name: string, input: unknown, unitHint: string | null = null, context: Context = {}): NormalizationResult {
  const field = isObject(input) ? structuredClone(input) : {};
  const out: NormalizationResult = { status: 'blocked', code: 'INVALID_FIELD', value: null, qualifier: null, source_unit: null, field };
  const block = (code: string): NormalizationResult => { out.code = code; field.standardized = false; if (['extracted', 'needs_review'].includes(String(field.status))) field.status = 'needs_review'; return out; };
  if (!STATES.includes(String(field.status))) return block('INVALID_STATUS');
  if (!Object.hasOwn(KINDS, String(field.unit))) { out.status = 'not_applicable'; out.code = 'NON_NUMERIC'; return out; }
  if (!['extracted', 'needs_review'].includes(String(field.status))) {
    if (field.value !== null) return block('MISSING_WITH_VALUE');
    out.status = 'not_applicable'; out.code = 'EMPTY_STATE'; return out;
  }
  if (field.status !== 'extracted') return block('INPUT_NEEDS_REVIEW');
  if (typeof field.raw_value !== 'string' || !field.raw_value.trim()) return block('RAW_VALUE_MISSING');
  const raw = field.raw_value.normalize('NFKC').trim();
  if (raw.length > 2000) return block('RAW_TOO_LONG');
  if (/[~～<>≤≥]|至少|以上|以下|暂定|暂估|预计|估算/.test(raw)) return block('UNSUPPORTED_QUALIFIER');
  const qualifier = /不超过|不高于|不多于|最多/.test(raw) ? 'at_most' : /大约|约数|约(?:为|计|合)?\s*(?=人民币|[￥¥\d])/.test(raw) ? 'approx' : 'exact';
  out.qualifier = qualifier;
  if (field.unit === 'cny') {
    const tokens = currencies(raw), declared = currency(context.currency), cRaw = typeof context.currencyRaw === 'string' ? currencies(context.currencyRaw) : [];
    if (tokens.length > 1 || /折合|折算|等值/.test(raw)) return block('MULTI_CURRENCY_OR_FX');
    if (tokens.some(c => c !== 'CNY') || (declared !== null && declared !== 'CNY') || cRaw.some(c => c !== 'CNY')) return block('CURRENCY_CONFLICT');
    if (!tokens.includes('CNY') && declared !== 'CNY') return block('CURRENCY_UNKNOWN');
  }
  if (!/\d/.test(raw)) return block('MULTIPLE_OR_MISSING_NUMBERS');
  const unitMatches = [...raw.matchAll(/\d\s*(亿股|万股|亿元|万元|股|元|%)/g)].map(m => m[1]!);
  const allowed = field.unit === 'shares' ? ['股', '万股', '亿股'] : field.unit === 'cny' ? ['元', '万元', '亿元'] : ['%'];
  const knownUnits = [...new Set(unitMatches)];
  if (knownUnits.some(u => !allowed.includes(u)) || knownUnits.length > 1) return block('UNIT_CONFLICT');
  if (unitHint !== null && !allowed.includes(unitHint)) return block('INVALID_UNIT_HINT');
  if (knownUnits.length && unitHint && knownUnits[0] !== unitHint) return block('UNIT_HINT_CONFLICT');
  const unit = knownUnits[0] ?? unitHint;
  if (!unit) return block('UNIT_MISSING');
  out.source_unit = unit;
  // 完整数字串必须只有一组，禁止从日期、范围、两个金额中抓首值。
  const numeric = raw.match(/[+-]?\d[\d,]*(?:\.\d+)?/g) ?? [];
  if (numeric.length !== 1) return block('MULTIPLE_OR_MISSING_NUMBERS');
  const token = numeric[0]!;
  if (!/^-?(?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d+)?$/.test(token) || /\d\s+\d|\d(?:[eE][+-]?\d|\/\d)/.test(raw)) return block('INVALID_NUMERIC_TOKEN');
  let value = canonicalDecimal(token.replaceAll(',', ''));
  if (value === null) return block('INVALID_DECIMAL');
  if (value.startsWith('-')) {
    if (name === 'change_shares' && context.eventType === 'equity_change' && ['increase', 'decrease'].includes(String(context.direction))) value = value.slice(1);
    else return block('NEGATIVE_VALUE');
  }
  const denominator = field.unit === 'percent' && ['holder_shares', 'total_share_capital', 'net_assets', 'other'].includes(String(field.denominator)) ? { kind: field.denominator as 'holder_shares' | 'total_share_capital' | 'net_assets' | 'other', definition: String(field.denominator) } : null;
  if (field.unit !== 'percent' && field.denominator != null) return block('UNEXPECTED_DENOMINATOR');
  try {
    const measure: MeasureInput = { kind: KINDS[field.unit as keyof typeof KINDS], rawText: raw, rawValue: value, sourceUnit: unit as MeasureInput['sourceUnit'], qualifier, scope: name.endsWith('_cumulative') ? 'cumulative' : name.endsWith('_this_time') ? 'single' : 'unknown', status: value === '0' && qualifier === 'exact' ? 'explicit_zero' : 'present', denominator };
    const n = normalize(measure);
    out.status = 'normalized'; out.code = 'NORMALIZED'; out.value = n.value;
    field.value = n.value; field.standardized = true;
    // note中幂等标注限定词，不丢掉约数/上界。
    if (qualifier !== 'exact') { const marker = qualifier === 'approx' ? '［约数］' : '［上限值］'; const note = typeof field.note === 'string' ? field.note : ''; if (!note.includes(marker)) field.note = note + marker; }
    return out;
  } catch { return block(field.unit === 'percent' && !denominator ? 'RATIO_BASIS_MISSING' : 'NORMALIZATION_REJECTED'); }
}
/** 与上游 normalizeFieldValue 调用方式兼容，成功null、失败原因字符串。
 * @param name 字段名。
 * @param field 要更新的字段，raw_value和出处保留。
 * @param unitHint 已定位单位。
 * @param context 同事件币种/方向；金额仅写“元”时必须提供币种。
 * @returns 标准化错误或null；失败清除standardized，候选值标needs_review。
 */
export function normalizeFieldValue(name: string, field: Obj, unitHint: string | null = null, context: Context = {}): string | null {
  const r = inspectField(name, field, unitHint, context); Object.assign(field, r.field);
  return r.status === 'blocked' ? `[标准化_D7] ${name}: ${r.code}` : null;
}
/** 为同事件提供已确认文本上下文，不从缺失状态残留值取数。
 * @param event 公共事件。
 * @returns 标准化上下文。
 */
export function eventContext(event: Obj): Context {
  const f = isObject(event.fields) ? event.fields : {}, c = isObject(f.currency) ? f.currency : {}, d = isObject(f.direction) ? f.direction : {};
  return { eventType: event.event_type, currency: c.status === 'extracted' ? c.value : null, currencyRaw: c.status === 'extracted' ? c.raw_value : null, direction: d.status === 'extracted' ? d.value : null };
}
/** 生成新的A信封及修复记录；事件/字段不删减，原输入不变。
 * @param input 公共v0.3信封。
 * @param hints 键为event_id.field_name，值为已核验表头单位。
 * @returns 标准化副本及逐字段审计记录。
 */
export function normalizeEnvelope(input: unknown, hints: Record<string, string> = {}): { envelope: Obj; changes: Obj[] } {
  if (!isObject(input) || input.schema_version !== '0.3' || !Array.isArray(input.events)) throw new Error('INVALID_ENVELOPE');
  const envelope = structuredClone(input), changes: Obj[] = [];
  const ids = new Set<string>();
  for (const ev of envelope.events as unknown[]) {
    if (!isObject(ev) || !isObject(ev.fields) || typeof ev.event_id !== 'string' || !/^E\d+$/.test(ev.event_id)) throw new Error('INVALID_EVENT');
    if (ids.has(ev.event_id)) throw new Error('DUPLICATE_EVENT_ID'); ids.add(ev.event_id);
    for (const [name, f] of Object.entries(ev.fields)) {
      const r = inspectField(name, f, hints[`${ev.event_id}.${name}`] ?? null, eventContext(ev));
      if (r.status === 'not_applicable') continue;
      if (JSON.stringify(f) !== JSON.stringify(r.field)) changes.push({ event_id: ev.event_id, field: name, code: r.code, before: structuredClone(f), after: structuredClone(r.field) });
      ev.fields[name] = r.field;
    }
  }
  return { envelope, changes };
}
/** 从同源解析块的明确表头取得单位，不跨块按数字反搜。
 * @param envelope A信封。
 * @param parsed 张方evidence解析对象，文件SHA必须相符。
 * @returns event_id.field_name单位映射与可追溯依据。
 */
export function resolveUnitHints(envelope: unknown, parsed: unknown): { hints: Record<string, string>; evidence: Obj[] } {
  if (!isObject(envelope) || !isObject(envelope.source) || !Array.isArray(envelope.events) || !isObject(parsed) || !isObject(parsed.doc) || !Array.isArray(parsed.pages) || typeof envelope.source.file_sha256 !== 'string' || envelope.source.file_sha256 !== parsed.doc.file_sha256) throw new Error('PARSER_SOURCE_MISMATCH');
  const blocks = new Map<string, Obj>();
  for (const page of parsed.pages) if (isObject(page) && Array.isArray(page.blocks)) for (const b of page.blocks) if (isObject(b) && typeof b.block_id === 'string') {
    if (blocks.has(b.block_id)) throw new Error('DUPLICATE_BLOCK_ID');
    blocks.set(b.block_id, { ...b, page: b.page ?? page.page });
  }
  const hints: Record<string, string> = {}, evidence: Obj[] = [];
  for (const ev of envelope.events) if (isObject(ev) && isObject(ev.fields)) for (const [name, f] of Object.entries(ev.fields)) {
    if (!isObject(f) || !Array.isArray(f.provenance) || !Object.hasOwn(KINDS, String(f.unit))) continue;
    const found: { unit: string; ref: Obj; header: string }[] = [];
    for (const ref of f.provenance) {
      if (!isObject(ref) || typeof ref.block_id !== 'string' || typeof ref.quote !== 'string' || !ref.quote.trim()) continue;
      const block = blocks.get(ref.block_id), table = block && isObject(block.table_ref) ? block.table_ref : null;
      if (!block || block.page !== ref.page || block.degraded === true || ref.degraded === true || ref.source_type !== 'cell' || !table || ref.table_id !== table.table_id || ref.cell_ref !== table.cell_ref || typeof block.text_raw !== 'string' || !block.text_raw.includes(ref.quote)) continue;
      const header = block.header_path ?? table.header_path;
      if (typeof header !== 'string') continue;
      const hs = header.normalize('NFKC');
      const units = [...hs.matchAll(/(?:\(|单位\s*[:：])\s*(亿股|万股|股|亿元|万元|元|%)\s*(?:\)|$)/g)].map(m => m[1]!);
      const unique = [...new Set(units)];
      if (unique.length === 1) found.push({ unit: unique[0]!, ref, header });
    }
    if (found.length && new Set(found.map(x => x.unit)).size === 1) {
      const key = `${ev.event_id}.${name}`; hints[key] = found[0]!.unit;
      evidence.push({ key, source_sha256: envelope.source.file_sha256, unit: hints[key], references: found });
    }
  }
  return { hints, evidence };
}
