/** 首测后公开回归：调用现有方/魏/宗接口；不修改业务代码或正式首测输出。Node >=22。 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,existsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const here=dirname(fileURLToPath(import.meta.url)),argv=process.argv.slice(2),args={};
for(let i=0;i<argv.length;i+=2){assert.ok(['--fang-root','--wei-root','--eval-root','--zhang-root','--out','--work-dir','--strict-all'].includes(argv[i])&&argv[i+1],'参数必须为明确的键值对');args[argv[i]]=argv[i+1];}
for(const k of ['--fang-root','--wei-root','--eval-root','--zhang-root'])assert.ok(args[k],`缺少 ${k}`);
const F=resolve(args['--fang-root']),W=resolve(args['--wei-root']),Z=resolve(args['--eval-root']),P=resolve(args['--zhang-root']);
const temp=args['--work-dir']?resolve(args['--work-dir']):mkdtempSync(join(tmpdir(),'fang-d11-'));
mkdirSync(temp,{recursive:true});
const sources=new Map(),sha=b=>createHash('sha256').update(b).digest('hex');
function source(root,path){const bytes=readFileSync(resolve(root,path));const key=({[F]:'fang',[W]:'wei',[Z]:'zong',[P]:'zhang'})[root]??'delivery';sources.set(key+':'+path,{owner:key,path,sha256:sha(bytes)});return bytes;}
const read=(root,path)=>JSON.parse(source(root,path).toString('utf8'));
const write=(path,obj)=>{writeFileSync(path,JSON.stringify(obj,null,2)+'\n');return path;};
const mod=async(root,path)=>{source(root,path);return import(pathToFileURL(resolve(root,path)).href);};
const {attributeCase}=await mod(F,'src_D9/attribution_D9.mjs');
const {explainGroup}=await mod(F,'src_D8/matching_D8.mjs');
const ds=read(here,'公开回归用例_D11.json');
const context={documents:{},parses:{}},envDir=join(temp,'envelopes');mkdirSync(envDir,{recursive:true});
const parseMap={};
for(const c of ds.cases){
  if(c.synthetic_controlled){Object.assign(context.documents,c.context.documents);Object.assign(context.parses,c.context.parses);}
  else for(const s of c.sides){
    if(context.documents[s.case_id])continue;
    const e=read(W,`evaluation/D11/firsttest-envelopes/${s.case_id}.json`);
    context.documents[s.case_id]=e;
    if(s.case_id==='pledge-scan-degrade')continue; // 扫描对抗例本就无文本解析，不伪造块。
    const p=`sample/${s.case_id.slice(0,2)}/parse/${s.case_id}.parse.json`;
    const parsed=read(P,p);assert.equal(parsed.doc.file_sha256,e.source.file_sha256,'源文档与解析版本必须同源');
    context.parses[s.case_id]=parsed;
  }
}
for(const [id,e] of Object.entries(context.documents))write(join(envDir,id+'.json'),e);
for(const [id,p] of Object.entries(context.parses)){parseMap[id]=write(join(temp,id+'.parse.json'),p);}
const mapPath=write(join(temp,'parses-map.json'),parseMap);
const cleanCases=ds.cases.map(c=>({case_id:c.case_id,sides:c.sides}));
const cleanPath=write(join(temp,'inputs.json'),{cases:cleanCases});
const expectPath=write(join(temp,'expectations.json'),{expectation_values:ds.expectation_values,cases:ds.cases.map(({context,...c})=>c)});
function cli(root,script,params,out,allowed=[0]){
  source(root,script);
  const r=spawnSync(process.execPath,[resolve(root,script),...params],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024});
  if(!allowed.includes(r.status))throw Error(`${script} exit=${r.status}\n${r.stderr}\n${r.stdout}`);
  assert.ok(existsSync(out),`${script} 没有写出报告`);
  return {exit_code:r.status,report:JSON.parse(readFileSync(out,'utf8'))};
}
const direct=ds.cases.map(c=>{
  const input={case_id:c.case_id,sides:structuredClone(c.sides)};
  const ctx=c.synthetic_controlled?structuredClone(c.context):structuredClone(context);
  const before=JSON.stringify({input,ctx});
  const r=attributeCase(input,ctx);assert.equal(JSON.stringify({input,ctx}),before,'不得修改输入或上下文');
  const polluted={...input,expected_verdict:'FORGED',category:'FORGED',attribution_basis:'强行互证'};
  assert.deepEqual(attributeCase(polluted,ctx),r,'期望标签不能进入判定');
  return r;
});
const native=cli(W,'scripts/jingguan/run_d9_rules.mjs',['--cases',cleanPath,'--verify-blocks',envDir,'--out',join(temp,'native.json')],join(temp,'native.json'));
const plugin=cli(W,'scripts/jingguan/run_d9_rules.mjs',['--cases',cleanPath,'--rules',resolve(F,'src_D9/attribution_D9.mjs'),'--envelopes',envDir,'--parses-map',mapPath,'--verify-blocks',envDir,'--out',join(temp,'plugin.json')],join(temp,'plugin.json'));
function rowsFor(report){return ds.cases.map(c=>{
  const r=report.find(r=>r.case_id===c.case_id);assert.ok(r,'漏执行用例 '+c.case_id);
  return {case_id:c.case_id,category:c.category,source_kind:c.source_kind,expected:c.expected_verdict,actual:r.verdict,code:r.attribution_code,pass:r.verdict===c.expected_verdict,expected_code_match:c.expected_code?c.expected_code===r.attribution_code:null,computed_count:r.computed?.length??0};
});}
function metrics(rows){const pos=rows.filter(x=>x.expected==='conflict'),neg=rows.filter(x=>x.expected!=='conflict');return {
  total:rows.length,pass:rows.filter(r=>r.pass).length,fail:rows.filter(r=>!r.pass).length,
  conflict_positive:pos.length,conflict_negative:neg.length,
  false_positive:neg.filter(r=>r.actual==='conflict').length,false_negative:pos.filter(r=>r.actual!=='conflict').length,
  note:'固定公开用例的计数，不估计真实业务泛化率；insufficient被强判也是错误。'};}
const dr=rowsFor(direct),nr=rowsFor(native.report.cases),pr=rowsFor(plugin.report.cases);
const bridgeLoss=direct.flatMap(r=>{const p=plugin.report.cases.find(x=>x.case_id===r.case_id);return r.computed.length>0&&p.computed.length===0?[{case_id:r.case_id,direct_computed:r.computed.map(x=>({name:x.name,result:x.result??null,used_source:x.used_source})),bridge_computed:p.computed,verdict_unchanged:r.verdict===p.verdict}]:[];});
const score={};
for(const [name,report] of [['direct',{cases:direct}],['builtin',native.report],['plugin',plugin.report]]){
  const input=write(join(temp,`score-input-${name}.json`),report),output=join(temp,`score-${name}.json`);
  const r=cli(Z,'evaluation/D9/score-rules.mjs',['--cases',expectPath,'--report',input,'--json',output,'--strict'],output,[0,1]);
  score[name]={exit_code:r.exit_code,result:r.report.result,pass:r.report.pass,fail:r.report.fail};
}
// 评分器反例：不更改正式用例/报告，仅向临时副本注入无效证据与漏算。
const scoreProbes=[];
for(const kind of ['invalid_evidence','missing_calculation']){
  const probe=structuredClone(direct);
  if(kind==='invalid_evidence'){
    const target=probe.find(r=>r.case_id==='D11-V06');target.evidence_verified=false;
    target.sides=target.sides.map(s=>({...s,block_verified:false,quote:'[不存在于指定块的合成引文]'}));
  }else for(const r of probe)r.computed=[];
  const injected=write(join(temp,kind+'-score-input.json'),{cases:probe}),probeOut=join(temp,kind+'-score.json');
  const p=cli(Z,'evaluation/D9/score-rules.mjs',['--cases',expectPath,'--report',injected,'--json',probeOut,'--strict'],probeOut,[0,1]);
  scoreProbes.push({kind,expected:'FAIL',result:p.report.result,pass:p.report.pass,fail:p.report.fail});
}
// D8公开16组：正式期望不传给匹配器；真实D11信封优先，新增演示公告使用既有公开D8输入。
const manifest=read(F,'public_dev_D8/input_manifest_D8.json'),alignmentEnvs={},alignmentInputSources={};
for(const g of ds.alignment.groups)for(const id of g.members){
  if(alignmentEnvs[id])continue;
  const first=`evaluation/D11/firsttest-envelopes/${id}.json`,fallback='public_dev_D8/'+manifest.documents[id]?.envelope;
  const current=existsSync(resolve(W,first));alignmentEnvs[id]=read(current?W:F,current?first:fallback);
  alignmentInputSources[id]=current?'D11_frozen_envelope':'existing_public_D8_demo';
  write(join(envDir,id+'.json'),alignmentEnvs[id]);
}
const ar=ds.alignment.groups.map(g=>{
  const r=explainGroup({group_id:g.group_id,members:g.members},g.members.map(id=>alignmentEnvs[id]));
  const expected=g.expected_relation==='insufficient'?'unknown':g.expected_relation;
  assert.equal(r.numeric_comparison_executed,false,'对齐不擅自比较金额');
  assert.equal(r.ui_hint.unknown_is_unrelated,false,'陈侧第三态语义保持');
  return {group_id:g.group_id,members:g.members,expected,actual:r.predicted_relation,pass:r.predicted_relation===expected,reasons:r.reasons,explanation:r.association_explanation};
});
const alignClean=write(join(temp,'alignment-inputs.json'),{groups:ds.alignment.groups.map(({group_id,members})=>({group_id,members}))});
const bOut=join(temp,'B-plugin.json'),b=cli(W,'scripts/jingguan/verify_crossdoc.mjs',['--envelopes-dir',envDir,'--manifest',alignClean,'--matcher',resolve(F,'src_D8/matching_D8.mjs'),'--d9-enrich','--out',bOut],bOut);
const bAgree=b.report.results.length===ar.length&&ar.every(r=>b.report.results.find(x=>x.group_id===r.group_id)?.predicted_relation===r.actual);
// 检查真正B归因入口，避免只测试独立runner。用完整上下文构造诊断差异。
const bridgeInput=write(join(temp,'attribution-B-input.json'),{results:ds.cases.filter(c=>['D11-U02','D11-V01','D11-C01'].includes(c.case_id)).map(c=>({group_id:c.case_id,members:c.sides.map(s=>s.case_id),predicted_relation:'related',d9_context:c.context,consistency:{conflicts:[{entity:c.sides[0].entity,field:c.sides[0].field,values:c.sides.map(s=>({doc:s.case_id,value:s.value,quote:s.quote})),d9_input:{case_id:c.case_id,sides:c.sides}}]}}))});
const bPaths={};
for(const mode of ['builtin','plugin']){
  const out=join(temp,`B-attribution-${mode}.json`),params=['--report',bridgeInput,'--out',out];
  if(mode==='plugin')params.push('--rules',resolve(F,'src_D9/wei_adapter_D9.mjs'));
  const r=cli(W,'scripts/jingguan/attribute_b.mjs',params,out);
  bPaths[mode]=r.report.attributions.map(r=>({group_id:r.group_id,actual:r.attribution,decided_by:r.decided_by}));
}
const expectedB={'D11-U02':'true_conflict','D11-V01':'true_conflict','D11-C01':'insufficient_evidence'};
const bAdapterPass=bPaths.plugin.every(r=>r.actual===expectedB[r.group_id]);
const checkedOn=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const out={schema_version:'fang-d11-regression-results/1',checked_on:checkedOn,baseline_date:'2026-10-07',test_kind:'post_firsttest_public_regression',fresh_model_calls:0,official_firsttest_overwritten:false,
  summary:{direct:metrics(dr),wei_builtin:metrics(nr),wei_rules_plugin:metrics(pr),D8:{total:ar.length,pass:ar.filter(x=>x.pass).length,B_plugin_agrees:bAgree},B_attribution_adapter_pass:bAdapterPass,
    label_independence_checked:ds.cases.length,input_immutability_checked:ds.cases.length,computed_records_dropped_by_wei_bridge:bridgeLoss.length,
    invalid_evidence_accepted_by_evaluator:scoreProbes[0].result==='PASS',missing_calculation_accepted_by_evaluator:scoreProbes[1].result==='PASS',all_integration_gates_pass:bridgeLoss.length===0&&scoreProbes.every(p=>p.result!=='PASS')&&nr.every(r=>r.pass)&&dr.every(r=>r.pass&&r.expected_code_match!==false)&&pr.every(r=>r.pass)&&ar.every(r=>r.pass)&&bAgree&&bAdapterPass},
  d9_direct:dr,wei_builtin:nr,wei_rules_plugin:pr,D8:ar,alignment_input_sources:alignmentInputSources,
  calculation_loss:bridgeLoss,zong_score_compatibility:score,score_negative_probes:scoreProbes,
  B_attribution:bPaths,sources:[...sources.values()]};
write(resolve(args['--out']??join(here,'回归结果_D11.json')),out);
console.log(JSON.stringify(out.summary,null,2));
assert.ok(dr.every(r=>r.pass&&r.expected_code_match!==false),'方D9回归未通过，见结果文件');
assert.ok(pr.every(r=>r.pass),'魏--rules插件判定兼容性未通过');
assert.ok(ar.every(r=>r.pass)&&bAgree&&bAdapterPass,'D8/B接口回归未通过');
if(args['--strict-all']==='true'&&!out.summary.all_integration_gates_pass)process.exitCode=1;
