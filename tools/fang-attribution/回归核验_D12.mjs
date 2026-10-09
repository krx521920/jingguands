/** Node 24；离线公开规则回归，不调用模型，不覆盖 D11 基线。 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,readdirSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {buildCases,arithmeticCases} from './回归用例_D12.mjs';
const here=dirname(fileURLToPath(import.meta.url)),args={};
for(let i=2;i<process.argv.length;i+=2){
  const key=process.argv[i],value=process.argv[i+1];
  assert.ok(['--fang-root','--baseline-root','--wei-root','--eval-root','--zhang-root','--chen-root','--out','--strict-all'].includes(key)&&value,`非法参数 ${key}`);
  args[key]=value;
}
for(const k of ['--wei-root','--eval-root','--zhang-root','--chen-root','--out'])assert.ok(args[k],`缺少 ${k}`);
const F=resolve(args['--fang-root']||here),W=resolve(args['--wei-root']),Z=resolve(args['--eval-root']),P=resolve(args['--zhang-root']);
const C=resolve(args['--chen-root']);
const load=async(root,file)=>import(pathToFileURL(resolve(root,file)).href);
const {pair}=await load(F,'tests_D9/fixtures_D9.mjs');
const current=await load(F,'src_D9/attribution_D9.mjs'),exact=await load(F,'src_D9/exact_D9.mjs');
const {validateAgainstSchema}=await load(W,'scripts/jingguan/lib/schema_validator.mjs');
const {checkRegistry}=await load(W,'scripts/jingguan/lib/registry.mjs');
const envelopeSchema=JSON.parse(readFileSync(resolve(W,'interface/event-envelope.schema.json'),'utf8'));
const baseline=args['--baseline-root']?await load(resolve(args['--baseline-root']),'src_D9/attribution_D9.mjs'):null;
const baselineExact=args['--baseline-root']?await load(resolve(args['--baseline-root']),'src_D9/exact_D9.mjs'):null;
const temp=mkdtempSync(join(tmpdir(),'fang-d12-'));
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const write=(p,x)=>{writeFileSync(p,JSON.stringify(x,null,2)+'\n');return p;};
const sha=b=>createHash('sha256').update(b).digest('hex');
function run(root,file,params,allowed=[0]){
  const r=spawnSync(process.execPath,[resolve(root,file),...params],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024});
  assert.ok(allowed.includes(r.status),`${file}: exit ${r.status}\n${r.stderr}\n${r.stdout}`);return r;
}
const cases=buildCases(pair),outputs=[];
for(const c of cases)for(const env of Object.values(c.options.documents)){
  assert.deepEqual(validateAgainstSchema(env,envelopeSchema),[],c.id+' A schema');
  assert.deepEqual(checkRegistry(env),[],c.id+' A registry');
}
const rows=cases.map(c=>{
  const before=JSON.stringify({input:c.input,options:c.options});
  const observed=current.attributeCase(c.input,c.options);
  const old=baseline?.attributeCase(c.input,c.options)??null;
  const result=observed.computed.at(-1)?.result??null;
  const stable=[1,2,3].every(()=>JSON.stringify(current.attributeCase(c.input,c.options))===JSON.stringify(observed));
  const reversed=current.attributeCase({...c.input,sides:[...c.input.sides].reverse()},c.options);
  const symmetric=reversed.verdict===observed.verdict&&reversed.attribution_code===observed.attribution_code
    &&(reversed.computed.at(-1)?.result??null)===result;
  const labelsIndependent=JSON.stringify(current.attributeCase({...c.input,expected_verdict:'FORGED',category:'FORGED'},c.options))===JSON.stringify(observed);
  const immutable=before===JSON.stringify({input:c.input,options:c.options});
  outputs.push(observed);
  return {case_id:c.id,reason:c.reason,source_kind:'synthetic_controlled',expected:c.expected,
    before:old?{verdict:old.verdict,code:old.attribution_code,result:old.computed.at(-1)?.result??null}:null,
    after:{verdict:observed.verdict,code:observed.attribution_code,result,computed:observed.computed},
    stable,symmetric,labelsIndependent,immutable,
    pass:observed.verdict===c.expected.verdict&&observed.attribution_code===c.expected.code&&result===c.expected.result&&stable&&symmetric&&labelsIndependent&&immutable};
});
const numeric=arithmeticCases.map(c=>{
  const actual=exact[c.op](...c.args),before=baselineExact?baselineExact[c.op](...c.args):undefined;
  return {...c,before,actual,pass:actual===c.expected};
});
// 魏的既有 --rules 接口：每例提供完整显式上下文，禁止期望字段进入规则。
const input=write(join(temp,'new-cases.json'),{cases:cases.map(c=>({case_id:c.id,sides:c.input.sides,context:c.options}))});
const out=join(temp,'new-wei.json');
run(W,'scripts/jingguan/run_d9_rules.mjs',['--cases',input,'--rules',resolve(F,'src_D9/attribution_D9.mjs'),'--envelopes',temp,'--out',out]);
const peer=read(out);
const weiRows=cases.map((c,i)=>{
  const r=peer.cases.find(x=>x.case_id===c.id),d=outputs[i];
  return {case_id:c.id,verdict:r?.verdict,code:r?.attribution_code,
    computed_preserved:JSON.stringify(r?.computed)===JSON.stringify(d.computed),
    pass:r?.verdict===d.verdict&&r?.attribution_code==='plugin:'+d.attribution_code&&JSON.stringify(r.computed)===JSON.stringify(d.computed)};
});
// 旧 D11 的脚本与期望完全不改：留存今日结果，集成红项不能隐藏。
const prior=join(temp,'D11-current.json');
const priorWork=join(temp,'D11');
const oldRun=run(F,'回归核验_D11.mjs',['--fang-root',F,'--wei-root',W,'--eval-root',Z,'--zhang-root',P,'--out',prior,'--work-dir',priorWork,'--strict-all','true'],[0,1]);
const d11=read(prior);
// 全量上下文只含 D11 公共/受控输入。004 的四人合计需要比较两侧之外的来源，显式传递而非规则库自行读盘。
const fullContext={documents:Object.fromEntries(readdirSync(join(priorWork,'envelopes')).filter(n=>n.endsWith('.json')).map(n=>[n.slice(0,-5),read(join(priorWork,'envelopes',n))])),
  parses:Object.fromEntries(Object.entries(read(join(priorWork,'parses-map.json'))).map(([id,p])=>[id,read(p)]))};
const fullCases=read(join(priorWork,'inputs.json'));
for(const c of fullCases.cases)c.context=fullContext;
const fullInput=write(join(temp,'full-context.json'),fullCases),fullOut=join(temp,'full-context-output.json');
run(W,'scripts/jingguan/run_d9_rules.mjs',['--cases',fullInput,'--rules',resolve(F,'src_D9/attribution_D9.mjs'),'--envelopes',join(priorWork,'envelopes'),'--out',fullOut]);
const fullReport=read(fullOut),directReport=read(join(priorWork,'score-input-direct.json'));
const fullContextRows=directReport.cases.map(d=>{
  const r=fullReport.cases.find(x=>x.case_id===d.case_id);
  return {case_id:d.case_id,pass:r?.verdict===d.verdict&&JSON.stringify(r?.computed)===JSON.stringify(d.computed),computed_count:r?.computed.length??0};
});
const legacy=[];
for(const [name,command] of [
  ['D5',['--test','tests_D5/equity.test_D5.mjs']],
  ['D8',['--test','tests_D8/latest.test_D8.mjs','tests_D8/rules.test_D8.mjs']],
  ['D9',['--test','tests_D9/regression_D9.test.mjs']],
  ['D10',['tests_D10/verify_D10.mjs']],
]){
  const r=spawnSync(process.execPath,command,{cwd:F,encoding:'utf8',maxBuffer:8*1024*1024});
  legacy.push({name,command:['node',...command].join(' '),exit_code:r.status,pass:r.status===0,
    summary:r.stdout.trim().split(/\r?\n/).slice(-10).join('\n'),stderr:r.stderr.trim()});
}
for(const script of ['demo/_contract_check.js','demo/_v03_gap_check.js']){
  const r=run(join(C,'workspace/cjh/page_prototype'),script,[],[0,1]);
  legacy.push({name:'Chen '+script,command:'node '+script,exit_code:r.status,pass:r.status===0,summary:r.stdout.trim().split(/\r?\n/).slice(-4).join('\n'),stderr:r.stderr.trim()});
}
const verdictMetrics=key=>{
  const tested=rows.filter(r=>r[key]),positives=tested.filter(r=>r.expected.verdict==='conflict'),negatives=tested.filter(r=>r.expected.verdict!=='conflict');
  return {total:tested.length,verdict_pass:tested.filter(r=>r[key].verdict===r.expected.verdict).length,
    conflict_positive:positives.length,conflict_negative:negatives.length,
    false_positive:negatives.filter(r=>r[key].verdict==='conflict').length,false_negative:positives.filter(r=>r[key].verdict!=='conflict').length,
    insufficient_promoted:tested.filter(r=>r.expected.verdict==='insufficient'&&r[key].verdict!=='insufficient').length};
};
const files=[...['src_D9/attribution_D9.mjs','src_D9/exact_D9.mjs','tests_D9/fixtures_D9.mjs','回归用例_D12.mjs','回归核验_D12.mjs','公开回归用例_D11.json','回归核验_D11.mjs'].map(p=>[F,p]),
  [W,'scripts/jingguan/run_d9_rules.mjs'],[W,'interface/event-envelope.schema.json'],[W,'scripts/jingguan/lib/schema_validator.mjs'],[W,'scripts/jingguan/lib/registry.mjs'],[Z,'evaluation/D9/score-rules.mjs']];
const peerSources=[
  [W,'evaluation/D12/wei-runs/README.md'],[W,'evaluation/D12/wei-runs/fang46-bridge-check.json'],
  [Z,'evaluation/D12/D12验收结果.md'],[Z,'evaluation/D12/D12回归一致性性能报告.md'],[Z,'evaluation/D12/评测侧勘误与修复.md'],
  [P,'sample/D12/README.md'],[C,'workspace/cjh/docs/D12_交付说明与代办清单.md'],[C,'workspace/cjh/docs/D12_缺陷表_新标准.md'],[C,'workspace/cjh/docs/D16_四条裁定落地说明.md'],
];
const ownPass=rows.every(r=>r.pass)&&numeric.every(r=>r.pass)&&weiRows.every(r=>r.pass)&&fullContextRows.every(r=>r.pass)&&legacy.every(r=>r.pass)
  &&d11.summary.direct.fail===0&&d11.summary.wei_rules_plugin.fail===0&&d11.summary.D8.pass===d11.summary.D8.total;
const report={schema_version:'fang.rules-regression/1.0',checked_on:new Date().toISOString(),node:process.version,rule_version:current.VERSION,
  baseline:baseline?{rule_version:baseline.VERSION,files:['src_D9/attribution_D9.mjs','src_D9/exact_D9.mjs'].map(path=>({path,sha256:sha(readFileSync(resolve(args['--baseline-root'],path)))}))}:null,
  fresh_model_calls:0,uses_held_out_cases:false,official_results_overwritten:false,
  summary:{own_rule_gate_pass:ownPass,full_team_gate_pass:ownPass&&d11.summary.all_integration_gates_pass,
    public_controlled_cases:rows.length,new_rule_pass:rows.filter(r=>r.pass).length,synthetic_A_schema_pass:cases.length*2,numeric_cases:numeric.length,numeric_pass:numeric.filter(r=>r.pass).length,
    wei_plugin_pass:weiRows.filter(r=>r.pass).length,wei_full_context_pass:fullContextRows.filter(r=>r.pass).length,before:verdictMetrics('before'),after:verdictMetrics('after')},
  regression:rows,arithmetic:numeric,wei_plugin:weiRows,legacy,
  d11_unchanged_suite:{exit_code:oldRun.status,summary:d11.summary,calculation_loss:d11.calculation_loss,score_negative_probes:d11.score_negative_probes},
  wei_full_context:fullContextRows,
  reviewed_peer_reports:peerSources.map(([root,path])=>({owner:root===W?'wei':root===Z?'zong':root===P?'zhang':'chen',path,sha256:sha(readFileSync(resolve(root,path)))})),
  fingerprints:files.map(([root,path])=>({owner:root===F?'fang':root===W?'wei':'zong',path,sha256:sha(readFileSync(resolve(root,path)))})),
  boundaries:['固定公开及合成用例计数，不估计真实业务准确率。','3 次规则重算是确定性检查，不是 3 次模型冷跑。','同运行原事件编号用于 sidecar；跨模型批次不能按序号认定同一事件。','规则与接口验收通过不等于团队评测、Web 或冷跑全部通过。']};
write(resolve(args['--out']),report);console.log(JSON.stringify(report.summary,null,2));
process.exitCode=(args['--strict-all']==='true'?report.summary.full_team_gate_pass:ownPass)?0:1;
