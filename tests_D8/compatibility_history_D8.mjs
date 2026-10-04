/** 历史D8.1基线；不是当前队友兼容性验收。请运行compatibility_latest_D8.mjs。 */
/** 固定提交公开数据回放；不读封存配对/期望、不调用模型、不修改队友文件。 */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import {alignEventPair,alignEnvelopes} from '../src_D8/alignment_D8.mjs';
import {alignD7Pair,indexContext,verifyGroupD8} from '../src_D8/adapters_D8.mjs';
import {makeSide,developmentPairs} from './fixtures_D8.mjs';
if(!process.argv[2]) throw Error('Usage: node tests_D8/compatibility_D8.mjs <local_git_repo>');
const repo=resolve(process.argv[2]);
const pins={wei:'954381da031debcbde5cf9c1fe2def3f65adb2f0',zhang:'1d3efad6ec6f0fa6f24a622f0240140ad68980cb',
  fang:'429521a8dc2d90f43d674a531ddb113d9d8ee6fd',master:'e6334aa278b85c0824c8b117723ae48019442d7d',chen:'7b53917f46'};
const sha=x=>createHash('sha256').update(x).digest('hex');
const sources=[];
const get=(ref,path)=>{const s=execFileSync('git',['-c',`safe.directory=${repo}`, 'show',`${ref}:${path}`],{cwd:repo,encoding:'utf8',maxBuffer:30e6});sources.push({commit:ref,path,sha256:sha(s)});return s;};
const json=(ref,path)=>JSON.parse(get(ref,path));
const uri=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const load=s=>import(uri(s));
const schema=json(pins.wei,'interface/event-envelope.schema.json');
const outputSchema=JSON.parse(readFileSync(new URL('../schema_D8.json',import.meta.url),'utf8'));
const {validateAgainstSchema}=await load(get(pins.wei,'scripts/jingguan/lib/schema_validator.mjs'));
const {checkRegistry}=await load(get(pins.wei,'scripts/jingguan/lib/registry.mjs'));
const validate=x=>[...validateAgainstSchema(x,schema),...checkRegistry(x)];
const {checkEquityEnvelope}=await load(stripTypeScriptTypes(get(pins.fang,'src_D5/equity_check_D5.ts')));
const {checkAwardEnvelope}=await load(stripTypeScriptTypes(get(pins.fang,'src_D6/award_check_D6.ts')));
const {default:bridge}=await load('const module={exports:{}};\n'+get(pins.chen,'workspace/cjh/page_prototype/bridge/upstream_bridge.js')+'\nexport default module.exports;');
const decimal=uri(stripTypeScriptTypes(get(pins.master,'src_D7/decimal_D7.mts')));
const normalization=uri(stripTypeScriptTypes(get(pins.master,'src_D7/normalization_D7.mts')).replaceAll('./decimal_D7.mts',decimal));
const {buildAlignmentPair}=await load(stripTypeScriptTypes(get(pins.master,'src_D7/alignment_D7.mts')).replaceAll('./normalization_D7.mts',normalization));
const index=json(pins.zhang,'sample/D8/cross_index.json');
const docs=[];
for(const [day,type] of [[4,'PLD'],[5,'EQC'],[6,'AWD']]) for(let i=1;i<=10;i++) {
  const id=`D${day}-${type}-${String(i).padStart(3,'0')}`;
  const envelope=json(pins.wei,`runs/batch-20261003T160213/envelopes/${id}.json`);
  const parsed=json(pins.zhang,`sample/D${day}/parse/${id}.parse.json`);
  assert.deepEqual(validate(envelope),[]);
  const before=JSON.stringify(envelope),uiBefore=bridge.toContract(envelope),d5Before=checkEquityEnvelope(envelope),d6Before=checkAwardEnvelope(envelope);
  const self=alignEnvelopes(envelope,envelope,{left:{parsed_document:parsed},right:{parsed_document:parsed}});
  assert.equal(JSON.stringify(envelope),before);assert.deepEqual(bridge.toContract(envelope),uiBefore);
  assert.deepEqual(checkEquityEnvelope(envelope),d5Before);assert.deepEqual(checkAwardEnvelope(envelope),d6Before);
  const context=indexContext(index,envelope);assert.equal(context.status,'located');assert.equal(context.used_for_identity,false);
  const ev=envelope.events[0];const pair=buildAlignmentPair(id,{envelope,event_id:ev.event_id},{envelope,event_id:ev.event_id});
  const beforePair=JSON.stringify(pair);const d7=alignD7Pair(pair);assert.equal(JSON.stringify(pair),beforePair);assert.equal(d7.may_compare,false);assert.deepEqual(validateAgainstSchema(d7,outputSchema),[]);
  docs.push({id,envelope,parsed,diagnostics:{a_schema:'PASS',input_unchanged:true,existing_ui_unchanged:true,d5_d6_order_independent:true,
    index_case:context.case_id,self_counts:self.counts,d7_status:d7.status}});
}
const combinations=[];
for(let i=0;i<docs.length;i++) for(let j=i+1;j<docs.length;j++) {
  const a=docs[i],b=docs[j];const before=sha(JSON.stringify([a.envelope,b.envelope]));
  const r=alignEnvelopes(a.envelope,b.envelope,{left:{parsed_document:a.parsed},right:{parsed_document:b.parsed}});
  assert.ok(r.pairs.every(p=>p.may_compare===false && p.audit.numeric_comparison_executed===false));
  for(const p of r.pairs)assert.deepEqual(validateAgainstSchema(p,outputSchema),[]);
  assert.equal(sha(JSON.stringify([a.envelope,b.envelope])),before);
  // 没有额外业务编号标注时，不凭公司名/金额给跨文件same；不同事件类型可以different。
  assert.equal(r.counts.same,0);
  combinations.push({documents:[a.id,b.id],counts:r.counts});
}
for(const p of developmentPairs()) {
  assert.deepEqual(validate(p.left.envelope),[]);assert.deepEqual(validate(p.right.envelope),[]);
  assert.equal(alignEventPair(p.left,p.right).status,p.expected);
  assert.deepEqual(validateAgainstSchema(alignEventPair(p.left,p.right),outputSchema),[]);
}
// 加载魏方函数体（只替换CLI路径初始化、移除主流程）复现旧入口局限；不执行封存测试。
let legacy=get(pins.wei,'scripts/jingguan/verify_crossdoc.mjs').split('// ---------- 主流程 ----------')[0]
  .replace("const REPO_ROOT = resolve(import.meta.dirname, '..', '..')",'const REPO_ROOT = process.cwd()');
const {verifyGroup}=await load(legacy+'\nexport {verifyGroup};');
const a=makeSide('award_contract','old-L'),b=makeSide('award_contract','old-R');
const group={group_id:'synthetic-boundary',members:['L','R']};
let called=0;const old=verifyGroup(group,[a.envelope,b.envelope],()=>{called++;return[];});
const safe=verifyGroupD8(group,[a.envelope,b.envelope]);
assert.equal(old.predicted_relation,'related');assert.equal(safe.document_pairs[0].counts.unknown,1);
for(const e of [a.envelope,b.envelope])e.events[0].fields.bid_amount.value='123456';
called=0;const oldStrings=verifyGroup(group,[a.envelope,b.envelope],()=>{called++;return[];});
assert.equal(oldStrings.predicted_relation,'unrelated');assert.equal(called,0);
const result={checked_on:'2026-10-04',node:process.version,pins,mode:'public_offline_compatibility_not_accuracy_evaluation',
  shared_a_schema:'0.3',d7_input_schema:'b-alignment-draft/0.1',d8_output_schema:'event-alignment/0.1',
  documents:docs.map(d=>({id:d.id,...d.diagnostics})),document_pairs:combinations,
  summary:{documents:docs.length,events:docs.reduce((s,d)=>s+d.envelope.events.length,0),document_pairs:combinations.length,
    pair_counts:combinations.reduce((s,r)=>{for(const k of Object.keys(s))s[k]+=r.counts[k];return s;},{same:0,different:0,unknown:0}),
    d7_adapter_checked:docs.length,index_joins_checked:docs.length,synthetic_contract_pairs:13,input_mutations:0,numeric_comparisons:0},
  wei_integration:{legacy_drop_in_compatible:false,reason:'old --matcher cannot determine tri-state relation and can be skipped by earlier gating',
    legacy_equal_amount:old.predicted_relation,legacy_string_amount:oldStrings.predicted_relation,legacy_string_matcher_invocations:called,
    new_entry:'verifyGroupD8(group,envelopes,contexts)',legacy_engine_modified:false},
  limitations:['未提供业务唯一编号标注的真实跨文档同类型事件保持unknown；不宣称召回率。','自建6同/6不同/1未知为开发测试，尚非宗方独立验收。','没有修改A信封、Gold、公共Schema或队友分支；没有读取封存期望。','同源解析块校验不等于原始PDF真实性核验。'],sources};
process.stdout.write(JSON.stringify(result,null,2)+'\n');
