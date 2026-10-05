import {readFileSync,writeFileSync,mkdirSync,mkdtempSync} from 'node:fs';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {loadPublic,runCases} from '../src_D9/run_D9.mjs';
import {attributeCase} from '../src_D9/attribution_D9.mjs';
import {validateAgainstSchema} from '../peer_reference_D9/schema_validator_D9.mjs';
import bridge from '../peer_reference_D9/upstream_bridge_D9.cjs';
import {pair} from './fixtures_D9.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),p=(...s)=>resolve(root,...s),read=f=>JSON.parse(readFileSync(p(f),'utf8'));
const dir='docs_D9/validation_D9';mkdirSync(p(dir),{recursive:true});mkdirSync(p('examples_D9'),{recursive:true});
const save=(f,x)=>writeFileSync(p(f),JSON.stringify(x,null,2)+'\n');
const command=(script,args)=>{const r=spawnSync(process.execPath,[p(script),...args],{cwd:root,encoding:'utf8'});assert.equal(r.error,undefined);return {exit_code:r.status,stdout:r.stdout,stderr:r.stderr};};
const provenance=read('来源清单_D9.json');
for(const f of provenance.files)assert.equal(createHash('sha256').update(readFileSync(p(f.local))).digest('hex'),f.sha256,f.local);
const context=loadPublic(),schema=read('peer_reference_D9/event-envelope.schema_D9.json');
const schemaResults=[],bridgeResults=[];
for(const [id,env] of Object.entries(context.documents)){
  const issues=validateAgainstSchema(env,schema);schemaResults.push({case_id:id,issues});assert.equal(issues.length,0,id+' schema');
  const before=JSON.stringify(env),converted=bridge.toContract(env),integrity=bridge.checkIntegrity(converted.events,converted.evidences);
  assert.equal(JSON.stringify(env),before);assert.equal(converted.events.length,env.events.length);
  let preserved=0;
  env.events.forEach((ev,i)=>{for(const [field,f] of Object.entries(ev.fields)){if(f.status==='extracted'&&f.value!=null){assert.equal(String(converted.events[i].fields[field].normalized),String(f.value),id+':'+field);preserved++;}}});
  bridgeResults.push({case_id:id,preserved_extracted_values:preserved,integrity});assert.equal(integrity.ok,true,id+' bridge');
}
const ds=read('public_dev_D9/rules-cases.dev_D9.json'),report=runCases(ds,context);save(dir+'/public_report_D9.json',report);
const score=command('peer_reference_D9/score-rules_D9.mjs',['--cases',p('public_dev_D9/rules-cases.dev_D9.json'),'--report',p(dir+'/public_report_D9.json'),'--json',p(dir+'/zong_score_D9.json'),'--strict']);
assert.equal(score.exit_code,1);const scoring=read(dir+'/zong_score_D9.json');assert.equal(scoring.pass,18);assert.equal(scoring.false_positive_conflict,0);
const old=read('peer_reference_D9/bilateral_evidence_D9.json'),drift=[];
for(const c of ds.cases){const prev=old.cases.find(x=>x.case_id===c.case_id);for(let i=0;i<c.sides.length;i++){const s=c.sides[i],t=prev?.sides?.[i];if(t&&s.block_id!==t.block_id)drift.push({case_id:c.case_id,document:s.case_id,field:s.field,old_block:t.block_id,current_block:s.block_id});}}
const money={unit:'amount',currency:'CNY',tax:'含税'};
const fx=pair({...money,value:'100',currency:'AED',extra:'2026-10-05，1 AED = 2 CNY',facts:{fx:{value:'2',from:'AED',to:'CNY',date:'2026-10-05'}}},{...money,value:'200'});
fx.input.case_id='FANG-D9-CONTROL-FX';
save('examples_D9/controlled_fx_cases_D9.json',{synthetic_controlled:true,notice:'虚构教学汇率，禁止用于真实货币换算',cases:[fx.input]});save('examples_D9/controlled_fx_context_D9.json',fx.options);
const correction=pair({value:'100',role:'publication_date',date:'2026-10-04'},{value:'101',quote:'更正为101股',role:'publication_date',extra:'将公告编号N0持股100股更正为101股',facts:{correction:{value:'N0',replaces_notice_number:'N0',replaces_field:'shares_after'}}});
correction.input.sides[1].caliber.correction.replaces_file_sha256=correction.options.documents['CONTROL-0'].source.file_sha256;
const controls=[{name:'explicit_fx',x:fx,expected:'explainable_difference'},
  {name:'explicit_tax',x:pair({...money,value:'100',tax:'不含税',extra:'本项目税率6%',facts:{tax_rate:{value:'6'}}},{...money,value:'106'}),expected:'explainable_difference'},
  {name:'same_point_conflict',x:pair({value:'5000000'},{value:'5200000'}),expected:'conflict'},
  {name:'linked_correction',x:correction,expected:'restated'},
  {name:'missing_time',x:pair({noTime:true},{noTime:true,value:'101'}),expected:'insufficient'}];
const cResults=controls.map(({name,x,expected})=>{x.input.case_id='FANG-D9-CONTROL-'+name;const result=attributeCase(x.input,x.options);assert.equal(result.verdict,expected);return {name,expected,input:x.input,context:x.options,result};});
save('examples_D9/controlled_development_D9.json',{is_mock:true,notice:'独立受控规则测试，未补写或改标宗019/020，不计真实案例覆盖',cases:cResults});
const groups=controls.map(({name,x})=>({group_id:name,predicted_relation:'same',consistency:{conflicts:[{entity:'甲主体',field:x.input.sides[0].field,values:x.input.sides.map(s=>({doc:s.case_id,value:s.value,quote:s.quote})),d9_input:x.input}]},d9_context:x.options}));
groups.push({group_id:'legacy_missing_metadata',predicted_relation:'same',consistency:{conflicts:[{field:'shares_after',entity:'甲主体',values:[{doc:'A',value:1,quote:'1'},{doc:'B',value:10000,quote:'10000'}]}]}});
groups.push({group_id:'unknown_group',predicted_relation:'unknown',reasons:['INSUFFICIENT_SIGNALS']});
save('examples_D9/wei_b_input_D9.json',{is_mock:true,results:groups});
const wei=command('peer_reference_D9/attribute_b_D9.mjs',['--report',p('examples_D9/wei_b_input_D9.json'),'--rules',p('src_D9/wei_adapter_D9.mjs'),'--out',p(dir+'/wei_plugin_output_D9.json')]);assert.equal(wei.exit_code,0,wei.stderr);
const plugin=read(dir+'/wei_plugin_output_D9.json');assert.equal(plugin.attributions.length,7);assert.ok(plugin.attributions.every(a=>a.decided_by==='plugin:FANG_D9_EVIDENCE_FIRST'));assert.equal(plugin.attributions[5].attribution,'insufficient_evidence');
const temp=mkdtempSync(resolve(tmpdir(),'fang-d9-peer-'));for(const [id,env] of Object.entries(context.documents))writeFileSync(resolve(temp,id+'.json'),JSON.stringify(env));
const peer=command('peer_reference_D9/run_d9_rules_D9.mjs',['--cases',p('public_dev_D9/rules-cases.dev_D9.json'),'--verify-blocks',temp,'--bilateral',p('peer_reference_D9/bilateral_evidence_D9.json'),'--out',p(dir+'/wei_original_runner_D9.json')]);assert.equal(peer.exit_code,0,peer.stderr);
const peerReport=read(dir+'/wei_original_runner_D9.json');const differences=report.cases.filter((x,i)=>x.verdict!==peerReport.cases[i].verdict).map((x,i)=>({case_id:x.case_id,fang_verdict:x.verdict,wei_verdict:peerReport.cases.find(c=>c.case_id===x.case_id).verdict}));
const summary={date:'2026-10-05',node:process.version,pins:provenance.pins,unchanged_source_files:provenance.files.length,
  schema:{total:schemaResults.length,passed:schemaResults.length},chen_bridge:{total:bridgeResults.length,passed:bridgeResults.length,extracted_values:bridgeResults.reduce((a,b)=>a+b.preserved_extracted_values,0)},
  public:{total:20,real_public_expected_match:18,real_public_total:18,original_controlled_kept_insufficient:2,zong_strict_status:scoring.result,zong_strict_exit:score.exit_code,zong_pass:scoring.pass,zong_fail:scoring.fail,false_positive:scoring.false_positive_conflict,false_negative_under_original_labels:scoring.false_negative_conflict},
  verified_real_side_count:report.cases.flatMap(c=>c.sides).filter(s=>s.block_verified).length,stale_bilateral_anchors:drift,
  wei_plugin:{cli_exit:wei.exit_code,entries:7,plugin_handled:7,builtin_fallbacks:0},wei_original_runner:{cli_exit:peer.exit_code,block_verify:peerReport.block_verify,differences},
  controlled_fixture_count:cResults.length,limits:['未调用DeepSeek在线模型；确定性层离线验证','未做陈的D9浏览器页面验收；检查既有bridge消费A兼容性','未读取封存Gold；未修改A状态/值或公开集标签','公开019/020缺事实，严格评分18/20，不能宣称20/20通过']};
save(dir+'/compatibility_report_D9.json',summary);save(dir+'/a_schema_and_bridge_D9.json',{schemaResults,bridgeResults});
console.log(JSON.stringify(summary,null,2));
