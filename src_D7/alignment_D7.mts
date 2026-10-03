/** B接口提案：只生成可追溯的双侧字段，不执行D8同事件判定或D9金额比较。 */
import { eventContext, inspectField, isObject, type Obj } from './normalization_D7.mts';
/** 明确选择某份信封中的事件，不按公司名猜测关联。 */
export interface SideInput { envelope: unknown; event_id: string; unit_hints?: Record<string, string> }
const IDENTITIES: Record<string, string[]> = { pledge: ['pledgor', 'pledgee', 'direction', 'start_date', 'end_date', 'announcement_date'], equity_change: ['holder', 'direction', 'method', 'change_date'], award_contract: ['bidder', 'tenderer', 'project_name', 'bid_date', 'contract_signed', 'formal_award_notice_received'] };
function side(input: SideInput): Obj {
  const e = input.envelope;
  if (!isObject(e) || e.schema_version !== '0.3' || !Array.isArray(e.events) || !isObject(e.source) || typeof e.run_id !== 'string' || typeof e.is_mock !== 'boolean') throw new Error('INVALID_A_ENVELOPE');
  const source = e.source;
  if (typeof source.file_sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(source.file_sha256) || typeof source.file_id !== 'string' || !source.file_id.trim() || typeof source.file_name !== 'string' || !source.file_name.trim()) throw new Error('SOURCE_ID_REQUIRED');
  const matches = e.events.filter(x => isObject(x) && x.event_id === input.event_id);
  if (matches.length !== 1) throw new Error('EVENT_NOT_UNIQUE');
  const ev = matches[0] as Obj;
  if (!isObject(ev.fields) || !Object.hasOwn(IDENTITIES, String(ev.event_type))) throw new Error('UNSUPPORTED_EVENT');
  const fields = ev.fields, identities: Obj = {}, observations: Obj = {}, basisFields: Obj = {};
  for (const name of IDENTITIES[String(ev.event_type)]!) identities[name] = fields[name] ?? null;
  for (const name of ['currency', 'tax_included', 'consortium_members', 'consortium_shares', 'price_adjustment_status']) basisFields[name] = fields[name] ?? null;
  for (const [name, f] of Object.entries(fields)) {
    if (!isObject(f)) throw new Error('INVALID_FIELD');
    const scope = name.endsWith('_this_time') || name.includes('_this_time_') ? 'single' : name.endsWith('_cumulative') || name.includes('_cumulative_') ? 'cumulative' : name.endsWith('_before') ? 'before' : name.endsWith('_after') ? 'after' : 'unknown';
    const n = inspectField(name, f, input.unit_hints?.[`${ev.event_id}.${name}`] ?? null, eventContext(ev));
    observations[name] = { original: f, normalized_value: n.status === 'normalized' ? n.value : null, normalization_status: n.status, normalization_reason: n.code, scope, denominator: f.denominator ?? null, qualifier: n.qualifier };
  }
  return structuredClone({ source: { ...source, source_schema_version: e.schema_version, run_id: e.run_id, is_mock: e.is_mock, code_version: isObject(e.run_meta) ? e.run_meta.code_version ?? null : null }, event_id: ev.event_id, event_type: ev.event_type, locator: `${source.file_sha256}/${e.run_id}/${ev.event_id}`, identity_fields: identities, basis_fields: basisFields, observations });
}
/** 构造B双侧字段样例，默认阻断比较。
 * @param pairId 样例对ID。
 * @param left 左侧A信封与事件ID。
 * @param right 右侧A信封与事件ID。
 * @returns 独立schema版本的提案对象，所有pair均unknown/may_compare=false。
 */
export function buildAlignmentPair(pairId: string, left: SideInput, right: SideInput): Obj {
  if (typeof pairId !== 'string' || !pairId.trim()) throw new Error('PAIR_ID_REQUIRED');
  return { schema_version: 'b-alignment-draft/0.1', interface_status: 'proposal_D7', pair_id: pairId, left: side(left), right: side(right), alignment: { status: 'unknown', reason_codes: ['ALIGNMENT_NOT_RUN_D7'], may_compare: false, conflict: null }, audit: { input_mutated: false, source_contents_verified: false, full_a_schema_validated: false, cross_document_matching_executed: false } };
}
