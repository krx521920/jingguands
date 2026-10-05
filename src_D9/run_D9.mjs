import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {attributeCase,VERSION} from './attribution_D9.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>JSON.parse(readFileSync(p,'utf8'));
export function loadPublic(){const x=read(resolve(root,'public_dev_D9/inputs_D9.json'));return {documents:Object.fromEntries(Object.entries(x.envelopes).map(([k,p])=>[k,read(resolve(root,p))])),parses:Object.fromEntries(Object.entries(x.parses).map(([k,p])=>[k,read(resolve(root,p))]))};}
export function runCases(dataset,options=loadPublic()){
  const cases=(dataset.cases??[]).map(c=>attributeCase({case_id:c.case_id,sides:c.sides},options));
  return {checked_on:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),tool:'attribution_D9',rule_version:VERSION,
    cases_total:cases.length,by_verdict:Object.fromEntries([...new Set(cases.map(c=>c.verdict))].map(v=>[v,cases.filter(c=>c.verdict===v).length])),cases,
    policy:'只接收case_id/sides和源文件；预期、类别、归因说明不进入规则；不能解释则保留疑点。'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2),arg=(name,d)=>{const i=args.indexOf(name);return i<0?d:args[i+1];};
  for(let i=0;i<args.length;i+=2)if(!['--cases','--out','--context'].includes(args[i])||!args[i+1]||args[i+1].startsWith('--'))throw new Error('用法：--cases 输入JSON [--context 源文件映射JSON] [--out 输出JSON]');
  const context=arg('--context',null);
  const report=runCases(read(resolve(arg('--cases',resolve(root,'public_dev_D9/rules-cases.dev_D9.json')))),context?read(resolve(context)):loadPublic());
  const out=arg('--out',null);if(out)writeFileSync(out,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({total:report.cases_total,counts:report.by_verdict}));
}
