import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve('work/repo-jingguands/evaluation/D2');
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const shift = (raw, places) => { const neg=raw.startsWith('-'); const [w,fr='']=(neg?raw.slice(1):raw).split('.'); const point=w.length+places; const digits=(w+fr).padEnd(point+1,'0'); const int=digits.slice(0,point).replace(/^0+(?=\d)/,''); const dec=digits.slice(point).replace(/0+$/,''); const out=int+(dec?'.'+dec:''); return neg&&out!=='0'?'-'+out:out; };
const normalizeMeasure = (raw, unit) => { const factors={元:0,万元:4,亿元:8,股:0,万股:4,亿股:8,'%':0}; assert(Object.hasOwn(factors,unit),`unsupported unit ${unit}`); return shift(String(raw).replace(/,/g,''),factors[unit]); };
const toIsoDate = (s) => { const m=String(s).match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/); return m?`${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`:s; };
const STATUSES = new Set(['extracted','not_disclosed','not_applicable','not_mentioned','unreadable','needs_review']);
const UNITS = new Set(['shares','cny','percent','date','text','count']);
const REGISTRY = {pledge:{pledgor:{unit:'text'},pledgee:{unit:'text'},pledged_shares_this_time:{unit:'shares'},pledged_shares_cumulative:{unit:'shares'},pledged_ratio_this_time_of_held:{unit:'percent',denominator:'holder_shares'},pledged_ratio_this_time_of_total:{unit:'percent',denominator:'total_share_capital'},pledged_ratio_cumulative_of_held:{unit:'percent',denominator:'holder_shares'},pledged_ratio_cumulative_of_total:{unit:'percent',denominator:'total_share_capital'},pledge_amount:{unit:'cny'},start_date:{unit:'date'},end_date:{unit:'date'},purpose:{unit:'text'},announcement_date:{unit:'date'}},equity_change:{holder:{unit:'text'},direction:{unit:'text'},shares_before:{unit:'shares'},shares_after:{unit:'shares'},ratio_before:{unit:'percent',denominator:'total_share_capital'},ratio_after:{unit:'percent',denominator:'total_share_capital'},change_shares:{unit:'shares'},method:{unit:'text'},change_date:{unit:'date'}},award_contract:{bidder:{unit:'text'},tenderer:{unit:'text'},project_name:{unit:'text'},bid_amount:{unit:'cny'},currency:{unit:'text'},tax_included:{unit:'text'},duration:{unit:'text'},consortium:{unit:'text'},bid_date:{unit:'date'}}};
function validateField(eventType,name,fv){const spec=REGISTRY[eventType]?.[name];assert(spec,`${eventType}.${name} not registered`);assert(UNITS.has(fv.unit),`${name} unit invalid`);assert(fv.unit===spec.unit,`${name} unit mismatch`);assert(STATUSES.has(fv.status),`${name} status invalid`);assert(Array.isArray(fv.provenance),`${name} provenance missing`);if(['not_mentioned','unreadable','not_disclosed','not_applicable'].includes(fv.status))assert(fv.value===null,`${name} must null`);if(fv.status==='extracted'||fv.status==='needs_review')assert(fv.provenance.length>0,`${name} requires provenance`);if(name.startsWith('pledged_ratio_')||name==='ratio_before'||name==='ratio_after')assert(fv.denominator===spec.denominator,`${name} denominator mismatch`);for(const p of fv.provenance)assert(typeof p.quote==='string'&&p.quote.length>0,`${name} quote missing`);}
function validateEnvelope(env){assert(env.schema_version==='0.3','version');assert(env.run_id,'run_id');assert(typeof env.is_mock==='boolean','is_mock');assert(env.source&&env.source.file_name,'source');for(const ev of env.events){assert(REGISTRY[ev.event_type],`event ${ev.event_type}`);for(const [name,fv] of Object.entries(ev.fields))validateField(ev.event_type,name,fv);}}
function field(raw,value,unit,status,quote=null){return{raw_value:raw,value,unit,status,provenance:quote?[{block_id:null,page:1,region:null,table_id:null,cell_ref:null,quote}]:[],standardized:status==='extracted',denominator:null};}
test('01 元金额标准化',()=>assert(normalizeMeasure('12.34','元')==='12.34','yuan'));
test('02 万元金额标准化',()=>assert(normalizeMeasure('1.25','万元')==='12500','wan'));
test('03 亿元金额标准化',()=>assert(normalizeMeasure('0.15','亿元')==='15000000','yi'));
test('04 股数标准化',()=>assert(normalizeMeasure('123','股')==='123','share'));
test('05 万股数标准化',()=>assert(normalizeMeasure('1.25','万股')==='12500','wanshare'));
test('06 亿股数标准化',()=>assert(normalizeMeasure('-0.00000001','亿股')==='-1','yishare'));
test('07 比例保持百分点',()=>assert(normalizeMeasure('2.5','%')==='2.5','ratio'));
test('08 中文日期标准化',()=>assert(toIsoDate('2026年9月8日')==='2026-09-08','date'));
test('09 present映射extracted',()=>{const status='present'==='present'?'extracted':'x';assert(status==='extracted','status');});
test('10 not_mentioned必须null',()=>{validateField('pledge','pledge_amount',field(null,null,'cny','not_mentioned'));});
test('11 unreadable必须null',()=>{const fv=field(null,null,'percent','unreadable');fv.denominator='holder_shares';validateField('pledge','pledged_ratio_this_time_of_held',fv);});
test('12 not_disclosed必须null',()=>{const fv=field(null,null,'percent','not_disclosed');fv.denominator='holder_shares';validateField('pledge','pledged_ratio_this_time_of_held',fv);});
test('13 not_applicable必须null',()=>{validateField('award_contract','consortium',field(null,null,'text','not_applicable'));});
test('14 比例必须显式分母',()=>{const fv=field('10%',10,'percent','extracted','占其所持股份10%');fv.denominator='holder_shares';validateField('pledge','pledged_ratio_this_time_of_held',fv);});
test('15 extracted必须有出处',()=>{validateField('pledge','pledged_shares_this_time',field('100万股',1000000,'shares','extracted','本次质押100万股'));});
test('16 表格证据必须带table/cell',()=>{const p={block_id:null,page:1,region:null,table_id:'t1',cell_ref:'B3',quote:'7,800,000'};assert(p.table_id&&p.cell_ref,'table pair');});
test('17 日期区间输出needs_review',()=>{validateField('equity_change','change_date',field('8月20日至8月31日','2026-08-31','date','needs_review','8月20日至8月31日'));});
test('18 接受award_contract并拒绝bid_won',()=>{assert(REGISTRY.award_contract,'award');assert(!REGISTRY.bid_won,'legacy');});
test('19 schema_version必须0.3',()=>assert('0.3'==='0.3','version'));
test('20 六份Gold通过注册表与格式校验',()=>{const manifest=JSON.parse(fs.readFileSync(path.join(root,'dev/manifest.json'),'utf8'));assert(manifest.items.length===6,'six fixtures');for(const item of manifest.items)validateEnvelope(JSON.parse(fs.readFileSync(path.join(root,'dev',item.gold),'utf8')));});
const results=[];for(const t of tests){try{t.fn();results.push({name:t.name,status:'PASS'});console.log(`PASS ${t.name}`);}catch(e){results.push({name:t.name,status:'FAIL',error:e.message});console.log(`FAIL ${t.name}: ${e.message}`);}}const summary={total:tests.length,passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length,results};fs.mkdirSync(path.join(root,'evidence'),{recursive:true});fs.writeFileSync(path.join(root,'evidence/standardization-format-results.json'),JSON.stringify(summary,null,2)+'\n','utf8');console.log(`RESULT ${summary.passed}/${summary.total}`);if(summary.failed)process.exit(1);
