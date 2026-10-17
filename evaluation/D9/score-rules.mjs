#!/usr/bin/env node
// D9 归因规则评分脚本（评测侧，宗）
// 用法:
//   node evaluation/D9/score-rules.mjs --self-check
//   node evaluation/D9/score-rules.mjs --report <attribution-report.json> [--json out] [--strict]
//   node evaluation/D9/score-rules.mjs --neg-test <attribution-report.json>   # 负例自证：伪造出处/错算必须 FAIL
//
// ★ 2026-10-17 修复（验收缺陷：对伪造出处、错误计算仍给 20/20）：
//   新增两条硬校验——
//     ③ QUOTE_NOT_IN_BLOCK / DANGLING_BLOCK_ID —— 引文必须**真的落在**所引 block 里（原始子串；空白归一仅辅助）
//     ④ COMPUTED_SUM_MISMATCH / COMPUTED_VS_AGGREGATE_MISMATCH —— 计算记录的 terms 求和必须等于 sum，且 sum 等于合计侧取值
//   并把评分逻辑抽成纯函数 score(rep)，用 --neg-test 现场构造"伪造引文/错算"两例，证明它们**必 FAIL**。
import fs from 'node:fs'; import path from 'node:path';
const argv=process.argv.slice(2); const arg=(k,d)=>{const i=argv.indexOf(k);return i>=0?argv[i+1]:d;}; const has=(k)=>argv.includes(k);
const CASES=arg('--cases','evaluation/D9/cases/rules-cases.dev.json');
const REPORT=arg('--report',null); const OUT=arg('--json',null); const STRICT=has('--strict');
const ENVD=arg('--envelope-dir','evaluation/D11/firsttest-envelopes');
const ds=JSON.parse(fs.readFileSync(CASES,'utf8'));
const FMT=new Set(ds.expectation_values);
const norm=s=>String(s==null?'':s).replace(/\s+/g,'');
const envCache=new Map();
function blocksOf(doc){
  if(envCache.has(doc)) return envCache.get(doc);
  const p=path.join(ENVD,doc+'.json'); let m=null;
  if(fs.existsSync(p)){
    try{ const e=JSON.parse(fs.readFileSync(p,'utf8'));
      m=new Map((((e.source||{}).parse_meta||{}).blocks||[]).map(b=>[b.block_id,String(b.text||b.text_raw||'')]));
    }catch{ m=null; }
  }
  envCache.set(doc,m); return m;
}
/** 引文是否能回锚到所引块：raw＝原文子串（严格）；ws＝空白归一后子串（辅助）；unresolvable＝无该文档信封 */
function anchor(doc,block_id,quote){
  const m=blocksOf(doc);
  if(!m) return 'unresolvable';
  const raw=m.get(block_id);
  if(raw===undefined) return 'dangling';
  const q=String(quote==null?'':quote);
  if(q!=='' && raw.includes(q)) return 'raw';
  if(q!=='' && norm(raw).includes(norm(q))) return 'ws';
  return 'miss';
}
function score(rep){
  const byId=new Map((rep.cases||[]).map(r=>[r.case_id,r]));
  const rows=[]; let pass=0,fail=0,notRun=0; const fp=[],fn=[]; let evChecked=0, evBad=0, cmpChecked=0, cmpBad=0;
  for(const c of ds.cases){
    const r=byId.get(c.case_id);
    if(!r){rows.push({case_id:c.case_id,expected:c.expected_verdict,status:'not_run'}); STRICT?fail++:notRun++; continue;}
    const v=r.verdict; const notes=[];
    let ok=(v===c.expected_verdict);
    if(v!=='insufficient'){
      const badSides=(r.sides||[]).filter(x=>!x.block_id||!x.quote);
      if(badSides.length){ok=false;notes.push('INVALID_EVIDENCE:'+badSides.length);}
    }
    if(c.requires_programmatic_sum){
      const cmp=(r.computed||[]).filter(x=>/sum|total|合计|勾稽/i.test(String(x.name||'')));
      if(cmp.length===0){ok=false;notes.push('MISSING_REQUIRED_COMPUTATION');}
    }
    // ③ 伪造出处：引文必须真的落在所引块
    for(const s of (r.sides||[])){
      if(!s.block_id||!s.quote) continue;
      evChecked++;
      const st=anchor(s.case_id,s.block_id,s.quote);
      if(st==='miss'){evBad++;ok=false;notes.push('QUOTE_NOT_IN_BLOCK:'+s.case_id+'/'+s.block_id);}
      else if(st==='dangling'){evBad++;ok=false;notes.push('DANGLING_BLOCK_ID:'+s.case_id+'/'+s.block_id);}
      else if(st==='unresolvable'){
        if(c.synthetic_controlled) notes.push('SYNTHETIC_EVIDENCE_UNVERIFIABLE:'+s.case_id);
        else {evBad++;ok=false;notes.push('UNRESOLVABLE_DOC:'+s.case_id);}
      }
    }
    // ④ 错误计算：terms 求和＝sum；sum＝合计侧取值；term 引文也要可回锚
    for(const cm of (r.computed||[])){
      if(Array.isArray(cm.terms)&&cm.terms.length){
        cmpChecked++;
        const s2=cm.terms.reduce((a,t)=>a+Number(t.value||0),0);
        if(Number.isFinite(Number(cm.sum))&&s2!==Number(cm.sum)){cmpBad++;ok=false;notes.push('COMPUTED_SUM_MISMATCH:'+(cm.name||'?')+' '+s2+'≠'+cm.sum);}
        if(cm.aggregate_side&&Number.isFinite(Number(cm.aggregate_side.value))&&Number.isFinite(Number(cm.sum))&&Number(cm.sum)!==Number(cm.aggregate_side.value)){cmpBad++;ok=false;notes.push('COMPUTED_VS_AGGREGATE_MISMATCH:'+(cm.name||'?'));}
        for(const t of cm.terms){
          if(t.block_id&&t.quote){ const st=anchor(t.doc,t.block_id,t.quote);
            if(st==='miss'||st==='dangling'){cmpBad++;ok=false;notes.push('COMPUTED_TERM_QUOTE_BAD:'+(t.entity||'?')+'/'+t.block_id);} }
        }
      }
    }
    if(c.expected_verdict!=='conflict'&&v==='conflict'){ok=false;notes.push('FALSE_POSITIVE_CONFLICT');fp.push(c.case_id);}
    if(c.expected_verdict==='conflict'&&v!=='conflict'){ok=false;notes.push('FALSE_NEGATIVE_CONFLICT');fn.push(c.case_id);}
    if(v==='conflict'){
      const withEv=(r.sides||[]).filter(s=>s.block_id&&s.quote);
      if(withEv.length<2){ok=false;notes.push('CONFLICT_WITHOUT_DUAL_EVIDENCE');}
    }
    for(const cmp of (c.must_not_compute||[])){
      const hit=(r.computed||[]).find(x=>x.name===cmp&&!x.used_source);
      if(hit){ok=false;notes.push('FORCED_COMPUTATION:'+cmp);}
    }
    if(c.must_not_conclude==='conflict'&&v==='conflict'){ok=false;notes.push('CONCLUDED_CONFLICT_FORBIDDEN');}
    rows.push({case_id:c.case_id,category:c.category,expected:c.expected_verdict,reported:v,synthetic_controlled:!!c.synthetic_controlled,status:ok?'pass':'fail',notes});
    ok?pass++:fail++;
  }
  return {rows,pass,fail,notRun,fp,fn,evChecked,evBad,cmpChecked,cmpBad};
}
function buildOut(res){
  const rows=res.rows;
  return {mode:'score',result:(res.fail===0&&(!STRICT||res.notRun===0))?'PASS':'FAIL',cases_total:ds.cases.length,scored:rows.length-res.notRun,pass:res.pass,fail:res.fail,not_run:res.notRun,
    false_positive_conflict:res.fp.length,false_negative_conflict:res.fn.length,false_positive_ids:res.fp,false_negative_ids:res.fn,
    evidence_check:{anchors_checked:res.evChecked,anchors_bad:res.evBad,rule:'quote 必须落在所引 block（raw 子串；空白归一只作辅助）'},
    computation_check:{records_checked:res.cmpChecked,records_bad:res.cmpBad,rule:'Σterms.value 必须＝sum，且 sum＝aggregate_side.value'},
    by_category:Object.fromEntries([...new Set(rows.map(r=>r.category))].map(k=>[k,{total:rows.filter(r=>r.category===k).length,pass:rows.filter(r=>r.category===k&&r.status==='pass').length}])),
    rows};
}
// ---- 用例集自身的结构自检 ----
function caseSetIssues(){
  const issues=[];
  for(const c of ds.cases){
    if(!FMT.has(c.expected_verdict)) issues.push(c.case_id+' bad expected_verdict');
    if(!Array.isArray(c.sides)) issues.push(c.case_id+' sides');
    const real=c.sides.filter(s=>!c.synthetic_controlled);
    if(c.expected_verdict==='conflict'&&!c.synthetic_controlled&&real.length<2) issues.push(c.case_id+' conflict needs 2 real sides');
  }
  return issues;
}
if(has('--neg-test')){
  const B=arg('--neg-test',null);
  if(!B||!fs.existsSync(B)){ console.error('用法: --neg-test <report.json>'); process.exit(2); }
  const base=JSON.parse(fs.readFileSync(B,'utf8'));
  const fakeQuote=JSON.parse(JSON.stringify(base));
  const t0=fakeQuote.cases.find(c=>c.case_id==='D9-RULE-005');
  t0.sides[0].quote='【评测负例】原文里根本没有这一段 1234567890';
  const badSum=JSON.parse(JSON.stringify(base));
  const t1=badSum.cases.find(c=>c.case_id==='D9-RULE-005');
  t1.computed[0].sum=Number(t1.computed[0].sum)+1;
  const rB=score(base), rQ=score(fakeQuote), rS=score(badSum);
  const res={
    clean_must_pass: rB.fail===0,
    fabricated_quote_must_fail: rQ.fail>0 && rQ.rows.find(x=>x.case_id==='D9-RULE-005'&&x.status==='fail'),
    wrong_sum_must_fail: rS.fail>0 && rS.rows.find(x=>x.case_id==='D9-RULE-005'&&x.status==='fail'),
    detail:{
      clean:{pass:rB.pass,fail:rB.fail,anchors:rB.evChecked,bad_anchors:rB.evBad,computations:rB.cmpChecked,bad_computations:rB.cmpBad},
      fabricated_quote_notes:(rQ.rows.find(x=>x.case_id==='D9-RULE-005')||{}).notes,
      wrong_sum_notes:(rS.rows.find(x=>x.case_id==='D9-RULE-005')||{}).notes
    }
  };
  const ok=res.clean_must_pass&&res.fabricated_quote_must_fail&&res.wrong_sum_must_fail;
  console.log(JSON.stringify({neg_test:ok?'PASS':'FAIL',...res},null,2));
  process.exit(ok?0:1);
}
if(has('--self-check')||!REPORT){
  const issues=caseSetIssues();
  const counts={}; for(const c of ds.cases) counts[c.expected_verdict]=(counts[c.expected_verdict]||0)+1;
  const out={mode:'self-check',result:issues.length?'FAIL':'PASS',cases_total:ds.cases.length,expected:counts,
    real_public:ds.cases.filter(c=>!c.synthetic_controlled).length,controlled:ds.cases.filter(c=>c.synthetic_controlled).length,
    hardening:['QUOTE_NOT_IN_BLOCK','DANGLING_BLOCK_ID','COMPUTED_SUM_MISMATCH','COMPUTED_VS_AGGREGATE_MISMATCH'],issues};
  if(OUT)fs.writeFileSync(OUT,JSON.stringify(out,null,2)+'\n');
  console.log(JSON.stringify(out,null,2)); process.exit(issues.length?1:0);
}
const rep=JSON.parse(fs.readFileSync(REPORT,'utf8'));
const out=buildOut(score(rep));
if(OUT)fs.writeFileSync(OUT,JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({result:out.result,cases_total:out.cases_total,pass:out.pass,fail:out.fail,not_run:out.not_run,
  false_positive_conflict:out.false_positive_conflict,false_negative_conflict:out.false_negative_conflict,
  evidence_check:out.evidence_check,computation_check:out.computation_check},null,2));
process.exit(out.result==='PASS'?0:1);