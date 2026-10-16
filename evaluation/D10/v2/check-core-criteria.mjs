#!/usr/bin/env node
// check-core-criteria.mjs —— D10 核心判据 v2 校验器（评测侧 · 2026-10-16 · 裁定 C-1 的落地件）
//
// 为何有 v2：旧判据名 `web_cli_same_result` 证的是「同源幂等」，被读成「Web/CLI 独立一致」。
//   裁定：**改名为 `same_source_same_result` 并移出核心判据**；**冻结旧件一个字节不动**，
//   新校验器把旧名当 deprecated 别名（接受但告警），新 bundle 必须用新名。
//
// 用法：
//   node evaluation/D10/v2/check-core-criteria.mjs --bundle <bundle.json> [--strict] [--json out.json]
//   node evaluation/D10/v2/check-core-criteria.mjs --self-test
"use strict";
import fs from "node:fs";
const argv=process.argv.slice(2); const arg=(k,d)=>{const i=argv.indexOf(k);return i>=0?argv[i+1]:d;}; const has=k=>argv.includes(k);
const RULES=JSON.parse(fs.readFileSync(new URL("./core-criteria-v2.json", import.meta.url), "utf8"));
const LEGACY=RULES.rename.from, MODERN=RULES.rename.to;

export function evaluate(bundle){
  const rows=[]; const issues=[]; const warnings=[];
  const cases=(bundle && (bundle.cases||bundle.results||bundle.records_list||bundle.items))||[];
  if(!cases.length) issues.push({rule:"NO_CASES",detail:"bundle 里没有 cases/records_list/items"});
  for(const c of cases){
    const id=c.case_id||c.id||"?";
    for(const f of RULES.core_fields_per_case){
      const k=f.split("{")[0].replace("[]","").trim();
      const cands=[c,(Array.isArray(c.records)&&c.records[0]&&typeof c.records[0]==="object")?c.records[0]:null].filter(x=>x&&typeof x==="object");
      if(!cands.some(x=>k in x)) issues.push({rule:"CORE_MISSING",case:id,detail:k});
    }
    const ct=c.cache_tests||c.cache||null;
    if(ct){
      for(const t of RULES.cache_tests_v2){
        if(t===MODERN){
          if(ct[MODERN]!==undefined) rows.push({case:id,key:MODERN,value:ct[MODERN],name_status:"ok"});
          else if(ct[LEGACY]!==undefined){ rows.push({case:id,key:LEGACY,value:ct[LEGACY],name_status:"deprecated_alias"}); warnings.push({rule:"DEPRECATED_KEY",case:id,detail:`用了旧名 ${LEGACY}，新 bundle 必须写 ${MODERN}`}); }
          else issues.push({rule:"CACHE_TEST_MISSING",case:id,detail:MODERN});
        } else if(ct[t]!==true) issues.push({rule:"CACHE_TEST_FAIL",case:id,detail:t});
      }
    }
    // 未测项必须显式标，不得静默通过
    const nc=(c.not_covered||{});
    for(const n of RULES.not_covered){
      const marked = nc[n.key]===true || (Array.isArray(nc)&&nc.includes(n.key)) || c[n.key]==="not_covered";
      if(!marked) warnings.push({rule:"NOT_COVERED_UNMARKED",case:id,detail:`${n.key} 未显式标未测（不得用 ${MODERN} 顶替）`});
    }
  }
  return {result:issues.length?"FAIL":"PASS", cases:cases.length, issues, warnings, rows,
    not_covered_declared:RULES.not_covered.map(x=>x.key)};
}
if(has("--self-test")){
  const good={cases:[{case_id:"ok",input_sha256:["x"],run_id:"r",code_version:"c",schema_version:"0.3",records:[1],diff_list:[],report:{events:1,diffs:1,attribution:1,boundaries:1},
    cache_tests:{replay_business_fields_identical:true,cold_cache_new_call_log:true,same_source_same_result:true},not_covered:{web_cli_independent:true}}]};
  const deprecated={cases:[{case_id:"dep",input_sha256:["x"],run_id:"r",code_version:"c",schema_version:"0.3",records:[1],diff_list:[],report:{events:1,diffs:1,attribution:1,boundaries:1},
    cache_tests:{replay_business_fields_identical:true,cold_cache_new_call_log:true,web_cli_same_result:true}}]};
  const missingNotCovered={cases:[{case_id:"nc",input_sha256:["x"],run_id:"r",code_version:"c",schema_version:"0.3",records:[1],diff_list:[],report:{events:1,diffs:1,attribution:1,boundaries:1},
    cache_tests:{replay_business_fields_identical:true,cold_cache_new_call_log:true,same_source_same_result:true}}]};
  const broken={cases:[{case_id:"bad",input_sha256:["x"],run_id:"r",code_version:"c",schema_version:"0.3",records:[1],diff_list:[],report:{events:1,diffs:1,attribution:1,boundaries:1},
    cache_tests:{replay_business_fields_identical:false,cold_cache_new_call_log:true,same_source_same_result:true}}]};
  const g=evaluate(good), d=evaluate(deprecated), n=evaluate(missingNotCovered), b=evaluate(broken);
  const ok = g.result==="PASS" && g.warnings.length===0
    && d.result==="PASS" && d.warnings.some(w=>w.rule==="DEPRECATED_KEY")
    && n.warnings.some(w=>w.rule==="NOT_COVERED_UNMARKED")
    && b.result==="FAIL" && b.issues.some(i=>i.rule==="CACHE_TEST_FAIL");
  console.log(JSON.stringify({self_test:ok?"PASS":"FAIL",
    clean_must_pass:g.result==="PASS"&&g.warnings.length===0,
    deprecated_alias_warns:d.warnings.some(w=>w.rule==="DEPRECATED_KEY"),
    not_covered_must_be_marked:n.warnings.some(w=>w.rule==="NOT_COVERED_UNMARKED"),
    cache_fail_must_fail:b.result==="FAIL"},null,2));
  process.exit(ok?0:1);
}
const B=arg("--bundle",null); if(!B){ console.error("用法: --bundle <bundle.json> | --self-test"); process.exit(2); }
const bundle=JSON.parse(fs.readFileSync(B,"utf8"));
const res=evaluate(bundle);
const OUTI=argv.indexOf("--json"); if(OUTI>=0) fs.writeFileSync(argv[OUTI+1],JSON.stringify(res,null,2)+"\n","utf8");
console.log(JSON.stringify(res,null,2));
if(has("--strict") && res.warnings.length) process.exit(1);
process.exit(res.issues.length?1:0);
