#!/usr/bin/env node
// check-evidence-round.mjs —— 出处回跳 / 同名串 / 降级完整性 一轮检查（评测侧 · 2026-10-10）
//
// 起因：张《剩 7 天测试建议》提的 T4（同名串引用歧义）/ T6（跨行引用）/ T7（扫描件信息不足）/ T11（出处可回跳）。
//   他给的四条原则里第 3 条就是"不只测值对不对，要测出处能不能回跳"——本脚本把这条做成可复算。
//
// ★ 关键事实（本脚本要证的）：**30/32 份首测信封自带 source.parse_meta.blocks**，
//   也就是说 T11/T4 今天就能在 30 份上跑，不需要再物化任何外部解析件。
//
// 用法：
//   node evaluation/2026-10-10-test-plan/check-evidence-round.mjs --dir evaluation/D11/firsttest-envelopes --exclude DEMO-EQC-HL-0930.json --json out.json
//   node evaluation/2026-10-10-test-plan/check-evidence-round.mjs --self-test
// 退出码：违反不变量（有值无出处 / block_id 悬空 / 无法读取却给了值）→ 1。
"use strict";
import fs from "node:fs"; import path from "node:path";
const argv=process.argv.slice(2); const arg=(k,d)=>{const i=argv.indexOf(k);return i>=0?argv[i+1]:d;}; const has=k=>argv.includes(k);
const norm=s=>String(s==null?"":s).replace(/\s+/g,"");

export function scanEvidence(env){
  const out={doc:env.__name, blocks:0, anchors:0, valued_fields:0,
    with_block_id:0, quote_only:0, hit:0, miss:0, dangling_block_id:0, ambiguous_anchors:0, ambiguous_quote_only:0,
    needs_ws_normalization:0, dup_group_blocks:0, dup_groups:0,
    valued_without_provenance:[], unreadable_with_value:[], details:[]};
  const blocks=(env.source&&env.source.parse_meta&&env.source.parse_meta.blocks)||null;
  out.blocks=blocks?blocks.length:0;
  const byId=new Map(), byText=new Map();
  for(const b of blocks||[]){
    byId.set(b.block_id,b);
    const t=norm(b.text||b.text_raw);
    if(!byText.has(t)) byText.set(t,[]);
    byText.get(t).push(b.block_id);
  }
  const dupEntries=[...byText.values()].filter(v=>v.length>1);
  out.dup_groups=dupEntries.length;
  out.dup_group_blocks=dupEntries.reduce((s,v)=>s+v.length,0);
  for(const ev of env.events||[]) for(const [fname,f] of Object.entries(ev.fields||{})){
    const val=f.value;
    const hasVal=(val!==null&&val!==undefined&&val!=="");
    const prov=Array.isArray(f.provenance)?f.provenance:[];
    if(hasVal){ out.valued_fields++; if(!prov.length) out.valued_without_provenance.push(`${ev.event_id||"?"}.${fname}`); }
    if(String(f.status)==="unreadable"&&hasVal) out.unreadable_with_value.push(`${ev.event_id||"?"}.${fname}`);
    for(const p of prov){
      out.anchors++;
      const bid=p.block_id, q=p.quote;
      const ambiguous=q!=null && (byText.get(norm(q))||[]).length>1;
      if(ambiguous) out.ambiguous_anchors++;
      if(!bid){ out.quote_only++; if(ambiguous) out.ambiguous_quote_only++; out.details.push({where:`${ev.event_id||"?"}.${fname}`,kind:"quote_only",ambiguous}); continue; }
      out.with_block_id++;
      const blk=byId.get(bid);
      if(!blk){ out.dangling_block_id++; out.details.push({where:`${ev.event_id||"?"}.${fname}`,kind:"dangling_block_id",block_id:bid}); continue; }
      const raw=String(blk.text||blk.text_raw||"");
      if(raw.includes(String(q))) out.hit++;
      else if(norm(raw).includes(norm(q))){ out.hit++; out.needs_ws_normalization++; }
      else { out.miss++; out.details.push({where:`${ev.event_id||"?"}.${fname}`,kind:"miss",block_id:bid,quote:String(q).slice(0,40)}); }
    }
  }
  return out;
}
function load(dir,exc){
  const ex=exc?(String(exc).endsWith(".json")?String(exc):String(exc)+".json"):null;
  return fs.readdirSync(dir).filter(f=>f.endsWith(".json")&&f!==ex).sort().map(f=>{
    const j=JSON.parse(fs.readFileSync(path.join(dir,f),"utf8")); j.__name=f.replace(/\.json$/,""); return j;
  });
}
if(has("--self-test")){
  const good={__name:"good",source:{parse_meta:{blocks:[{block_id:"b1",text:"中标金额 1,000 元"},{block_id:"b2",text:"中标金额 1,000 元"}]}},
    events:[{event_id:"E01",fields:{amount:{value:1000,status:"extracted",provenance:[{block_id:"b1",quote:"中标金额 1,000 元"}]},
      note:{value:null,status:"unreadable",provenance:[]}}}]};
  const bad={__name:"bad",source:{parse_meta:{blocks:[{block_id:"b1",text:"x"}]}},
    events:[{event_id:"E01",fields:{a:{value:1,status:"extracted",provenance:[]},
      b:{value:"v",status:"unreadable",provenance:[{block_id:"zzz",quote:"y"}]}}}]};
  const g=scanEvidence(good), b=scanEvidence(bad);
  const okG = g.anchors===1 && g.with_block_id===1 && g.hit===1 && g.ambiguous_anchors===1 && g.dup_group_blocks===2 && g.miss===0 && g.dangling_block_id===0;
  const okB = b.valued_without_provenance.length===1 && b.unreadable_with_value.length===1 && b.dangling_block_id===1;
  console.log(JSON.stringify({self_test:{positive:okG?"PASS":"FAIL",negative:okB?"PASS":"FAIL",good:g,bad:b}},null,2));
  process.exit((okG&&okB)?0:1);
}
const DIR=arg("--dir","evaluation/D11/firsttest-envelopes"); const EXC=arg("--exclude",null); const OUT=arg("--json",null);
const rows=load(DIR,EXC).map(scanEvidence);
const sum=k=>rows.reduce((s,r)=>s+r[k],0);
const total={docs:rows.length, docs_with_blocks:rows.filter(r=>r.blocks>0).length,
  blocks:sum("blocks"), valued_fields:sum("valued_fields"), anchors:sum("anchors"),
  with_block_id:sum("with_block_id"), quote_only:sum("quote_only"), hit:sum("hit"), miss:sum("miss"),
  dangling_block_id:sum("dangling_block_id"), ambiguous_anchors:sum("ambiguous_anchors"), ambiguous_quote_only:sum("ambiguous_quote_only"),
  needs_ws_normalization:sum("needs_ws_normalization"), dup_groups:sum("dup_groups"), dup_group_blocks:sum("dup_group_blocks"),
  valued_without_provenance:rows.flatMap(r=>r.valued_without_provenance.map(x=>r.doc+"#"+x)),
  unreadable_with_value:rows.flatMap(r=>r.unreadable_with_value.map(x=>r.doc+"#"+x))};
const viol=total.valued_without_provenance.length+total.dangling_block_id+total.unreadable_with_value.length;
const res={checked_on:new Date().toISOString().slice(0,10),dir:DIR,excluded:EXC,result:viol?"FAIL":"PASS",violations:viol,summary:total,rows};
if(OUT) fs.writeFileSync(OUT,JSON.stringify(res,null,2)+"\n");
console.log(JSON.stringify({result:res.result,violations:viol,summary:total},null,2));
process.exit(viol?1:0);