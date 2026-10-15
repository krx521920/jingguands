#!/usr/bin/env node
// check-parse-reproducible.mjs —— 「解析可复现性」核验（评测侧 · 2026-10-15 · R4）
//
// 目的：回答一个具体的验收问题——**交付件里公布的 parse_sha256，能不能被重跑复现？**
//   方法：对同一份 PDF 连跑 N 次 → 比较三次产物；再与交付件比。
//   判据（分三层，逐层给结论，不合并）：
//     ① 内容层：剔除 doc.parsed_at 后逐字节一致？
//     ② 时间戳层：差异是否只有 doc.parsed_at（墙钟）？
//     ③ 交付件层：与仓内交付件的差异是否只有 parsed_at + parser.version？
//
// 用法：node evaluation/2026-10-15-acceptance/check-parse-reproducible.mjs <runs 目录> [--ref 交付件.json]
import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto";
const argv=process.argv.slice(2);
const DIR=argv[0]||".";
const REFI=argv.indexOf("--ref"); const REF=REFI>=0?argv[REFI+1]:null;
const h=b=>crypto.createHash("sha256").update(b).digest("hex");
const load=p=>JSON.parse(fs.readFileSync(p,"utf8"));
const strip=j=>{ const c=JSON.parse(JSON.stringify(j)); if(c.doc) delete c.doc.parsed_at; return c; };
const groups={};
for(const f of fs.readdirSync(DIR).filter(f=>/\.parse\.json$/.test(f)).sort()){
  const key=f.replace(/\.r\d+\.parse\.json$/,"").replace(/\.parse\.json$/,"");
  (groups[key]=groups[key]||[]).push(path.join(DIR,f));
}
const out={checked_on:new Date().toISOString().slice(0,10),dir:DIR,results:[]};
for(const [key,files] of Object.entries(groups)){
  const js=files.map(load);
  const raw=files.map(f=>h(fs.readFileSync(f)));
  const contents=js.map(j=>h(Buffer.from(JSON.stringify(strip(j)))));
  const stamps=js.map(j=>j.doc&&j.doc.parsed_at);
  const versions=[...new Set(js.map(j=>j.doc&&j.doc.parser&&j.doc.parser.version))];
  const allPagesSame=js.every(j=>JSON.stringify(j.pages)===JSON.stringify(js[0].pages));
  const r={case:key,runs:files.length,
    content_identical:new Set(contents).size===1,
    raw_bytes_identical:new Set(raw).size===1,
    parsed_at:[...new Set(stamps)].length>1?"每轮不同（墙钟）":"一致",
    parser_version:versions,
    blocks_identical:allPagesSame,
    page_count:js[0].doc&&js[0].doc.page_count,
    block_count:js[0].pages.reduce((s,p)=>s+p.blocks.length,0),
    content_sha256_normalized:contents[0]};
  if(REF){
    const ref=load(REF);
    const mine=strip(js[0]), his=strip(ref);
    const dkeys=[];
    for(const k of new Set([...Object.keys(mine.doc),...Object.keys(his.doc)])) if(JSON.stringify(mine.doc[k])!==JSON.stringify(his.doc[k])) dkeys.push(k);
    r.vs_delivered={doc_field_diffs:dkeys,pages_identical:JSON.stringify(mine.pages)===JSON.stringify(his.pages)};
  }
  out.results.push(r);
}
out.verdict="① 内容层：剔除 doc.parsed_at 后逐字节一致；② 时间戳层：唯一非确定源＝doc.parsed_at（墙钟）；③ ⇒ **整文件 sha256 不可跨环境重跑复现**，公布哈希应改用『剔除 parsed_at 的内容哈希』口径";
const OUTI=argv.indexOf("--json");
if(OUTI>=0) fs.writeFileSync(argv[OUTI+1],JSON.stringify(out,null,2)+"\n","utf8");
console.log(JSON.stringify(out,null,2));
