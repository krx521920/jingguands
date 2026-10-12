/** Offline public controls. No model calls or sealed inputs. Node 24.x. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const args={};for(let i=2;i<process.argv.length;i+=2){assert.ok(['--fang-root','--baseline-root','--wei-root','--out'].includes(process.argv[i])&&process.argv[i+1]);args[process.argv[i]]=process.argv[i+1];}
for(const k of ['--fang-root','--wei-root','--out'])assert.ok(args[k],k+' required');
const F=resolve(args['--fang-root']),W=resolve(args['--wei-root']);
const load=(r,p)=>import(pathToFileURL(resolve(r,p)).href);
const {pair:rawPair}=await load(F,'tests_D9/fixtures_D9.mjs');
const {buildCases,arithmeticCases}=await load(F,'回归用例_D12.mjs');
const current=await load(F,'src_D9/attribution_D9.mjs'),exact=await load(F,'src_D9/exact_D9.mjs');
const old=args['--baseline-root']?await load(resolve(args['--baseline-root']),'src_D9/attribution_D9.mjs'):null;
const pair=(a,b)=>{
 const x=rawPair(a,b);
 for(const s of x.input.sides){const e=x.options.documents[s.case_id];e.source.file_name=s.case_id+'.synthetic.txt';e.run_meta={entry:'tool',interface_version:'v0.3'};
  const ev=e.events[0];ev.event_id='E01';ev.event_type=s.unit==='cny'?'award_contract':'equity_change';ev.extraction_method='mock';
  if(s.unit==='cny'){ev.fields.bidder=ev.fields.holder;delete ev.fields.holder;}
  for(const f of Object.values(ev.fields)){f.raw_value??=String(f.value);f.unit??='text';f.standardized=true;if(f.unit==='percent')f.denominator='total_share_capital';f.provenance=f.provenance.map(({file_sha256,...p})=>({...p,source_type:'paragraph'}));}
 }
 return x;
};
const money={field:'bid_amount',unit:'cny',currency:'CNY',tax:'含税'};
const m=v=>({...money,value:v,raw:v+'元'});
const rounded=(v,raw,n,extra='')=>({...money,value:v,raw,extra:`四舍五入保留${n}位小数；${extra}`,facts:{rounding:{value:n}}});
const cases=buildCases(rawPair);
function add(id,reason,x,verdict,code){cases.push({id,reason,...x,expected:{verdict,code}});}
const C='SAME_BASIS_CONFLICT',I='insufficient',E='explainable_difference';
add('F1-01','exact shares +1',pair({value:'1000'},{value:'1001'}),'conflict',C);
add('F1-02','large shares +10000000 within 0.5 percent',pair({value:'1000000000000'},{value:'1000010000000'}),'conflict',C);
add('F1-03','large shares +1',pair({value:'1000000000000000'},{value:'1000000000000001'}),'conflict',C);
add('F1-04','amount +0.01',pair(m('100'),m('100.01')),'conflict',C);
add('F1-05','amount below one cent still exact',pair(m('100'),m('100.000001')),'conflict',C);
const pct=v=>({field:'ratio_after',unit:'percent',value:v,raw:v+'%',extra:'分母为总股本',facts:{denominator:{value:'total_share_capital',definition:'总股本'}}});
add('F1-06','percent uses percentage points, no relative tolerance',pair(pct('1'),pct('1.0001')),'conflict',C);
add('F1-07','zero versus nonzero',pair(m('0'),m('0.000001')),'conflict',C);
add('F1-08','positive lower midpoint included',pair(rounded('12300','1.23万元',2),m('12250')),E,'EXPLICIT_ROUNDING');
add('F1-09','positive upper midpoint excluded',pair(rounded('12300','1.23万元',2),m('12350')),'conflict',C);
add('F1-10','positive upper interior',pair(rounded('12300','1.23万元',2),m('12349.999999999999999999')),E,'EXPLICIT_ROUNDING');
add('F1-11','negative lower midpoint excluded',pair(rounded('-12300','-1.23万元',2),m('-12350')),'conflict',C);
add('F1-12','negative upper midpoint included',pair(rounded('-12300','-1.23万元',2),m('-12250')),E,'EXPLICIT_ROUNDING');
add('F1-13','both sides rounded: cannot treat one as exact',pair(rounded('1.2','1.2元',1),rounded('1.24','1.24元',2)),I,'ROUNDING_BOTH_SIDES_UNRESOLVED');
add('F1-14','missing disclosure unit',pair(rounded('1.23','1.23',2),m('1.234')),I,'ROUNDING_BASIS_UNPROVEN');
add('F1-15','competing precision statements',pair(rounded('1.23','1.23元',2,'四舍五入保留3位小数'),m('1.234')),I,'ROUNDING_BASIS_UNPROVEN');
add('F1-16','undeclared precision cannot be guessed',pair({...m('12300'),raw:'1.23万元'},m('12345')),'conflict',C);
add('F1-17','same company insufficient event identity',pair({value:'1000',noKey:true},{value:'1001',noKey:true}),I,'EVENT_IDENTITY_UNPROVEN');
add('F1-18','qualified approximate is not exact',pair({value:'1000',raw:'约1000股'},{value:'1001'}),I,'QUALIFIED_AMOUNT_NOT_EXACT');
const summary=r=>({verdict:r.verdict,code:r.attribution_code,result:r.computed.at(-1)?.result??null});
const {validateAgainstSchema}=await load(W,'scripts/jingguan/lib/schema_validator.mjs');
const {checkRegistry}=await load(W,'scripts/jingguan/lib/registry.mjs');
const envelopeSchema=JSON.parse(readFileSync(resolve(W,'interface/event-envelope.schema.json'),'utf8'));
const schemaChecks=cases.flatMap(c=>Object.values(c.options.documents).map(env=>({case_id:c.id,errors:[...validateAgainstSchema(env,envelopeSchema),...checkRegistry(env)]})));
const rows=cases.map(c=>{
 const before=JSON.stringify([c.input,c.options]),out=current.attributeCase(c.input,c.options),rev=current.attributeCase({...c.input,sides:[...c.input.sides].reverse()},c.options);
 const pass=out.verdict===c.expected.verdict&&out.attribution_code===c.expected.code&&(!Object.hasOwn(c.expected,'result')||summary(out).result===c.expected.result);
 const symmetric=JSON.stringify(summary(out))===JSON.stringify(summary(rev));
 const immutable=before===JSON.stringify([c.input,c.options]);
 const labelsIgnored=JSON.stringify(out)===JSON.stringify(current.attributeCase({...c.input,expected_verdict:'forged',category:'forged'},c.options));
 return {case_id:c.id,reason:c.reason,expected:c.expected,before:old?summary(old.attributeCase(c.input,c.options)):null,after:summary(out),computed:out.computed,pass:pass&&symmetric&&immutable&&labelsIgnored,symmetric,immutable,labelsIgnored};
});
const arithmetic=arithmeticCases.map(c=>({...c,actual:exact[c.op](...c.args),pass:exact[c.op](...c.args)===c.expected}));
const temp=mkdtempSync(join(tmpdir(),'fang-f1-')),save=(name,x)=>{const p=join(temp,name);writeFileSync(p,JSON.stringify(x));return p;};
const input=save('cases.json',{cases:cases.map(c=>({case_id:c.id,sides:c.input.sides,context:c.options}))});
function run(file,params){const r=spawnSync(process.execPath,[resolve(W,file),...params],{cwd:W,encoding:'utf8',maxBuffer:8*1024*1024});assert.equal(r.status,0,r.stderr+'\n'+r.stdout);}
const outFile=join(temp,'peer.json');run('scripts/jingguan/run_d9_rules.mjs',['--cases',input,'--rules',resolve(F,'src_D9/attribution_D9.mjs'),'--envelopes',temp,'--out',outFile]);
const peer=JSON.parse(readFileSync(outFile,'utf8'));
const cli=rows.map(row=>{const p=peer.cases.find(x=>x.case_id===row.case_id);return {case_id:row.case_id,pass:p?.verdict===row.after.verdict&&p?.attribution_code==='plugin:'+row.after.code&&JSON.stringify(p.computed)===JSON.stringify(row.computed)};});
const bCases=cases.filter(c=>['F1-01','F1-02','F1-04','F1-06','F1-13','F1-14'].includes(c.id));
const groups=bCases.map(c=>({group_id:c.id,predicted_relation:'related',consistency:{conflicts:[{entity:c.input.sides[0].entity,field:c.input.sides[0].field,values:c.input.sides.map(s=>({doc:s.case_id,value:s.value,quote:s.quote})),d9_input:c.input}]},d9_context:c.options}));
groups.push({group_id:'F1-NO-CONTEXT',predicted_relation:'related',consistency:{conflicts:[{entity:'甲主体',field:'shares_after',values:[{doc:'A',value:'1000',quote:'1000股'},{doc:'B',value:'1001',quote:'1001股'}]}]}});
const bInput=save('b.json',{results:groups}),bOut=join(temp,'b-out.json');run('scripts/jingguan/attribute_b.mjs',['--report',bInput,'--rules',resolve(F,'src_D9/wei_adapter_D9.mjs'),'--out',bOut]);
const b=JSON.parse(readFileSync(bOut,'utf8'));
const adapter=b.attributions.map((x,i)=>({case_id:groups[i].group_id,attribution:x.attribution,decided_by:x.decided_by,pass:x.decided_by==='plugin:FANG_D9_EVIDENCE_FIRST'&&x.attribution===(i===bCases.length?'insufficient_evidence':rows.find(r=>r.case_id===bCases[i].id).after.verdict==='conflict'?'true_conflict':'insufficient_evidence')}));
const defaultOut=join(temp,'default.json');run('scripts/jingguan/run_d9_rules.mjs',['--cases',input,'--out',defaultOut]);
const defaultPeer=JSON.parse(readFileSync(defaultOut,'utf8'));
const defaultDifferences=rows.map(r=>{const d=defaultPeer.cases.find(c=>c.case_id===r.case_id);return {case_id:r.case_id,plugin:r.after,default:{verdict:d.verdict,code:d.attribution_code}};}).filter(r=>r.plugin.verdict!==r.default.verdict);
const files=[['fang','src_D9/attribution_D9.mjs'],['fang','src_D9/exact_D9.mjs'],['fang','src_D9/wei_adapter_D9.mjs'],['fang','tests_D9/fixtures_D9.mjs'],['fang','回归用例_D12.mjs'],['wei','scripts/jingguan/run_d9_rules.mjs'],['wei','scripts/jingguan/attribute_b.mjs'],['wei','scripts/jingguan/lib/eval_side.mjs']];
const sources=files.map(([owner,path])=>({owner,path,sha256:createHash('sha256').update(readFileSync(resolve(owner==='fang'?F:W,path))).digest('hex')}));
for(const path of ['interface/event-envelope.schema.json','scripts/jingguan/lib/schema_validator.mjs','scripts/jingguan/lib/registry.mjs'])sources.push({owner:'wei',path,sha256:createHash('sha256').update(readFileSync(resolve(W,path))).digest('hex')});
sources.push({owner:'delivery',path:'tolerance_regression_20261012.mjs',sha256:createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex')});
const prior=spawnSync(process.execPath,['--test',resolve(F,'tests_D9/regression_D9.test.mjs')],{cwd:F,encoding:'utf8'});
const existing_regression={exit_code:prior.status,stdout:prior.stdout,stderr:prior.stderr};
const pass=rows.every(r=>r.pass)&&arithmetic.every(r=>r.pass)&&cli.every(r=>r.pass)&&adapter.length===groups.length&&adapter.every(r=>r.pass)&&schemaChecks.every(r=>r.errors.length===0)&&prior.status===0;
const report={schema_version:'fang.tolerance-regression/1.0',checked_on:new Date().toISOString(),version:current.VERSION,node:process.version,source_kind:'synthetic_public_controls',wei_reference_commit:'dc4080ac43b09255b18209894b28a9fa76822d71',rows,arithmetic,cli,adapter,default_path_differences:defaultDifferences,sources,summary:{pass,rules_passed:rows.filter(r=>r.pass).length,rules_total:rows.length,arithmetic_passed:arithmetic.filter(r=>r.pass).length,cli_passed:cli.filter(r=>r.pass).length,adapter_passed:adapter.filter(r=>r.pass).length},boundaries:{web_tested:false,model_calls:0,sealed_inputs_read:false,default_engine_modified:false}};
report.schema_checks=schemaChecks;report.existing_regression=existing_regression;
writeFileSync(resolve(args['--out']),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({summary:report.summary,failures:rows.filter(r=>!r.pass),schema_errors:schemaChecks.filter(r=>r.errors.length),existing_exit:prior.status,default_path_differences:defaultDifferences.length},null,2));if(!pass)process.exitCode=1;
