#!/usr/bin/env node
// check-strict-fields.mjs —— 严格字段/出处评分器（评测侧 · 2026-10-14 · 两天冲刺 R1）
//
// 存在理由：两天冲刺 R1 关闭条件要求——
//   **虚构块 / 错引文 / 错计算 必须 FAIL**。旧口径只把 miss 记数不判违规，
//   等于「错引文也能满分」。本脚本把三类都升级为**硬违规**，并自带负例自检
//   （证明它不是"永远 PASS"的假评分器）。
//
// 三类硬违规：
//   ① FABRICATED_BLOCK   —— provenance.block_id 不在**该信封自己**的 blocks 里（拿别的文档凑数 / 凭空造块）
//   ② WRONG_QUOTE_RAW    —— quote 不是 block.text 的**原文子串**（张 10-13 裁决：quote_in_block_raw 是可回锚判定字段；
//                           空白归一后能命中只作辅助口径，单列不计入严格分子）
//   ③ ARITHMETIC_MISMATCH —— 明示算术关系不成立：EQC change_shares ≠ |after-before|；
//                           PLD 累计质押 < 本次质押；日期 start > end
// 另有既有两条：有值无出处 / 标注 unreadable 却给了值。
//
// 用法：
//   node evaluation/2026-10-14-sprint/R1-评分器加固/check-strict-fields.mjs --dir evaluation/D11/firsttest-envelopes --exclude DEMO-EQC-HL-0930.json
//   node evaluation/2026-10-14-sprint/R1-评分器加固/check-strict-fields.mjs --self-test
// 退出码：有硬违规 → 1；干净 → 0。
"use strict";
import fs from "node:fs"; import path from "node:path";
const argv=process.argv.slice(2); const arg=(k,d)=>{const i=argv.indexOf(k);return i>=0?argv[i+1]:d;}; const has=k=>argv.includes(k);
const norm=s=>String(s==null?"":s).replace(/\s+/g,"");
const num=v=>{ if(v===null||v===undefined||v==="") return null; const n=Number(String(v).replace(/,/g,"")); return Number.isFinite(n)?n:null; };

export function scanStrict(env){
  const r={doc:env.__name||"?",fields:0,valued:0,anchors:0,
    hit_raw:0, hit_ws_only:0, miss:0, fabricated_block:0, dangling_missing_fix:0,
    valued_without_provenance:[], unreadable_with_value:[], arithmetic:[], details:[]};
  const blocks=(env.source&&env.source.parse_meta&&env.source.parse_meta.blocks)||[];
  const byId=new Map(blocks.map(b=>[b.block_id,b]));
  const F=e=>e.fields||{};
  for(const ev of env.events||[]){
    const f=F(ev);
    for(const [fn,v] of Object.entries(f)){
      r.fields++;
      const val=v.value; const hasVal=(val!==null&&val!==undefined&&val!=="");
      const prov=Array.isArray(v.provenance)?v.provenance:[];
      if(hasVal){ r.valued++; if(!prov.length) r.valued_without_provenance.push(`${ev.event_id||"?"}.${fn}`); }
      if(String(v.status)==="unreadable"&&hasVal) r.unreadable_with_value.push(`${ev.event_id||"?"}.${fn}`);
      for(const p of prov){
        r.anchors++;
        const bid=p.block_id, q=p.quote;
        if(!bid){ r.fabricated_block++; r.details.push({where:`${ev.event_id||"?"}.${fn}`,kind:"no_block_id"}); continue; }
        const b=byId.get(bid);
        if(!b){ r.fabricated_block++; r.details.push({where:`${ev.event_id||"?"}.${fn}`,kind:"fabricated_block",block_id:bid}); continue; }
        const raw=String(b.text||b.text_raw||"");
        if(q!=null && raw.includes(String(q))) r.hit_raw++;
        else if(q!=null && norm(raw).includes(norm(q))) r.hit_ws_only++;
        else { r.miss++; r.details.push({where:`${ev.event_id||"?"}.${fn}`,kind:"wrong_quote",block_id:bid,quote:String(q).slice(0,40)}); }
      }
    }
    // ---- ③ 算术一致性 ----
    const g=k=>{const x=f[k]; return x?num(x.value):null;};
    const sb=g("shares_before"), sa=g("shares_after"), cs=g("change_shares");
    if(sb!==null&&sa!==null&&cs!==null && Math.abs(sa-sb)!==cs)
      r.arithmetic.push({ev:ev.event_id,kind:"change_shares",declared:cs,recomputed:Math.abs(sa-sb)});
    const thisT=g("pledged_shares_this_time"), cum=g("pledged_shares_cumulative");
    if(thisT!==null&&cum!==null && cum<thisT)
      r.arithmetic.push({ev:ev.event_id,kind:"cumulative_lt_this_time",cumulative:cum,this_time:thisT});
    // 方向 vs 股数符号：**被动稀释豁免**（可转债转股/转增等，股数不变或方向由总股本驱动）
    const dir=f.direction&&f.direction.value, method=String((f.method&&f.method.value)||"");
    const dilution=/稀释|转股|转增|被动/.test(method);
    if(dir&&sb!==null&&sa!==null&&!dilution){
      if(dir==="decrease"&&sa>sb) r.arithmetic.push({ev:ev.event_id,kind:"direction_vs_shares",detail:`direction=decrease 但 shares 增加（${sb}→${sa}）`});
      if(dir==="increase"&&sa<sb) r.arithmetic.push({ev:ev.event_id,kind:"direction_vs_shares",detail:`direction=increase 但 shares 减少（${sb}→${sa}）`});
    }
    const sd=f.start_date&&f.start_date.value, ed=f.end_date&&f.end_date.value;
    if(sd&&ed && /^\d{4}-\d{2}-\d{2}$/.test(sd) && /^\d{4}-\d{2}-\d{2}$/.test(ed) && sd>ed)
      r.arithmetic.push({ev:ev.event_id,kind:"start_after_end",start:sd,end:ed});
  }
  return r;
}
function load(dir,exc){
  const ex=exc?(String(exc).endsWith(".json")?String(exc):String(exc)+".json"):null;
  return fs.readdirSync(dir).filter(f=>f.endsWith(".json")&&f!==ex).sort()
    .map(f=>{const j=JSON.parse(fs.readFileSync(path.join(dir,f),"utf8")); j.__name=f.replace(/\.json$/,""); return j;});
}
function rollup(rows){
  const sum=k=>rows.reduce((s,r)=>s+r[k],0);
  return {docs:rows.length, fields:sum("fields"), valued:sum("valued"), anchors:sum("anchors"),
    hit_raw:sum("hit_raw"), hit_ws_only:sum("hit_ws_only"), miss:sum("miss"),
    fabricated_block:sum("fabricated_block"),
    arithmetic_violations:rows.reduce((s,r)=>s+r.arithmetic.length,0),
    valued_without_provenance:rows.flatMap(r=>r.valued_without_provenance.map(x=>r.doc+"#"+x)),
    unreadable_with_value:rows.flatMap(r=>r.unreadable_with_value.map(x=>r.doc+"#"+x))};
}
function violations(t){ return t.fabricated_block+t.miss+t.arithmetic_violations+t.valued_without_provenance.length+t.unreadable_with_value.length; }

if(has("--self-test")){
  const base=()=>({__name:"ctl",source:{parse_meta:{blocks:[{block_id:"b1",text:"质押股数 2,100,000 股"},{block_id:"b2",text:"合计 50,350,000 股"}]}},
    events:[{event_id:"E01",fields:{
      shares_before:{value:1000,status:"extracted",unit:"shares",provenance:[{block_id:"b1",quote:"质押股数 2,100,000 股"}]},
      shares_after:{value:3000,status:"extracted",unit:"shares",provenance:[{block_id:"b1",quote:"质押股数 2,100,000 股"}]},
      change_shares:{value:2000,status:"extracted",unit:"shares",provenance:[{block_id:"b2",quote:"合计 50,350,000 股"}]}}}]});
  const clean=base();
  const fab=base(); fab.events[0].fields.shares_before.provenance=[{block_id:"NOT_EXIST",quote:"质押股数 2,100,000 股"}];
  const wq=base();  wq.events[0].fields.shares_before.provenance=[{block_id:"b1",quote:"质押股数 9,999,999 股"}];
  const ar=base();  ar.events[0].fields.change_shares.value=1234;
  const t0=rollup([scanStrict(clean)]);
  const tF=rollup([scanStrict(fab)]);
  const tQ=rollup([scanStrict(wq)]);
  const tA=rollup([scanStrict(ar)]);
  const res={
    positive_clean_must_pass: violations(t0)===0 && t0.hit_raw===3,
    negative_fabricated_must_fail: tF.fabricated_block===1 && violations(tF)===1,
    negative_wrong_quote_must_fail: tQ.miss===1 && violations(tQ)===1,
    negative_wrong_calc_must_fail: tA.arithmetic_violations===1 && violations(tA)===1,
    clean:t0, fabricated:tF, wrong_quote:tQ, wrong_calc:tA};
  const ok=res.positive_clean_must_pass&&res.negative_fabricated_must_fail&&res.negative_wrong_quote_must_fail&&res.negative_wrong_calc_must_fail;
  console.log(JSON.stringify({self_test:ok?"PASS":"FAIL",...res},null,2));
  process.exit(ok?0:1);
}

const DIR=arg("--dir","evaluation/D11/firsttest-envelopes"), EXC=arg("--exclude",null), OUT=arg("--json",null);
const rows=load(DIR,EXC).map(scanStrict);
const total=rollup(rows); total.details=rows.flatMap(r=>r.details.map(d=>({doc:r.doc,...d}))); total.arithmetic_details=rows.flatMap(r=>r.arithmetic.map(a=>({doc:r.doc,...a})));
const viol=violations(total);
const res={checked_on:new Date().toISOString().slice(0,10),dir:DIR,excluded:EXC,result:viol?"FAIL":"PASS",violations:viol,
  strict:{note:"严格分子＝quote 原文子串命中（hit_raw）；空白归一后命中的 hit_ws_only 单列，不并入严格分子",...(()=>{const {details,arithmetic_details,...rest}=total; return rest;})()}};
if(OUT) fs.writeFileSync(OUT,JSON.stringify({...res,details:total.details,arithmetic_details:total.arithmetic_details},null,2)+"\n","utf8");
console.log(JSON.stringify(res,null,2));
process.exit(viol?1:0);