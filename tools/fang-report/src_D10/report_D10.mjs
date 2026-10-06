/** D10：只读A、B和D9结果，生成五段报告；不读取期望答案作判定。 */
import {createHash} from 'node:crypto';
export const SCHEMA_VERSION='verification-report/1.0';
export const VERSION='D10.1';
export const sha=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
export const canonical=x=>JSON.stringify(sort(x));
function sort(x){return Array.isArray(x)?x.map(sort):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sort(x[k])])):x;}
const clean=s=>String(s??'').normalize('NFKC').replace(/\s+/gu,'');
const relationLabel={related:'同一交易关联',unrelated:'不同事件，未跨事件比较',unknown:'证据不足，保留疑点'};
const verdictKind={corroborated:'corroboration',explainable_difference:'caliber_difference',restated:'restatement',conflict:'value_conflict',insufficient:'insufficient'};
/** 记录具体源文件/页块的核验结果；相同引文不会跨文件搜索替代。 */
export function verifyEvidence(member,env,parsed,p){
  const blocks=parsed?.pages?.flatMap(page=>(page.blocks??[]).map(b=>({...b,page:b.page??page.page})))??env.source?.parse_meta?.blocks??[];
  const found=blocks.filter(b=>b.block_id===p.block_id),b=found.length===1?found[0]:null;
  const hashOK=!parsed||parsed.doc?.file_sha256===env.source?.file_sha256;
  const region=p.region??b?.region??null;
  const validRegion=Array.isArray(region)&&region.length===4&&region.every(Number.isFinite)&&region[0]>=0&&region[1]>=0&&region[2]>region[0]&&region[3]>region[1];
  const page=parsed?.pages?.find(x=>x.page===p.page);
  const withinPage=!page?.width||!page?.height?null:validRegion&&region[2]<=page.width+1&&region[3]<=page.height+1;
  const degraded=!!(p.degraded||b?.degraded||p.source_type==='scan_region'||b?.source==='OCR');
  const quoteOK=!!b&&!!clean(p.quote)&&clean(b.text_raw??b.text).includes(clean(p.quote));
  const pageOK=!!b&&Number.isInteger(p.page)&&p.page>0&&p.page===b.page;
  const issues=[...(!hashOK?['PARSE_SHA_MISMATCH']:[]),...(!b?['BLOCK_NOT_UNIQUE_OR_MISSING']:[]),...(!pageOK?['PAGE_MISMATCH']:[]),...(!quoteOK?['QUOTE_NOT_IN_BLOCK']:[]),...(!validRegion?['REGION_MISSING_OR_INVALID']:[]),...(withinPage===false?['REGION_OUT_OF_PAGE']:[]),...(degraded?['DEGRADED_NO_TEXT_PROOF']:[])];
  return {evidence_id:'ev-'+sha([member,env.source.file_sha256,p.block_id,p.page,p.quote]).slice(0,24),member_id:member,file_sha256:env.source.file_sha256,
    hash_kind:member==='pledge-scan-degrade'?'parse_file_bytes':'source_pdf_declared',block_id:p.block_id??null,page:p.page??null,region,
    quote:p.quote??null,source_type:p.source_type??b?.source_type??null,table_id:p.table_id??b?.table_ref?.table_id??null,cell_ref:p.cell_ref??b?.table_ref?.cell_ref??null,
    validation:{status:issues.length?'needs_review':'verified',issues,quote_in_block:quoteOK,page_matches:pageOK,region_in_page:withinPage,source_hash_matches:hashOK,raw_pdf_rehashed:false}};
}
/** 一个完整的组结果。cacheAudit是独立检查结果；上游声明另存，不能默认全部true。 */
export function buildGroup({group,context,bGroup,bRun,attributionCases,cacheAudit,sourceFiles,codeVersion,runId,attributeCase}){
  if(typeof attributeCase!=='function')throw Error('D9_ATTRIBUTE_CASE_REQUIRED: pass the existing D9 attributeCase function');
  const members=group.members;if(!Array.isArray(members)||members.length<2||new Set(members).size!==members.length)throw Error('INVALID_GROUP_MEMBERS');
  const {documents,parses}=context;for(const m of members)if(!documents[m])throw Error('MISSING_ENVELOPE:'+m);
  if(bGroup.group_id!==group.case_id||canonical(bGroup.members)!==canonical(members))throw Error('B_GROUP_MEMBERS_MISMATCH');
  if(!['related','unrelated','unknown'].includes(bGroup.predicted_relation))throw Error('INVALID_B_RELATION');
  const events=[],evidence=new Map(),records=[],boundaries=[],boundaryDetails=[],diffs=[],calculations=[],attributions=[];
  const addBoundary=(code,message,affected=[],status='needs_review')=>{boundaries.push(message);boundaryDetails.push({code,status,message,members:affected});};
  const register=(member,p)=>{const v=verifyEvidence(member,documents[member],parses?.[member],p);evidence.set(v.evidence_id,v);return v.evidence_id;};
  for(const m of members){
    const env=documents[m];const rec={case_id:m,envelope_found:true,file_sha256:env.source.file_sha256,run_id:env.run_id,schema_version:env.schema_version,code_version:env.run_meta?.code_version??null,is_mock:env.is_mock,
      input_artifact:sourceFiles[m],events:env.events.length,cache:{status:m.startsWith('DEMO')?'not_in_today_cache_batch':'upstream_reported_replay',hit:null,log_verified:false}};
    records.push(rec);
    for(const [ix,e] of env.events.entries()){
      const refs={};for(const [field,f] of Object.entries(e.fields??{}))refs[field]=(f.provenance??[]).map(p=>register(m,p));
      events.push({event_id:`${m}:${ix}:${e.event_id}`,source_event_id:e.event_id,member_id:m,event_type:e.event_type,file_sha256:env.source.file_sha256,a_run_id:env.run_id,
        fields:structuredClone(e.fields),field_evidence_ids:refs,verification_status:'observations_preserved_not_whole_event_certified'});
    }
    if(m==='pledge-scan-degrade')addBoundary('SYNTHETIC_SCAN_HASH','扫描对抗件哈希是解析文件字节哈希，不是源PDF哈希；空文本不得当作引文证据。',[m]);
    if(m.startsWith('DEMO'))addBoundary('DEMO_PDF_NOT_BUNDLED','演示文件保留上游声明的PDF哈希和解析/抽取内容；源PDF未随仓库交付，未独立复算PDF字节哈希。',[m]);
  }
  const missingConflictInputs=[];
  const dynamicInputs=(bGroup.consistency?.conflicts??[]).flatMap((c,i)=>{
    const original=c.values?.length?c.values:c.aggregate?[c.aggregate,...(c.parts??[])]:[],sides=c.d9_input?.sides;
    if(bGroup.predicted_relation!=='related'||!Array.isArray(sides)||!sides.length||sides.length!==original.length||sides.some((s,ix)=>!members.includes(s.case_id)||String(s.value)!==String(original[ix]?.value)||(s.quote??'')!==(original[ix]?.quote??''))){missingConflictInputs.push({index:i,conflict:c});return [];}
    return [{case_id:`B-CONFLICT-${i+1}`,sides:c.d9_input.sides}];
  });
  // 用例是公开开发输入；选择依据只有成员，标题/expected/category不送入规则。
  for(const c of [...attributionCases,...dynamicInputs]){
    if(!c.sides?.length||!c.sides.every(s=>members.includes(s.case_id)))continue;
    const input={case_id:c.case_id,sides:structuredClone(c.sides)};
    const result=attributeCase(input,{documents:Object.fromEntries(members.map(m=>[m,documents[m]])),parses});
    const aid=`${group.case_id}:${c.case_id}`,scope=new Set(c.sides.map(s=>s.case_id)).size===1?'within_document':'cross_document';
    if(scope==='cross_document'&&bGroup.predicted_relation!=='related')continue;
    const refs=[];
    for(const s of result.sides){
      if(s.block_id&&s.quote&&s.page)refs.push(register(s.case_id,{block_id:s.block_id,quote:s.quote,page:s.page,region:s.region,source_type:s.source_type}));
      for(const p of s.a_field_provenance??[])refs.push(register(s.case_id,p));
    }
    const cids=[];
    for(const [ix,calc] of (result.computed??[]).entries()){
      const id=`${aid}:calc-${ix+1}`,calcRefs=[];
      for(const s of calc.evidence??[]){if(s.case_id&&s.block_id&&s.page)calcRefs.push(register(s.case_id,{block_id:s.block_id,page:s.page,quote:s.quote,region:s.region,source_type:s.source_type}));}
      calculations.push({calculation_id:id,attribution_id:aid,rule_id:result.attribution_code,operation:calc.name,operands:calc.operands??[],result:calc.result??null,
        unit:calc.name==='share_sum'?'shares':null,status:result.comparison_performed?'executed':'not_executed',used_source:calc.used_source??null,evidence_ids:[...new Set([...refs,...calcRefs])],details:structuredClone(calc)});cids.push(id);
    }
    const attr={attribution_id:aid,scope,rule_id:result.attribution_code,verdict:result.verdict,message:result.attribution,resolution:result.resolution,requires_review:result.requires_review,
      evidence_ids:[...new Set(refs)],calculation_ids:cids,details:result,model_explanation:null};
    attributions.push(attr);
    diffs.push({diff_id:`${aid}:diff`,kind:result.attribution_code==='SINGLE_SIDE_DISCLOSURE'?'coverage':verdictKind[result.verdict],verdict:result.verdict,scope,fields:[...new Set(c.sides.map(s=>s.field))],members:[...new Set(c.sides.map(s=>s.case_id))],
      attribution_id:aid,evidence_ids:attr.evidence_ids,calculation_ids:cids,comparison_performed:result.comparison_performed,requires_review:result.requires_review,
      observations:result.sides.map(s=>({member_id:s.case_id,entity:s.entity,field:s.field,value:s.original_value,normalized_value:s.normalized_value,unit:s.unit}))});
    if(result.requires_review)addBoundary(result.attribution_code,result.attribution,[...new Set(c.sides.map(s=>s.case_id))]);
    if(result.resolution==='caliber_identified_only')addBoundary('CALIBER_ONLY',`${c.case_id}仅说明披露/不可比口径，未宣称全部差额已数值对平。`,[...new Set(c.sides.map(s=>s.case_id))],'scope_limit');
  }
  for(const {index,conflict} of missingConflictInputs){
    const aid=`${group.case_id}:B-CONFLICT-${index+1}`,message='B冲突缺少完整一致的d9_input或组级未允许比较；保留原冲突候选和疑点，不能静默删除或定为真矛盾。';
    attributions.push({attribution_id:aid,scope:'cross_document',rule_id:'B_CONFLICT_INPUT_MISSING',verdict:'insufficient',message,resolution:'unresolved',requires_review:true,evidence_ids:[],calculation_ids:[],details:{upstream_conflict:structuredClone(conflict)},model_explanation:null});
    diffs.push({diff_id:aid+':diff',kind:'insufficient',verdict:'insufficient',scope:'cross_document',fields:conflict.field?[conflict.field]:[],members:[...members],attribution_id:aid,evidence_ids:[],calculation_ids:[],comparison_performed:false,requires_review:true,observations:structuredClone(conflict.values??[])});
    addBoundary('B_CONFLICT_INPUT_MISSING',message,members);
  }
  // 组级未比较和缺证据必须作为正式结果保留，零冲突不等于已核验一致。
  if(bGroup.predicted_relation!=='related'){
    const unknown=bGroup.predicted_relation==='unknown',aid=`${group.case_id}:relation`;
    attributions.unshift({attribution_id:aid,scope:'cross_document',rule_id:unknown?'GROUP_INSUFFICIENT':'GROUP_NOT_COMPARABLE',verdict:'insufficient',message:relationLabel[bGroup.predicted_relation],resolution:unknown?'unresolved':'not_comparable',requires_review:unknown,evidence_ids:[],calculation_ids:[],details:{reasons:bGroup.reasons,alignment:bGroup.alignment??null},model_explanation:null});
    diffs.unshift({diff_id:aid+':diff',kind:unknown?'insufficient':'not_comparable',verdict:'insufficient',scope:'cross_document',fields:[],members:[...members],attribution_id:aid,evidence_ids:[],calculation_ids:[],comparison_performed:false,requires_review:unknown,observations:[]});
    addBoundary(unknown?'GROUP_INSUFFICIENT':'CROSS_EVENT_NOT_COMPARED',relationLabel[bGroup.predicted_relation],members,unknown?'needs_review':'scope_limit');
  }
  const bad=[...evidence.values()].filter(x=>x.validation.status!=='verified');
  if(bad.length)addBoundary('EVIDENCE_REVIEW',`${bad.length}条字段出处未满足完整核验；保留原状态与校验问题，不能将全事件标为已核验。`,[...new Set(bad.map(x=>x.member_id))]);
  const cacheRows=members.map(m=>cacheAudit.rows.find(x=>x.member_id===m));
  const replay=cacheRows.every(Boolean)?cacheRows.every(x=>x.replay_business_fields_identical):null;
  if(replay!==true)addBoundary('CACHE_REPLAY_NOT_FULLY_CONFIRMED','本组缓存重放完整业务字段一致性未全部成立或未覆盖；见cache_check逐成员记录。',members);
  addBoundary('CACHE_RUNTIME_NOT_REEXECUTED','本次离线重放结构化结果，未新调用模型；冷重跑调用日志及陈实际Web/CLI同次一致性未在本次独立验证。',members,'scope_limit');
  const conflicts=diffs.filter(x=>x.kind==='value_conflict').length;
  const report={events,diffs:{relation:bGroup.predicted_relation,relation_label:relationLabel[bGroup.predicted_relation],conflicts,corroborations:diffs.filter(x=>x.kind==='corroboration').length,
    complementaries:diffs.filter(x=>x.kind==='coverage').length,items:diffs,upstream_counts:{corroborations:bGroup.consistency?.corroborations?.length??0,conflicts:bGroup.consistency?.conflicts?.length??0}},
    attribution:{conflict_count:conflicts,attributions},calculations,calculation_summary:{executed:calculations.length,not_executed_reason:calculations.length?null:'没有满足执行条件的算式；不为填满报告而推算金额、汇率或税率。'},
    boundaries,boundary_details:boundaryDetails,evidence:[...evidence.values()],alignment:structuredClone(bGroup.alignment??null),
    upstream_consistency:structuredClone(bGroup.consistency??null),trace:{a_run_ids:records.map(x=>x.run_id),b_run_id:bRun.b_run_id,report_run_id:runId,expected_labels_used:false,model_called:false,input_mutated:false}};
  return {case_id:group.case_id,title:group.title??null,members:[...members],input_sha256:members.map(m=>documents[m].source.file_sha256),run_id:runId+':'+group.case_id,b_run_id:bRun.b_run_id,code_version:codeVersion,schema_version:SCHEMA_VERSION,
    records,diff_list:structuredClone(diffs),report,cache:{replay_business_fields_identical:replay,cold_cache_new_call_log:null,web_cli_same_result:null,evidence_status:'partial_offline_verification',upstream_claim:structuredClone(cacheAudit.upstream_claim)},
    cache_check:cacheRows.map((x,i)=>x??{member_id:members[i],status:'not_in_cache_batch'}),status:'report_generated',requires_review:boundaryDetails.some(x=>x.status==='needs_review')};
}
/** JSON/CSV同源投影；不将空值填零，也不把未知映射为不同事件。 */
export function toCSV(bundle){
  const keys=['case_id','run_id','relation','events','differences','calculations','requires_review','boundaries'];
  const rows=bundle.results.map(r=>[r.case_id,r.run_id,r.report.diffs.relation,r.report.events.length,r.diff_list.length,r.report.calculations.length,r.requires_review,r.report.boundaries.join(' | ')]);
  const cell=v=>{let s=String(v??'');if(/^[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  return '\uFEFF'+[keys,...rows].map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n';
}
/** 陈D9数据字段投影；完整五段仍在主报告，页面固定D5文案需陈随D10接线调整。 */
export function toChenVerify(bundle){
  const findings=bundle.results.flatMap(r=>r.report.attribution.attributions.map(a=>{
    const ev=r.report.evidence.find(e=>a.evidence_ids.includes(e.evidence_id));return {dataset:r.case_id,event_id:null,holder:null,code:a.rule_id,severity:a.verdict==='conflict'?'conflict':a.requires_review?'review':'info',message:a.message,fields:r.diff_list.find(d=>d.attribution_id===a.attribution_id)?.fields??[],provenance:ev?{...ev,field:r.diff_list.find(d=>d.attribution_id===a.attribution_id)?.fields[0]??''}:null,attribution_id:a.attribution_id};}));
  const by_severity={conflict:0,error:0,review:0,info:0};for(const f of findings)by_severity[f.severity]++;
  return {schema_version:'chen-verify-projection/D10',source_report_run_id:bundle.run_id,summary:{datasets_checked:new Set(bundle.results.flatMap(r=>r.members)).size,sidecar_errors:0,by_severity,verified_events:0,
    review_events:bundle.results.reduce((s,r)=>s+r.report.events.length,0),corroboration_total:0,pair_conflict_total:by_severity.conflict},findings,
    pairs:bundle.results.map(r=>({group_id:r.case_id,predicted_relation:r.report.diffs.relation,corroborations:[],conflicts:[]})),
    boundaries:['现有页面固定的D5说明需陈修改为D10；此投影不代表现有/api/verify已经接通。','未把上游未经D9复核的互证点投影为绿色通过；完整结果在主报告。']};
}
