/** D6 中标口径：消费 v0.3 信封，返回独立报告；不覆盖抽取值、不换汇、不倒算税额。 */
type Obj = Record<string, unknown>;
/** 核验状态独立于公共字段六状态。 */
export type CheckStatus = 'verified' | 'needs_review' | 'invalid' | 'skipped';
/** 可定位的原因码。 */
export interface Finding { code: string; severity: 'error' | 'review'; fields: string[]; message: string }
/** 同一事件内、具备金额分配依据的精确结果。 */
export interface Allocation { member: string; share_percent: string; amount: string; currency: string; tax_included: boolean }
/** 规范值不回写公共信封，原字段及出处完整保留。 */
export interface AwardResult {
  event_index: number; event_id: string | null; status: CheckStatus; observed: Obj; findings: Finding[];
  normalized: { currency: string | null; tax_included: boolean | null; bid_amount: string | null; amount_unit: '元' | null; consortium_members: string[]; consortium_shares: { member: string; percent: string }[] };
  calculations: { allocations: Allocation[]; allocation_status: 'not_applicable' | 'blocked' | 'calculated'; formula: string | null };
}
/** 可与 D4/D5 报告并列消费，不能替换 EventEnvelope。 */
export interface AwardReport {
  tool: 'award_check_D6'; version: '0.6.0'; input_schema_version: string | null; run_id: string | null;
  source: unknown; status: CheckStatus; findings: Finding[]; events: AwardResult[];
  audit: { evidenceMode: 'required' | 'synthetic_test'; inputMutated: false; sourceContentsVerified: false; fullEnvelopeSchemaValidated: false; exchangeRateApplied: false; taxConversionApplied: false; revenueInferred: false };
}
const STATES = ['extracted', 'needs_review', 'not_mentioned', 'not_disclosed', 'not_applicable', 'unreadable'];
const UNITS: Record<string, string> = { bidder: 'text', tenderer: 'text', project_name: 'text', bid_amount: 'cny', currency: 'text', tax_included: 'text', duration: 'text', consortium_members: 'text', consortium_shares: 'text', bid_date: 'date', contract_signed: 'text', formal_award_notice_received: 'text', price_adjustment_status: 'text', recognized_revenue: 'cny' };
const ALIASES: Record<string, string> = { CNY: 'CNY', RMB: 'CNY', 人民币: 'CNY', 人民币元: 'CNY', USD: 'USD', 美元: 'USD', 美金: 'USD', HKD: 'HKD', 港币: 'HKD', 港元: 'HKD', EUR: 'EUR', 欧元: 'EUR', JPY: 'JPY', 日元: 'JPY', GBP: 'GBP', 英镑: 'GBP', AED: 'AED', 阿联酋迪拉姆: 'AED', 迪拉姆: 'AED' };
const NONEXACT = /大约|约数|约(?:为|计|合)?\s*(?=人民币|[￥¥\d])|不超过|至多|至少|以上|以下|[<>≤≥~～]|暂定|暂估|预计|估算|上限|下限|approx|at_most/i;
const object = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const clean = (v: string): string => v.normalize('NFKC').trim();
const summarize = (f: Finding[]): CheckStatus => f.some(x => x.severity === 'error') ? 'invalid' : f.length ? 'needs_review' : 'verified';
function decimal(v: unknown): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  if (typeof v === 'number' && (!Number.isFinite(v) || Math.abs(v) > Number.MAX_SAFE_INTEGER)) return null;
  const s = String(v);
  if (s.length > 120 || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(s)) return null;
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}
function parts(v: string): [bigint, number] { const [a = '0', b = ''] = v.split('.'); return [BigInt(a + b), b.length]; }
function render(n: bigint, scale: number): string {
  const s = n.toString().padStart(scale + 1, '0');
  return decimal(scale ? `${s.slice(0, -scale)}.${s.slice(-scale)}` : s)!;
}
function multiply(a: string, b: string, divide100 = false): string {
  const [x, xs] = parts(a), [y, ys] = parts(b); return render(x * y, xs + ys + (divide100 ? 2 : 0));
}
function sum(values: string[]): string {
  const scale = Math.max(0, ...values.map(v => parts(v)[1]));
  return render(values.reduce((n, v) => { const [a, b] = parts(v); return n + a * 10n ** BigInt(scale - b); }, 0n), scale);
}
/** 明确别名归一，元/¥/$ 本身不足以确定币种。
 * @param value 已抽取币种，不从金额或地区默认 CNY。
 * @returns 支持的 ISO 代码或 null。
 */
export function normalizeCurrency(value: unknown): string | null { return text(value) ? ALIASES[clean(value).toUpperCase()] ?? null : null; }
/** 兼容公共接口字符串/布尔，不使用 Boolean('false')。
 * @param value 已披露含税状态。
 * @returns true/false；未知、空值和非白名单返回 null。
 */
export function normalizeTaxIncluded(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (!text(value)) return null;
  const s = clean(value).toLowerCase();
  return ['true', '含税', '含增值税'].includes(s) ? true : ['false', '不含税', '未含税', '不含增值税'].includes(s) ? false : null;
}
function currenciesIn(s: string): string[] {
  return [...new Set((s.match(/人民币|美元|美金|港元|港币|欧元|日元|英镑|阿联酋迪拉姆|迪拉姆|\b(?:CNY|RMB|USD|HKD|EUR|JPY|GBP|AED)\b/gi) ?? []).map(normalizeCurrency).filter((x): x is string => x !== null))];
}
function evidenceOK(refs: unknown): boolean {
  return Array.isArray(refs) && refs.length > 0 && refs.every(p => {
    if (!object(p) || !text(p.quote) || !Number.isSafeInteger(p.page) || Number(p.page) < 1 || p.degraded === true) return false;
    if (p.source_type != null && !['paragraph', 'cell'].includes(String(p.source_type))) return false;
    if (p.source_type === 'cell' && (!text(p.block_id) || !text(p.table_id) || !text(p.cell_ref))) return false;
    if (p.region != null && (!Array.isArray(p.region) || p.region.length !== 4 || !p.region.every(x => typeof x === 'number' && Number.isFinite(x)) || p.region[0] < 0 || p.region[1] < 0 || p.region[0] >= p.region[2] || p.region[1] >= p.region[3])) return false;
    return true;
  });
}
function quoted(f: Obj): string { return Array.isArray(f.provenance) ? f.provenance.filter(object).map(p => String(p.quote ?? '')).join('\n') : ''; }
// 只接受单一金额表达式；单位缺失、多值、范围、折算文本均留待复核。
function rawAmount(raw: string): string | null {
  const s = clean(raw).replace(/\s+/g, '');
  const m = /^(?:(?:人民币|CNY|RMB|￥))?((?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d+)?)(亿元|万元|元)(?:[（(](?:含税|不含税)[）)])?$/i.exec(s);
  if (!m) return null;
  const d = decimal(m[1]!.replaceAll(',', '')); return d === null ? null : multiply(d, m[2] === '亿元' ? '100000000' : m[2] === '万元' ? '10000' : '1');
}
/** 核验币种、含税与份额；有完整明确金额分配比例才生成成员金额。
 * @param input 公共 v0.3 EventEnvelope，不在本函数内修改。
 * @param options 合成示例必须显式选择 synthetic_test，生产默认 required。
 * @returns 独立报告，全部原始字段/出处和阻断原因保留。
 */
export function checkAwardEnvelope(input: unknown, options: { evidenceMode?: 'required' | 'synthetic_test' } = {}): AwardReport {
  const report: AwardReport = { tool: 'award_check_D6', version: '0.6.0', input_schema_version: null, run_id: null, source: null, status: 'invalid', findings: [], events: [], audit: { evidenceMode: 'required', inputMutated: false, sourceContentsVerified: false, fullEnvelopeSchemaValidated: false, exchangeRateApplied: false, taxConversionApplied: false, revenueInferred: false } };
  const fail = (code: string, message: string): AwardReport => { report.findings.push({ code, severity: 'error', fields: [], message }); return report; };
  if (!object(options) || Object.keys(options).some(k => k !== 'evidenceMode') || (options.evidenceMode !== undefined && !['required', 'synthetic_test'].includes(options.evidenceMode))) return fail('INVALID_OPTIONS', '仅接受 evidenceMode=required/synthetic_test');
  const mode = options.evidenceMode ?? 'required'; report.audit.evidenceMode = mode;
  if (!object(input) || input.schema_version !== '0.3' || !text(input.run_id) || typeof input.is_mock !== 'boolean' || !object(input.source) || !Array.isArray(input.events)) return fail('INVALID_ENVELOPE', '需要 v0.3 信封、run_id、is_mock、source 与 events');
  report.input_schema_version = input.schema_version; report.run_id = input.run_id; report.source = structuredClone(input.source);
  const source = input.source;
  const located = text(source.file_id) && text(source.file_name) && typeof source.file_sha256 === 'string' && /^[a-f0-9]{64}$/i.test(source.file_sha256) && (!source.file_id.startsWith('sha256:') || source.file_id.slice(7).toLowerCase() === source.file_sha256.toLowerCase());
  const counts = new Map<unknown, number>();
  for (const ev of input.events) if (object(ev)) counts.set(ev.event_id, (counts.get(ev.event_id) ?? 0) + 1);
  input.events.forEach((ev: unknown, index: number) => {
    const r: AwardResult = { event_index: index, event_id: object(ev) && text(ev.event_id) ? ev.event_id : null, status: 'invalid', observed: object(ev) && object(ev.fields) ? structuredClone(ev.fields) : {}, findings: [], normalized: { currency: null, tax_included: null, bid_amount: null, amount_unit: null, consortium_members: [], consortium_shares: [] }, calculations: { allocations: [], allocation_status: 'blocked', formula: null } };
    report.events.push(r);
    const add = (code: string, severity: Finding['severity'], fields: string[], message: string): void => { r.findings.push({ code, severity, fields, message }); };
    if (!object(ev) || !r.event_id || !/^E\d+$/.test(r.event_id) || !object(ev.fields)) { add('INVALID_EVENT', 'error', [], '事件 ID 或 fields 无效'); return; }
    if (counts.get(ev.event_id)! > 1) { add('DUPLICATE_EVENT_ID', 'error', [], '同信封事件 ID 重复，所有重复事件均不计算'); return; }
    if (ev.event_type !== 'award_contract') {
      if (['pledge', 'equity_change'].includes(String(ev.event_type))) r.status = 'skipped';
      else add('UNSUPPORTED_EVENT_TYPE', 'error', [], '事件类型未注册');
      return;
    }
    const f = ev.fields;
    const get = (name: string): Obj => object(f[name]) ? f[name] : {};
    const usable = new Set<string>();
    const sourceAllowed = mode === 'synthetic_test' ? input.is_mock === true && ev.extraction_method === 'mock' : input.is_mock === false && ['model', 'rule', 'hybrid'].includes(String(ev.extraction_method)) && located;
    if (!sourceAllowed) add('EVIDENCE_MODE_BLOCKED', 'review', [], '真实模式需来源哈希与真实抽取方法；合成模式需双 mock 标记');
    for (const [name, field] of Object.entries(f)) {
      if (!Object.hasOwn(UNITS, name)) { add('UNREGISTERED_FIELD', 'review', [name], '未注册字段仅保留，不参与计算'); continue; }
      if (!object(field) || !STATES.includes(String(field.status)) || field.unit !== UNITS[name] || (field.standardized !== undefined && typeof field.standardized !== 'boolean')) { add('INVALID_FIELD', 'error', [name], '字段状态、单位或 standardized 无效'); continue; }
      if (!['extracted', 'needs_review'].includes(String(field.status))) {
        if (field.value !== null) add('MISSING_WITH_VALUE', 'error', [name], '空态携带残留值');
        continue;
      }
      if (field.status === 'needs_review' || field.standardized === false) { add('UNCONFIRMED_FIELD', 'review', [name], '候选值不进入计算'); continue; }
      if (field.value == null || !text(field.raw_value) || field.denominator != null) { add('INVALID_FIELD', 'error', [name], '有值字段需要 raw_value，金额/文本不应带分母'); continue; }
      if (!evidenceOK(field.provenance)) { add('INCOMPLETE_OR_DEGRADED_EVIDENCE', 'review', [name], '缺少完整引用或来源降级'); continue; }
      if (sourceAllowed) usable.add(name);
    }
    for (const name of ['bid_amount', 'currency', 'tax_included', 'consortium_members', 'consortium_shares']) if (!object(f[name])) add('MISSING_FIELD', 'review', [name], '缺少口径字段，不填默认值');
    if (usable.has('currency')) {
      const c = normalizeCurrency(get('currency').value);
      const rawCurrency = clean(String(get('currency').raw_value)), tokens = currenciesIn(rawCurrency);
      if (!c) add('UNKNOWN_CURRENCY', 'review', ['currency'], '币种未明确或不在别名表，不默认 CNY');
      else if (tokens.some(x => x !== c)) add('CURRENCY_CONFLICT', 'review', ['currency'], '币种值与原文币种矛盾');
      else if (!tokens.length && !(c === 'CNY' && ['元', '万元', '亿元'].includes(rawCurrency))) add('CURRENCY_BASIS_UNCONFIRMED', 'review', ['currency'], '币种原文不明确；模糊符号不能支持标准币种');
      else r.normalized.currency = c;
    } else add('CURRENCY_UNAVAILABLE', 'review', ['currency'], '缺少已确认币种');
    if (usable.has('tax_included')) {
      const t = normalizeTaxIncluded(get('tax_included').value), raw = normalizeTaxIncluded(get('tax_included').raw_value);
      if (t === null) add('TAX_UNKNOWN', 'review', ['tax_included'], '含税状态未知，不按未税处理');
      else if (raw === null) add('TAX_BASIS_UNCONFIRMED', 'review', ['tax_included'], '原始含税表达未确认，不使用猜测的标准值');
      else if (raw !== t) add('TAX_CONFLICT', 'review', ['tax_included'], '含税状态与原文矛盾');
      else r.normalized.tax_included = t;
    } else add('TAX_UNKNOWN', 'review', ['tax_included'], '未披露/无法确认含税状态，不默认含税或不含税');
    if (usable.has('bid_amount')) {
      const a = get('bid_amount'), raw = String(a.raw_value), v = decimal(a.value), c = r.normalized.currency;
      const tokens = currenciesIn(raw), exact = !NONEXACT.test(raw + '\n' + String(a.note ?? '') + '\n' + quoted(a));
      const taxLabel = /[（(](含税|不含税)[）)]/.exec(raw)?.[1];
      if (taxLabel && r.normalized.tax_included !== null && normalizeTaxIncluded(taxLabel) !== r.normalized.tax_included) {
        add('TAX_CONFLICT', 'review', ['bid_amount', 'tax_included'], '金额上的税口径与含税字段矛盾'); r.normalized.tax_included = null;
      }
      if (v === null) add('INVALID_AMOUNT', 'error', ['bid_amount'], '金额须为非负、安全的十进制值，大数请用字符串');
      else if (a.standardized !== true) add('AMOUNT_NOT_STANDARDIZED', 'review', ['bid_amount'], '数值未明确标准化，不猜数量级');
      else if (!c || c !== 'CNY') add('FOREIGN_OR_UNKNOWN_CURRENCY', 'review', ['bid_amount', 'currency'], '公共 cny 单位不能承载未知/外币金额，不自行换汇');
      else if (tokens.length > 1 || /折合|折算|等值/.test(raw)) add('MULTI_AMOUNT_OR_FX', 'review', ['bid_amount', 'currency'], '原文含多金额/折算表达，需上游明确选定金额与币种');
      else if (tokens.some(x => x !== c)) add('CURRENCY_CONFLICT', 'review', ['bid_amount', 'currency'], '原始金额币种与 currency 不一致');
      else {
        const fromRaw = rawAmount(raw);
        if (fromRaw === null) add('AMOUNT_BASIS_UNCLEAR', 'review', ['bid_amount'], '金额不是单一明确元/万元/亿元表达，不猜单位或范围');
        else if (fromRaw !== v) add('AMOUNT_VALUE_MISMATCH', 'review', ['bid_amount'], `原文换算为 ${fromRaw} 元，与 value 不符`);
        else { r.normalized.bid_amount = v; r.normalized.amount_unit = '元'; }
      }
      if (!exact) { add('NONEXACT_AMOUNT', 'review', ['bid_amount'], '暂定/约数/上下界不能作为精确分配总额'); usable.delete('bid_amount'); }
    } else add('AMOUNT_UNAVAILABLE', 'review', ['bid_amount'], '缺少可用中标金额');
    const members = get('consortium_members'), shares = get('consortium_shares');
    const noConsortium = members.status === 'not_applicable' && shares.status === 'not_applicable';
    const consortiumMentioned = /联合体/.test(String(get('bidder').value ?? '') + String(get('bidder').raw_value ?? ''));
    if (noConsortium && !consortiumMentioned) r.calculations.allocation_status = 'not_applicable';
    else if (members.status === 'not_applicable' || shares.status === 'not_applicable') add('CONSORTIUM_STATUS_CONFLICT', 'review', ['consortium_members', 'consortium_shares'], '联合体字段或中标人信息不一致');
    else {
      if (usable.has('consortium_members') && text(members.value)) {
        const list = clean(members.value).split(/[、;；]/).map(x => x.trim());
        if (list.some(x => !x) || new Set(list).size !== list.length) add('INVALID_MEMBERS', 'error', ['consortium_members'], '名单有空成员或重复成员');
        else r.normalized.consortium_members = list;
      }
      if (!usable.has('consortium_shares') || !text(shares.value)) add('SHARES_UNAVAILABLE', 'review', ['consortium_shares'], '未披露金额份额，不均分、不按牵头身份分配、不用剩余比例补齐');
      else {
        const s = clean(shares.value), raw = clean(String(shares.raw_value));
        const prefix = /^(?:中标金额|合同金额)分配比例[:：]\s*/;
        const explicit = prefix.test(s) && prefix.test(raw) && !NONEXACT.test(raw + '\n' + quoted(shares));
        const parse = (v: string): { member: string; percent: string }[] | null => {
          const rows = v.replace(prefix, '').split(/[;；、]/).map(x => /^\s*(.+?)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*%\s*$/.exec(x));
          if (rows.some(x => !x)) return null;
          const out = rows.map(m => ({ member: m![1]!.replace(/[:：]$/, '').trim(), percent: decimal(m![2])! }));
          return out.some(x => !x.percent) ? null : out;
        };
        const ps = parse(s), prs = parse(raw);
        if (!ps || !prs || JSON.stringify(ps) !== JSON.stringify(prs)) add('SHARES_FORMAT_UNCONFIRMED', 'review', ['consortium_shares'], '仅接受逐成员明确百分比，原值与标准值需一致');
        else {
          r.normalized.consortium_shares = ps;
          const names = ps.map(p => p.member), ms = r.normalized.consortium_members;
          const identityOK = ms.length > 0 && new Set(names).size === names.length && names.length === ms.length && names.every(n => ms.includes(n));
          const total = sum(ps.map(p => p.percent));
          if (!identityOK) add('SHARE_MEMBER_MISMATCH', 'review', ['consortium_members', 'consortium_shares'], '成员缺失、重复或名称不匹配，不用简称/剩余份额推断');
          if (total !== '100') add('SHARE_TOTAL_NOT_100', 'review', ['consortium_shares'], `份额合计 ${total}%，须精确等于100%，不自动归一或补差`);
          if (!explicit) add('SHARE_BASIS_UNCONFIRMED', 'review', ['consortium_shares'], '需要明确“中标金额分配比例”或“合同金额分配比例”；工程量、股权、利润份额不能代替金额份额');
          if (identityOK && total === '100' && explicit && usable.has('bid_amount') && r.normalized.bid_amount !== null && r.normalized.currency && r.normalized.tax_included !== null && !r.findings.some(x => x.severity === 'error')) {
            r.calculations.allocations = ps.map(p => ({ member: p.member, share_percent: p.percent, amount: multiply(r.normalized.bid_amount!, p.percent, true), currency: r.normalized.currency!, tax_included: r.normalized.tax_included! }));
            r.calculations.allocation_status = 'calculated'; r.calculations.formula = 'bid_amount × share_percent ÷ 100';
            if (r.calculations.allocations.some(a => (a.amount.split('.')[1]?.length ?? 0) > 2)) add('SUBCENT_ALLOCATION', 'review', ['bid_amount', 'consortium_shares'], '精确分配结果含不足一分，不代定货币舍入或尾差分配规则');
          }
        }
      }
      if (r.calculations.allocation_status === 'blocked') add('ALLOCATION_BLOCKED', 'review', ['bid_amount', 'currency', 'tax_included', 'consortium_members', 'consortium_shares'], '拆分前提不完整，分配结果保持空数组');
    }
    r.status = summarize(r.findings);
  });
  const findings = report.events.flatMap(e => e.findings);
  report.status = findings.length ? summarize(findings) : report.events.some(e => e.status !== 'skipped') ? 'verified' : 'skipped';
  return report;
}
