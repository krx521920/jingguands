/** 推送版：消费魏B报告和已有D9规则；不捆绑A快照，不替代A/B运行入口。 */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {buildGroup,sha,SCHEMA_VERSION} from './report_D10.mjs';
import {validateBundle} from './validate_D10.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const read=p=>JSON.parse(readFileSync(p,'utf8'));
/** paths: bReport, cases, attributionCases, d9Root; optional context/parseRoot/cacheAudit/outDir. */
export async function generate(paths){
  for(const key of ['bReport','cases','attributionCases','d9Root'])if(!paths?.[key])throw Error('MISSING_ARGUMENT:'+key);
  const b=read(paths.bReport),groups=read(paths.cases).cases,attributionCases=read(paths.attributionCases).cases;
  const supplied=paths.context?read(paths.context):null;
  const d9=await import(pathToFileURL(resolve(paths.d9Root,'src_D9/attribution_D9.mjs')).href);
  if(typeof d9.attributeCase!=='function')throw Error('D9_ATTRIBUTE_CASE_EXPORT_MISSING');
  if(!Array.isArray(groups)||!Array.isArray(b.results)||!b.b_run?.b_run_id||!Array.isArray(attributionCases))throw Error('INVALID_INPUT_INTERFACE');
  if(new Set(groups.map(g=>g.case_id)).size!==groups.length||new Set(b.results.map(g=>g.group_id)).size!==b.results.length)throw Error('DUPLICATE_GROUP');
  const cache=paths.cacheAudit?read(paths.cacheAudit):{rows:[],upstream_claim:{status:'not_supplied'}};
  if(!Array.isArray(cache.rows))throw Error('INVALID_CACHE_AUDIT');
  const runId='report-d10-'+randomUUID(),codeVersion='D10.1-slim-'+sha(readFileSync(new URL('./report_D10.mjs',import.meta.url))).slice(0,12);
  const sourcePath=resolve(paths.context??paths.bReport),payload=sha(readFileSync(sourcePath));
  const results=groups.map(group=>{
    const g=b.results.find(x=>x.group_id===group.case_id);if(!g)throw Error('B_GROUP_MISSING:'+group.case_id);
    const context=structuredClone(supplied??g.d9_context);
    if(!context?.documents)throw Error('D9_CONTEXT_MISSING: use Wei --d9-enrich or --context');
    if(paths.parseRoot){
      context.parses??={};
      for(const m of group.members)if(/^D[456]-/.test(m)){
        const path=resolve(paths.parseRoot,m.split('-')[0],'parse',m+'.parse.json');
        const parsed=read(path);if(parsed.doc?.file_sha256!==context.documents[m]?.source?.file_sha256)throw Error('PARSE_SHA_MISMATCH:'+m);
        context.parses[m]=parsed;
      }
    }
    for(const m of group.members){
      const env=context.documents[m],link=g.a_run_links?.find(x=>x.case_id===m);
      if(!env||!link||link.a_run_id!==env.run_id||link.schema_version!==env.schema_version)throw Error('B_A_RUN_MISMATCH:'+m);
    }
    // 缓存旧记录不能迁移成新批次已验证：仅采用replay run_id与当前成员一致的行。
    const cacheAudit={...cache,rows:cache.rows.filter(row=>context.documents[row.member_id]?.run_id===row.run_ids?.replay)};
    const sourceFiles=Object.fromEntries(group.members.map(m=>[m,{path:relative(ROOT,sourcePath).replaceAll('\\','/'),payload_sha256:payload}]));
    return buildGroup({group:{case_id:group.case_id,title:group.title,members:group.members},context,bGroup:g,bRun:b.b_run,attributionCases,cacheAudit,sourceFiles,codeVersion,runId,attributeCase:d9.attributeCase});
  });
  const output=resolve(paths.outDir??resolve(ROOT,'results_D10'));mkdirSync(output,{recursive:true});
  const bundle={schema_version:SCHEMA_VERSION,run_id:runId,code_version:codeVersion,built_at:new Date().toISOString(),business_date:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),
    data_mode:'offline_replay_of_pinned_extractions',source_versions:{b_code_version:b.code_version??'not_supplied',attribution:d9.VERSION??'not_supplied',b_report_sha256:sha(readFileSync(paths.bReport)),cases_sha256:sha(readFileSync(paths.cases)),attribution_cases_sha256:sha(readFileSync(paths.attributionCases))},
    execution:{model_called:false,b_run_id:b.b_run.b_run_id,rule_versions:{attribution:d9.VERSION??'not_supplied',report:'D10.1-slim'},b_executed_here:false},cache_audit_file:'audit_D10/cache_audit_D10.json',results};
  const errors=validateBundle(bundle,read(resolve(ROOT,'schema_D10/核验报告_schema_D10.json')));if(errors.length)throw Error(JSON.stringify(errors));
  mkdirSync(resolve(output,'audit_D10'),{recursive:true});writeFileSync(resolve(output,'audit_D10/cache_audit_D10.json'),JSON.stringify(cache,null,2)+'\n');
  writeFileSync(resolve(output,'核验报告合集_D10.json'),JSON.stringify(bundle,null,2)+'\n');
  return bundle;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const names={'--b-report':'bReport','--cases':'cases','--attribution-cases':'attributionCases','--d9-root':'d9Root','--context':'context','--parse-root':'parseRoot','--cache-audit':'cacheAudit','--out-dir':'outDir'},paths={},args=process.argv.slice(2);
  for(let i=0;i<args.length;i+=2){if(!names[args[i]]||!args[i+1]||args[i+1].startsWith('--'))throw Error('参数：--b-report --cases --attribution-cases --d9-root [--context --parse-root --cache-audit --out-dir]');paths[names[args[i]]]=resolve(args[i+1]);}
  const r=await generate(paths);console.log(JSON.stringify({groups:r.results.length,run_id:r.run_id,model_called:false}));
}
