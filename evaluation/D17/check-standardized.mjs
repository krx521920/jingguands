#!/usr/bin/env node
// check-standardized.mjs —— 标准化判据门（评测侧 · D17，2026-10-10 裁定配套）
//
// 裁定要点（详见 evaluation/D17/裁定-standardized判据-20261010.md）：
//   ① 只有**有值**字段参与标准化统计（弃权/空值字段没有值可标准化）；
//   ② `unit: text` 字段的 standardized 键**无契约含义**（D13-C2 已裁），不入分母、不上屏；
//   ③ 主口径 = 标准化覆盖率 ＝ standardized=true 的**非 text 有值字段** / 非 text 有值字段；
//   ④ 有值字段**必须**带布尔 standardized；缺键＝缺陷；
//   ⑤ 弃权字段**不得**标 standardized=true（语义错误，消费者会误读）。
//
// 用法：
//   node evaluation/D17/check-standardized.mjs --dir evaluation/D11/firsttest-envelopes --exclude DEMO-EQC-HL-0930.json
//   node evaluation/D17/check-standardized.mjs --self-test
// 退出码：违反 ④⑤ 或读不到输入 → 1。
"use strict";
import fs from "node:fs"; import path from "node:path";
const argv=process.argv.slice(2); const arg=(k,d)=>{const i=argv.indexOf(k);return i>=0?argv[i+1]:d;}; const has=k=>argv.includes(k);
const DIR=arg("--dir",null); const EXC=arg("--exclude",null); const OUT=arg("--json",null);

export function scan(files){
  const r={files:files.length,fields:0,valued:0,abstain:0,
    nontext_valued:0,nontext_true:0,text_valued:0,text_true:0,text_false:0,
    valued_true:0,valued_false:0,abstain_true:[],
    missing_bool_on_valued:[]};
  for(const {name,j} of files){
    for(const ev of j.events||[]) for(const [fname,v] of Object.entries(ev.fields||{})){
      r.fields++;
      const hasVal=(v.value!==null&&v.value!==undefined&&v.value!=="");
      const isBool=typeof v.standardized==="boolean";
      const isText=v.unit==="text";
      if(hasVal){
        r.valued++;
        if(!isBool) r.missing_bool_on_valued.push(`${name}#${ev.event_id||"?"}.${fname}`);
        else { v.standardized? r.valued_true++ : r.valued_false++; }
        if(isText){ r.text_valued++; v.standardized===true? r.text_true++ : r.text_false++; }
        else { r.nontext_valued++; if(v.standardized===true) r.nontext_true++; }
      }else{
        r.abstain++;
        if(v.standardized===true) r.abstain_true.push(`${name}#${ev.event_id||"?"}.${fname}(${v.status||"?"})`);
      }
    }
  }
  r.coverage_main_pct = r.nontext_valued? +(100*r.nontext_true/r.nontext_valued).toFixed(2) : null;
  r.coverage_aux_pct  = r.valued? +(100*r.valued_true/r.valued).toFixed(2) : null;
  r.annot_complete_pct= r.valued? +(100*(r.valued-r.missing_bool_on_valued.length)/r.valued).toFixed(2) : null;
  return r;
}
function load(dir,exc){
  return fs.readdirSync(dir).filter(f=>f.endsWith(".json")&&f!==exc).sort()
    .map(f=>({name:f,j:JSON.parse(fs.readFileSync(path.join(dir,f),"utf8"))}));
}
if(has("--self-test")){
  const mk=(fields)=>({name:"t.json",j:{events:[{event_id:"E01",fields}]}});
  const good=scan([mk({
    a:{value:1,unit:"shares",standardized:true,status:"extracted"},
    b:{value:"x",unit:"text",standardized:true,status:"extracted"},
    c:{value:null,unit:"shares",standardized:false,status:"not_mentioned"}
  })]);
  const bad=scan([mk({
    d:{value:2,unit:"shares",status:"extracted"},              // 缺布尔 → 应报
    e:{value:null,unit:"cny",standardized:true,status:"not_applicable"} // 弃权 true → 应报
  })]);
  const okGood=good.missing_bool_on_valued.length===0&&good.abstain_true.length===0&&good.coverage_main_pct===100;
  const okBad =bad.missing_bool_on_valued.length===1&&bad.abstain_true.length===1;
  console.log(JSON.stringify({self_test:{positive:okGood?"PASS":"FAIL",negative:okBad?"PASS":"FAIL",good,bad}},null,2));
  process.exit((okGood&&okBad)?0:1);
}
if(!DIR){ console.error("需要 --dir <envelopes 目录>（或 --self-test）"); process.exit(2); }
const r=scan(load(DIR,EXC));
const violations=r.missing_bool_on_valued.length+r.abstain_true.length;
const out={checked_on:new Date().toISOString().slice(0,10),dir:DIR,excluded:EXC,result:violations?"FAIL":"PASS",violations,...r};
if(OUT) fs.writeFileSync(OUT,JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify({result:out.result,violations,files:r.files,fields:r.fields,valued:r.valued,
  nontext_valued:r.nontext_valued,nontext_true:r.nontext_true,coverage_main_pct:r.coverage_main_pct,
  coverage_aux_pct:r.coverage_aux_pct,annot_complete_pct:r.annot_complete_pct,
  text_valued:r.text_valued,abstain:r.abstain},null,2));
if(r.missing_bool_on_valued.length) console.log("  有值缺布尔:",r.missing_bool_on_valued.slice(0,5).join(", "));
if(r.abstain_true.length) console.log("  弃权却标 true:",r.abstain_true.slice(0,5).join(", "));
process.exit(violations?1:0);