/** 实际运行队友 CLI/评分器；公开数据回放，不访问封存集合或模型。 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {runManifest} from '../src_D8/run_public_D8.mjs';
import {alignDocuments,alignEvents} from '../src_D8/matching_D8.mjs';
import {indexContext} from '../src_D8/adapters_D8.mjs';
import {validateAgainstSchema} from '../peer_reference_D8/schema_validator_D8.mjs';
import bridge from '../peer_reference_D8/upstream_bridge_D8.cjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const dest=resolve(process.argv[2]??join(root,'docs_D8/validation_D8'));mkdirSync(dest,{recursive:true});
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const write=(name,x)=>writeFileSync(join(dest,name),JSON.stringify(x,null,2)+'\n');
const sha=x=>createHash('sha256').update(x).digest('hex');
const snapshot=read(join(root,'来源清单_D8.json'));
for(const s of snapshot.sources)assert.equal(sha(readFileSync(join(root,s.local))),s.sha256,s.local);
const input=read(join(root,'public_dev_D8/input_manifest_D8.json'));
const schema=read(join(root,'peer_reference_D8/event-envelope.schema_D8.json'));
const alignmentSchema=read(join(root,'document_alignment_schema_D8.json'));
const index=read(join(root,'public_dev_D8/cross_index_D8.json'));
const scratch=mkdtempSync(join(tmpdir(),'fang-d8-peer-'));
const docs={};let indexJoins=0;
for(const [id,p] of Object.entries(input.documents)){
  const path=join(root,'public_dev_D8',p.envelope),e=read(path);docs[id]=e;
  assert.deepEqual(validateAgainstSchema(e,schema),[],id);
  const original=JSON.stringify(e),uiBefore=bridge.toContract(e);
  alignDocuments(e,e);alignEvents(e,e);
  assert.equal(JSON.stringify(e),original);assert.deepEqual(bridge.toContract(e),uiBefore);
  if(/^D[456]-/.test(id)){assert.equal(indexContext(index,e).status,'located');indexJoins++;}
  copyFileSync(path,join(scratch,id+'.json'));
}
const commands=[];
function run(args){
  const p=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',maxBuffer:10e6});
  commands.push({program:'node',arguments:args,exit_code:p.status,stdout:p.stdout,stderr:p.stderr});
  assert.equal(p.status,0,p.stderr+'\n'+p.stdout);return p;
}
const pairPath=join(root,'public_dev_D8/pairs.dev30_D8.json'),demoPath=join(root,'public_dev_D8/demo_pairs_D8.json');
run([join(root,'peer_reference_D8/score-pairs_D8.mjs'),'--pairs',pairPath,'--self-check']);
const own=runManifest(pairPath,join(dest,'public_report_D8.json'));
for(const r of own.results)for(const p of r.document_pairs)assert.deepEqual(validateAgainstSchema(p,alignmentSchema),[]);
run([join(root,'peer_reference_D8/score-pairs_D8.mjs'),'--pairs',pairPath,'--report',join(dest,'public_report_D8.json'),'--strict','--json',join(dest,'public_score_D8.json')]);
const demo=runManifest(demoPath,join(dest,'demo_report_D8.json'));
for(const g of read(demoPath).groups)assert.equal(demo.results.find(r=>r.group_id===g.group_id).predicted_relation,g.expected_relation);
const challenge=runManifest(join(root,'public_dev_D8/demo_challenges_D8.json'),join(dest,'challenge_report_D8.json'));
assert.ok(challenge.results.filter(r=>['D8-DEMO-004','D8-DEMO-005'].includes(r.group_id)).every(r=>r.predicted_relation==='unknown'));
for(const [name,manifest] of [['public',pairPath],['demo',demoPath]]){
  run([join(root,'peer_reference_D8/verify_crossdoc_D8.mjs'),'--envelopes-dir',scratch,'--manifest',manifest,
    '--matcher',join(root,'src_D8/matching_D8.mjs'),'--expect','--out',join(dest,`wei_${name}_report_D8.json`)]);
  const r=read(join(dest,`wei_${name}_report_D8.json`));assert.ok(r.results.every(g=>!g.consistency?.aligner_errors?.length));
}
run([join(root,'peer_reference_D8/score-pairs_D8.mjs'),'--pairs',pairPath,'--report',join(dest,'wei_public_report_D8.json'),'--strict','--json',join(dest,'wei_public_score_D8.json')]);
// 修改公开预期并打乱配对顺序，规则输出仍须原样；评分标签仅用于测试端断言。
const changed=read(pairPath);changed.groups.reverse();
for(const g of changed.groups){g.expected_relation='insufficient';g.relation_basis='NOT USED';g.member_meta=[];}
const mutated=join(scratch,'changed-labels.json');writeFileSync(mutated,JSON.stringify(changed));
const rerun=runManifest(mutated);
assert.deepEqual([...rerun.results].sort((a,b)=>a.group_id.localeCompare(b.group_id)),[...own.results].sort((a,b)=>a.group_id.localeCompare(b.group_id)));
let pairCount=0;const counts={related:0,unrelated:0,unknown:0};
const base=Object.keys(docs).filter(id=>/^D[456]-/.test(id));
for(let i=0;i<base.length;i++)for(let j=i+1;j<base.length;j++){
  const a=docs[base[i]],b=docs[base[j]],before=sha(JSON.stringify([a,b]));
  const result=alignDocuments(a,b);counts[result.predicted_relation]++;pairCount++;
  assert.deepEqual(validateAgainstSchema(result,alignmentSchema),[]);
  assert.equal(sha(JSON.stringify([a,b])),before);if(result.status!=='same')assert.deepEqual(alignEvents(a,b),[]);
}
write('compatibility_summary_D8.json',{checked_on:new Date().toISOString(),node:process.version,pins:snapshot.pins,
  a_schema_documents:Object.keys(docs).length,chen_bridge_unchanged:Object.keys(docs).length,zhang_index_joins:indexJoins,
  full_public30_combinations:pairCount,full_public30_counts:counts,
  public_development_score:read(join(dest,'public_score_D8.json')).result,
  wei_plugin_public_score:read(join(dest,'wei_public_score_D8.json')).result,
  public_pairs:13,supplement_strict_pairs:3,granularity_challenges_unknown:2,
  public_gold_expectations_used_by_rule:false,source_files_byte_hashes_verified:snapshot.sources.length,
  legacy_matcher_drop_in:true,legacy_matcher_can_override_relation:false,
  legacy_unconditional_aggregate_checks_still_exist:true,full_tri_state_entry:'src_D8/run_public_D8.mjs',
  no_model_calls:true,no_sealed_corpus_access:true,no_shared_schema_changes:true,
  peer_semantic_review:'pending',ui_visual_acceptance:'not_claimed',scratch_directory:scratch});
write('commands_D8.json',commands);
console.log(JSON.stringify({documents:Object.keys(docs).length,public_pairs:13,demo_pairs:3,pairCount,counts,output:dest}));
