/** D8 保守事件对齐。只作 same/different/unknown 判定，不作金额比较或跨事件合并。 */
import { createHash } from 'node:crypto';

const TYPES = ['pledge', 'equity_change', 'award_contract'];
const KEY_KINDS = { pledge: 'pledge_registration_id', equity_change: 'equity_transaction_id', award_contract: 'award_lot_id' };
const KEY_LABELS = { pledge_registration_id: /质押登记(?:编号|号)|登记证明编号/u,
  equity_transaction_id: /交易编号|过户登记编号|协议编号/u,
  award_lot_id: /标段编号|合同编号/u };
const ENTITY = { pledge: 'pledgor', equity_change: 'holder', award_contract: 'bidder' };
const obj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const str = x => typeof x === 'string' && x.trim().length > 0;
const norm = x => String(x).normalize('NFKC').trim();
const compact = x => norm(x).replace(/\s+/gu, '');
const canonical = x => Array.isArray(x) ? x.map(canonical) : obj(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, canonical(x[k])])) : x;
const digest = x => createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');

/** 文件SHA/run_id/event_id联合定位，不把E01当作跨文件业务ID。 */
export function eventLocator(envelope, eventId) {
  return `${envelope?.source?.file_sha256}/${envelope?.run_id}/${eventId}`;
}

function readSide(input) {
  const e = input?.envelope, id = input?.event_id;
  if (!obj(e) || e.schema_version !== '0.3' || !Array.isArray(e.events) || !obj(e.source)
    || !str(e.run_id) || typeof e.is_mock !== 'boolean' || !str(id)) return { error: 'INVALID_A_INPUT' };
  const s = e.source;
  if (!str(s.file_name) || !str(s.file_id) || !/^[a-f0-9]{64}$/i.test(s.file_sha256 ?? '')
    || (s.file_id.startsWith('sha256:') && s.file_id.slice(7).toLowerCase() !== s.file_sha256.toLowerCase())) return { error: 'INVALID_SOURCE_ID' };
  const matches = e.events.filter(x => obj(x) && x.event_id === id);
  if (matches.length !== 1) return { error: 'EVENT_NOT_UNIQUE' };
  const ev = matches[0];
  if (!/^E\d+$/u.test(id) || !TYPES.includes(ev.event_type) || !obj(ev.fields)) return { error: 'INVALID_EVENT' };
  if ((e.is_mock && ev.extraction_method !== 'mock') || (!e.is_mock && ev.extraction_method !== undefined && !['model','rule','hybrid'].includes(ev.extraction_method))) return { error: 'EXTRACTION_MODE_MISMATCH' };
  let blocks = null;
  if (input.parsed_document !== undefined) {
    const p = input.parsed_document;
    if (!obj(p?.doc) || p.doc.file_sha256?.toLowerCase() !== s.file_sha256.toLowerCase()
      || !Array.isArray(p.pages) || p.quality?.degraded === true) return { error: 'PARSE_SOURCE_MISMATCH_OR_DEGRADED' };
    blocks = new Map();
    for (const page of p.pages) {
      if (!Number.isSafeInteger(page.page) || !Array.isArray(page.blocks)) return { error: 'INVALID_PARSE' };
      for (const b of page.blocks) {
        if (!str(b.block_id) || blocks.has(b.block_id)) return { error: 'PARSE_BLOCK_NOT_UNIQUE' };
        blocks.set(b.block_id, { ...b, page: b.page ?? page.page });
      }
    }
  }
  return { input, e, ev, blocks, locator: eventLocator(e,id) };
}

function fieldEvidence(side, field, requireBlocks = false) {
  if (!obj(field) || field.status !== 'extracted' || field.standardized === false || !str(field.raw_value)
    || field.value === null || field.value === undefined || !Array.isArray(field.provenance) || !field.provenance.length) return null;
  if (requireBlocks && !side.blocks) return null;
  for (const p of field.provenance) {
    if (!obj(p) || !Number.isSafeInteger(p.page) || p.page < 1 || !str(p.quote) || p.degraded === true
      || (p.source_type != null && !['paragraph','cell'].includes(p.source_type))) return null;
    if (p.source_type === 'cell' && (!str(p.block_id) || !str(p.table_id) || !str(p.cell_ref))) return null;
    if (p.region != null && (!Array.isArray(p.region) || p.region.length !== 4 || !p.region.every(Number.isFinite)
      || p.region[0] < 0 || p.region[1] < 0 || p.region[2] <= p.region[0] || p.region[3] <= p.region[1])) return null;
    if (side.blocks) {
      const b = side.blocks.get(p.block_id);
      if (!b || b.page !== p.page || b.degraded === true || b.source === 'OCR' || !str(b.text_raw)
        || !compact(b.text_raw).includes(compact(p.quote))) return null;
      if (p.region != null && b.region != null && JSON.stringify(p.region) !== JSON.stringify(b.region)) return null;
    }
  }
  if (!field.provenance.some(p => compact(p.quote).includes(compact(field.raw_value)))) return null;
  return { value: field.value, raw_value: field.raw_value, provenance: structuredClone(field.provenance),
    verification: side.blocks ? 'parse_block_checked' : 'reference_structure_only' };
}

function identityKey(side) {
  const k = side.input.identity;
  if (k === undefined) return { error: 'BUSINESS_KEY_MISSING' };
  if (!obj(k) || k.event_ref !== side.locator || k.kind !== KEY_KINDS[side.ev.event_type]
    || !['security_code','uscc'].includes(k.namespace_kind)) return { error: 'KEY_SCOPE_INVALID' };
  const ns = fieldEvidence(side,k.namespace,true), key = fieldEvidence(side,k.key,true);
  if (!ns || !key || !str(ns.value) || !str(key.value) || k.namespace.unit !== 'text' || k.key.unit !== 'text'
    || norm(ns.raw_value) !== norm(ns.value) || norm(key.raw_value) !== norm(key.value)) return { error: 'KEY_EVIDENCE_INSUFFICIENT' };
  const namespace = norm(ns.value), value = norm(key.value);
  if (!(k.namespace_kind === 'security_code' ? /^\d{6}$/u : /^[0-9A-Z]{18}$/u).test(namespace)
    || !/^[\p{L}\p{N}][\p{L}\p{N}._/()\-]{2,119}$/u.test(value)) return { error: 'KEY_FORMAT_INVALID' };
  const label = k.namespace_kind === 'security_code' ? /证券代码|股票代码/u : /统一社会信用代码/u;
  if (!ns.provenance.some(p => label.test(p.quote)) || !key.provenance.some(p => KEY_LABELS[k.kind].test(p.quote))) return { error: 'KEY_SEMANTIC_LABEL_MISSING' };
  const escaped=value.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
  const token=new RegExp('(?<![\\p{L}\\p{N}._/\\-])'+escaped+'(?![\\p{L}\\p{N}._/\\-])','u');
  if(!key.provenance.some(p=>token.test(norm(p.quote)))) return {error:'KEY_TOKEN_NOT_EXACT'};
  const keyExpression=new RegExp('(?:'+KEY_LABELS[k.kind].source+')\\s*[:：]?\\s*'+escaped+'(?![\\p{L}\\p{N}._/\\-])','u');
  const namespaceExpression=new RegExp('(?:'+label.source+')\\s*[:：]?\\s*'+namespace+'(?![0-9A-Z])','u');
  if(!key.provenance.some(p=>keyExpression.test(norm(p.quote))) || !ns.provenance.some(p=>namespaceExpression.test(norm(p.quote))))
    return {error:'KEY_LABEL_VALUE_NOT_PAIRED'};
  // 不用更正、撤销、否定或范围表达内的编号作确定性身份判断。
  if ([ns,key].some(f => f.provenance.some(p => /更正|修订|撤销|作废|原编号|不属于|并非|不是|可能|待定|编号范围|未披露|示例|仅供参考/u.test(p.quote)))) return { error: 'KEY_QUALIFIED_OR_CORRECTED' };
  return { kind:k.kind, namespace_kind:k.namespace_kind, namespace, value, evidence:{namespace:ns,key} };
}

function sideSummary(s) {
  if (s.error) return { error:s.error };
  return { locator:s.locator, file_id:s.e.source.file_id, file_name:s.e.source.file_name,
    file_sha256:s.e.source.file_sha256, run_id:s.e.run_id, event_id:s.ev.event_id, event_type:s.ev.event_type,
    is_mock:s.e.is_mock, code_version:s.e.run_meta?.code_version ?? null, parsed_document_supplied:s.blocks !== null };
}

/** 同一公告事件的保守判定；缺少可核实身份依据时返回unknown，数字相等不参与判同。 */
export function alignEventPair(left, right) {
  const a = readSide(left), b = readSide(right);
  const result = { schema_version:'event-alignment/0.1', rule_version:'D8.1', status:'unknown', reason_codes:[],
    explanation:'', left:sideSummary(a), right:sideSummary(b), evidence:[], context_signals:[],
    may_compare:false, next_action:'补齐事件身份依据；不进入数值比较。',
    audit:{ input_mutated:false, numeric_comparison_executed:false, exchange_rate_applied:false,
      source_pdf_bytes_verified:false, automatic_entity_aliases:false, transitive_grouping:false } };
  const finish = (status,code,explanation) => {
    result.status=status; result.reason_codes.push(code); result.explanation=explanation;
    if (status==='same') result.next_action='仅确认事件身份；D9另行检查币种、含税、期间、分母等可比口径。';
    if (status==='different') result.next_action='分别保留事件，不进行跨事件数值比较。';
    return result;
  };
  if (a.error || b.error) {
    if(a.error) result.reason_codes.push('LEFT_'+a.error);
    if(b.error) result.reason_codes.push('RIGHT_'+b.error);
    return finish('unknown','INVALID_OR_UNLOCATED_INPUT','输入、文件来源或事件定位不足，不能判定关系。');
  }
  if (a.e.is_mock !== b.e.is_mock) return finish('unknown','MIXED_REAL_MOCK','真实与模拟输入不混用。');
  const entityEvidence=s=>{
    const f=s.ev.fields[ENTITY[s.ev.event_type]], e=fieldEvidence(s,f);
    return e && f.unit==='text' && str(e.value) && norm(e.value)===norm(e.raw_value) ? e : null;
  };
  const ea = entityEvidence(a), eb = entityEvidence(b);
  if (ea && eb) {
    result.context_signals.push({code:norm(ea.value)===norm(eb.value)?'SAME_ENTITY_ONLY':'ENTITY_NAMES_DIFFER',left:ea,right:eb});
  }
  if (!ea || !eb) return finish('unknown','ENTITY_EVIDENCE_INSUFFICIENT','至少一侧事件主体缺少可用出处；不以缺失推断不同事件。');
  if (a.ev.event_type!==b.ev.event_type) {
    result.evidence.push({role:'typed_event_subject',left:ea,right:eb});
    return finish('different','EVENT_TYPE_DIFFERENT','两侧A事件类型不同，按质押、股权变动、中标的原子事件粒度分别保留；不否认更高层交易可能有关。');
  }
  // 文件内ID只在同一运行、同一文件、同一不可变事件内容下代表相同观察。
  if (a.locator===b.locator) {
    if (digest(a.ev)!==digest(b.ev)) return finish('unknown','LOCATOR_CONTENT_CONFLICT','同一定位携带不同事件内容，需先核对版本。');
    result.evidence.push({role:'same_source_observation',left:ea,right:eb});
    return finish('same','SAME_SOURCE_OBSERVATION','同一文件SHA、运行ID、事件ID及事件内容一致。');
  }
  const ka=identityKey(a), kb=identityKey(b);
  if (ka.error || kb.error) {
    if(ka.error) result.reason_codes.push('LEFT_'+ka.error);
    if(kb.error) result.reason_codes.push('RIGHT_'+kb.error);
    return finish('unknown','IDENTITY_NOT_ESTABLISHED','公司、金额、日期或项目名称只能作为检索线索；缺少双侧已定位且作用范围明确的业务编号。');
  }
  result.evidence.push({role:'scoped_business_key',left:ka.evidence,right:kb.evidence});
  if (ka.namespace_kind!==kb.namespace_kind || ka.namespace!==kb.namespace)
    return finish('unknown','NAMESPACE_NOT_ALIGNED','业务编号作用域不同或尚未建立映射，不能直接比较编号。');
  if (ka.value!==kb.value) return finish('different','BUSINESS_KEY_DIFFERENT','同类型、同作用域的业务唯一编号明确不同。');
  // 编号可以指向一笔交易；不同股东、增减双方或质押/解押仍不是同一原子事件观察。
  if (norm(ea.value)!==norm(eb.value)) return finish('unknown','SAME_TRANSACTION_DIFFERENT_SUBJECT','编号相同但事件主体不同；不按简称互含或转让双方金额相等合并。');
  if (a.ev.event_type!=='award_contract') {
    const da=fieldEvidence(a,a.ev.fields.direction), db=fieldEvidence(b,b.ev.fields.direction);
    const allowed=a.ev.event_type==='pledge'?['pledge','release']:['increase','decrease'];
    const aliases={pledge:'pledge',质押:'pledge',release:'release',解除质押:'release',解押:'release',increase:'increase',增持:'increase',decrease:'decrease',减持:'decrease'};
    if (!da || !db || !allowed.includes(da.value) || !allowed.includes(db.value)
      || aliases[norm(da.raw_value)]!==da.value || aliases[norm(db.raw_value)]!==db.value)
      return finish('unknown','DIRECTION_EVIDENCE_INSUFFICIENT','交易编号匹配，但方向缺失或不在公共枚举内。');
    result.evidence.push({role:'action_direction',left:da,right:db});
    if (da.value!==db.value) return finish('different','ACTION_DIRECTION_DIFFERENT','同一业务编号下的不同动作分别保留，例如质押与解除质押；不是相同原子事件。');
  }
  return finish('same','SCOPED_BUSINESS_KEY_MATCH','同类型、同业务作用域、同事件编号及主体一致，双侧编号均已定位到解析原文。');
}

/** 枚举事件对并检查一对多歧义，不跨事件复用数值、不作传递合并。 */
export function alignEnvelopes(leftEnvelope, rightEnvelope, options = {}) {
  const left=Array.isArray(leftEnvelope?.events)?leftEnvelope.events:[], right=Array.isArray(rightEnvelope?.events)?rightEnvelope.events:[];
  const max=options.max_pairs ?? 10000;
  if (!Number.isSafeInteger(max) || max<1 || left.length*right.length>max) throw Error('PAIR_LIMIT_EXCEEDED_OR_INVALID');
  const pairs=[];
  for(const l of left) for(const r of right) pairs.push(alignEventPair(
    {envelope:leftEnvelope,event_id:l?.event_id,parsed_document:options.left?.parsed_document,identity:options.left?.identities?.[l?.event_id]},
    {envelope:rightEnvelope,event_id:r?.event_id,parsed_document:options.right?.parsed_document,identity:options.right?.identities?.[r?.event_id]}));
  const counts=new Map();
  for(const p of pairs.filter(p=>p.status==='same')) for(const key of ['L:'+p.left.locator,'R:'+p.right.locator]) counts.set(key,(counts.get(key)??0)+1);
  for(const p of pairs) if(p.status==='same' && (counts.get('L:'+p.left.locator)>1 || counts.get('R:'+p.right.locator)>1)) {
    p.status='unknown';p.reason_codes.push('MULTIPLE_MATCHES');p.explanation='存在一对多或多对多候选，不选择首个事件。';p.next_action='补充更细的事件编号或经复核的事件拆分依据。';
  }
  return {schema_version:'event-alignment-batch/0.1',rule_version:'D8.1',pairs,
    counts:Object.fromEntries(['same','different','unknown'].map(s=>[s,pairs.filter(p=>p.status===s).length])),
    reason_codes:pairs.length?[]:['NO_EVENT_PAIRS'],grouping_performed:false,numeric_comparison_executed:false};
}
