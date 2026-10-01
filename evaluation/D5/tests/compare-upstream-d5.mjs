import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dev', 'manifest.json'), 'utf8'));
const upstreamDir = path.join(root, 'evidence', 'upstream');
const reportPath = path.join(upstreamDir, 'batch_report.json');
const report = fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, 'utf8')) : null;
const strictKey = (event) => [event.fields?.holder?.value, event.fields?.direction?.value, event.fields?.shares_before?.value].join('|');
const numericKey = (event) => [event.fields?.direction?.value, event.fields?.shares_before?.value, event.fields?.shares_after?.value, event.fields?.change_shares?.value].join('|');
const valueOf = (name, field) => name === 'change_shares' && typeof field?.value === 'number' ? Math.abs(field.value) : field?.value;
function alignEvents(goldEvents, upstreamEvents) {
  const records = [];
  const used = new Set();
  for (const gold of goldEvents) {
    let index = upstreamEvents.findIndex((event, i) => !used.has(i) && strictKey(event) === strictKey(gold));
    let alignment = 'exact_key';
    if (index === -1 && goldEvents.length === 1 && upstreamEvents.length === 1) { index = 0; alignment = 'single_event_fallback'; }
    if (index === -1) {
      const candidates = upstreamEvents.map((event, i) => ({ event, i })).filter(({ event, i }) => !used.has(i) && numericKey(event) === numericKey(gold));
      if (candidates.length === 1) { index = candidates[0].i; alignment = 'numeric_fallback'; }
    }
    if (index === -1) { records.push({ gold, upstream:null, alignment:'missing_event', identity_diff:true }); continue; }
    used.add(index);
    const upstream = upstreamEvents[index];
    records.push({ gold, upstream, alignment, identity_diff: strictKey(gold) !== strictKey(upstream) });
  }
  return { records, extras: upstreamEvents.filter((_, i) => !used.has(i)) };
}
function compareFields(gold, upstream) {
  const differences=[]; let extracted=0,hits=0,statusDiffs=0,wrongFilled=0,missingValues=0;
  for (const [name,goldField] of Object.entries(gold.fields ?? {})) {
    const upstreamField=upstream?.fields?.[name];
    if(!upstreamField){differences.push({field:name,verdict:'MISSING_FIELD'});continue}
    const goldHasValue=goldField.status==='extracted'||(goldField.status==='needs_review'&&goldField.value!==null);
    const upstreamHasValue=upstreamField.status==='extracted'||(upstreamField.status==='needs_review'&&upstreamField.value!==null);
    if(goldHasValue) extracted++;
    if(goldField.status!==upstreamField.status){
      statusDiffs++; if(!goldHasValue&&upstreamHasValue) wrongFilled++; if(goldHasValue&&!upstreamHasValue) missingValues++;
      differences.push({field:name,verdict:goldHasValue&&!upstreamHasValue?'MISSING_VALUE':!goldHasValue&&upstreamHasValue?'WRONG_FILLED':'STATUS_DIFF',gold:goldField.status,upstream:upstreamField.status}); continue;
    }
    if(goldHasValue){const gv=valueOf(name,goldField),uv=valueOf(name,upstreamField); if(JSON.stringify(gv)===JSON.stringify(uv)) hits++; else differences.push({field:name,verdict:'VALUE_DIFF',gold:gv,upstream:uv});}
  }
  return {extracted,hits,statusDiffs,wrongFilled,missingValues,differences};
}
const cases=[]; let totalGoldEvents=0,totalUpstreamEvents=0,totalAligned=0,totalExact=0,totalFallback=0,totalMissingEvents=0,totalExtraEvents=0,totalExtracted=0,totalHits=0,totalStatusDiffs=0,totalWrongFilled=0,totalMissingValues=0;
for(const item of manifest.items){
  const upstreamPath=path.join(upstreamDir,`${item.case_id}.upstream.json`); if(!fs.existsSync(upstreamPath)) continue;
  const gold=JSON.parse(fs.readFileSync(path.join(root,'dev',item.gold),'utf8'));
  const upstream=JSON.parse(fs.readFileSync(upstreamPath,'utf8'));
  const aligned=alignEvents(gold.events,upstream.events??[]); const caseDiffs=[]; let caseExtracted=0,caseHits=0,caseStatusDiffs=0,caseWrongFilled=0,caseMissingValues=0;
  for(const record of aligned.records){
    if(!record.upstream){caseDiffs.push({event_id:record.gold.event_id,verdict:'MISSING_EVENT',key:strictKey(record.gold)});continue}
    if(record.identity_diff) caseDiffs.push({event_id:record.gold.event_id,verdict:'IDENTITY_DIFF',alignment:record.alignment,gold_key:strictKey(record.gold),upstream_key:strictKey(record.upstream)});
    const compared=compareFields(record.gold,record.upstream); caseExtracted+=compared.extracted; caseHits+=compared.hits; caseStatusDiffs+=compared.statusDiffs; caseWrongFilled+=compared.wrongFilled; caseMissingValues+=compared.missingValues;
    for(const diff of compared.differences) caseDiffs.push({event_id:record.gold.event_id,...diff});
  }
  for(const extra of aligned.extras) caseDiffs.push({event_id:extra.event_id,verdict:'EXTRA_EVENT',key:strictKey(extra)});
  totalGoldEvents+=gold.events.length; totalUpstreamEvents+=upstream.events?.length??0; totalAligned+=aligned.records.filter(r=>r.upstream).length; totalExact+=aligned.records.filter(r=>r.alignment==='exact_key').length; totalFallback+=aligned.records.filter(r=>r.alignment!=='exact_key'&&r.upstream).length; totalMissingEvents+=aligned.records.filter(r=>!r.upstream).length; totalExtraEvents+=aligned.extras.length; totalExtracted+=caseExtracted; totalHits+=caseHits; totalStatusDiffs+=caseStatusDiffs; totalWrongFilled+=caseWrongFilled; totalMissingValues+=caseMissingValues;
  cases.push({case_id:item.case_id,gold_events:gold.events.length,upstream_events:upstream.events?.length??0,aligned_events:aligned.records.filter(r=>r.upstream).length,exact_key_matches:aligned.records.filter(r=>r.alignment==='exact_key').length,fallback_matches:aligned.records.filter(r=>r.alignment!=='exact_key'&&r.upstream).length,missing_events:aligned.records.filter(r=>!r.upstream).length,extra_events:aligned.extras.length,extracted_fields:caseExtracted,value_hits:caseHits,status_diffs:caseStatusDiffs,wrong_filled:caseWrongFilled,missing_values:caseMissingValues,differences:caseDiffs});
}
const out={upstream_branch:'weiwenyu',upstream_commit:'55fd805dc30d317f18dae2fcae80f70845e481cf',upstream_batch:report?.stamp?`runs/batch-${report.stamp}`:null,baseline_reason:'Selected as the highest-accuracy observed ten-document batch; the newer 20261001T135159 and 20261001T135902 batches regressed and are recorded separately.',documents_compared:cases.length,gold_documents:manifest.items.length,gold_events:totalGoldEvents,upstream_events:totalUpstreamEvents,aligned_events:totalAligned,exact_key_matches:totalExact,fallback_matches:totalFallback,missing_events:totalMissingEvents,extra_events:totalExtraEvents,gold_extracted_fields:totalExtracted,value_hits:totalHits,field_accuracy:totalExtracted?Number((totalHits/totalExtracted).toFixed(4)):null,status_differences:totalStatusDiffs,wrong_filled:totalWrongFilled,missing_values:totalMissingValues,result:totalMissingEvents===0&&totalExtraEvents===0&&totalStatusDiffs===0&&totalHits===totalExtracted?'MATCH':'DIFF',cases};
fs.writeFileSync(path.join(root,'evidence','upstream-comparison.json'),JSON.stringify(out,null,2)+'\n','utf8'); console.log(JSON.stringify(out,null,2));
