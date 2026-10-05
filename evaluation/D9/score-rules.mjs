#!/usr/bin/env node
// D9 归因规则评分脚本（评测侧，宗）
// 用法:
//   node evaluation/D9/score-rules.mjs --self-check
//   node evaluation/D9/score-rules.mjs --report <attribution-report.json> [--json out] [--strict]
// 归因报告格式（B 侧 D9 归因输出约定）:
//   { checked_on, cases:[ {case_id, verdict, attribution, sides:[{case_id,block_id,quote}], computed:[{name,used_source}] } ] }
// verdict ∈ corroborated | explainable_difference | restated | conflict | insufficient
import fs from 'node:fs'; import path from 'node:path';
const argv=process.argv.slice(2); const arg=(k,d)=>{const i=argv.indexOf(k);return i>=0?argv[i+1]:d;}; const has=(k)=>argv.includes(k);
const CASES=arg('--cases','evaluation/D9/cases/rules-cases.dev.json');
const REPORT=arg('--report',null); const OUT=arg('--json',null); const STRICT=has('--strict');
const ds=JSON.parse(fs.readFileSync(CASES,'utf8'));
const FMT=new Set(ds.expectation_values);
const issues=[];
for(const c of ds.cases){
  if(!FMT.has(c.expected_verdict)) issues.push(c.case_id+' bad expected_verdict');
  if(!Array.isArray(c.sides)) issues.push(c.case_id+' sides');
  const real=c.sides.filter(s=>!c.synthetic_controlled);
  if(c.expected_verdict==='conflict'&&!c.synthetic_controlled&&real.length<2) issues.push(c.case_id+' conflict needs 2 real sides');
  if(c.expected_verdict!=='conflict'&&c.must_not_conclude!=='conflict'&&['partial_coverage','scope_cumulative','ratio_denominator','tax_scope','currency_scope','aggregate_detail'].includes(c.category)&&!c.must_not_conclude) issues.push(c.case_id+' should declare must_not_conclude');
}
if(has('--self-check')||!REPORT){
  const counts={}; for(const c of ds.cases) counts[c.expected_verdict]=(counts[c.expected_verdict]||0)+1;
  const out={mode:'self-check',result:issues.length?'FAIL':'PASS',cases_total:ds.cases.length,expected:counts,real_public:ds.cases.filter(c=>!c.synthetic_controlled).length,controlled:ds.cases.filter(c=>c.synthetic_controlled).length,issues};
  if(OUT)fs.writeFileSync(OUT,JSON.stringify(out,null,2)+'\n');
  console.log(JSON.stringify(out,null,2)); process.exit(issues.length?1:0);
}
const rep=JSON.parse(fs.readFileSync(REPORT,'utf8'));
const byId=new Map((rep.cases||[]).map(r=>[r.case_id,r]));
const rows=[]; let pass=0,fail=0,notRun=0; const fp=[],fn=[];
for(const c of ds.cases){
  const r=byId.get(c.case_id);
  if(!r){rows.push({case_id:c.case_id,expected:c.expected_verdict,status:'not_run'}); STRICT?fail++:notRun++; continue;}
  const v=r.verdict; const notes=[];
  let ok=(v===c.expected_verdict);
  // 误报：非矛盾类别却判 conflict
  if(c.expected_verdict!=='conflict'&&v==='conflict'){ok=false;notes.push('FALSE_POSITIVE_CONFLICT');fp.push(c.case_id);}
  // 漏报：真矛盾却未判 conflict
  if(c.expected_verdict==='conflict'&&v!=='conflict'){ok=false;notes.push('FALSE_NEGATIVE_CONFLICT');fn.push(c.case_id);}
  // 疑似矛盾必须双侧证据
  if(v==='conflict'){
    const withEv=(r.sides||[]).filter(s=>s.block_id&&s.quote);
    if(withEv.length<2){ok=false;notes.push('CONFLICT_WITHOUT_DUAL_EVIDENCE');}
  }
  // 不得强行换算：computed 中未声明来源的汇率/税率
  for(const cmp of (c.must_not_compute||[])){
    const hit=(r.computed||[]).find(x=>x.name===cmp&&!x.used_source);
    if(hit){ok=false;notes.push('FORCED_COMPUTATION:'+cmp);}
  }
  if(c.must_not_conclude==='conflict'&&v==='conflict'){ok=false;notes.push('CONCLUDED_CONFLICT_FORBIDDEN');}
  rows.push({case_id:c.case_id,category:c.category,expected:c.expected_verdict,reported:v,synthetic_controlled:!!c.synthetic_controlled,status:ok?'pass':'fail',notes});
  ok?pass++:fail++;
}
const out={mode:'score',result:(fail===0&&(!STRICT||notRun===0))?'PASS':'FAIL',cases_total:ds.cases.length,scored:rows.length-notRun,pass,fail,not_run:notRun,
 false_positive_conflict:fp.length,false_negative_conflict:fn.length,false_positive_ids:fp,false_negative_ids:fn,
 by_category:Object.fromEntries([...new Set(rows.map(r=>r.category))].map(k=>[k,{total:rows.filter(r=>r.category===k).length,pass:rows.filter(r=>r.category===k&&r.status==='pass').length}])),
 rows};
if(OUT)fs.writeFileSync(OUT,JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({result:out.result,cases_total:out.cases_total,pass:out.pass,fail:out.fail,not_run:out.not_run,false_positive_conflict:out.false_positive_conflict,false_negative_conflict:out.false_negative_conflict},null,2));
process.exit(out.result==='PASS'?0:1);
