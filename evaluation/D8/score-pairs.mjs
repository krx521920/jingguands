#!/usr/bin/env node
// D8 跨文档配对评分脚本（评测侧，宗）
// 用法：
//   node evaluation/D8/score-pairs.mjs --self-check
//   node evaluation/D8/score-pairs.mjs --report <b-report.json> [--json <out.json>] [--strict]
//
// 输入：
//   --pairs  配对清单（默认 evaluation/D8/pairs/pairs.dev30.json）
//   --report B 流程输出（魏 scripts/jingguan/verify_crossdoc.mjs 的 report）
// 判定：
//   related       期望 predicted_relation === 'related'
//   unrelated     期望 predicted_relation === 'unrelated' 且 0 条 conflict（不同事件不得进入数值矛盾比较）
//   insufficient  期望 predicted_relation === 'unknown'，或 reasons 含 'INSUFFICIENT_SIGNALS'（证据不足不得强行下结论）
//   version_traceability 每个成员须有 a_run_links（a_run_id + code_version + is_mock），可追双侧版本
import fs from 'node:fs'; import path from 'node:path';
const argv=process.argv.slice(2);
const arg=(k,d)=>{const i=argv.indexOf(k); return i>=0?argv[i+1]:d;};
const has=(k)=>argv.includes(k);
const PAIRS=arg('--pairs','evaluation/D8/pairs/pairs.dev30.json');
const REPORT=arg('--report',null);
const OUT=arg('--json',null);
const STRICT=has('--strict');
const pairs=JSON.parse(fs.readFileSync(PAIRS,'utf8'));
const key=(ms)=>[...ms].sort().join('|');
const manifestGroups=pairs.groups||[];
// --- self-check ---
const issues=[];
const seen=new Set();
if(manifestGroups.length!==pairs.total) issues.push('total mismatch');
for(const gp of manifestGroups){
  if(!Array.isArray(gp.members)||gp.members.length<2) issues.push(gp.group_id+' member count');
  if(!['related','unrelated','insufficient'].includes(gp.expected_relation)) issues.push(gp.group_id+' bad expected_relation');
  const k=key(gp.members); if(seen.has(k)) issues.push(gp.group_id+' duplicate pair '+k); seen.add(k);
  for(const h of (gp.member_hashes||[])) if(!h.raw_sha256) issues.push(gp.group_id+' missing raw hash '+h.case_id);
}
if(has('--self-check')||!REPORT){
  const byRel={related:0,unrelated:0,insufficient:0}; for(const gp of manifestGroups) byRel[gp.expected_relation]++;
  const out={mode:'self-check',result:issues.length?'FAIL':'PASS',pairs_total:manifestGroups.length,...byRel,issues};
  if(OUT) fs.writeFileSync(OUT,JSON.stringify(out,null,2)+'\n','utf8');
  console.log(JSON.stringify(out,null,2));
  process.exit(issues.length?1:0);
}
// --- score against B report ---
const report=JSON.parse(fs.readFileSync(REPORT,'utf8'));
const results=report.results||[];
const byKey=new Map(results.map(r=>[key(r.members||[]),r]));
const rows=[]; let pass=0,fail=0,notRun=0;
for(const gp of manifestGroups){
  const r=byKey.get(key(gp.members));
  if(!r){ rows.push({group_id:gp.group_id,members:gp.members,expected:gp.expected_relation,status:'not_run',pass:STRICT?false:null}); if(STRICT)fail++; else notRun++; continue; }
  const pred=r.predicted_relation;
  const reasons=r.reasons||[];
  const conflicts=(r.consistency&&r.consistency.conflicts)||[];
  const links=r.a_run_links||[];
  const linkOk=gp.members.every(m=>links.some(l=>l.case_id===m&&l.a_run_id&&l.code_version&&l.is_mock===false));
  let ok=false,why='';
  if(gp.expected_relation==='related'){ ok=pred==='related'; why=ok?'predicted related':'predicted '+pred; }
  else if(gp.expected_relation==='unrelated'){ ok=(pred==='unrelated')&&conflicts.length===0; why=ok?'unrelated & 0 conflict':('predicted '+pred+', conflicts '+conflicts.length); }
  else { ok=(pred==='unknown')||reasons.includes('INSUFFICIENT_SIGNALS'); why=ok?'insufficient signalled':('predicted '+pred+', reasons '+JSON.stringify(reasons)); }
  if(ok&&!linkOk){ ok=false; why+=' | version traceability missing'; }
  rows.push({group_id:gp.group_id,members:gp.members,expected:gp.expected_relation,predicted:pred,reasons,conflicts:conflicts.length,version_traceable:linkOk,status:ok?'pass':'fail',detail:why});
  ok?pass++:fail++;
}
const sum=(rel)=>rows.filter(r=>r.expected===rel);
const out={
  mode:'score',result:(fail===0&&(!STRICT||notRun===0))?'PASS':'FAIL',
  pairs_total:manifestGroups.length,scored:rows.length-notRun,pass,fail,not_run:notRun,
  same_event:{total:sum('related').length,hit:sum('related').filter(r=>r.status==='pass').length},
  different_event:{total:sum('unrelated').length,clean:sum('unrelated').filter(r=>r.status==='pass').length},
  insufficient:{total:sum('insufficient').length,ok:sum('insufficient').filter(r=>r.status==='pass').length},
  report_provenance:report.b_run||null,
  rows
};
if(OUT) fs.writeFileSync(OUT,JSON.stringify(out,null,2)+'\n','utf8');
console.log(JSON.stringify({result:out.result,pairs_total:out.pairs_total,pass:out.pass,fail:out.fail,not_run:out.not_run,same_event:out.same_event,different_event:out.different_event,insufficient:out.insufficient},null,2));
process.exit(out.result==='PASS'?0:1);
