#!/usr/bin/env node
// lock-new-batch.mjs —— 新批封存工具（评测侧，2026-10-11）
//
// 用途：拿到一批**陌生公告**（T1/T2/T3 等新批）后，一步产出：
//   ① 输入哈希锁（逐文件 + 整批锚点）——锁语义沿用 D13 v2：**输入哈希为主**；
//   ② 私有预期模板（结构先定，内容我私下填；只公开 `expectation_sha256`）；
//   ③ 评分入口约定（评分器用 evluation/D8|D9|D10 那几把，报告头必须带批次口径，见 report-header.mjs）。
//
// ★ 哈希基准（我方栽过的坑，写死在这里）：
//   - 文本类（.json/.md/.txt/.csv/.mjs）→ **LF 归一字节**（读后 CRLF→LF 再 sha256）；
//   - 二进制类（.pdf/.png/.jpg…）→ **原始字节**。
//   每条记录都写 `hash_basis`，避免"在我机器上绿"这类主机相关假绿。
//
// 用法：
//   node evaluation/2026-10-11-handoff/lock-new-batch.mjs --dir <批目录> --id <批ID> --out <锁.json> [--expect-out <预期模板.json>]
//   node evaluation/2026-10-11-handoff/lock-new-batch.mjs --publish-expectations <预期.json>   # 只打印可公开的 sha256
//   node evaluation/2026-10-11-handoff/lock-new-batch.mjs --self-test
// 退出码：任何异常/自检失败 → 1。
"use strict";
import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto";
const argv=process.argv.slice(2); const arg=(k,d)=>{const i=argv.indexOf(k);return i>=0?argv[i+1]:d;}; const has=k=>argv.includes(k);
const TEXT_EXT=new Set([".json",".md",".txt",".csv",".mjs",".cjs",".yaml",".yml"]);
const sha256=b=>crypto.createHash("sha256").update(b).digest("hex");
const lf=b=>Buffer.from(b.toString("utf8").replace(/\r\n/g,"\n"),"utf8");

/** 逐文件哈希（文本 LF 归一试算一次，若与原始字节不等则记录 basis） */
export function hashFile(p){
  const raw=fs.readFileSync(p);
  const ext=path.extname(p).toLowerCase();
  if(TEXT_EXT.has(ext)){
    const norm=lf(raw);
    return {sha256:sha256(norm), bytes:norm.length, hash_basis:"lf_normalized"};
  }
  return {sha256:sha256(raw), bytes:raw.length, hash_basis:"raw_bytes"};
}

/** 整批锚点：文件名升序 → 逐份 sha256 → "名:哈希" 行 → \n 连接 → 再 sha256（与权威批次锚点同算法） */
export function anchorOf(rows){
  const lines=rows.map(r=>`${r.file}:${r.sha256}`);
  return sha256(Buffer.from(lines.join("\n"),"utf8"));
}

export function buildLock(dir, id, exclude){
  const ex=new Set((exclude||[]).filter(Boolean));
  const files=fs.readdirSync(dir).filter(f=>fs.statSync(path.join(dir,f)).isFile()&&!ex.has(f)).sort();
  const rows=files.map(f=>({file:f, ...hashFile(path.join(dir,f))}));
  return {batch_id:id, created_on:new Date().toISOString().slice(0,10), files:rows,
    count:rows.length, anchor_sha256:anchorOf(rows),
    lock_semantics:{primary:"input_sha256（文件哈希；主锁，不随生成器演进变化）",
      generator:"待填：解析器/抽取器版本（张/魏交付后登记）",
      product:"产物哈希仅作当次一致性核对，不是跨版本承诺"},
    note:"本批哈希一律以「仓库字节」为口径：文本 LF 归一、二进制原始字节；逐文件 hash_basis 已标注。"};
}

export function expectationTemplate(id, rows){
  return {batch_id:id, created_on:new Date().toISOString().slice(0,10),
    expectation_sha256:null,   // 填完后用 --publish-expectations 生成，只公开这个值
    cases:rows.map(r=>({case_id:r.file.replace(/\.[^.]+$/,""), expected_relation:null, expected_fields:{}, notes:""}))};
}

if(has("--self-test")){
  const dir="tmp/lock-selftest"; fs.rmSync(dir,{recursive:true,force:true}); fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,"a.json"),'{"k":1}\r\n');         // 故意 CRLF：应与 LF 版同锚点
  fs.writeFileSync(path.join(dir,"b.txt"),"hello\r\n");
  const l1=buildLock(dir,"SELFTEST");
  const dir2="tmp/lock-selftest2"; fs.rmSync(dir2,{recursive:true,force:true}); fs.mkdirSync(dir2,{recursive:true});
  fs.writeFileSync(path.join(dir2,"a.json"),'{"k":1}\n');          // LF
  fs.writeFileSync(path.join(dir2,"b.txt"),"hello\n");
  const l2=buildLock(dir2,"SELFTEST");
  const crlfOk=l1.anchor_sha256===l2.anchor_sha256;
  // 改一字节 → 锚点必变
  fs.writeFileSync(path.join(dir2,"a.json"),'{"k":2}\n');
  const l3=buildLock(dir2,"SELFTEST");
  const mutOk=l3.anchor_sha256!==l1.anchor_sha256;
  // 预期哈希：确定性 + 只公开哈希
  const ex=expectationTemplate("SELFTEST", l1.files); ex.cases[0].expected_relation="related";
  const h1=sha256(Buffer.from(JSON.stringify(ex.cases)));
  const h2=sha256(Buffer.from(JSON.stringify(ex.cases)));
  const expOk=h1===h2 && h1.length===64;
  console.log(JSON.stringify({self_test:{crlf_equals_lf:crlfOk?"PASS":"FAIL",mutation_changes_anchor:mutOk?"PASS":"FAIL",expectation_deterministic:expOk?"PASS":"FAIL"},
    anchor:l1.anchor_sha256.slice(0,16),files:l1.files.map(r=>r.file+":"+r.hash_basis)},null,2));
  process.exit((crlfOk&&mutOk&&expOk)?0:1);
}
if(has("--publish-expectations")){
  const f=argv[argv.indexOf("--publish-expectations")+1];
  const j=JSON.parse(fs.readFileSync(f,"utf8"));
  const h=sha256(Buffer.from(JSON.stringify(j.cases)));
  console.log(JSON.stringify({batch_id:j.batch_id, cases:j.cases.length, expectation_sha256:h, published:"只公开这个值；预期内容不入库"},null,2));
  process.exit(0);
}
const DIR=arg("--dir",null), ID=arg("--id",null), OUT=arg("--out",null), EXPOUT=arg("--expect-out",null);
if(!DIR||!OUT){ console.error("需要 --dir 与 --out（或 --self-test / --publish-expectations）"); process.exit(2); }
const EXC=String(arg("--exclude","")).split(",").map(s=>s.trim()).filter(Boolean);
const lock=buildLock(DIR, ID||path.basename(DIR), EXC);
fs.writeFileSync(OUT, JSON.stringify(lock,null,2)+"\n","utf8");
if(EXPOUT) fs.writeFileSync(EXPOUT, JSON.stringify(expectationTemplate(lock.batch_id,lock.files),null,2)+"\n","utf8");
console.log(JSON.stringify({batch_id:lock.batch_id,files:lock.count,anchor_sha256:lock.anchor_sha256,
  basis:lock.files.reduce((m,f)=>{m[f.hash_basis]=(m[f.hash_basis]||0)+1;return m;},{}),
  wrote:OUT+(EXPOUT?(" + "+EXPOUT):"")},null,2));