/** Node 24；复跑三例、魏插件与陈契约，生成审阅记录。只读既有数据，不调用模型。 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const here=dirname(fileURLToPath(import.meta.url)),args={};
for(let i=2;i<process.argv.length;i+=2){assert.ok(['--fang-root','--wei-root','--zhang-root','--chen-root','--zong-root','--out'].includes(process.argv[i])&&process.argv[i+1]);args[process.argv[i]]=process.argv[i+1];}
for(const k of ['--fang-root','--wei-root','--zhang-root','--chen-root','--zong-root','--out'])assert.ok(args[k],`缺少 ${k}`);
const roots=Object.fromEntries(['fang','wei','zhang','chen','zong'].map(k=>[k,resolve(args['--'+k+'-root'])]));
const sources=[],sha=b=>createHash('sha256').update(b).digest('hex');
function bytes(owner,path){const b=readFileSync(resolve(owner==='delivery'?here:roots[owner],path));sources.push({owner,path,sha256:sha(b)});return b;}
const read=(owner,path)=>JSON.parse(bytes(owner,path).toString('utf8'));
const mod=async(owner,path)=>{bytes(owner,path);return import(pathToFileURL(resolve(roots[owner],path)).href);};
const manifest=read('delivery','答辩案例_D13.json');
const {attributeCase,VERSION}=await mod('fang','src_D9/attribution_D9.mjs');
const exact=await mod('fang','src_D9/exact_D9.mjs');
const {pair}=await mod('fang','tests_D9/fixtures_D9.mjs');
const {buildCases}=await mod('fang','回归用例_D12.mjs');
const {validateAgainstSchema}=await mod('wei','scripts/jingguan/lib/schema_validator.mjs');
const {checkRegistry}=await mod('wei','scripts/jingguan/lib/registry.mjs');
const schema=read('wei','interface/event-envelope.schema.json');
const {default:bridge}=await mod('chen','workspace/cjh/page_prototype/bridge/upstream_bridge.js');
assert.equal(VERSION,manifest.rule_version,'规则版本变化，请重审材料');
const publicCases=read('fang','public_dev_D9/rules-cases.dev_D9.json');
const inputMap=read('fang','public_dev_D9/inputs_D9.json');
const control=buildCases(pair).find(c=>c.id==='D12-Q04');
const loaded=manifest.cases.map(c=>{
  if(c.loader==='D12_builder')return {input:{...structuredClone(control.input),case_id:c.case_id},context:structuredClone(control.options)};
  const original=publicCases.cases.find(x=>x.case_id===c.source_id);assert.ok(original,c.source_id);
  const context={documents:{},parses:{}};
  for(const id of c.members){
    context.documents[id]=read('fang',inputMap.envelopes[id]);
    context.parses[id]=read('zhang',`sample/${id.slice(0,2)}/parse/${id}.parse.json`);
    assert.equal(context.documents[id].source.file_sha256,context.parses[id].doc.file_sha256);
  }
  return {input:{case_id:c.case_id,sides:structuredClone(original.sides)},context};
});
const results=[];let envelopes=0;
for(const [i,{input,context}] of loaded.entries()){
  const spec=manifest.cases[i],original=JSON.stringify({input,context});
  for(const env of Object.values(context.documents)){
    assert.deepEqual(validateAgainstSchema(env,schema),[],spec.case_id+' schema');
    assert.deepEqual(checkRegistry(env),[],spec.case_id+' registry');
    const converted=bridge.toContract(env);assert.ok(converted.contract_validation.ok);
    assert.deepEqual(converted.envelope.events.map(e=>Object.fromEntries(Object.entries(e.fields).map(([k,f])=>[k,f.value]))),env.events.map(e=>Object.fromEntries(Object.entries(e.fields).map(([k,f])=>[k,f.value]))));
    envelopes++;
  }
  const result=attributeCase(input,context),e=spec.expected;
  for(const k of ['verdict','attribution_code','comparison_performed','requires_review'])assert.equal(result[k],e[k],spec.case_id+' '+k);
  assert.equal(result.computed.length,e.native_computed_count);
  if(e.sum_result)assert.equal(result.computed[0].result,e.sum_result);
  assert.equal(JSON.stringify({input,context}),original,'输入不得被改动');
  assert.deepEqual(attributeCase({...input,expected_verdict:'FORGED',category:'FORGED'},context),result);
  assert.deepEqual(attributeCase(input,context),result);
  const calc=spec.presentation_calculation;
  const value=calc.operation==='sum'?exact.sum(calc.operands):exact.multiply(...calc.operands);
  assert.equal(value,calc.result,spec.case_id+' 展示算式');
  results.push({case_id:spec.case_id,source_kind:spec.source_kind,input,result,presentation_calculation:{...calc,verified_result:value}});
}
// 负例在内存中构造，不能通过改预期或修饰报告让门禁变绿。
const bad=structuredClone(loaded[0]);bad.input.sides[0].quote+='不存在的文字';
assert.equal(attributeCase(bad.input,bad.context).verdict,'insufficient');
const partial=structuredClone(loaded[1]);
for(const env of Object.values(partial.context.documents))for(const e of env.events)if(e.fields?.holder?.value==='马军强')delete e.fields.change_shares;
const partialResult=attributeCase(partial.input,partial.context);
assert.equal(partialResult.attribution_code,'AGGREGATE_PARTIAL_COVERAGE');assert.equal(partialResult.requires_review,true);assert.equal(partialResult.comparison_performed,false);assert.equal(partialResult.computed.length,0);
assert.ok(results[2].result.sides[0].block_verified,'未知例仍有可读原文，不能描述为扫描失败');
const temp=mkdtempSync(join(tmpdir(),'fang-d13-')),inputPath=join(temp,'cases.json'),outputPath=join(temp,'wei.json');
writeFileSync(inputPath,JSON.stringify({cases:loaded.map(x=>({...x.input,context:x.context}))}));
bytes('wei','scripts/jingguan/run_d9_rules.mjs');
const cli=spawnSync(process.execPath,[resolve(roots.wei,'scripts/jingguan/run_d9_rules.mjs'),'--cases',inputPath,'--rules',resolve(roots.fang,'src_D9/attribution_D9.mjs'),'--envelopes',temp,'--out',outputPath],{cwd:roots.wei,encoding:'utf8'});
assert.equal(cli.status,0,cli.stderr||cli.stdout);
const peer=JSON.parse(readFileSync(outputPath,'utf8'));
const wei=results.map(({case_id,result})=>{
  const actual=peer.cases.find(x=>x.case_id===case_id);assert.ok(actual);
  assert.equal(actual.verdict,result.verdict);assert.equal(actual.attribution_code,'plugin:'+result.attribution_code);assert.deepEqual(actual.computed,result.computed);
  return {case_id,verdict:actual.verdict,code:actual.attribution_code,computed_preserved:true};
});
const vendor=['attribution_D9.mjs','exact_D9.mjs','wei_adapter_D9.mjs'].map(file=>{
  const own=bytes('fang','src_D9/'+file),copy=bytes('wei','tools/fang-attribution/src_D9/'+file);
  const lf=b=>b.toString('utf8').replace(/\r\n/g,'\n');
  assert.equal(lf(own),lf(copy),'魏 vendor 与方代码内容不一致 '+file);
  return {file,bytes_identical:sha(own)===sha(copy),LF_normalized_identical:true,fang_sha256:sha(own),wei_sha256:sha(copy)};
});
const peerReports=[['wei','docs/d13-reproduction.md'],['zong','evaluation/D13/评测章节.md'],['zhang','sample/D13/D13-B1诊断与可复现性.md'],['chen','workspace/cjh/docs/D13_队友待办与缺陷汇总.md'],['chen','workspace/cjh/docs/D22_D13陌生样例复现执行记录.md']];
for(const [owner,path] of peerReports)bytes(owner,path);
bytes('fang','vendor_D8/src_D8/matching_D8.mjs');
bytes('fang','src_D9/vendor_D9/decimal_D9.mts');
bytes('fang','src_D10/report_D10.mjs');
bytes('zong','evaluation/D9/score-rules.mjs');
for(const path of ['核验方法章节_D13.md','三个答辩案例_D13.md','案例自检_D13.mjs'])bytes('delivery',path);
const report={schema_version:'fang.defense-audit/1.0',checked_on:new Date().toISOString(),local_date:'2026-10-09',node:process.version,rule_version:VERSION,source_pins:manifest.source_pins,
  summary:{cases_pass:results.length,cases_total:manifest.cases.length,presentation_formulas_pass:results.length,wei_plugin_pass:wei.length,wei_vendor_files_LF_normalized_identical:vendor.length,wei_vendor_files_bytes_identical:vendor.filter(x=>x.bytes_identical).length,A_schema_and_chen_value_preservation:envelopes,negative_probes_pass:2,input_immutable:true,expected_labels_unused:true,repeat_identical:true},
  results,wei,vendor,negative_probes:[{name:'bad_quote',actual:'insufficient'},{name:'missing_seller',actual:partialResult.attribution_code,requires_review:partialResult.requires_review}],sources,
  boundaries:{fresh_model_calls:0,held_out_inputs_used:false,real_pdf_bytes_rehashed:false,web_browser_run:false,full_harness_end_to_end_run:false,new_conflict_case_is_controlled:true,team_full_acceptance_claimed:false}};
writeFileSync(resolve(args['--out']),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summary,null,2));
