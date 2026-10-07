#!/usr/bin/env node
// 锁存自检：逐文件校验 lock-manifest.json 的 sha256，过期/缺失即 FAIL
import fs from 'node:fs'; import crypto from 'node:crypto';
const man=JSON.parse(fs.readFileSync('evaluation/D11/results/lock-manifest.json','utf8'));
let ok=0,stale=0,missing=0; const bad=[];
for(const f of man.files){
  if(!fs.existsSync(f.path)){missing++;bad.push('MISSING '+f.path);continue;}
  const h=crypto.createHash('sha256').update(fs.readFileSync(f.path)).digest('hex');
  if(h!==f.sha256){stale++;bad.push('STALE '+f.path);}else ok++;
}
const out={result:(stale===0&&missing===0)?'PASS':'FAIL',files:man.files.length,ok,stale,missing,issues:bad.slice(0,20)};
console.log(JSON.stringify(out,null,2));
process.exit(out.result==='PASS'?0:1);
