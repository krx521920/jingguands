import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalize, inspectField, normalizeFieldValue, normalizeEnvelope, canonicalDecimal, resolveUnitHints } from '../src_D7/normalization_D7.mts';
import { summarizeSamples } from '../src_D7/statistics_D7.mts';
import { buildAlignmentPair } from '../src_D7/alignment_D7.mts';
import { envelope, field, missing, sample } from './fixtures_D7.mjs';
const legacy = JSON.parse(readFileSync(new URL('./legacy_cases_D7.json', import.meta.url)));
for (const c of legacy) test('D2兼容 ' + c.id, () => c.inputs.forEach((v,i) => { const n = normalize(v); for (const [k,expected] of Object.entries(c.expected[i])) assert.deepEqual(n[k], expected); }));
for (const [raw,unit,expected,hint,ctx,extra] of [
  ['人民币1.25万元','cny','12500'], ['合同约定人民币100万元','cny','1000000'], ['1.5亿元','cny','150000000',null,{currency:'CNY'}],
  ['0元','cny','0',null,{currency:'CNY'}], ['人民币9007199254740993.01元','cny','9007199254740993.01'], ['1,234万股','shares','12340000'], ['１．２５万股','shares','12500'], ['100','shares','1000000','万股'], ['0.005%','percent','0.005',null,{}, {denominator:'net_assets'}],
  ['不超过人民币2万元','cny','20000'], ['约为人民币1万元','cny','10000'], ['约0元','cny','0',null,{currency:'CNY'}],
]) test('复算 ' + raw, () => { const f=field(raw,'wrong',unit,extra); const before=structuredClone(f); const r=inspectField('test',f,hint??null,ctx??{}); assert.equal(r.status,'normalized',JSON.stringify(r)); assert.equal(r.value,expected); assert.deepEqual(f,before); });
for (const [label,raw,unit,code,hint,ctx,extra] of [
  ['外币首数字','173,800,000阿联酋迪拉姆（折合人民币317,915,000元）','cny','MULTI_CURRENCY_OR_FX'],
  ['外币错标','100万美元','cny','CURRENCY_CONFLICT'], ['币种上下文矛盾','100元','cny','CURRENCY_CONFLICT',null,{currency:'CNY',currencyRaw:'美元'}],
  ['缺币种','100万元','cny','CURRENCY_UNKNOWN'], ['裸数字','100','shares','UNIT_MISSING'], ['错单位','100万元','shares','UNIT_CONFLICT'],
  ['表头冲突','100股','shares','UNIT_HINT_CONFLICT','万股'], ['表头类型冲突','100股','shares','INVALID_UNIT_HINT','万元'],
  ['范围','100-200股','shares','MULTIPLE_OR_MISSING_NUMBERS'], ['多值','100股和200股','shares','MULTIPLE_OR_MISSING_NUMBERS'],
  ['前导日期','2026年100股','shares','MULTIPLE_OR_MISSING_NUMBERS'], ['错千分位','1,00股','shares','INVALID_NUMERIC_TOKEN'],
  ['科学计数','1e3股','shares','MULTIPLE_OR_MISSING_NUMBERS'], ['负余额','-100股','shares','NEGATIVE_VALUE'], ['小数股','0.1股','shares','NORMALIZATION_REJECTED'],
  ['缺分母','1%','percent','RATIO_BASIS_MISSING'], ['非比例分母','100股','shares','UNEXPECTED_DENOMINATOR',null,{}, {denominator:'other'}],
  ['暂定金额','暂定人民币100万元','cny','UNSUPPORTED_QUALIFIER'], ['无法读数','若干股','shares','MULTIPLE_OR_MISSING_NUMBERS'],
]) test('拒绝猜测 ' + label, () => { const f=field(raw,999,unit,extra); const r=inspectField('test',f,hint??null,ctx??{}); assert.equal(r.code,code); assert.equal(r.status,'blocked'); assert.equal(r.field.standardized,false); assert.equal(r.field.status,'needs_review'); assert.equal(r.field.value,999); assert.deepEqual(r.field.provenance,f.provenance); });
test('旧三参数API可调用并清除失败残标',()=>{const f=field('100',100,'shares');assert.match(normalizeFieldValue('shares_before',f),/UNIT_MISSING/);assert.equal(f.standardized,false);});
test('变动股数只在明确方向上下文采用绝对量',()=>{const f=field('-1万股',-10000,'shares');assert.equal(inspectField('change_shares',f,null,{eventType:'equity_change',direction:'decrease'}).value,'10000');assert.equal(inspectField('shares_before',f).status,'blocked');});
for(const status of ['not_disclosed','not_applicable','not_mentioned','unreadable'])test('空态保持 '+status,()=>{const f=missing('cny',status),r=inspectField('bid_amount',f);assert.deepEqual(r.field,f);assert.equal(r.value,null);});
test('空态残留值不伪装成功',()=>assert.equal(inspectField('bid_amount',{...missing('cny'),value:0}).code,'MISSING_WITH_VALUE'));
test('needs_review候选不升级',()=>assert.equal(inspectField('x',field('1万股',10000,'shares',{status:'needs_review'})).code,'INPUT_NEEDS_REVIEW'));
test('金额副本修复、原信封不变、再次运行幂等',()=>{const x=envelope();x.events[0].fields.bid_amount.value=100;const before=structuredClone(x);const r=normalizeEnvelope(x);assert.equal(r.envelope.events[0].fields.bid_amount.value,'1000000');assert.deepEqual(x,before);assert.deepEqual(normalizeEnvelope(r.envelope).envelope,r.envelope);});
test('不安全number和空值不转零',()=>{for(const v of [null,'',NaN,Infinity,9007199254740992])assert.equal(canonicalDecimal(v),null);});
test('统计不硬编码标准化为1且与Gold命中独立',()=>{const g=envelope();g.events[0].fields.bid_amount.value='100';const r=summarizeSamples([sample(g)]);assert.equal(r.field_value_agreement.rate,1);assert.equal(r.numeric_normalization_conditional.rate,0);});
test('文本标准化不混入数值分母',()=>{const r=summarizeSamples([sample()]);assert.equal(r.numeric_normalization_end_to_end.denominator,1);assert.ok(r.field_value_agreement.denominator>1);});
test('失败核心样本留在全部预期分母，条件分母另列',()=>{const g=envelope();const r=summarizeSamples([sample(g),sample(g,null,{case_id:'failed'})]);assert.equal(r.format_compliance.denominator,2);assert.equal(r.format_compliance.rate,0.5);assert.equal(r.numeric_normalization_end_to_end.rate,0.5);assert.equal(r.numeric_normalization_conditional.rate,1);});
test('四个空态都统计错误填充，零也算填入',()=>{const g=envelope(),a=structuredClone(g);for(const [i,status]of ['not_mentioned','not_disclosed','not_applicable','unreadable'].entries()){g.events[0].fields['empty'+i]=missing('text',status);a.events[0].fields['empty'+i]=field('0',0);}const r=summarizeSamples([sample(g,a)]);assert.equal(r.wrong_fill_all_empty_states.numerator,4);assert.equal(r.wrong_fill_legacy_two_states.numerator,2);});
test('无样本指标为null',()=>{const r=summarizeSamples([]);assert.equal(r.numeric_normalization_conditional.rate,null);assert.equal(r.format_compliance.rate,null);});
test('未知格式不能当成功',()=>assert.equal(summarizeSamples([sample(undefined,undefined,{format_valid:null})]).format_compliance.numerator,0));
test('对抗与扫描队列单列，失败项仍保留',()=>{const r=summarizeSamples([sample(),sample(null,null,{case_id:'adversary',cohort:'adversarial'}),sample(null,envelope(),{case_id:'scan',cohort:'scan'})]);assert.equal(r.input_count,3);assert.equal(r.cohorts.adversarial.failed,1);assert.equal(r.format_compliance.denominator,1);});
test('重复样本ID不能合并分母',()=>assert.throws(()=>summarizeSamples([sample(),sample()]),/DUPLICATE/));
test('重复事件不取第一条',()=>{const g=envelope(),a=structuredClone(g);a.events.push(structuredClone(a.events[0]));assert.equal(summarizeSamples([sample(g,a)]).event_coverage.numerator,0);});
test('同值不同分母不是命中',()=>{const g=envelope('pledge'),a=structuredClone(g);a.events[0].fields.pledged_ratio_this_time_of_total.denominator='holder_shares';assert.ok(summarizeSamples([sample(g,a)]).field_value_agreement.rate<1);});
for(const type of ['pledge','equity_change','award_contract'])test('B三类双侧保留 '+type,()=>{const l=envelope(type,'a'),r=envelope(type,'b'),before=structuredClone(l),b=buildAlignmentPair('p',{envelope:l,event_id:'E01'},{envelope:r,event_id:'E01'});assert.equal(b.alignment.status,'unknown');assert.equal(b.alignment.may_compare,false);assert.notEqual(b.left.locator,b.right.locator);assert.deepEqual(l,before);for(const [k,f]of Object.entries(l.events[0].fields))assert.deepEqual(b.left.observations[k].original,f);});
test('同公司不同项目不自动合并',()=>{const l=envelope(),r=envelope('award_contract','b');r.events[0].fields.project_name=field('二号项目','二号项目');assert.equal(buildAlignmentPair('p',{envelope:l,event_id:'E01'},{envelope:r,event_id:'E01'}).alignment.may_compare,false);});
test('B缺来源或歧义事件拒绝生成',()=>{const e=envelope();e.source.file_sha256=null;assert.throws(()=>buildAlignmentPair('p',{envelope:e,event_id:'E01'},{envelope:envelope(),event_id:'E01'}),/SOURCE_ID/);const a=envelope();a.events.push(structuredClone(a.events[0]));assert.throws(()=>buildAlignmentPair('p',{envelope:a,event_id:'E01'},{envelope:envelope(),event_id:'E01'}),/EVENT_NOT_UNIQUE/);});
test('CLI参数错误和模块导入兼容',()=>{const r=spawnSync(process.execPath,[fileURLToPath(new URL('../src_D7/cli_D7.mts',import.meta.url))],{encoding:'utf8'});assert.equal(r.status,2);assert.equal(r.stdout,'');assert.match(r.stderr,/用法/);});
test('比例描述的总股本不是单位股',()=>assert.equal(inspectField('ratio_before',field('占公司总股本1.25%','1.25','percent',{denominator:'total_share_capital'})).value,'1.25'));
test('显式评测映射支持事件ID重排，不参与B推断',()=>{const g=envelope(),a=structuredClone(g);a.events[0].event_id='E05';const r=summarizeSamples([sample(g,a,{event_map:{E01:'E05'}})]);assert.equal(r.field_value_agreement.rate,1);assert.equal(r.extra_events,0);});
test('事件映射不可多对一',()=>assert.throws(()=>summarizeSamples([sample(undefined,undefined,{event_map:{E01:'E01',E02:'E01'}})]),/ONE_TO_ONE/));
function located(){const e=envelope('pledge'),f=e.events[0].fields.pledged_shares_this_time;f.raw_value='100';f.provenance=[{block_id:'b1',source_type:'cell',page:1,table_id:'t1',cell_ref:'r2c1',quote:'100'}];const p={doc:{file_sha256:e.source.file_sha256},pages:[{page:1,blocks:[{block_id:'b1',page:1,source_type:'cell',text_raw:'100',table_ref:{table_id:'t1',cell_ref:'r2c1',header_path:'本次质押数量（万股）'}}]}]};return{e,p};}
test('表头单位凭同SHA、块、单元格和引用取得',()=>{const{e,p}=located(),h=resolveUnitHints(e,p);assert.equal(h.hints['E01.pledged_shares_this_time'],'万股');assert.equal(normalizeEnvelope(e,h.hints).envelope.events[0].fields.pledged_shares_this_time.value,'1000000');});
for(const[desc,mutate]of [['错页',p=>p.pages[0].blocks[0].page=2],['错列',p=>p.pages[0].blocks[0].table_ref.cell_ref='r2c2'],['出处不匹配',p=>p.pages[0].blocks[0].text_raw='200'],['无框失去列语义',p=>delete p.pages[0].blocks[0].table_ref],['降级',p=>p.pages[0].blocks[0].degraded=true]])test('不借单位 '+desc,()=>{const{e,p}=located();mutate(p);assert.deepEqual(resolveUnitHints(e,p).hints,{});});
test('解析文件SHA不同阻断',()=>{const{e,p}=located();p.doc.file_sha256='b'.repeat(64);assert.throws(()=>resolveUnitHints(e,p),/SOURCE_MISMATCH/);});
test('B可消费已定位表头，保留原始裸数字',()=>{const{e,p}=located();const b=buildAlignmentPair('p',{envelope:e,event_id:'E01',unit_hints:resolveUnitHints(e,p).hints},{envelope:envelope('pledge','b'),event_id:'E01'});assert.equal(b.left.observations.pledged_shares_this_time.normalized_value,'1000000');assert.equal(b.left.observations.pledged_shares_this_time.original.raw_value,'100');});
test('CLI三入口端到端可运行',()=>{const root=fileURLToPath(new URL('../',import.meta.url)),cli=fileURLToPath(new URL('../src_D7/cli_D7.mts',import.meta.url));for(const args of [['normalize','examples_D7/A_input_D7.json'],['metrics','examples_D7/metrics_input_D7.json'],['pair','example','examples_D7/A_input_D7.json','E01','examples_D7/A_input_D7.json','E01']]){const r=spawnSync(process.execPath,[cli,...args],{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.ok(JSON.parse(r.stdout).result);}});
test('重复事件ID不能借用同键表头',()=>{const e=envelope();e.events.push(structuredClone(e.events[0]));assert.throws(()=>normalizeEnvelope(e),/DUPLICATE_EVENT_ID/);});
