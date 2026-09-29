import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const val = (name, fallback = null) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const goldDir = val('--gold', 'evaluation/D3/dev/gold');
const systemDir = val('--system-dir');
const batchReport = val('--batch-report');
const outJson = val('--json', 'evaluation/D3/evidence/field-comparison.json');
const outMd = val('--md', 'evaluation/D3/field-comparison.md');
if (!systemDir && !batchReport) throw new Error('provide --system-dir or --batch-report');
const manifest = JSON.parse(fs.readFileSync('evaluation/D3/dev/manifest.json', 'utf8'));
const system = new Map();
if (batchReport) { const report = JSON.parse(fs.readFileSync(batchReport, 'utf8')); for (const r of report.results || []) if (r.ok && r.run_id) system.set(r.case, path.join(path.dirname(batchReport), r.run_id, 'events.json')); }
else for (const item of manifest.items) system.set(item.case_id, path.join(systemDir, item.case_id + '.json'));
const cases = [], errors = [];
const valueEqual = (a,b) => a===b || (a!==null&&b!==null&&Number.isFinite(Number(a))&&Number.isFinite(Number(b))&&Math.abs(Number(a)-Number(b))<1e-9);
for (const item of manifest.items) {
  const gold = JSON.parse(fs.readFileSync(path.join(goldDir, item.case_id + '.envelope.json'), 'utf8'));
  const sysPath = system.get(item.case_id);
  if (!sysPath || !fs.existsSync(sysPath)) { cases.push({case_id:item.case_id,status:'PENDING_SYSTEM_OUTPUT',gold_events:gold.events.length,system_events:null}); errors.push({case_id:item.case_id,verdict:'PENDING_SYSTEM_OUTPUT'}); continue; }
  const sys = JSON.parse(fs.readFileSync(sysPath,'utf8')); for (const detail of (sys.run_meta?.errors || [])) errors.push({case_id:item.case_id,verdict:'RUN_META_ERROR',detail}); const sg = new Map((sys.events||[]).map(e=>[e.event_id,e]));
  for (const ge of gold.events) { const se=sg.get(ge.event_id); if(!se){errors.push({case_id:item.case_id,event_id:ge.event_id,verdict:'MISSING_EVENT'});continue} sg.delete(ge.event_id);
    for (const [name,gf] of Object.entries(ge.fields||{})) { const sf=se.fields?.[name]; if(!sf){errors.push({case_id:item.case_id,event_id:ge.event_id,field:name,verdict:'MISSING_FIELD',gold:gf.value});continue} if(gf.status!==sf.status){errors.push({case_id:item.case_id,event_id:ge.event_id,field:name,verdict:'STATUS_DIFF',gold:gf.status,system:sf.status});continue} if(!valueEqual(gf.value,sf.value))errors.push({case_id:item.case_id,event_id:ge.event_id,field:name,verdict:'VALUE_DIFF',gold:gf.value,system:sf.value}); }
  }
  for (const extra of sg.keys()) errors.push({case_id:item.case_id,event_id:extra,verdict:'EXTRA_EVENT'});
  cases.push({case_id:item.case_id,status:errors.some(e=>e.case_id===item.case_id)?'DIFF':'MATCH',gold_events:gold.events.length,system_events:sys.events?.length||0,system_path:'external_system_output/'+item.case_id+'.json'});
}
const result={generated_at:new Date().toISOString(),gold_dir:goldDir,system_dir:systemDir?'external_system_output':null,batch_report:batchReport,cases,errors};
fs.mkdirSync(path.dirname(outJson),{recursive:true}); fs.writeFileSync(outJson,JSON.stringify(result,null,2)+'\n','utf8');
let md='# D3 字段对比报告\n\n'; md+=`- Gold 文档：${cases.length}\n- 已有系统输出的文档：${cases.filter(c=>c.status!=='PENDING_SYSTEM_OUTPUT').length}\n- 待系统输出的文档：${cases.filter(c=>c.status==='PENDING_SYSTEM_OUTPUT').length}\n\n`; md+='| 文档 | Gold 事件 | 系统事件 | 结果 |\n|---|---:|---:|---|\n'; for(const c of cases)md+=`| ${c.case_id} | ${c.gold_events} | ${c.system_events??'—'} | ${c.status} |\n`; md+='\n## 错误清单\n\n'; if(errors.length===0)md+='无差异。\n';else{md+='| 文档 | 事件 | 字段 | 判定 | Gold | 系统 | 说明 |\n|---|---|---|---|---|---|---|\n';for(const e of errors)md+=`| ${e.case_id} | ${e.event_id??'—'} | ${e.field??'—'} | ${e.verdict} | ${JSON.stringify(e.gold??'')} | ${JSON.stringify(e.system??'')} | ${e.detail??''} |\n`;} fs.writeFileSync(outMd,md,'utf8'); console.log(JSON.stringify({cases:cases.length,errors:errors.length,pending:cases.filter(c=>c.status==='PENDING_SYSTEM_OUTPUT').length,out_json:outJson,out_md:outMd},null,2));
