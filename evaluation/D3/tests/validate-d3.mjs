import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dev/manifest.json'), 'utf8'));
const REGISTRY = { pledgor:{unit:'text'}, pledgee:{unit:'text'}, pledged_shares_this_time:{unit:'shares'}, pledged_shares_cumulative:{unit:'shares'}, pledged_ratio_this_time_of_held:{unit:'percent',denominator:'holder_shares'}, pledged_ratio_this_time_of_total:{unit:'percent',denominator:'total_share_capital'}, pledged_ratio_cumulative_of_held:{unit:'percent',denominator:'holder_shares'}, pledged_ratio_cumulative_of_total:{unit:'percent',denominator:'total_share_capital'}, pledge_amount:{unit:'cny'}, start_date:{unit:'date'}, end_date:{unit:'date'}, purpose:{unit:'text'}, announcement_date:{unit:'date'} };
const STATUSES = new Set(['extracted','not_disclosed','not_applicable','not_mentioned','unreadable','needs_review']);
const UNITS = new Set(['shares','cny','percent','date','date_range','text','count']);
const assert = (ok,msg)=>{if(!ok)throw new Error(msg)};
const results=[]; let events=0, fields=0, evidence=0, unsupported=0;
for(const item of manifest.items){
  const raw=JSON.parse(fs.readFileSync(path.join(root,'dev',item.raw),'utf8'));
  const gold=JSON.parse(fs.readFileSync(path.join(root,'dev',item.gold),'utf8'));
  const rawText=raw.pages.map(p=>p.text).join('\n');
  assert(raw.source_hash===item.source_hash,`${item.case_id} raw source hash mismatch`);
  assert(gold.source.file_sha256===item.source_hash,`${item.case_id} gold source hash mismatch`);
  assert(gold.source.file_id===item.file_id,`${item.case_id} file_id mismatch`);
  assert(gold.events.length===item.event_count,`${item.case_id} event count mismatch`);
  for(const ev of gold.events){ events++; assert(/^E\d{2}$/.test(ev.event_id),`${item.case_id} event_id`); assert(ev.event_type==='pledge',`${item.case_id} event type`);
    for(const [name,fv] of Object.entries(ev.fields)){ fields++; const spec=REGISTRY[name]; assert(spec,`${item.case_id}.${ev.event_id}.${name} unregistered`); assert(UNITS.has(fv.unit),`${item.case_id}.${name} unit enum`); assert(fv.unit===spec.unit,`${item.case_id}.${name} unit mismatch`); assert(STATUSES.has(fv.status),`${item.case_id}.${name} status enum`); assert(Array.isArray(fv.provenance),`${item.case_id}.${name} provenance`);
      if(['not_disclosed','not_applicable','not_mentioned','unreadable'].includes(fv.status)) assert(fv.value===null,`${item.case_id}.${name} missing must null`);
      if(['extracted','needs_review'].includes(fv.status)) assert(fv.provenance.length>0,`${item.case_id}.${name} needs provenance`);
      if(spec.denominator) assert(fv.denominator===spec.denominator,`${item.case_id}.${name} denominator`);
      for(const p of fv.provenance){ evidence++; assert(p.page>=1,`${item.case_id}.${name} page`); assert(typeof p.quote==='string'&&p.quote.length>0,`${item.case_id}.${name} quote`); if(!rawText.includes(p.quote)){unsupported++;throw new Error(`${item.case_id}.${name} quote not in raw: ${p.quote}`)}; if(p.source_type==='cell'||p.source_type==='table'){assert(p.table_id,`${item.case_id}.${name} table_id`);assert(p.cell_ref,`${item.case_id}.${name} cell_ref`)} }
    }
  }
  results.push({case_id:item.case_id,events:gold.events.length,fields:Object.keys(gold.events[0].fields).length,result:'PASS'});
}
const out={total_cases:manifest.items.length,total_events:events,total_fields:fields,total_evidence:evidence,unsupported_quotes:unsupported,result:'PASS',cases:results};
fs.mkdirSync(path.join(root,'evidence'),{recursive:true}); fs.writeFileSync(path.join(root,'evidence/validation-results.json'),JSON.stringify(out,null,2)+'\n','utf8'); console.log(JSON.stringify(out,null,2));
