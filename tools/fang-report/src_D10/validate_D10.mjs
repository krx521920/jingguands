import {validateAgainstSchema} from './schema_validator_D10.mjs';
import {canonical,sha} from './report_D10.mjs';
/** Schema之外检查成员、数量、跨引用和计算，不将未知缓存状态算通过。 */
export function validateBundle(bundle,schema){
  const errors=validateAgainstSchema(bundle,schema).map(x=>({code:'SCHEMA',detail:x}));
  if(errors.length)return errors;
  const seen=new Set();
  for(const r of bundle.results){
    const fail=(code,detail)=>errors.push({case_id:r.case_id,code,detail});
    if(seen.has(r.case_id))fail('DUPLICATE_GROUP',r.case_id);seen.add(r.case_id);
    if(r.members.length!==r.input_sha256.length||r.members.length!==r.records.length)fail('MEMBER_LENGTH','输入/记录数量不匹配');
    r.members.forEach((m,i)=>{if(r.records[i]?.case_id!==m||r.records[i]?.file_sha256!==r.input_sha256[i])fail('MEMBER_ORDER',m);});
    if(canonical(r.diff_list)!==canonical(r.report.diffs.items))fail('DIFF_ALIAS_DRIFT','diff_list/report.diffs.items不一致');
    const ids=arr=>new Set(arr.map(x=>x.evidence_id??x.calculation_id??x.attribution_id??x.event_id));
    for(const [name,arr] of [['evidence',r.report.evidence],['calculations',r.report.calculations],['attributions',r.report.attribution.attributions],['events',r.report.events]])if(ids(arr).size!==arr.length)fail('DUPLICATE_ID',name);
    const evs=ids(r.report.evidence),attrs=ids(r.report.attribution.attributions),calcs=ids(r.report.calculations);
    const checkRefs=x=>{for(const id of x.evidence_ids??[])if(!evs.has(id))fail('EVIDENCE_REF_MISSING',id);for(const id of x.calculation_ids??[])if(!calcs.has(id))fail('CALC_REF_MISSING',id);};
    for(const e of r.report.events){
      const ix=r.members.indexOf(e.member_id);if(ix<0||e.file_sha256!==r.input_sha256[ix]||e.a_run_id!==r.records[ix]?.run_id)fail('EVENT_SOURCE_MISMATCH',e.event_id);
      for(const refs of Object.values(e.field_evidence_ids))checkRefs({evidence_ids:refs});
    }
    for(const e of r.report.evidence){const i=r.members.indexOf(e.member_id);if(i<0||e.file_sha256!==r.input_sha256[i])fail('CROSS_FILE_EVIDENCE',e.evidence_id);if(e.validation.status==='verified'&&(!e.block_id||!e.quote||!e.validation.quote_in_block||!e.validation.page_matches||e.validation.issues.length))fail('FALSE_VERIFIED_EVIDENCE',e.evidence_id);}
    for(const x of [...r.diff_list,...r.report.attribution.attributions,...r.report.calculations]){checkRefs(x);if(x.attribution_id&&!attrs.has(x.attribution_id))fail('ATTR_REF_MISSING',x.attribution_id);}
    const conflicts=r.diff_list.filter(x=>x.kind==='value_conflict').length;
    if(r.report.diffs.conflicts!==conflicts||r.report.attribution.conflict_count!==conflicts)fail('CONFLICT_COUNT_DRIFT',String(conflicts));
    if(r.report.calculation_summary.executed!==r.report.calculations.length)fail('CALC_COUNT_DRIFT','执行数不匹配');
    if(r.report.diffs.relation!=='related'&&r.diff_list.some(x=>x.scope==='cross_document'&&x.comparison_performed))fail('CROSS_EVENT_COMPARISON','unknown/unrelated不可跨文档计算');
    for(const c of r.report.calculations)if(c.status==='executed'&&(!c.used_source||!c.evidence_ids.length||c.result===null))fail('CALC_WITHOUT_BASIS',c.calculation_id);
  }
  return errors;
}
/** 对绑定的输入JSON字节校验；防路径下文件被换掉而复用旧结果。 */
export function validateInputPayload(result,readBytes){return result.records.flatMap(r=>sha(readBytes(r.input_artifact.path))===r.input_artifact.payload_sha256?[]:[{code:'INPUT_PAYLOAD_CHANGED',member:r.case_id}]);}
