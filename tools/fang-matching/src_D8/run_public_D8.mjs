#!/usr/bin/env node
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {explainGroup,RULE_VERSION} from './matching_D8.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>JSON.parse(readFileSync(p,'utf8'));
export function runManifest(manifestPath,outputPath){
  const manifest=read(manifestPath),input=read(resolve(root,'public_dev_D8/input_manifest_D8.json'));
  const results=(manifest.groups??[]).map(g=>{
    const envs=g.members.map(id=>input.documents[id]?read(resolve(root,'public_dev_D8',input.documents[id].envelope)):null);
    return explainGroup({group_id:g.group_id,members:g.members},envs);
  });
  const report={checked_on:new Date().toISOString().slice(0,10),b_run:{b_run_id:'fang-D8-'+Date.now(),engine:'run_public_D8.mjs',
    matcher:{plugin:'src_D8/matching_D8.mjs'},rule_version:RULE_VERSION,mode:'public_development_not_blind_acceptance'},
    manifest:manifestPath,groups_total:manifest.groups.length,groups_checked:results.length,results,
    related_detected:results.filter(r=>r.predicted_relation==='related').length,
    unrelated_detected:results.filter(r=>r.predicted_relation==='unrelated').length,
    unknown_detected:results.filter(r=>r.predicted_relation==='unknown').length,
    related_conflicts_total:0,related_corroborations_total:0,
    limitations:['仅关联与解释；未执行 D9 金额/比例/合计一致性比较。','使用显式公开原文身份上下文，非 A 自动抽取准确率，也非封存验收。']};
  if(outputPath)writeFileSync(outputPath,JSON.stringify(report,null,2)+'\n');
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2),arg=(k,d)=>{const i=args.indexOf(k);return i<0?d:args[i+1];};
  const r=runManifest(resolve(arg('--manifest',resolve(root,'public_dev_D8/pairs.dev30_D8.json'))),arg('--out',null));
  console.log(JSON.stringify({total:r.groups_total,related:r.related_detected,unrelated:r.unrelated_detected,unknown:r.unknown_detected}));
}
