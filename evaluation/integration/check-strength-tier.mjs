#!/usr/bin/env node
// D7 标准化分层（方案 C）框架校验器 —— 评测侧
// 用途：对魏的审计输出做“锁定项”硬校验 + 算强度分布，为可修订项（none/conflict 清单）提供依据。
// 用法：node evaluation/integration/check-strength-tier.mjs --audit <D7-normalization-audit.json> [--json out]
import fs from 'node:fs';
const argv=process.argv.slice(2); const arg=(k,d)=>{const i=argv.indexOf(k);return i>=0?argv[i+1]:d;};
const AUDIT=arg('--audit','runs/D7-normalization-audit-20261005.json'); const OUT=arg('--json',null);
const has=(k)=>argv.includes(k);
const EXPECT_REJECT=has('--expect-reject');   // 方案C：本审计的 FAIL（71 处非法降级）是预期结论，不是出错
const a=JSON.parse(fs.readFileSync(AUDIT,'utf8'));
const changes=a.changes||[];
const issues=[]; const dist={strong:0,medium:0,weak:0,none:0,conflict:0,unknown:0};
const downgraded=[], typeOnly=[];
for(const c of changes){
  const b=c.before||{}, f=c.after||{};
  // 锁定项①：任何改动不得改变 value
  const numEq=(x,y)=>{ if(x===y) return true; const nx=Number(x), ny=Number(y); return x!==null && y!==null && !Number.isNaN(nx) && !Number.isNaN(ny) && nx===ny; };
  if(!numEq(b.value,f.value)) issues.push(`${c.case}.${c.field} VALUE_CHANGED: ${JSON.stringify(b.value)} -> ${JSON.stringify(f.value)}`);
  const strength=(f.evidence_strength||c.evidence_strength||'unknown');
  dist[strength]=(dist[strength]||0)+1;
  const isDowngrade=(f.status&&b.status&&f.status!==b.status);
  if(isDowngrade){
    downgraded.push({case:c.case,field:c.field,from:b.status,to:f.status,code:c.code||c.kind});
    // 锁定项②：只有 none/conflict 才允许降级
    if(!['none','conflict'].includes(strength)) issues.push(`${c.case}.${c.field} ILLEGAL_DOWNGRADE strength=${strength} (${b.status}->${f.status})`);
  } else { typeOnly.push(c); }
}
const out={result:issues.length?'FAIL':'PASS',audit:AUDIT,total_changes:changes.length,
 type_only:typeOnly.length,status_downgrades:downgraded.length,
 value_changes:issues.filter(x=>x.includes('VALUE_CHANGED')).length,
 illegal_downgrades:issues.filter(x=>x.includes('ILLEGAL_DOWNGRADE')).length,
 strength_distribution:dist,
 note:dist.unknown===changes.length?'审计未带 evidence_strength —— 请魏按框架回传强度分布（strong/medium/weak/none/conflict）后重跑本工具':'',
 downgraded_list:downgraded, issues};
if(OUT)fs.writeFileSync(OUT,JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({result:out.result,total:out.total_changes,type_only:out.type_only,status_downgrades:out.status_downgrades,value_changes:out.value_changes,illegal_downgrades:out.illegal_downgrades,strength_distribution:dist},null,2));
if(EXPECT_REJECT){
  const onlyIllegal=issues.every(x=>x.includes('ILLEGAL_DOWNGRADE'));
  const valueBad=issues.some(x=>x.includes('VALUE_CHANGED'));
  const out2={result:valueBad?'FAIL':(onlyIllegal?'AUDIT_COMPLETE_CONFORMS_TO_RULING':'PASS'),mode:'expect-reject',
   note:valueBad?'出现值变更——超出方案C裁定范围':(onlyIllegal?'审计结论：'+issues.length+' 处降级违反「仅 none/conflict 可降级」，与方案 C 修订裁定一致':'未发现非法降级，本审计通过'),
   illegal_downgrades:issues.filter(x=>x.includes('ILLEGAL_DOWNGRADE')).length,issues};
  if(OUT)fs.writeFileSync(OUT,JSON.stringify(out2,null,2)+'\n');
  console.log(JSON.stringify({result:out2.result,illegal_downgrades:out2.illegal_downgrades,note:out2.note},null,2));
  process.exit(valueBad?1:0);
}
process.exit(issues.length?1:0);
