import fs from 'node:fs'; import path from 'node:path'; import { createHash } from 'node:crypto';
const root='evaluation/D8';
const dev=JSON.parse(fs.readFileSync('evaluation/dev-30/manifest.json','utf8'));
const sealed=JSON.parse(fs.readFileSync('evaluation/sealed/single/manifest.json','utf8'));
const sealedById=Object.fromEntries(sealed.cases.map(c=>[c.source_case_id,c]));
const sha=(p)=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const rawOf=(id)=>{const c=dev.cases.find(x=>x.case_id===id); if(!c)return null; return path.resolve('evaluation/dev-30',c.raw);};
const textOf=(id)=>{const p=rawOf(id); if(!p)return ''; const raw=JSON.parse(fs.readFileSync(p,'utf8')); let t=''; for(const pg of (raw.pages||[])){ if(typeof pg.text==='string')t+=pg.text+'\n'; for(const b of (pg.blocks||[]))t+=(b.text||'')+'\n'; } return t;};
function esc(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function issuerCode(t){const m=t.match(/(?:证券代码|股票代码)[:：]\s*([0-9]{5,6})/); return m?m[1]:(t.match(/\b(920580|600267)\b/)||[])[1]||null;}
function noticeNo(t){const m=t.match(/(?:公告编号|编号)[:：]?\s*([0-9]{4}-[0-9]{2,3})/); return m?m[1]:null;}
function company(t){const m=t.match(/((?:北京|上海|浙江|江苏|洛阳|天津|广东|武汉|成都|兰州|青海|内蒙古|山东|深圳|杭州|宁波|福建省?|安徽省?|河南省?|四川省?)[^\n，。]{2,20}?(?:股份有限公司|集团有限公司|有限公司))/); return m?m[1]:null;}
const meta=(id)=>({case_id:id,raw_sha256:sealedById[id]?sealedById[id].raw_sha256:sha(rawOf(id)),gold_sha256:sealedById[id]?sealedById[id].gold_sha256:null,issuer_code:issuerCode(textOf(id)),notice_number:noticeNo(textOf(id)),issuer_name:company(textOf(id))});
const DEG='pledge-scan-degrade';
const degradedMeta={case_id:DEG,raw_sha256:'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',gold_sha256:null,issuer_code:null,notice_number:null,issuer_name:null};
function g(group_id,members,expected_relation,test_purpose,relation_basis){const mm=members.map(m=>m===DEG?degradedMeta:meta(m));return {group_id,members,expected_relation,test_purpose,relation_basis,member_hashes:mm.map(m=>({case_id:m.case_id,raw_sha256:m.raw_sha256,gold_sha256:m.gold_sha256})),member_meta:mm};}
const groups=[
 g('D8-PAIR-001',['D5-EQC-001','D5-EQC-002'],'related','same event, two disclosure layers','科创新材 2026-09-23 协议转让：简式（出让方）与详式（受让方）报告书'),
 g('D8-PAIR-002',['D5-EQC-001','D5-EQC-003'],'related','same event, issuer report vs advisor review','科创新材 2026-09-23 协议转让：简式报告书与财务顾问核查意见'),
 g('D8-PAIR-003',['D5-EQC-002','D5-EQC-003'],'related','same event, same notice number','科创新材详式报告书与财务顾问核查意见（同为2025-097）'),
 g('D8-PAIR-004',['D5-EQC-004','D5-EQC-005'],'related','same event, transfer counterparties','海正药业协议转让：受让方与出让方双方报告书（72,673,907股）'),
 g('D8-PAIR-005',['D4-PLD-001','D4-PLD-002'],'unrelated','same type different issuer','万集科技 vs 兰石重装，不同主体'),
 g('D8-PAIR-006',['D5-EQC-006','D5-EQC-007'],'unrelated','same type different issuer','鸿路钢构 vs 红豆集团，不同主体'),
 g('D8-PAIR-007',['D6-AWD-001','D6-AWD-002'],'unrelated','same type different issuer','惠通科技 vs 金盾股份，不同主体'),
 g('D8-PAIR-008',['D4-PLD-003','D4-PLD-004'],'unrelated','same type different issuer','联创电子 vs 中国天楹，不同主体'),
 g('D8-PAIR-009',['D6-AWD-008','D6-AWD-009'],'unrelated','same type different issuer','蒙草生态 vs 大丰实业，不同主体'),
 g('D8-PAIR-010',['D4-PLD-006','D5-EQC-006'],'unrelated','cross type different issuer','质押 vs 权益变动，不同主体'),
 g('D8-PAIR-011',['D4-PLD-008','D6-AWD-007'],'unrelated','cross type different issuer','质押 vs 中标，不同主体'),
 g('D8-PAIR-012',['D5-EQC-009','D6-AWD-005'],'unrelated','cross type different issuer','权益变动 vs 中标联合体，不同主体'),
 g('D8-PAIR-013',[DEG,'D6-AWD-001'],'insufficient','degraded scan -> must not assert a conclusion','一侧为全页扫描降级（14字段全 unreadable、0可用字段），证据不足须输出信息不足'),
];
const out={
 sealed_set_id:'financial-events-d8-pair-dev-v0.1',
 created_on:'2026-10-04',
 mode:'public_dev_pairing_with_negative_controls',
 corpus:'evaluation/dev-30（30份公开开发集）+ 1份对抗扫描降级样本',
 total:groups.length,
 expectation_values:['related','unrelated','insufficient'],
 consumption:'兼容 B 流程清单格式：groups[].members / groups[].expected_relation；可直接作为 scripts/jingguan/verify_crossdoc.mjs --manifest 的输入',
 corpus_ceiling:{
   same_event_pairs_available:4,
   plan_target:6,
   note:'公开30份开发集仅含两个可核验同事件簇（科创新材3份、海正药业2份），同事件配对上界为 C(3,2)+C(2,2)=4；本清单据实交付 4 组同事件 + 8 组不同事件 + 1 组证据不足，不以虚构配对凑数。'
 },
 groups
};
fs.writeFileSync(path.join(root,'pairs','pairs.dev30.json'),JSON.stringify(out,null,2)+'\n','utf8');
console.log(JSON.stringify({total:out.total,related:groups.filter(x=>x.expected_relation==='related').length,unrelated:groups.filter(x=>x.expected_relation==='unrelated').length,insufficient:groups.filter(x=>x.expected_relation==='insufficient').length},null,2));


