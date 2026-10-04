/** D7、张方索引与魏方分组数据适配。索引及expected_relation绝不充当规则答案。 */
import { alignEventPair, alignEnvelopes } from './alignment_D8.mjs';
import { alignEvents as matchingV1 } from './matching_D8.mjs';

function fromD7(s) {
  if (!s?.source || !s.observations) throw Error('INVALID_D7_SIDE');
  const source=s.source;
  return {schema_version:source.source_schema_version,run_id:source.run_id,is_mock:source.is_mock,
    source:{file_id:source.file_id,file_sha256:source.file_sha256,file_name:source.file_name,parse_meta:source.parse_meta??null},
    events:[{event_id:s.event_id,event_type:s.event_type,fields:Object.fromEntries(Object.entries(s.observations).map(([k,v])=>[k,structuredClone(v.original)])),
      extraction_method:source.is_mock?'mock':undefined}],run_meta:{code_version:source.code_version}};
}

/** 消费D7提案并生成独立D8结果，不修改D7已冻结schema或原字段。 */
export function alignD7Pair(pair, options = {}) {
  if(pair?.schema_version!=='b-alignment-draft/0.1' || pair.interface_status!=='proposal_D7') throw Error('UNSUPPORTED_D7_PAIR');
  return {pair_id:pair.pair_id, ...alignEventPair(
    {envelope:fromD7(pair.left),event_id:pair.left.event_id,identity:options.left?.identity,parsed_document:options.left?.parsed_document},
    {envelope:fromD7(pair.right),event_id:pair.right.event_id,identity:options.right?.identity,parsed_document:options.right?.parsed_document})};
}

/** 张方cross_index仅按完整文件SHA关联；主体、日期和所谓version链均只供检索。 */
export function indexContext(index,envelope) {
  const id='sha256:'+envelope?.source?.file_sha256;
  const files=Array.isArray(index?.files)?index.files.filter(f=>f.file_id===id):[];
  if(files.length!==1) return {status:'unknown',reason:'INDEX_FILE_NOT_UNIQUE',used_for_identity:false};
  const caseId=files[0].case_id;
  return {status:'located',case_id:caseId,file:structuredClone(files[0]),used_for_identity:false,
    issuer_candidates:Object.entries(index.issuer_index??{}).filter(([,ids])=>Array.isArray(ids)&&ids.includes(caseId)).map(([key])=>key),
    date_candidates:Object.entries(index.date_index??{}).flatMap(([date,hits])=>Array.isArray(hits)?hits.filter(h=>h.case_id===caseId).map(h=>({date,hits:structuredClone(h.hits??[])})):[]),
    announcement_sequences:(index.version_index??[]).flatMap(v=>(v.chain??[]).filter(c=>c.case_id===caseId).map(c=>structuredClone(c))),
    warnings:['ISSUER_IS_NOT_EVENT','DATE_CANDIDATES_NOT_EVENT_DATES','ANNOUNCEMENT_SEQUENCE_NOT_CORRECTION_CHAIN']};
}

/** 魏方分组入口替代调用点：返回各文档对的三态结果，不复用旧related门槛或数值比较。 */
export function verifyGroupD8(group,envelopes,contexts = {}) {
  if(!Array.isArray(group?.members)||!Array.isArray(envelopes)||group.members.length!==envelopes.length
    ||new Set(group.members).size!==group.members.length) throw Error('INVALID_GROUP_MEMBERS');
  const document_pairs=[];
  for(let i=0;i<envelopes.length;i++) for(let j=i+1;j<envelopes.length;j++) {
    const a=group.members[i],b=group.members[j];
    document_pairs.push({members:[a,b],...alignEnvelopes(envelopes[i],envelopes[j],{left:contexts[a],right:contexts[b]})});
  }
  return {schema_version:'event-alignment-group/0.1',group_id:group.group_id,members:[...group.members],document_pairs,
    missing_envelopes:group.members.filter((_,i)=>!envelopes[i]),
    group_relation:'not_inferred',numeric_comparison_executed:false,expected_relation_used:false};
}

/** D8.2：保持同名导出并转发魏方 matching v1；完整三态须使用 matching_D8.explainGroup。 */
export function alignEvents(envA,envB,options={}) {
  return matchingV1(envA,envB,options);
}
