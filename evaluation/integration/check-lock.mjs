import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
// 锁存自检：逐文件校验 lock-manifest.json 的 sha256，过期/缺失即 FAIL
// ★ 2026-10-10 修：基准改为 **LF 归一字节**（读文件后把 CRLF→LF 再哈希）。
//   原因：原先按工作区字节哈希，Windows 上 CRLF 会让同一份仓库内容在不同主机给出不同值——
//   魏在 v2.0-delivery 彩排时报 "stale 5（D11 results 五份文档）" 正是这个基准问题（我方第 N 次同类错）。
//   LF 归一后与仓库 blob 字节一致（仓库行尾规则 text eol=lf），跨主机可复现。
const man=JSON.parse(fs.readFileSync('evaluation/D11/results/lock-manifest.json','utf8'));
const norm=p=>String(p).replace(/\\/g,'/');
const lf=b=>Buffer.from(b.toString('utf8').replace(/\r\n/g,'\n'),'utf8');
let ok=0,stale=0,missing=0; const bad=[];
for(const f of man.files){
  const p=norm(f.path);
  if(!fs.existsSync(p)){missing++;bad.push('MISSING '+p);continue;}
  const h=crypto.createHash('sha256').update(lf(fs.readFileSync(p))).digest('hex');
  if(h!==f.sha256){stale++;bad.push('STALE '+p+' 期望 '+String(f.sha256).slice(0,12)+' 实算 '+h.slice(0,12));}else ok++;
}
const out={result:(stale===0&&missing===0)?'PASS':'FAIL',hash_basis:man.hash_basis||'(未标注)',files:man.files.length,ok,stale,missing,issues:bad.slice(0,20)};
console.log(JSON.stringify(out,null,2));
process.exit(out.result==='PASS'?0:1);