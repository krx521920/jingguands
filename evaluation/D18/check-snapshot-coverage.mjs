#!/usr/bin/env node
// check-snapshot-coverage.mjs —— 解析快照覆盖门（评测侧 · D18）
//
// 背景：页面 L3「出处原文命中」此前只覆盖 **1 份文档 / 39 条 provenance**，因为页面手里只有 1 份
//   parse 快照。2026-10-10 魏交付方案 A：evaluation/D9/snapshot-paths.json —— 34 份快照映射
//   （官方 parse-official 30 ＋ 演示 raw 3 ＋ 扫描降级 1），join 键＝信封 source.file_sha256；
//   扫描降级件例外（其信封写的是占位符，按 parse 文件 sha 对齐）。陈按 sha 物化即可，不新增副本。
//
// 本门做三件事：
//   ① 校验清单本身（三键齐全、路径不空）；
//   ② 把清单与指定信封集 join，报**覆盖**与**例外**，算出可核锚点数；
//   ③ 若给了 --materialized，逐条核对物化文件的 sha256 == 清单 parse_file_sha256。
//
// 用法：
//   node evaluation/D18/check-snapshot-coverage.mjs
//   node evaluation/D18/check-snapshot-coverage.mjs --materialized <目录>
//   node evaluation/D18/check-snapshot-coverage.mjs --self-test
// 退出码：有未覆盖（非例外）或物化不符 → 1。
"use strict";
import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto";
const argv=process.argv.slice(2); const arg=(k,d)=>{const i=argv.indexOf(k);return i>=0?argv[i+1]:d;}; const has=k=>argv.includes(k);
const MAN=arg("--manifest","evaluation/D18/snapshot-paths.weiwenyu-81a5698d.json");
const ENV=arg("--envelopes","evaluation/D11/firsttest-envelopes");
const MAT=arg("--materialized",null);
const EXC=arg("--exclude",null);   // 排除某份信封（如 DEMO），用于按权威口径单独复核
const OUT=arg("--json",null);
const H=b=>crypto.createHash("sha256").update(b).digest("hex");
const isHex64=s=>typeof s==="string"&&/^[0-9a-f]{64}$/.test(s);

export function coverage(docs, envs){
  const bySha=new Map(docs.filter(d=>isHex64(d.file_sha256)).map(d=>[d.file_sha256,d]));
  const byCase=new Map(docs.map(d=>[d.case_id,d]));
  const rows=[];
  for(const e of envs){
    let d=null, how=null;
    if(e.sha && bySha.has(e.sha)){ d=bySha.get(e.sha); how="sha"; }
    else if(byCase.has(e.name)){ d=byCase.get(e.name); how="exception"; }
    let anchors=0; for(const ev of e.j.events||[]) for(const [,v] of Object.entries(ev.fields||{})) anchors+=(v.provenance||[]).length;
    rows.push({envelope:e.name,status:d?"COVERED":"UNCOVERED",how,parse_path:d?d.parse_path:null,anchors,total_anchors:anchors});
  }
  return rows;
}
if(has("--self-test")){
  const tmp="tmp/d18-selftest"; fs.mkdirSync(tmp,{recursive:true});
  const good=Buffer.from('{"ok":1}'); fs.writeFileSync(path.join(tmp,"a.parse.json"),good);
  fs.writeFileSync(path.join(tmp,"scan.parse.json"),Buffer.from('{"tampered":1}'));   // 故意写坏：期望 MISMATCH
  const docs=[
    {case_id:"A",parse_path:"a.parse.json",file_sha256:"aa".repeat(32),parse_file_sha256:H(good)},
    {case_id:"SCAN",parse_path:"scan.parse.json",file_sha256:"advscan01",parse_file_sha256:"bb".repeat(32)}
  ];
  const envs=[{name:"A",sha:"aa".repeat(32),j:{events:[{fields:{x:{provenance:[1,2]}}}]}},
              {name:"SCAN",sha:"advscan01",j:{events:[{fields:{y:{provenance:[]}}}]}},
              {name:"MISSING",sha:"cc".repeat(32),j:{events:[{fields:{z:{provenance:[1]}}}]}}];
  const cov=coverage(docs,envs);
  const uncovered=cov.filter(r=>r.status==="UNCOVERED");
  const exception=cov.filter(r=>r.how==="exception");
  // 物化核对
  const matRows=docs.map(d=>{ const p=path.join(tmp,d.parse_path); if(!fs.existsSync(p)) return {case_id:d.case_id,status:"MISSING"};
    return {case_id:d.case_id,status:H(fs.readFileSync(p))===d.parse_file_sha256?"MATCH":"MISMATCH"}; });
  const ok = uncovered.length===1 && exception.length===1 && cov.filter(r=>r.how==="sha").length===1
          && matRows.find(r=>r.case_id==="A").status==="MATCH" && matRows.find(r=>r.case_id==="SCAN").status==="MISMATCH";
  console.log(JSON.stringify({self_test:{result:ok?"PASS":"FAIL",coverage:cov,materialized:matRows}},null,2));
  process.exit(ok?0:1);
}
const man=JSON.parse(fs.readFileSync(MAN,"utf8"));
const docs=man.docs||[];
const badDocs=docs.filter(d=>!d.case_id||!d.parse_path||!d.file_sha256);
const envs=fs.readdirSync(ENV).filter(f=>f.endsWith(".json")&&f.replace(/\.json$/,"")!==EXC).sort().map(f=>({name:f.replace(/\.json$/,""),j:JSON.parse(fs.readFileSync(path.join(ENV,f),"utf8")),sha:null}))
  .map(e=>({...e,sha:e.j.source&&e.j.source.file_sha256}));
const cov=coverage(docs,envs);
const uncovered=cov.filter(r=>r.status==="UNCOVERED");
const byHow={sha:cov.filter(r=>r.how==="sha").length,exception:cov.filter(r=>r.how==="exception").length,uncovered:uncovered.length};
const anchorsTotal=cov.reduce((s,r)=>s+r.total_anchors,0);
const anchorsCovered=cov.filter(r=>r.status==="COVERED").reduce((s,r)=>s+r.anchors,0);
let mat=[];
if(MAT){
  mat=docs.map(d=>{ const p=path.join(MAT,d.parse_path); if(!fs.existsSync(p)) return {case_id:d.case_id,status:"MISSING"};
    return {case_id:d.case_id,status:H(fs.readFileSync(p))===d.parse_file_sha256?"MATCH":"MISMATCH"}; });
}
const matBad=mat.filter(r=>r.status!=="MATCH").length;
const result=(badDocs.length||uncovered.length||matBad)?"FAIL":"PASS";
const out={checked_on:new Date().toISOString().slice(0,10),manifest:MAN,envelopes:ENV,materialized:MAT,result,
  manifest_docs:docs.length,manifest_bad:badDocs.length,join:byHow,
  anchors:{covered:anchorsCovered,total:anchorsTotal},covered_docs:cov.filter(r=>r.status==="COVERED").length,docs_total:cov.length,
  uncovered:uncovered.map(r=>r.envelope),materialized_bad:mat.map(r=>r).filter(r=>r.status!=="MATCH")};
if(OUT) fs.writeFileSync(OUT,JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify({result,manifest_docs:out.manifest_docs,join:byHow,covered_docs:out.covered_docs+"/"+out.docs_total,
  anchors:out.anchors.covered+"/"+out.anchors.total,materialized_bad:matBad,uncovered:out.uncovered},null,2));
process.exit(result==="PASS"?0:1);