/** Node 24；复用已交付规则，离线核对演示、反例、集成版与接口，不调用模型。 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync,mkdtempSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const args={};
for(let i=2;i<process.argv.length;i+=2){assert.ok(['--fang-root','--wei-root','--release-root','--chen-root','--out'].includes(process.argv[i])&&process.argv[i+1]);args[process.argv[i]]=process.argv[i+1];}
for(const k of ['fang','wei','release','chen','out'])assert.ok(args[`--${k}${k==='out'?'':'-root'}`],`缺少 ${k}`);
const roots=Object.fromEntries(['fang','wei','release','chen'].map(k=>[k,resolve(args[`--${k}-root`])])),sources=[];
const sha=x=>createHash('sha256').update(x).digest('hex');
function bytes(owner,path){const b=readFileSync(resolve(roots[owner],path));sources.push({owner,path,sha256:sha(b)});return b;}
const read=(owner,path)=>JSON.parse(bytes(owner,path).toString('utf8'));
const load=async(owner,path)=>{bytes(owner,path);return import(pathToFileURL(resolve(roots[owner],path)).href);};
const own=await load('fang','src_D9/attribution_D9.mjs'),release=await load('release','tools/fang-attribution/src_D9/attribution_D9.mjs');
const exact=await load('release','tools/fang-attribution/src_D9/exact_D9.mjs');
const matching=await load('release','tools/fang-matching/src_D8/matching_D8.mjs');
const reportTool=await load('release','tools/fang-report/src_D10/report_D10.mjs');
assert.equal(own.VERSION,'D12.1');assert.equal(release.VERSION,own.VERSION);assert.equal(matching.RULE_VERSION,'D8.2');assert.equal(reportTool.VERSION,'D10.1');
const {pair}=await load('fang','tests_D9/fixtures_D9.mjs');
const {buildCases,arithmeticCases}=await load('fang','回归用例_D12.mjs');
const {validateAgainstSchema}=await load('wei','scripts/jingguan/lib/schema_validator.mjs');
const {checkRegistry}=await load('wei','scripts/jingguan/lib/registry.mjs');
const schema=read('wei','interface/event-envelope.schema.json');
const {default:bridge}=await load('chen','workspace/cjh/page_prototype/bridge/upstream_bridge.js');
const versionFiles=[];
function walk(dir,prefix=''){return readdirSync(dir,{withFileTypes:true}).flatMap(d=>d.isDirectory()?walk(join(dir,d.name),prefix+d.name+'/'):[prefix+d.name]).filter(p=>/\.(mjs|mts)$/.test(p)).sort();}
for(const [local,dest] of [['src_D9','tools/fang-attribution/src_D9'],['vendor_D8','tools/fang-attribution/vendor_D8'],['src_D8','tools/fang-matching/src_D8'],['src_D10','tools/fang-report/src_D10']]){
  const files=walk(resolve(roots.fang,local));
  assert.deepEqual(walk(resolve(roots.release,dest)),files,`运行模块清单不同：${local}`);
  for(const name of files){const a=bytes('fang',local+'/'+name),b=bytes('release',dest+'/'+name);assert.equal(a.toString('utf8').replace(/\r\n/g,'\n'),b.toString('utf8').replace(/\r\n/g,'\n'),`规则漂移：${name}`);versionFiles.push({fang:local+'/'+name,release:dest+'/'+name,bytes_identical:sha(a)===sha(b),LF_content_identical:true});}
}
const controls=buildCases(pair),regression=[];
for(const c of controls){const a=release.attributeCase(c.input,c.options);assert.equal(a.verdict,c.expected.verdict,c.id);assert.equal(a.attribution_code,c.expected.code,c.id);if(c.expected.result!==null)assert.ok(a.computed.some(x=>x.result===c.expected.result),c.id);regression.push({id:c.id,verdict:a.verdict,code:a.attribution_code,pass:true});}
const arithmetic=arithmeticCases.map(c=>{const actual=exact[c.op](...c.args);assert.equal(actual,c.expected,c.id);return {id:c.id,operation:c.op,actual,pass:true};});
const manifest=read('fang','public_dev_D9/inputs_D9.json'),publicCases=read('fang','public_dev_D9/rules-cases.dev_D9.json');
function publicCase(id,members){const c=publicCases.cases.find(x=>x.case_id===id);assert.ok(c);const options={documents:{},parses:{}};for(const m of members){options.documents[m]=read('fang',manifest.envelopes[m]);options.parses[m]=read('fang',manifest.parses[m]);assert.equal(options.documents[m].source.file_sha256,options.parses[m].doc.file_sha256);}return {input:{sides:structuredClone(c.sides)},options};}
const pick=id=>structuredClone(controls.find(c=>c.id===id));
const demos=[];
function add(id,title,kind,x,verdict,code){x=structuredClone(x);x.input.case_id=id;demos.push({id,title,source_kind:kind,input:x.input,context:x.options,expected:{verdict,code}});}
add('D14-DEMO-01','真矛盾类型：精确股数相差一股','controlled_D12-Q04',pick('D12-Q04'),'conflict','SAME_BASIS_CONFLICT');
add('D14-DEMO-02','口径差异：个人份额与四人合计','public_D9-RULE-005',publicCase('D9-RULE-005',['D5-EQC-001','D5-EQC-002']),'explainable_difference','AGGREGATE_DETAIL_RECONCILED');
add('D14-DEMO-03','未知：可读金额缺少比较对象','public_D9-RULE-018',publicCase('D9-RULE-018',['D6-AWD-005']),'insufficient','NO_COMPARISON_CONTEXT');
const another=pick('D12-Q04'),right=another.input.sides[1];right.caliber.event_key.value='TX-02';
for(const fact of Object.values(right.caliber))for(const p of fact.provenance??[])p.quote=p.quote.replaceAll('TX-01','TX-02');
for(const b of another.options.documents[right.case_id].source.parse_meta.blocks)b.text_raw=b.text_raw.replaceAll('TX-01','TX-02');
add('D14-NEG-01','同公司同主体，但事件键不同','controlled_event_change',another,'insufficient','EVENT_IDENTITY_UNPROVEN');
const badQuote=pick('D12-Q04');badQuote.input.sides[0].quote+='原文不存在的文字';
add('D14-NEG-02','坏引文不能维持矛盾结论','controlled_bad_quote',badQuote,'insufficient','EVIDENCE_NOT_VERIFIED');
const partial=publicCase('D9-RULE-005',['D5-EQC-001','D5-EQC-002']);
for(const env of Object.values(partial.options.documents))for(const e of env.events)if(e.fields.holder?.value==='马军强')delete e.fields.change_shares;
add('D14-NEG-03','缺一位出让人的份额','public_snapshot_controlled_missing_field',partial,'explainable_difference','AGGREGATE_PARTIAL_COVERAGE');
for(const [id,key,title] of [['04','D12-T01','16% 不能证明 6%'],['05','D12-F01','11 AED 不能截成 1 AED'],['06','D12-R05','舍入半值越界必须保留矛盾'],['07','D12-N01','超出安全整数范围仍保留一股差异']]){const c=pick(key);add('D14-NEG-'+id,title,'controlled_'+key,c,c.expected.verdict,c.expected.code);}
const outcomes=[],uniqueEnvelopes=new Set();
for(const d of demos){
  const before=JSON.stringify({input:d.input,context:d.context});
  for(const env of Object.values(d.context.documents)){
    const fp=sha(JSON.stringify(env));if(uniqueEnvelopes.has(fp))continue;
    assert.deepEqual(validateAgainstSchema(env,schema),[],d.id+' schema');assert.deepEqual(checkRegistry(env),[],d.id+' registry');
    const b=bridge.toContract(env);assert.ok(b.contract_validation.ok,d.id+' 陈契约');
    // 契约可选 note/denominator 及出处定位三项允许缺省或 null；不放宽 value/status。
    const canonicalFields=e=>Object.fromEntries(Object.entries(e.fields).map(([k,f])=>[k,{note:null,denominator:null,...f,provenance:f.provenance.map(p=>({region:null,table_id:null,cell_ref:null,...p}))}]));
    assert.deepEqual(b.envelope.events.map(canonicalFields),env.events.map(canonicalFields),d.id+' 陈字段保留');uniqueEnvelopes.add(fp);
    assert.deepEqual(b.envelope.events.map(e=>[e.event_id,e.event_type]),env.events.map(e=>[e.event_id,e.event_type]),d.id+' 事件定位保留');
  }
  const actual=release.attributeCase(d.input,d.context);assert.equal(actual.verdict,d.expected.verdict,d.id);assert.equal(actual.attribution_code,d.expected.code,d.id);
  assert.deepEqual(actual,own.attributeCase(d.input,d.context),'个人规则与集成规则行为一致');
  assert.deepEqual(actual,release.attributeCase({...d.input,expected_verdict:'FORGED',category:'FORGED'},d.context));
  assert.equal(JSON.stringify({input:d.input,context:d.context}),before,'输入不得被改写');
  outcomes.push({case_id:d.id,title:d.title,source_kind:d.source_kind,expected:d.expected,input:d.input,result:actual});
}
assert.equal(outcomes[0].result.requires_review,true);assert.equal(outcomes[0].result.computed.length,0);
assert.equal(outcomes[1].result.computed[0].result,'8427900');
assert.deepEqual(outcomes[1].result.computed[0].operands.map(x=>x.value),['3680700','2975600','430000','1341600']);
assert.equal(outcomes[2].result.sides[0].block_verified,true);assert.equal(outcomes[2].result.comparison_performed,false);
const partialResult=outcomes.find(x=>x.case_id==='D14-NEG-03').result;assert.equal(partialResult.requires_review,true);assert.equal(partialResult.comparison_performed,false);assert.equal(partialResult.computed.length,0);
const temp=mkdtempSync(join(tmpdir(),'fang-d14-')),casesFile=join(temp,'cases.json'),weiFile=join(temp,'wei.json');
writeFileSync(casesFile,JSON.stringify({cases:demos.map(d=>({...d.input,context:d.context}))}));
bytes('wei','scripts/jingguan/run_d9_rules.mjs');
const run=spawnSync(process.execPath,[resolve(roots.wei,'scripts/jingguan/run_d9_rules.mjs'),'--cases',casesFile,'--rules',resolve(roots.release,'tools/fang-attribution/src_D9/attribution_D9.mjs'),'--envelopes',temp,'--out',weiFile],{cwd:roots.wei,encoding:'utf8'});
assert.equal(run.status,0,run.stderr||run.stdout);
const peer=JSON.parse(readFileSync(weiFile,'utf8'));
const interfaceChecks=outcomes.map(x=>{const y=peer.cases.find(y=>y.case_id===x.case_id);assert.ok(y);assert.equal(y.verdict,x.result.verdict);assert.equal(y.attribution_code,'plugin:'+x.result.attribution_code);assert.deepEqual(y.computed,x.result.computed);return {case_id:x.case_id,verdict:y.verdict,attribution_code:y.attribution_code,computed_preserved:true};});
const anchors=read('fang','三键审计记录_20261010.json');
const anchorSummary={source:'方已上传的三键审计记录_20261010.json（本轮读取，未重新执行该脚本）',historical:anchors.historical_comparison,new_batch_summary:anchors.new_replay.summary};
for(const [owner,path] of [['release','docs/release-d14.md'],['release','docs/adjudication/D14-INT008判定口径-魏文宇.md'],['chen','workspace/cjh/docs/D14_L4评判标准与本地验证报告.md'],['chen','workspace/cjh/page_prototype/bridge/contract_validate.js'],['chen','workspace/cjh/spec/v0.3/event-envelope.schema.json'],['chen','workspace/cjh/spec/v0.3/registry.mjs']])bytes(owner,path);
const script=fileURLToPath(import.meta.url);sources.push({owner:'delivery',path:'演示复核_D14.mjs',sha256:sha(readFileSync(script))});
for(const name of ['核验演示与反例说明_D14.md','版本与交接说明_D14.md'])sources.push({owner:'delivery',path:name,sha256:sha(readFileSync(resolve(dirname(script),name)))});
const sourceList=[...new Map(sources.map(s=>[s.owner+'/'+s.path,s])).values()];
const result={schema_version:'fang.d14-defense/1.0',business_date:'2026-10-10',executed_at:new Date().toISOString(),node:process.version,
  source_pins:{fang:'8982141d824cd154aeaa43de032457e071f559aa',wei:'2cf52956248244571c1f622fad7e17b302b70778',release:'036a2662a83f6fd9023ece684aa323211120f8b7',chen:'9d731f1b3bc036a38cd0e60d14a9af20ba77f15a'},
  pin_note:'以上为交付时固定提交参照；实际目录内容以 sources 哈希为证，复跑更换检出版本须重审。',
  versions:{alignment:matching.RULE_VERSION,attribution:release.VERSION,report:reportTool.VERSION,contract:'0.3'},version_files:versionFiles,
  summary:{main_cases_pass:3,counterexamples_pass:demos.length-3,wei_plugin_pass:interfaceChecks.length,unique_A_schema_registry_and_chen_preservation:uniqueEnvelopes.size,D12_regression_pass:regression.length,exact_arithmetic_pass:arithmetic.length,runtime_files_LF_identical:versionFiles.length,runtime_files_bytes_identical:versionFiles.filter(x=>x.bytes_identical).length},
  demo_cases:outcomes.slice(0,3),counterexamples:outcomes.slice(3),interface_checks:interfaceChecks,regression,arithmetic,anchor_summary:anchorSummary,sources:sourceList,
  boundaries:{model_calls:0,held_out_inputs_used:false,full_harness_run:false,web_browser_rehearsal:false,team_two_rehearsals_completed:false,web_sidecars_generated:false,own_rule_source_changed:false,three_key_audit_rerun:false}};
writeFileSync(resolve(args['--out']),JSON.stringify(result,null,2)+'\n');
console.table(outcomes.map(x=>({id:x.case_id,verdict:x.result.verdict,code:x.result.attribution_code,review:x.result.requires_review})));console.log(JSON.stringify(result.summary,null,2));
