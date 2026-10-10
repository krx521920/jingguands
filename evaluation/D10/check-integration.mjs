#!/usr/bin/env node
// D10 集成与缓存一致性校验器（评测侧）
// 用法: node evaluation/D10/check-integration.mjs --self-check
//       node evaluation/D10/check-integration.mjs --bundle <integration-bundle.json> [--json out] [--strict]
import fs from 'node:fs';
const argv=process.argv.slice(2);const arg=(k,d)=>{const i=argv.indexOf(k);return i>=0?argv[i+1]:d;};const has=(k)=>argv.includes(k);
const CASES=arg('--cases','evaluation/D10/cases/integration-cases.json');
const BUNDLE=arg('--bundle',null);const OUT=arg('--json',null);const STRICT=has('--strict');
const ds=JSON.parse(fs.readFileSync(CASES,'utf8'));
const issues=[];
for(const c of ds.cases){ if(!Array.isArray(c.members)||c.members.length<2) issues.push(c.case_id+' members<2'); }
if(has('--self-check')||!BUNDLE){const out={mode:'self-check',result:issues.length?'FAIL':'PASS',cases_total:ds.cases.length,issues};if(OUT)fs.writeFileSync(OUT,JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));process.exit(issues.length?1:0);}
const b=JSON.parse(fs.readFileSync(BUNDLE,'utf8'));
const byId=new Map((b.results||[]).map(r=>[r.case_id,r]));
const rows=[];let pass=0,fail=0,notRun=0;
for(const c of ds.cases){
 const r=byId.get(c.case_id);
 if(!r){rows.push({case_id:c.case_id,status:'not_run'});STRICT?fail++:notRun++;continue;}
 const notes=[];
 const hasInputs=(r.input_sha256||[]).length===c.members.length&&(r.input_sha256||[]).every(x=>/^[0-9a-f]{64}$/.test(x));
 if(!hasInputs)notes.push('INPUT_HASH_INCOMPLETE');
 if(!r.run_id)notes.push('NO_RUN_ID');
 if(!r.code_version)notes.push('NO_CODE_VERSION');
 if(!r.schema_version)notes.push('NO_SCHEMA_VERSION');
 if(!Array.isArray(r.records))notes.push('NO_RECORDS');
 if(!Array.isArray(r.diff_list))notes.push('NO_DIFF_LIST');
 const rep=r.report||{};
 for(const k of ['events','diffs','attribution','boundaries']) if(!(k in rep))notes.push('REPORT_MISSING_'+k);
 const ct=r.cache||{};
 if(ct.replay_business_fields_identical!==true)notes.push('REPLAY_NOT_IDENTICAL');
 if(ct.cold_cache_new_call_log!==true)notes.push('COLD_CACHE_NO_NEW_LOG');
 if(ct.web_cli_same_result!==true)notes.push('WEB_CLI_MISMATCH');
 const ok=notes.length===0;
 rows.push({case_id:c.case_id,status:ok?'pass':'fail',notes});ok?pass++:fail++;
}
const out={mode:'check',result:(fail===0&&(!STRICT||notRun===0))?'PASS':'FAIL',cases_total:ds.cases.length,pass,fail,not_run:notRun,rows};
if(OUT)fs.writeFileSync(OUT,JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({result:out.result,cases_total:out.cases_total,pass:out.pass,fail:out.fail,not_run:out.not_run},null,2));
process.exit(out.result==='PASS'?0:1);
