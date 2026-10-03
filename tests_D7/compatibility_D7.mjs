/** 固定公开开发集离线回放；禁止把该报告作为封存集或新模型执行结果。 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { normalizeEnvelope, normalizeFieldValue, resolveUnitHints } from '../src_D7/normalization_D7.mts';
import { summarizeSamples } from '../src_D7/statistics_D7.mts';
const repo = process.argv[2]; if (!repo) throw new Error('提供集成仓库路径');
const pins = { fang:'4e886d33fb902cd18d4742780a8eaa6fa33a1232', wei:'34f938a636807ecb4ca4974152f880bc02ed2177', zong:'bbe5d220bc0f0b078c4f46c22c32ee9a4fef8a01', chen:'759bfcf911e774d7eb29d61c484c24637a7b3fed', zhang:'d5ffa1eb9b1b7c3cd569f92ff542914e9c7936b2' };
const get=(ref,path)=>execFileSync('git',['show',`${ref}:${path}`],{cwd:repo,encoding:'utf8',maxBuffer:30e6});
const json=(ref,path)=>JSON.parse(get(ref,path)), load=code=>import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`), hash=x=>createHash('sha256').update(x).digest('hex');
const validator=await load(get(pins.wei,'scripts/jingguan/lib/schema_validator.mjs')), registry=await load(get(pins.wei,'scripts/jingguan/lib/registry.mjs')), schema=json(pins.wei,'interface/event-envelope.schema.json');
const {default:bridge}=await load(`const module={exports:{}};\n${get(pins.chen,'workspace/cjh/page_prototype/bridge/upstream_bridge.js')}\nexport default module.exports;`);
const d5=await load(stripTypeScriptTypes(get(pins.fang,'src_D5/equity_check_D5.ts'))), d6=await load(stripTypeScriptTypes(get(pins.fang,'src_D6/award_check_D6.ts')));
const old=await load(get(pins.wei,'scripts/jingguan/lib/fang_normalize.mjs'));
const batch=json(pins.wei,'runs/batch-20261002T120859/batch_report.json');
const report={tool:'compatibility_D7',date:'2026-10-03',pins,node:process.version,model_called:false,sealed_data_accessed:false,documents:[],before_after_reproductions:[],b_samples:[],summary:{}};
const beforeSamples=[],afterSamples=[];
const validate=x=>[...validator.validateAgainstSchema(x,schema),...registry.checkRegistry(x)];
for(const [day,type]of [[4,'PLD'],[5,'EQC'],[6,'AWD']])for(let i=1;i<=10;i++){
  const id=`D${day}-${type}-${String(i).padStart(3,'0')}`, path=`runs/batch-20261002T120859/envelopes/${id}.json`, bytes=get(pins.wei,path), input=JSON.parse(bytes), gold=json(pins.zong,`evaluation/D${day}/dev/gold/${id}.envelope.json`), before=JSON.stringify(input);
  const page=bridge.toContract(input), previousD5=d5.checkEquityEnvelope(input), previousD6=d6.checkAwardEnvelope(input);
  const parsePath=day===4?`corpus/zhangzhibo/d3/parse-d3set/${id}.parse.json`:day===5?`corpus/zhangzhibo/d5/parse-official/${id}.parse.json`:`corpus/zhangzhibo/d6/parse/bid-${String(i).padStart(3,'0')}.parse.json`;
  const parse=json(pins.wei,parsePath),sourceMatches=input.source.file_sha256===parse.doc.file_sha256;
  const hints=sourceMatches?resolveUnitHints(input,parse):{hints:{},evidence:[{code:'PARSER_SOURCE_MISMATCH',input_sha256:input.source.file_sha256,parser_source_sha256:parse.doc.file_sha256}]};
  // 仅冻结同文档回放：以公开标注的主体/方向/项目键核对ID映射，绝不按金额找最佳匹配。
  const identityKeys=day===4?['pledgor','pledgee','direction','start_date']:day===5?['holder','direction']:['bidder','project_name'];
  const key=e=>JSON.stringify([e.event_type,...identityKeys.map(k=>e.fields[k]?.value??null)]);
  const eventMap={};for(const ge of gold.events){const matches=input.events.filter(e=>key(e)===key(ge));assert.equal(matches.length,1,`${id} requires explicit reviewed mapping`);eventMap[ge.event_id]=matches[0].event_id;}
  const result=normalizeEnvelope(input,hints.hints);
  assert.equal(JSON.stringify(input),before);assert.deepEqual(bridge.toContract(input),page);
  assert.deepEqual(d5.checkEquityEnvelope(input),previousD5);assert.deepEqual(d6.checkAwardEnvelope(input),previousD6);
  assert.deepEqual(normalizeEnvelope(result.envelope,hints.hints).envelope,result.envelope);
  const issues=validate(result.envelope);assert.deepEqual(issues,[],id);
  const adapted=bridge.toContract(result.envelope);assert.equal(adapted.events.length,input.events.length);
  for(let j=0;j<input.events.length;j++){
    const a=input.events[j],b=result.envelope.events[j];assert.deepEqual(Object.keys(a.fields),Object.keys(b.fields));
    for(const name of Object.keys(a.fields)){assert.deepEqual(a.fields[name].provenance,b.fields[name].provenance);assert.equal(a.fields[name].raw_value,b.fields[name].raw_value);assert.equal(a.fields[name].unit,b.fields[name].unit);}
  }
  const base={case_id:id,cohort:'core',gold,execution:'completed',format_valid:validate(input).length===0,event_map:eventMap,unit_hints:hints.hints};
  beforeSamples.push({...base,actual:input});afterSamples.push({...base,actual:result.envelope,format_valid:true});
  report.documents.push({id,path,input_sha256:hash(bytes),parse_path:parsePath,event_mapping:eventMap,event_mapping_keys:identityKeys,unit_evidence:hints.evidence,gold_schema_issues:validate(gold),original_schema_issues:validate(input),output_schema_issues:issues,original_unchanged:true,original_page_unchanged:true,events:input.events.length,changes:result.changes,old_d5_status:previousD5.status,new_d5_status:d5.checkEquityEnvelope(result.envelope).status,old_d6_status:previousD6.status,new_d6_status:d6.checkAwardEnvelope(result.envelope).status,page_integrity:adapted.integrity});
}
const coreIds=new Set(beforeSamples.map(x=>x.case_id));
for(const row of batch.results.filter(x=>!coreIds.has(x.case))){
  let actual=null;
  if(row.ok) actual=json(pins.wei,`runs/batch-20261002T120859/envelopes/${row.case}.json`);
  const s={case_id:row.case,cohort:row.case.includes('scan')?'scan':'adversarial',gold:null,actual,execution:row.ok?'completed':row.status==='skipped'?'skipped':'failed',format_valid:actual?validate(actual).length===0:false};
  beforeSamples.push(s);afterSamples.push(s);
}
for(const [name,raw,unit,expected]of [['foreign','173,800,000阿联酋迪拉姆（折合人民币317,915,000元）','cny','MULTI_CURRENCY_OR_FX'],['bare','100','shares','UNIT_MISSING'],['many','100股和200股','shares','MULTIPLE_OR_MISSING_NUMBERS'],['badcomma','1,00股','shares','INVALID_NUMERIC_TOKEN']]){
  const a={raw_value:raw,value:0,unit,status:'extracted',standardized:true,provenance:[],denominator:null,note:null},b=structuredClone(a);
  const oldError=old.normalizeFieldValue('x',a),newError=normalizeFieldValue('x',b);
  assert.match(newError,new RegExp(expected));assert.equal(b.status,'needs_review');assert.equal(b.standardized,false);
  report.before_after_reproductions.push({name,old_error:oldError,old_field:a,new_error:newError,new_field:b});
}
const examples=JSON.parse(readFileSync(new URL('../examples_D7/B_pairs_D7.json',import.meta.url),'utf8'));
const bSchema=JSON.parse(readFileSync(new URL('../examples_D7/B_schema_D7.json',import.meta.url),'utf8'));
for(const c of examples){const issues=validator.validateAgainstSchema(c.pair,bSchema);assert.deepEqual(issues,[],c.case_id);assert.equal(c.pair.alignment.may_compare,false);report.b_samples.push({case_id:c.case_id,schema_valid:true,status:c.pair.alignment.status,may_compare:false});}
const bad=structuredClone(examples[0].pair);bad.alignment.may_compare=true;assert.ok(validator.validateAgainstSchema(bad,bSchema).length);
const badField=structuredClone(examples[0].pair);badField.left.observations.bid_amount.original.status='invented';assert.ok(validator.validateAgainstSchema(badField,bSchema).length);
report.before_metrics=summarizeSamples(beforeSamples);report.after_metrics=summarizeSamples(afterSamples);
report.legacy_published_metrics=json(pins.zong,'evaluation/dev-30/five-metric-report.json');
report.summary={core_documents:30,core_events:report.documents.reduce((n,d)=>n+d.events,0),full_inputs:beforeSamples.length,core_output_schema_pass:30,original_inputs_unchanged:true,raw_values_and_evidence_preserved:true,page_adapter_accepts_updated_envelope:true,idempotent:true,b_samples:examples.length,numeric_changed_fields:report.documents.reduce((n,d)=>n+d.changes.length,0)};
process.stdout.write(JSON.stringify(report,null,2)+'\n');
