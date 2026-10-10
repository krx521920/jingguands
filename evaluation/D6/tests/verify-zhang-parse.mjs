import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'dev','manifest.json'),'utf8'));
const remoteBase='https://raw.githubusercontent.com/krx521920/jingguands/932f1dc9f0695e2e06cb138aad770d40c2a75265/corpus/zhangzhibo/d6/parse';
const rows=[]; const issues=[];
const blockMap=(doc)=>{const m=new Map(); for(const p of doc.pages??[]) for(const b of p.blocks??[]) m.set(b.block_id,b); return m};
const blockText=(b)=>`${b.text??''}\n${b.text_raw??''}`;
const digest=(b)=>createHash('sha256').update(b).digest('hex');
for(const item of manifest.items){
  const localPath=path.join(root,'dev',item.raw); const localBytes=fs.readFileSync(localPath); const local=JSON.parse(localBytes.toString('utf8'));
  const remoteName=`bid-${item.case_id.slice(-3)}.parse.json`;
  const res=await fetch(`${remoteBase}/${remoteName}`,{headers:{'User-Agent':'codex-eval'}}); if(!res.ok) throw new Error(`${item.case_id} remote parse ${res.status}`);
  const remoteBytes=Buffer.from(await res.arrayBuffer()); const remote=JSON.parse(remoteBytes.toString('utf8'));
  const hashMatches=local.doc.file_sha256===item.source_hash && remote.doc.file_sha256===item.source_hash;
  const schemaMatches=local.schema_version==='evidence/0.9' && remote.schema_version==='evidence/0.9';
  if(!hashMatches) issues.push({case_id:item.case_id,issue:'source_hash_mismatch'});
  if(!schemaMatches) issues.push({case_id:item.case_id,issue:'schema_mismatch'});
  const localBlocks=blockMap(local), remoteBlocks=blockMap(remote); const gold=JSON.parse(fs.readFileSync(path.join(root,'dev',item.gold),'utf8'));
  const candidates=[];
  for(const ev of gold.events) for(const [field,fv] of Object.entries(ev.fields??{})) if(fv.provenance?.length && (fv.status==='extracted'||fv.status==='needs_review')) candidates.push({event_id:ev.event_id,field,provenance:fv.provenance[0],value:fv.value,status:fv.status});
  candidates.sort((a,b)=>`${a.event_id}.${a.field}`.localeCompare(`${b.event_id}.${b.field}`));
  if(candidates.length<2) issues.push({case_id:item.case_id,issue:'fewer_than_two_evidence_candidates'});
  for(const c of candidates.slice(0,2)){
    const localBlock=localBlocks.get(c.provenance.block_id), remoteBlock=remoteBlocks.get(c.provenance.block_id);
    const localOk=Boolean(localBlock && localBlock.page===c.provenance.page && blockText(localBlock).includes(c.provenance.quote));
    const remoteOk=Boolean(remoteBlock && remoteBlock.page===c.provenance.page && blockText(remoteBlock).includes(c.provenance.quote));
    if(!localOk) issues.push({case_id:item.case_id,field:c.field,issue:'local_evidence_failed'});
    if(!remoteOk) issues.push({case_id:item.case_id,field:c.field,issue:'zhang_evidence_failed'});
    rows.push({case_id:item.case_id,event_id:c.event_id,field:c.field,page:c.provenance.page,block_id:c.provenance.block_id,quote:c.provenance.quote,local_evidence:localOk?'PASS':'FAIL',zhang_evidence:remoteOk?'PASS':'FAIL',source_hash_match:hashMatches,schema_match:schemaMatches,local_file_sha256:digest(localBytes),zhang_file_sha256:digest(remoteBytes)});
  }
}
const out={checked_on:'2026-10-02',source_commit:'932f1dc9f0695e2e06cb138aad770d40c2a75265',documents:manifest.items.length,spot_checks:rows.length,passed:rows.filter(r=>r.local_evidence==='PASS'&&r.zhang_evidence==='PASS').length,failed:rows.filter(r=>r.local_evidence!=='PASS'||r.zhang_evidence!=='PASS').length,source_hash_matches:rows.filter(r=>r.source_hash_match).length/2,schema_matches:rows.filter(r=>r.schema_match).length/2,issues,rows};
fs.writeFileSync(path.join(root,'evidence','zhang-parse-spot-checks.json'),JSON.stringify(out,null,2)+'\n','utf8'); console.log(JSON.stringify({documents:out.documents,spot_checks:out.spot_checks,passed:out.passed,failed:out.failed,source_hash_matches:out.source_hash_matches,schema_matches:out.schema_matches,issues},null,2));
