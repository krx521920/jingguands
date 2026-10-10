#!/usr/bin/env node
// check-metrics-caliber.mjs —— 页面指标口径一致性门（评测侧 · D15）
//
// 背景（2026-10-10 深度审计查出）：同一屏出现**同名指标三套数**——
//   卡片「字段抽取率」72.11%（437/606，覆盖率口径）却挂着准确率目标 90；
//   注册表另有 field_accuracy=100%（437/437）与 field_coverage=72.52%（446/615）；
//   卡片「标准化率」71.62% vs 注册表 standardized_rate 99.1%；
//   卡片「出处命中率」39/39（1 份文档）vs 注册表 evidence_hit 241/241（10 份）。
// 这类问题不靠人记，靠门：读 /api/metrics 与 /api/metrics/registry，按**概念**配对后逐条对账。
//
// 用法：
//   node evaluation/D15/check-metrics-caliber.mjs --base http://127.0.0.1:8642
//   node evaluation/D15/check-metrics-caliber.mjs --self-test        # 两个方向都验（正向 PASS / 反向 FAIL）
// 退出码：FAIL = 1。
"use strict";
import fs from "node:fs";
const argv=process.argv.slice(2); const arg=(k,d)=>{const i=argv.indexOf(k);return i>=0?argv[i+1]:d;};
const has=k=>argv.includes(k);
const BASE=arg("--base","http://127.0.0.1:8642");
const OUT=arg("--json",null);
const MANIFEST=arg("--manifest","evaluation/D15/metrics-caliber-manifest.json");
const man=JSON.parse(fs.readFileSync(MANIFEST,"utf8"));

/** 从文本里抠「分子/分母」：支持 "分子 437 / 分母 606"、"39/39" */
function pickFrac(text){
  if(!text) return null;
  let m=/分子\s*([0-9]+)\s*\/\s*分母\s*([0-9]+)/.exec(text);
  if(m) return {num:+m[1],den:+m[2],how:"分子X分母Y"};
  m=/([0-9]+)\s*\/\s*([0-9]+)/.exec(text);
  if(m) return {num:+m[1],den:+m[2],how:"A/B"};
  return null;
}

/** 纯函数：给齐三份输入即可判——便于自检，不依赖 HTTP */
export function evaluate(cards, registry, disciplineText){
  const rows=[];
  const all=(registry.metrics||[]).concat(registry.not_covered||[]);
  for(const c of man.concepts){
    const cardList=cards.filter(x=>c.card_keys.includes(x.key));
    const regList=all.filter(x=>c.registry_keys.includes(x.key));
    // R1 目标错配：概念未声明可对标目标，卡片却挂了目标
    if(c.target===null){
      for(const card of cardList){
        if(card.target!==null&&card.target!==undefined){
          rows.push({rule:"R1_TARGET_MISMATCH",concept:c.label,status:"FAIL",
            detail:`卡片「${card.name}」挂着目标 ${card.target}${card.unit}，但本概念未声明可对标目标（准确率类目标不得用在覆盖/出处口径上）`,why:c.why});
        }
      }
    }
    for(const card of cardList) for(const r of regList){
      // R2 同名两个值
      if(typeof card.value==="number"&&typeof r.value==="number"&&card.value!==r.value){
        if(c.allow_value_difference!==true){
          rows.push({rule:"R2_SAME_NAME_TWO_VALUES",concept:c.label,status:"FAIL",
            detail:`同名同屏两个值：卡片 ${card.value}% vs 注册表 ${r.value}%，且本概念未声明允许差异`,why:c.why});
        }else{
          const need=(c.require_warning_text||[]);
          const hay=[card.caliber,card.coverage_note,disciplineText].filter(Boolean).join(" ");
          const missing=need.filter(t=>!hay.includes(t));
          rows.push({rule:"R2_SAME_NAME_TWO_VALUES",concept:c.label,status:missing.length?"FAIL":"PASS",
            detail:missing.length
              ? `同名两个值（${card.value}% vs ${r.value}%）缺声明文本 ${JSON.stringify(missing)}`
              : `同名两个值（${card.value}% vs ${r.value}%）已带声明文本 ${JSON.stringify(need)}`,why:c.why});
        }
      }
      // R3 分母/分子必须一致
      if(r.den===null||r.den===undefined) continue;
      const frac=pickFrac(card.caliber)||pickFrac(card.coverage_note);
      if(!frac){
        rows.push({rule:"R3_NO_DENOMINATOR",concept:c.label,status:"FAIL",
          detail:`卡片「${card.name}」口径文本里读不到「分子/分母」`,why:c.why}); continue;
      }
      if(frac.den!==r.den){
        rows.push({rule:"R3_DENOMINATOR_DIFFERS",concept:c.label,status:"FAIL",
          detail:`卡片分母 ${frac.den}（${frac.how}）≠ 注册表分母 ${r.den}；同名指标两个分母`,why:c.why});
      }else if(frac.num!==r.num){
        rows.push({rule:"R3_NUMERATOR_DIFFERS",concept:c.label,status:"FAIL",
          detail:`分母一致但分子不同：卡片 ${frac.num} vs 注册表 ${r.num}`,why:c.why});
      }else{
        rows.push({rule:"R3_OK",concept:c.label,status:"PASS",detail:`分子/分母一致：${frac.num}/${frac.den}`,why:c.why});
      }
    }
  }
  return rows;
}

// ---------------- 自检：两个方向都验 ----------------
if(has("--self-test")){
  const okCards=[
    {key:"extracted_pct",name:"字段抽取覆盖率",value:72.11,unit:"%",target:null,caliber:"（分子 437 / 分母 606）",coverage_note:null},
    {key:"standardized_pct",name:"标准化率",value:99.1,unit:"%",target:null,caliber:"（分子 442 / 分母 446）；★ 判据未统一",coverage_note:"★ 判定标准未统一，与首测数不可比"},
    {key:"provenance_hit",name:"出处原文命中率",value:100,unit:"%",target:95,caliber:"（分子 241 / 分母 241）",coverage_note:"覆盖 10/41 份文档"}
  ];
  const okReg={metrics:[
    {key:"field_coverage",value:72.11,num:437,den:606},
    {key:"standardized_rate",value:99.1,num:442,den:446},
    {key:"evidence_hit",value:100,num:241,den:241}
  ],not_covered:[]};
  const badCards=[
    {key:"extracted_pct",name:"字段抽取率",value:72.11,unit:"%",target:90,caliber:"（分子 437 / 分母 606）",coverage_note:null},
    {key:"standardized_pct",name:"标准化率",value:71.62,unit:"%",target:98,caliber:"（分子 434 / 分母 606）",coverage_note:null},
    {key:"provenance_hit",name:"出处命中率",value:100,unit:"%",target:95,caliber:"L3 原文命中：39/39",coverage_note:"仅 1 份解析快照"}
  ];
  const badReg={metrics:okReg.metrics,not_covered:[]};
  const a=evaluate(okCards,okReg,"");
  const b=evaluate(badCards,badReg,"");
  const aFail=a.filter(x=>x.status==="FAIL").length, bFail=b.filter(x=>x.status==="FAIL").length;
  console.log(JSON.stringify({self_test:{positive:aFail===0?"PASS":"FAIL",positive_fail:aFail,negative:bFail>0?"PASS":"FAIL",negative_fail:bFail}},null,2));
  for(const r of b) console.log(`  [${r.status}] ${r.rule} · ${r.concept} — ${r.detail}`);
  process.exit((aFail===0&&bFail>0)?0:1);
}

// ---------------- 主流程：打真接口 ----------------
const j=async p=>{const r=await fetch(BASE+p); if(!r.ok) throw new Error(p+" -> "+r.status); return r.json();};
let rows=[];
try{
  const metrics=await j("/api/metrics");
  const reg=await j("/api/metrics/registry");
  const disciplineText=[].concat(reg.discipline||[],[].concat((metrics.data_source&&metrics.data_source.discipline)||[])).join(" ");
  rows=evaluate(metrics.cards||[], reg, disciplineText);
}catch(e){ rows=[{rule:"RUN_ERROR",concept:"-",status:"ERROR",detail:e.message}]; }
const fail=rows.filter(r=>r.status==="FAIL").length, error=rows.filter(r=>r.status==="ERROR").length;
const out={checked_on:new Date().toISOString().slice(0,10),base:BASE,result:(fail||error)?"FAIL":"PASS",fail,error,rows};
if(OUT) fs.writeFileSync(OUT,JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify({result:out.result,fail,error,rows:rows.length},null,2));
for(const r of rows) console.log(`  [${r.status}] ${r.rule} · ${r.concept} — ${r.detail}`);
process.exit((fail||error)?1:0);