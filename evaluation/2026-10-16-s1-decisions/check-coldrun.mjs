#!/usr/bin/env node
// check-coldrun.mjs —— 冷跑 10×3 独立复核器（评测侧 · 2026-10-16）
//
// 为什么要写死口径：同一批产物，**"严格"可以有三种读法**，结果分别是 5/10、8/10、9/10。
//   不写死规则就吵不清。本工具同时给出三种口径，并把它固化下来：
//     (a) full_file       —— 全文件字节（仅剔除 run 标识与耗时字段）：5/10（差异含**引文粒度**抖动）
//     (b) value_order     —— **值层·保序**：8/10  ← 这是 R2 判据「值层＋code_version」的本意，**官方口径**
//     (c) value_natural   —— 值层·自然键配对：9/10（把"事件顺序轮转"排除后）
//   值层＝每字段的 value/status/unit；**不含 provenance/quote/region**（那属出处层）。
//
// 用法：node evaluation/2026-10-16-s1-decisions/check-coldrun.mjs <R4-冷跑目录> [--json out.json]
import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto";
const argv=process.argv.slice(2); const DIR=argv[0];
if(!DIR){ console.error("用法: node check-coldrun.mjs <R4-冷跑目录> [--json out.json]"); process.exit(2); }
const OUTI=argv.indexOf("--json");
const h=b=>crypto.createHash("sha256").update(b).digest("hex");
const J=p=>JSON.parse(fs.readFileSync(p,"utf8"));
const load=(cs,r)=>{ const rd=path.join(DIR,cs,"r"+r); const sub=fs.readdirSync(rd).filter(x=>fs.statSync(path.join(rd,x)).isDirectory())[0]; return J(path.join(rd,sub,"events.json")); };
const stripFull=j=>{ const c=JSON.parse(JSON.stringify(j)); delete c.run_id; if(c.run_meta){delete c.run_meta.started_at; delete c.run_meta.duration_ms;} return JSON.stringify(c); };
const valueLayer=j=>({code_version:(j.run_meta&&j.run_meta.code_version)||null,
  events:(j.events||[]).map(e=>({event_id:e.event_id,fields:Object.fromEntries(Object.entries(e.fields||{}).map(([k,x])=>[k,{v:x.value==null?"":String(x.value),s:String(x.status),u:(x.unit==null?"":String(x.unit))}]))}))});
function natKey(e){ const f=e.fields||{}; const v=k=>(f[k]&&f[k].value!=null)?String(f[k].value):"";
  if(v("pledgor")||v("pledgee")) return [v("direction"),v("pledgor"),v("pledgee"),v("pledged_shares_this_time")].join("|");
  if(v("holder")) return [v("holder"),v("direction"),v("change_date")].join("|");
  if(v("project_name")) return [v("project_name"),v("bidder")].join("|");
  return JSON.stringify(Object.entries(f).map(([k,x])=>k+"="+(x.value==null?"":x.value)).sort()); }
function natProject(j){ const m=new Map(); for(const e of j.events||[]) m.set(natKey(e), Object.fromEntries(Object.entries(e.fields||{}).map(([k,x])=>[k,(x.value==null?"":String(x.value))+"#"+String(x.status)]))); return m; }
const cases=fs.readdirSync(DIR).filter(d=>fs.statSync(path.join(DIR,d)).isDirectory()).sort();
let fileOK=0, ordOK=0, natOK=0; const rows=[];
for(const cs of cases){
  const js=[1,2,3].map(r=>load(cs,r));
  const a=new Set(js.map(stripFull)).size===1;
  const b=new Set(js.map(j=>JSON.stringify(valueLayer(j)))).size===1;
  const p0=natProject(js[0]); let c=true; const nd=[];
  for(const j of js.slice(1)){ const m=natProject(j); for(const [k,fm] of p0){ const o=m.get(k); if(!o){c=false;nd.push(k+" 缺");continue;} for(const fk of new Set([...Object.keys(fm),...Object.keys(o)])) if(fm[fk]!==o[fk]){c=false;nd.push(k+"."+fk);} } }
  if(a)fileOK++; if(b)ordOK++; if(c)natOK++;
  const ms=js.map(j=>(j.run_meta&&j.run_meta.duration_ms)||null);
  const errs=js.reduce((s,j)=>s+(((j.run_meta&&j.run_meta.errors)||[]).length),0);
  rows.push({case:cs,full_file_same:a,value_layer_order_same:b,value_layer_natural_key_same:c,durations_ms:ms,errors:errs,natural_diffs:[...new Set(nd)].slice(0,4)});
}
const out={checked_on:new Date().toISOString().slice(0,10),dir:DIR,cases:cases.length,
  official_caliber:"value_order (值层·保序)",
  calibers:{full_file:`${fileOK}/${cases.length}`,value_order:`${ordOK}/${cases.length}`,value_natural_key:`${natOK}/${cases.length}`},
  total_errors:rows.reduce((s,r)=>s+r.errors,0), max_duration_ms:Math.max(...rows.flatMap(r=>r.durations_ms.filter(x=>x!=null))),
  rows};
if(OUTI>=0) fs.writeFileSync(argv[OUTI+1],JSON.stringify(out,null,2)+"\n","utf8");
console.log(JSON.stringify(out,null,2));
