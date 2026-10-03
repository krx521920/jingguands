/** D7 统计：固定样本清单决定分母，文本与数值标准化分开统计。 */
import { canonicalDecimal, eventContext, inspectField, isObject, type Obj } from './normalization_D7.mts';
/** 每份预期输入都必须有记录；失败时actual=null，不能删行。 */
export interface Sample { case_id: string; cohort: 'core' | 'adversarial' | 'scan'; gold: Obj | null; actual: Obj | null; execution: 'completed' | 'failed' | 'skipped'; format_valid: boolean | null; event_map?: Record<string, string>; unit_hints?: Record<string, string> }
const EMPTY = ['not_mentioned', 'not_disclosed', 'not_applicable', 'unreadable'];
const BOOL_FIELDS = ['tax_included', 'contract_signed', 'formal_award_notice_received'];
function equivalent(name: string, a: Obj | undefined, b: Obj): boolean {
  if (!a || a.status !== b.status || a.unit !== b.unit || (a.denominator ?? null) !== (b.denominator ?? null)) return false;
  if (['cny', 'shares', 'percent'].includes(String(b.unit))) { const n = canonicalDecimal(a.value); return n !== null && n === canonicalDecimal(b.value); }
  if (BOOL_FIELDS.includes(name)) return String(a.value) === String(b.value);
  return a.value === b.value;
}
/** n/a分母返回null，不冒充0%或100%。
 * @param n 命中数。
 * @param d 固定分母。
 * @returns 可追溯的分子、分母和比率。
 */
export function metric(n: number, d: number): { numerator: number; denominator: number; rate: number | null } { return { numerator: n, denominator: d, rate: d ? n / d : null }; }
/** 独立重算数值规范性，不将与Gold相同视为原文规范化正确。
 * @param samples 包含失败/跳过项的预期样本清单；core有Gold，其他队列单列。
 * @returns 描述性统计，不覆盖评测方正式报告，不决定现场验收通过。
 */
export function summarizeSamples(samples: Sample[]): Obj {
  const ids = new Set<string>();
  for (const s of samples) {
    if (!s.case_id || ids.has(s.case_id)) throw new Error('MISSING_OR_DUPLICATE_CASE_ID'); ids.add(s.case_id);
    if (!['core', 'adversarial', 'scan'].includes(s.cohort) || !['completed', 'failed', 'skipped'].includes(s.execution)) throw new Error('INVALID_SAMPLE');
    if (s.cohort === 'core' && (!isObject(s.gold) || !Array.isArray(s.gold.events))) throw new Error('CORE_GOLD_REQUIRED');
    if (s.execution === 'completed' && (!isObject(s.actual) || !Array.isArray(s.actual.events))) throw new Error('COMPLETED_OUTPUT_REQUIRED');
    if (s.execution !== 'completed' && s.actual !== null) throw new Error('FAILED_SAMPLE_HAS_OUTPUT');
    if (![true, false, null].includes(s.format_valid)) throw new Error('INVALID_FORMAT_STATUS');
    if (s.event_map !== undefined && (!isObject(s.event_map) || Object.values(s.event_map).some(v => typeof v !== 'string') || new Set(Object.values(s.event_map)).size !== Object.keys(s.event_map).length)) throw new Error('EVENT_MAP_NOT_ONE_TO_ONE');
  }
  const core = samples.filter(s => s.cohort === 'core');
  let fields = 0, hits = 0, numeric = 0, attempted = 0, normalized = 0, empty = 0, wrong = 0, oldEmpty = 0, oldWrong = 0, events = 0, matched = 0, extras = 0;
  const rows: Obj[] = [];
  for (const s of core) {
    const goldEvents = s.gold!.events as unknown[], actualEvents = s.actual?.events as unknown[] | undefined;
    const actual = Array.isArray(actualEvents) ? actualEvents.filter(isObject) : [];
    const goldIds = new Set<string>();
    for (const ge of goldEvents) {
      if (!isObject(ge) || typeof ge.event_id !== 'string' || goldIds.has(ge.event_id) || !isObject(ge.fields)) throw new Error('INVALID_OR_DUPLICATE_GOLD_EVENT');
      goldIds.add(ge.event_id); events++;
      const mappedId = s.event_map === undefined ? ge.event_id : s.event_map[ge.event_id];
      const candidates = actual.filter(a => a.event_id === mappedId && a.event_type === ge.event_type);
      const ae = candidates.length === 1 ? candidates[0] : undefined;
      if (ae) matched++;
      const afs = ae && isObject(ae.fields) ? ae.fields : {};
      for (const [name, gf] of Object.entries(ge.fields)) {
        if (!isObject(gf)) throw new Error('INVALID_GOLD_FIELD');
        const af = isObject(afs[name]) ? afs[name] : undefined;
        if (EMPTY.includes(String(gf.status))) {
          empty++; const fill = af?.value != null;
          if (fill) wrong++;
          if (['not_mentioned', 'unreadable'].includes(String(gf.status))) { oldEmpty++; if (fill) oldWrong++; }
        }
        if (gf.status !== 'extracted' || gf.value == null) continue;
        fields++; const hit = equivalent(name, af, gf); if (hit) hits++;
        if (!['cny', 'shares', 'percent'].includes(String(gf.unit))) continue;
        numeric++;
        const attempt = af?.status === 'extracted' && af.value != null;
        if (attempt) attempted++;
        const r = af && ae ? inspectField(name, af, s.unit_hints?.[`${ae.event_id}.${name}`] ?? null, eventContext(ae)) : null;
        const verified = attempt && af!.unit === gf.unit && (af!.denominator ?? null) === (gf.denominator ?? null) && af!.standardized === true && r?.status === 'normalized' && canonicalDecimal(af!.value) === r.value;
        if (verified) normalized++;
        rows.push({ case_id: s.case_id, event_id: ge.event_id, field: name, gold_match: hit, attempt, raw_normalization_verified: Boolean(verified), code: !attempt ? 'NOT_EXTRACTED' : r?.status === 'normalized' && !verified ? 'STANDARD_VALUE_OR_BASIS_MISMATCH' : r?.code ?? 'MISSING_OUTPUT', observed_value: af?.value ?? null, independently_normalized_value: r?.value ?? null });
      }
    }
    extras += actual.filter(a => !goldEvents.some(g => isObject(g) && (s.event_map === undefined ? g.event_id : s.event_map[String(g.event_id)]) === a.event_id && g.event_type === a.event_type)).length;
  }
  return {
    tool: 'statistics_D7', version: '0.7.0', input_count: samples.length,
    metric_semantics: 'field_value_agreement是与冻结Gold一致性；numeric_normalization是独立复算验证覆盖率，未验证不等于错误；条件比率必须连同端到端覆盖率解读',
    cohorts: Object.fromEntries(['core', 'adversarial', 'scan'].map(c => { const a = samples.filter(s => s.cohort === c); return [c, { total: a.length, completed: a.filter(s => s.execution === 'completed').length, failed: a.filter(s => s.execution === 'failed').length, skipped: a.filter(s => s.execution === 'skipped').length }]; })),
    field_value_agreement: metric(hits, fields), event_coverage: metric(matched, events), extra_events: extras,
    numeric_normalization_end_to_end: metric(normalized, numeric), numeric_normalization_conditional: metric(normalized, attempted), numeric_extraction_coverage: metric(attempted, numeric),
    wrong_fill_all_empty_states: metric(wrong, empty), wrong_fill_legacy_two_states: metric(oldWrong, oldEmpty),
    format_compliance: metric(core.filter(s => s.format_valid === true && s.execution === 'completed').length, core.length), format_unverified: core.filter(s => s.format_valid === null).length,
    evidence_accuracy: null, evidence_accuracy_reason: '需要独立证据审核记录；字段值相同不代表出处命中',
    event_matching_policy: '冻结文件内优先使用显式event_map；未提供时按本地event_id+event_type；不能用于B同事件判定', rows,
  };
}
