#!/usr/bin/env node
// check-relation.mjs —— D10 关系层预期对账门（评测侧 · G-1，2026-10-10 落地）
//
// 背景（我方盲区 G-1）：原有的 check-integration.mjs 只查**结构 + 缓存纪律**，
//   不查 relation 与预期是否一致 —— 实测**旧包与新包都能过**。2026-10-10 陈页面用的旧包
//   给 008 = unrelated，而权威包给 unknown，结构门完全没反应。
//   ⇒ 关系层必须单独做门，且预期必须来自**单一字段** `expected_relation`。
//
// 口径依据：魏 2026-10-10《D14-INT008判定口径-魏文宇.md》
//   原 `expected` 把归因层结论（explainable_difference）写进了 relation 层预期，
//   消费方按关键词映射就会得出错误的关系枚举。故用例已拆为
//   `expected_relation`（relation 层唯一真源）＋ `attribution_demo`（归因层展示）。
//
// 用法：
//   node evaluation/D10/check-relation.mjs --bundle <bundle.json>
//   node evaluation/D10/check-relation.mjs --self-test
// 退出码：有 MISMATCH/ERROR → 1。
"use strict";
import fs from "node:fs";
const argv=process.argv.slice(2); const arg=(k,d)=>{const i=argv.indexOf(k);return i>=0?argv[i+1]:d;}; const has=k=>argv.includes(k);
const CASES=arg("--cases","evaluation/D10/cases/integration-cases.json");
const BUNDLE=arg("--bundle",null); const OUT=arg("--json",null);

export function actualRelation(r){
  return (r && r.report && r.report.diffs && r.report.diffs.relation)
      ?? (r && r.relation) ?? null;
}
export function compare(cases,bundle){
  const rows=[];
  const byId=new Map(((bundle&&bundle.results)||[]).map(r=>[r.case_id,r]));
  for(const c of (cases.cases||[])){
    const exp=c.expected_relation;
    const r=byId.get(c.case_id);
    if(exp===undefined||exp===null){
      rows.push({case_id:c.case_id,expected:null,actual:r?actualRelation(r):null,status:"NO_EXPECTATION"});
      continue;
    }
    if(!r){ rows.push({case_id:c.case_id,expected:exp,actual:null,status:"NOT_RUN"}); continue; }
    const act=actualRelation(r);
    rows.push({case_id:c.case_id,expected:exp,actual:act,
      status: act===exp ? "MATCH" : (act===null ? "MISMATCH" : "MISMATCH")});
  }
  return rows;
}
// ---------------- 自检：正反两向 ----------------
if(has("--self-test")){
  const cases={cases:[
    {case_id:"T-1",expected_relation:"related"},
    {case_id:"T-2",expected_relation:"unrelated"},
    {case_id:"T-3",expected_relation:"unknown"},
    {case_id:"T-4",expected_relation:null}
  ]};
  const mk=(rel)=>Object.fromEntries(Object.entries(rel).map(([k,v])=>[k,{case_id:k,report:{diffs:{relation:v}}}]));
  const good={results:[...Object.values(mk({"T-1":"related","T-2":"unrelated","T-3":"unknown","T-4":"unknown"}))]};
  const bad ={results:[...Object.values(mk({"T-1":"related","T-2":"unrelated","T-3":"unrelated","T-4":"unknown"}))]};
  const a=compare(cases,good), b=compare(cases,bad);
  const aMis=a.filter(x=>x.status==="MISMATCH").length, bMis=b.filter(x=>x.status==="MISMATCH").length;
  const aNon=a.filter(x=>x.status==="NO_EXPECTATION").length;
  console.log(JSON.stringify({self_test:{positive:(aMis===0?"PASS":"FAIL"),positive_mismatch:aMis,negative:(bMis===1?"PASS":"FAIL"),negative_mismatch:bMis,no_expectation_surfaced:aNon}},null,2));
  for(const r of b) console.log(`  [${r.status}] ${r.case_id} expected=${r.expected} actual=${r.actual}`);
  process.exit((aMis===0&&bMis===1&&aNon===1)?0:1);
}
// ---------------- 主流程 ----------------
if(!BUNDLE){ console.error("需要 --bundle <bundle.json>（或 --self-test）"); process.exit(2); }
const cases=JSON.parse(fs.readFileSync(CASES,"utf8"));
const bundle=JSON.parse(fs.readFileSync(BUNDLE,"utf8"));
const rows=compare(cases,bundle);
const mis=rows.filter(r=>r.status==="MISMATCH").length;
const notRun=rows.filter(r=>r.status==="NOT_RUN").length;
const noExp=rows.filter(r=>r.status==="NO_EXPECTATION").length;
const out={checked_on:new Date().toISOString().slice(0,10),bundle:BUNDLE,cases:CASES,
  result:(mis||notRun)?"FAIL":"PASS",cases_total:rows.length,match:rows.filter(r=>r.status==="MATCH").length,mismatch:mis,not_run:notRun,no_expectation:noExp,rows};
if(OUT) fs.writeFileSync(OUT,JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify({result:out.result,cases_total:out.cases_total,match:out.match,mismatch:mis,not_run:notRun,no_expectation:noExp},null,2));
for(const r of rows) if(r.status!=="MATCH") console.log(`  [${r.status}] ${r.case_id} expected=${r.expected} actual=${r.actual}`);
process.exit((mis||notRun)?1:0);