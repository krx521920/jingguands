#!/usr/bin/env node
// verify-sealed.mjs —— 封存集自校验（评测侧）
//
// ★ 2026-10-16 根因修复：哈希基准改为「LF 归一字节」。
//   旧版对**工作区原始字节**取 sha256，而 2026-10-04 锁定时工作区是 CRLF——
//   于是同一份内容：CRLF 检出＝PASS、LF 检出（干净克隆/换子树后）＝**19 条不一致**。
//   这与 2026-10-10 修掉的 check-lock 是**同一类**基准缺陷（当时同样报 stale 5）。
//   现基准＝「读文件后 CRLF→LF 再 sha256」＝**仓库 blob 字节**，任何主机/检出方式结果一致。
//   内容零改动：19 个文件的差异**纯为行尾**，旧基准值仍保留在各 manifest 的 *_worktree_crlf_2026_10_04 字段里。
//
// 用法：node evaluation/sealed/verify-sealed.mjs [--json out.json]
import fs from 'node:fs'; import path from 'node:path'; import { createHash } from 'node:crypto';
const argv=process.argv.slice(2); const OUTI=argv.indexOf('--json');
const root=path.resolve(import.meta.dirname,'.');
const single=JSON.parse(fs.readFileSync(path.join(root,'single','manifest.json'),'utf8'));
const cross=JSON.parse(fs.readFileSync(path.join(root,'cross-doc','manifest.json'),'utf8'));
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const LF=b=>Buffer.from(b.toString('utf8').replace(/\r\n/g,'\n'),'utf8');
const hPath=p=>sha(LF(fs.readFileSync(p)));          // 基准：LF 归一＝仓库 blob 字节
const hRaw=b=>sha(LF(b));
const HASH_BASIS='LF 归一字节（读文件后 CRLF→LF 再 sha256）＝仓库 blob 字节，跨主机可复现';
const issues=[]; let crlfOnDisk=0, refs=0;
if(single.total!==30||single.cases.length!==30)issues.push('single count');
if(cross.total!==20||cross.groups.length!==20)issues.push('cross count');
const ids=new Set(single.cases.map(c=>c.source_case_id));
for(const c of single.cases){
  const raw=path.resolve(root,'single',c.raw),gold=path.resolve(root,'single',c.gold);
  for(const [p,key] of [[raw,'raw_sha256'],[gold,'gold_sha256']]){
    refs++;
    const b=fs.readFileSync(p); if(b.includes(0x0d)) crlfOnDisk++;
    if(hRaw(b)!==c[key]) issues.push(`${c.sealed_id} ${key}`);
  }
}
for(const g of cross.groups){
  if(![2,3,4].includes(g.members.length))issues.push(`${g.group_id} member count`);
  for(const m of g.members)if(!ids.has(m))issues.push(`${g.group_id} unknown ${m}`);
  for(const h of g.member_hashes){const c=single.cases.find(x=>x.source_case_id===h.case_id); if(!c||c.raw_sha256!==h.raw_sha256||c.gold_sha256!==h.gold_sha256)issues.push(`${g.group_id} member hash ${h.case_id}`)}
}
const shaText=s=>sha(Buffer.from(s,'utf8'));   // manifest 本身按仓库字节（LF）取
const out={result:issues.length===0?'PASS':'FAIL',checked_on:(single.revised_on||single.created_on),
  hash_basis:HASH_BASIS,
  single_cases:single.cases.length,cross_doc_groups:cross.groups.length,
  related_groups:cross.groups.filter(g=>g.expected_relation==='related').length,
  unrelated_control_groups:cross.groups.filter(g=>g.expected_relation==='unrelated').length,
  single_manifest_sha256:shaText(fs.readFileSync(path.join(root,'single','manifest.json'),'utf8').replace(/\r\n/g,'\n')),
  cross_doc_manifest_sha256:shaText(fs.readFileSync(path.join(root,'cross-doc','manifest.json'),'utf8').replace(/\r\n/g,'\n')),
  hash_lock_manifest_sha256:shaText(fs.readFileSync(path.join(root,'hash-lock.json'),'utf8').replace(/\r\n/g,'\n')),
  info:{referenced_files:refs,crlf_on_disk:crlfOnDisk,note:'crlf_on_disk 只作信息项——基准已归一，行尾不再影响判定'},
  issues};
fs.writeFileSync(path.join(root,'verification.json'),JSON.stringify(out,null,2)+'\n','utf8');
if(OUTI>=0) fs.writeFileSync(argv[OUTI+1],JSON.stringify(out,null,2)+'\n','utf8');
console.log(JSON.stringify(out,null,2));
if(issues.length)process.exit(1);