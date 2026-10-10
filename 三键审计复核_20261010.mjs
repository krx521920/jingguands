/** Node 24；独立审计，不回写 A、Gold 或冻结批次。只使用指定仓库的公开批次。 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const args={};
for(let i=2;i<process.argv.length;i+=2){
  assert.ok(['--wei-root','--out','--old-batch','--new-batch','--parses-map'].includes(process.argv[i])&&process.argv[i+1],'参数需成对提供');
  args[process.argv[i]]=process.argv[i+1];
}
assert.ok(args['--wei-root']&&args['--out'],'用法：node 三键审计复核_20261010.mjs --wei-root <魏仓库> --out <结果.json>');
const root=resolve(args['--wei-root']),sources=[],sha=x=>createHash('sha256').update(x).digest('hex');
const oldBatch=args['--old-batch']??'runs/batch-20261005T063943/envelopes';
const newBatch=args['--new-batch']??'runs/batch-20261008T010943/envelopes';
function read(path){const b=readFileSync(resolve(root,path));sources.push({path,sha256:sha(b)});return JSON.parse(b.toString('utf8').replace(/^\uFEFF/,''));}
const normPath='tools/fang-d7/src_D7/normalization_D7.mts';
const {inspectField,eventContext,resolveUnitHints,canonicalDecimal}=await import(pathToFileURL(resolve(root,normPath)).href);
for(const p of [normPath,'tools/fang-d7/src_D7/decimal_D7.mts'])sources.push({path:p,sha256:sha(readFileSync(resolve(root,p)))});
const map=read(args['--parses-map']??'runs/full-parses-map.json'),cache=new Map();
const keys=['source_type','table_ref','header_path'];
const count=xs=>xs.reduce((o,k)=>(o[k]=(o[k]??0)+1,o),{});
function inlineParse(env){
  const blocks=env.source?.parse_meta?.blocks;if(!Array.isArray(blocks))return null;
  const pages=new Map();for(const b of blocks){if(!pages.has(b.page))pages.set(b.page,{page:b.page,blocks:[]});pages.get(b.page).blocks.push(b);}
  return {doc:{file_sha256:env.source.file_sha256},pages:[...pages.values()]};
}
function complete(parse){const bs=parse?.pages?.flatMap(p=>p.blocks??[])??[];return bs.length>0&&bs.every(b=>keys.every(k=>Object.hasOwn(b,k)));}
function selectParse(env,external){
  const own=inlineParse(env);
  if(complete(own))return {parse:own,source:'envelope_three_keys',reason:null};
  if(external){
    if(external.doc?.file_sha256!==env.source?.file_sha256)return {parse:null,source:'unavailable',reason:'PARSER_SOURCE_MISMATCH'};
    // 原解析的表头可只在 table_ref 内；段落的无表头按 null 表示，不虚构文字。
    const projected={...external,pages:(external.pages??[]).map(p=>({...p,blocks:(p.blocks??[]).map(b=>({...b,header_path:b.header_path??b.table_ref?.header_path??null}))}))};
    if(complete(projected))return {parse:projected,source:'parses_map',reason:null};
  }
  return {parse:own,source:'legacy_incomplete',reason:'LEGACY_METADATA_UNAVAILABLE_NOT_A_DEFECT'};
}
function indexOf(env,selected){
  if(!selected.parse)return new Map();
  assert.equal(selected.parse.doc.file_sha256,env.source.file_sha256,'解析必须同源');
  const out=new Map();for(const p of selected.parse.pages)for(const b of p.blocks??[]){assert.ok(!out.has(b.block_id),'重复块号');out.set(b.block_id,{...b,page:b.page??p.page});}return out;
}
function anchor(env,field,index,code){
  const refs=Array.isArray(field.provenance)?field.provenance:[],valid=[];let bad=false;
  for(const p of refs){
    const b=index.get(p.block_id);
    if(!b||b.page!==p.page||b.degraded===true||p.degraded===true||p.file_sha256&&p.file_sha256!==env.source.file_sha256||typeof p.quote!=='string'||!p.quote.trim()||typeof b.text_raw!=='string'||!b.text_raw.includes(p.quote)){bad=true;continue;}
    valid.push({p,b});
  }
  if(!valid.length)return {strength:'unknown',basis:'unverified_reference',references:[]};
  if(bad)return {strength:'unknown',basis:'partially_unverified_reference',references:[]};
  const refsOut=valid.map(({p,b})=>({block_id:p.block_id,page:p.page,quote:p.quote,source_type:b.source_type??null,table_ref:b.table_ref??null,header_path:b.header_path??null}));
  if(code==='UNIT_CONFLICT')return {strength:'conflict',basis:'conflict',references:refsOut};
  if(/\d\s*(亿股|万股|股|亿元|万元|元|%)/u.test(String(field.raw_value??'')))return {strength:'strong',basis:'quote_internal',references:refsOut};
  const grades=valid.map(({p,b})=>{
    if(!keys.every(k=>Object.hasOwn(b,k)))return ['unknown','legacy_metadata_unavailable'];
    if(b.source_type==='cell'&&p.source_type==='cell'&&b.table_ref&&typeof p.table_id==='string'&&typeof p.cell_ref==='string'&&p.table_id===b.table_ref.table_id&&p.cell_ref===b.table_ref.cell_ref)return ['strong','cell_header'];
    if(b.source_type==='cell'&&b.table_ref&&(p.table_id!==b.table_ref.table_id||p.cell_ref!==b.table_ref.cell_ref))return ['conflict','locator_conflict'];
    if(typeof b.header_path==='string'&&b.header_path.trim())return ['medium','block_header'];
    if(b.table_ref)return ['weak','table_hint'];
    return ['none','none'];
  });
  const order=['conflict','unknown','none','weak','medium','strong'];grades.sort((a,b)=>order.indexOf(a[0])-order.indexOf(b[0]));
  return {strength:grades[0][0],basis:grades[0][1],references:refsOut};
}
function audit(env,selected){
  const original=JSON.stringify(env),index=indexOf(env,selected);
  const unit=selected.parse?resolveUnitHints(env,selected.parse):{hints:{},evidence:[]};
  const rows=[];
  for(const ev of env.events)for(const [name,f] of Object.entries(ev.fields)){
    if(!['shares','percent','cny'].includes(f.unit)||!['extracted','needs_review'].includes(f.status))continue;
    const raw=inspectField(name,f,null,eventContext(ev)),r=inspectField(name,f,unit.hints[`${ev.event_id}.${name}`]??null,eventContext(ev));
    const a=anchor(env,f,index,r.code);
    rows.push({event:ev.event_id,field:name,input_status:f.status,input_value:f.value,raw_value:f.raw_value,
      without_header_code:raw.code,with_header_code:r.code,evidence_strength:a.strength,unit_basis:a.basis,
      normalized_value:r.value,source_unit:r.source_unit,normalization_verified:r.status==='normalized',
      numeric_equal:r.value!==null&&canonicalDecimal(f.value)===r.value,
      status_write_performed:false,
      excluded_from_numeric_comparison:r.status!=='normalized'||!['strong','medium'].includes(a.strength),
      source:selected.source,source_issue:selected.reason,unit_evidence:unit.evidence.filter(x=>x.key===`${ev.event_id}.${name}`),references:a.references});
  }
  assert.equal(JSON.stringify(env),original,'不得更改输入信封');return rows;
}
function summary(rows){return {numeric_observations:rows.length,without_headers:count(rows.map(x=>x.without_header_code)),with_headers:count(rows.map(x=>x.with_header_code)),strength:count(rows.map(x=>x.evidence_strength)),unit_basis:count(rows.map(x=>x.unit_basis)),normalization_verified:rows.filter(x=>x.normalization_verified).length,verified_value_mismatches:rows.filter(x=>x.normalization_verified&&!x.numeric_equal).length,excluded_from_numeric_comparison:rows.filter(x=>x.excluded_from_numeric_comparison).length};}
function batch(path,withMap){
  const docs=[],rows=[],skipped=[];
  for(const file of readdirSync(resolve(root,path)).filter(f=>f.endsWith('.json')).sort()){
    const id=file.slice(0,-5),env=read(path+'/'+file);
    if(id==='pledge-scan-degrade'){skipped.push({case:id,reason:'扫描降级单列，不进入可读数值分母'});continue;}
    let external=null;if(withMap&&map[id]){if(!cache.has(id))cache.set(id,read(map[id]));external=cache.get(id);}
    const selected=selectParse(env,external),r=audit(env,selected).map(x=>({case:id,...x}));
    rows.push(...r);docs.push({case:id,run_id:env.run_id,file_sha256:env.source.file_sha256,source:selected.source,source_issue:selected.reason,numeric_observations:r.length});
  }
  return {path,documents:docs,skipped,summary:summary(rows),rows};
}
// 同一输入只切换证据入口；不把新旧批次的事件顺序或字段状态当成不变。
const old=batch(oldBatch,true),fresh=batch(newBatch,false),legacy=batch(oldBatch,false);
const historical=read('runs/D7-normalization-audit-20261005.json');
const oldRows=new Map(old.rows.map(r=>[`${r.case}/${r.event}/${r.field}`,r]));
const missing=historical.changes.filter(x=>x.code==='UNIT_MISSING').map(x=>{
  const r=oldRows.get(`${x.case}/${x.event}/${x.field}`);assert.ok(r,'历史字段必须逐一对应');
  assert.equal(r.without_header_code,x.code);assert.equal(canonicalDecimal(r.input_value),canonicalDecimal(x.before.value));assert.equal(r.input_status,x.before.status);return r;
});
assert.equal(old.rows.length,legacy.rows.length);
for(let i=0;i<old.rows.length;i++)assert.equal(old.rows[i].without_header_code,legacy.rows[i].with_header_code,'旧投影无表头的数值路径应相同');
const correctedAnchors=missing.filter(x=>['strong','medium'].includes(x.evidence_strength));
// 内置兼容性反向检查：真实 null、老缺键、错误出处均不能变成虚假的已验证。
const example={schema_version:'0.3',source:{file_sha256:'test-sha',parse_meta:{blocks:[{block_id:'b',page:1,text_raw:'100',source_type:'cell',table_ref:{table_id:'t',cell_ref:'r1c1'},header_path:'数量（股）'}]}},events:[{event_id:'E01',event_type:'equity_change',fields:{shares_after:{status:'extracted',standardized:true,value:100,raw_value:'100',unit:'shares',provenance:[{block_id:'b',page:1,quote:'100',source_type:'cell',table_id:'t',cell_ref:'r1c1'}]}}}]};
const probeResults=[];
function probe(name,fn){fn();probeResults.push({name,pass:true});}
probe('cell_strong_and_explicit_unit',()=>{const x=audit(example,selectParse(example,null))[0];assert.equal(x.evidence_strength,'strong');assert.equal(x.with_header_code,'NORMALIZED');});
probe('paragraph_null_is_valid_none',()=>{const e=structuredClone(example),b=e.source.parse_meta.blocks[0],p=e.events[0].fields.shares_after.provenance[0];b.source_type=p.source_type='paragraph';b.table_ref=b.header_path=null;delete p.table_id;delete p.cell_ref;const x=audit(e,selectParse(e,null))[0];assert.equal(x.evidence_strength,'none');assert.equal(x.source_issue,null);});
probe('cell_null_header_anchor_is_not_unit',()=>{const e=structuredClone(example);e.source.parse_meta.blocks[0].header_path=null;const x=audit(e,selectParse(e,null))[0];assert.equal(x.evidence_strength,'strong');assert.equal(x.with_header_code,'UNIT_MISSING');assert.equal(x.excluded_from_numeric_comparison,true);});
probe('legacy_missing_keys_unknown_not_defect',()=>{const e=structuredClone(example);for(const k of keys)delete e.source.parse_meta.blocks[0][k];const x=audit(e,selectParse(e,null))[0];assert.equal(x.evidence_strength,'unknown');assert.equal(x.source_issue,'LEGACY_METADATA_UNAVAILABLE_NOT_A_DEFECT');});
probe('legacy_fallback_used_for_units_not_only_labels',()=>{const e=structuredClone(example);for(const k of keys)delete e.source.parse_meta.blocks[0][k];const x=audit(e,selectParse(e,inlineParse(example)))[0];assert.equal(x.source,'parses_map');assert.equal(x.with_header_code,'NORMALIZED');});
probe('parse_nested_header_supported',()=>{const e=structuredClone(example),p=structuredClone(inlineParse(example));p.pages[0].blocks[0].table_ref.header_path=p.pages[0].blocks[0].header_path;delete p.pages[0].blocks[0].header_path;for(const k of keys)delete e.source.parse_meta.blocks[0][k];assert.equal(audit(e,selectParse(e,p))[0].with_header_code,'NORMALIZED');});
probe('wrong_source_hash_rejected',()=>{const e=structuredClone(example);for(const k of keys)delete e.source.parse_meta.blocks[0][k];const p=inlineParse(example);p.doc.file_sha256='wrong';assert.equal(selectParse(e,p).reason,'PARSER_SOURCE_MISMATCH');assert.equal(audit(e,selectParse(e,p))[0].evidence_strength,'unknown');});
probe('wrong_quote_cannot_be_strong',()=>{const e=structuredClone(example);e.events[0].fields.shares_after.provenance[0].quote='999';assert.equal(audit(e,selectParse(e,null))[0].evidence_strength,'unknown');});
probe('wrong_page_cannot_be_strong',()=>{const e=structuredClone(example);e.events[0].fields.shares_after.provenance[0].page=2;assert.equal(audit(e,selectParse(e,null))[0].evidence_strength,'unknown');});
probe('wrong_cell_rejected',()=>{const e=structuredClone(example);e.events[0].fields.shares_after.provenance[0].cell_ref='r1c2';const x=audit(e,selectParse(e,null))[0];assert.equal(x.evidence_strength,'conflict');assert.equal(x.with_header_code,'UNIT_MISSING');});
probe('duplicate_block_rejected',()=>{const e=structuredClone(example);e.source.parse_meta.blocks.push(structuredClone(e.source.parse_meta.blocks[0]));assert.throws(()=>audit(e,selectParse(e,null)),/重复块号/);});
const thisPath=fileURLToPath(import.meta.url);sources.push({owner:'delivery',path:thisPath.split(/[\\/]/).pop(),sha256:sha(readFileSync(thisPath))});
sources.push({owner:'delivery',path:'核验方法章节_D13.md',sha256:sha(readFileSync(resolve(dirname(thisPath),'核验方法章节_D13.md')))});
const dedup=[...new Map(sources.map(s=>[(s.owner??'wei')+'/'+s.path,s])).values()];
const inputFingerprint=sha(JSON.stringify(dedup.filter(s=>s.owner!=='delivery').map(s=>[s.path,s.sha256]).sort((a,b)=>a[0]<b[0]?-1:1)));
const report={schema_version:'fang.three-keys-audit/1.0',checked_on:new Date().toISOString(),business_date:'2026-10-10',node:process.version,
  provenance:{repository:'https://github.com/krx521920/jingguands',reference_branch:'inbox/weiwenyu-20261010',reference_commit:'2cf52956248244571c1f622fad7e17b302b70778',note:'来源哈希为实际输入；reference_commit 为交付时固定提交，换目录复跑须自行核对版本。'},
  historical_comparison:{historical_summary:historical.summary,old_batch:oldBatch,old_missing_count:missing.length,after_anchor_strength:count(missing.map(x=>x.evidence_strength)),corrected_no_anchor_assessments:correctedAnchors.length,after_unit_codes:count(missing.map(x=>x.with_header_code)),note:'锚点定位与单位数值复算分开；strong 不等于已完成独立换算，原信封状态保持。'},
  old_replay:old,new_replay:fresh,legacy_without_map:{path:oldBatch,summary:legacy.summary,source_issue:'LEGACY_METADATA_UNAVAILABLE_NOT_A_DEFECT'},
  compatibility:{probes:probeResults,inputs_unchanged:true,new_envelopes_used_inline_only:true,no_numeric_values_written:true},
  input_fingerprint_sha256:inputFingerprint,sources:dedup,
  boundaries:{model_calls:0,gold_modified:false,frozen_envelopes_modified:false,web_verify_sidecars_generated:false,web_verified:false,anchor_is_not_numeric_verification:true}};
writeFileSync(resolve(args['--out']),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({historical:report.historical_comparison,old:old.summary,new:fresh.summary,legacy:legacy.summary,probes:probeResults.length},null,2));
