/** D9 确定性归因：只读事实与出处；expected_verdict/category/attribution_basis 不参与判定。 */
import {decimal,compare,multiply,sum,normalizeStated,roundHalfUp} from './exact_D9.mjs';
import {alignDocuments} from '../vendor_D8/src_D8/matching_D8.mjs';
export const VERSION='D9.1';
const clone=x=>structuredClone(x),obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const text=x=>typeof x==='string'&&x.trim().length>0;
const norm=x=>String(x??'').normalize('NFKC').replace(/\s+/gu,'');
const eq=(a,b)=>norm(a)===norm(b),abs=v=>v?.startsWith('-')?v.slice(1):v;
const currencies={CNY:'CNY',RMB:'CNY',人民币:'CNY',USD:'USD',美元:'USD',HKD:'HKD',港元:'HKD',港币:'HKD',AED:'AED',阿联酋迪拉姆:'AED',迪拉姆:'AED',EUR:'EUR',欧元:'EUR',JPY:'JPY',日元:'JPY',GBP:'GBP',英镑:'GBP'};
const currency=v=>typeof v==='string'?currencies[v.trim().toUpperCase()]??null:null;
const currencyTokens=s=>[...new Set((String(s??'').match(/人民币|美元|港元|港币|阿联酋迪拉姆|迪拉姆|欧元|日元|英镑|(?<![A-Za-z])(?:CNY|RMB|USD|HKD|AED|EUR|JPY|GBP)(?![A-Za-z])/giu)??[]).map(currency))];
const dates=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const sameValue=(a,b)=>decimal(a)!==null&&decimal(b)!==null?decimal(a)===decimal(b):eq(a,b);
const qtext=f=>(f?.provenance??[]).map(p=>norm(p.quote)).join('');
function quotedNumber(q,v){
  const target=decimal(v);if(target===null)return false;
  return (String(q??'').normalize('NFKC').match(/-?\d[\d,]*(?:\.\d+)?/g)??[]).some(t=>decimal(t.replaceAll(',',''))===target||abs(decimal(t.replaceAll(',','')))===target);
}
function dateIn(q,d){if(!dates(d))return false;const [y,m,day]=d.split('-').map(Number);return norm(q).includes(d)||norm(q).includes(`${y}年${m}月${day}日`);}
function references(s,ps){return Array.isArray(ps)&&ps.length>0&&ps.every(p=>{
  const b=s.blocks?.get(p?.block_id);return b&&text(p.quote)&&!p.degraded&&!b.degraded&&b.source!=='OCR'
    &&Number.isInteger(p.page)&&p.page>0&&p.page===b.page&&norm(b.text_raw??b.text).includes(norm(p.quote))
    &&(p.file_sha256==null||p.file_sha256===s.sha);
});}
function fieldOK(s,f){return f?.status==='extracted'&&f.standardized!==false&&f.value!==null&&f.value!==undefined&&references(s,f.provenance);}
function fact(s,f){return obj(f)&&f.value!==null&&f.value!==undefined&&references(s,f.provenance)?f:null;}
function side(input,options){
  const x=obj(input)?clone(input):{},env=options.documents?.[x.case_id],parsed=options.parses?.[x.case_id];
  const s={input:x,env,sha:env?.source?.file_sha256??null,verified:false,issues:[],bindings:[],blocks:new Map(),value:decimal(x.value)};
  if(!text(x.case_id)||!text(x.field)||!text(x.unit)){s.issues.push('INVALID_SIDE_FIELDS');return s;}
  if(!env||env.schema_version!=='0.3'||!Array.isArray(env.events)||!text(env.run_id)||typeof env.is_mock!=='boolean'||!/^[a-f0-9]{64}$/i.test(s.sha??'')){
    s.issues.push('SOURCE_DOCUMENT_MISSING_OR_INVALID');return s;
  }
  if(env.source.file_id?.startsWith('sha256:')&&env.source.file_id.slice(7)!==s.sha){s.issues.push('SOURCE_SHA_MISMATCH');return s;}
  if(parsed&&parsed.doc?.file_sha256!==s.sha){s.issues.push('PARSE_SOURCE_MISMATCH');return s;}
  const bs=parsed?parsed.pages?.flatMap(p=>(p.blocks??[]).map(b=>({...b,page:b.page??p.page}))):env.source.parse_meta?.blocks;
  if(!Array.isArray(bs)||!bs.length){s.issues.push('PARSE_BLOCKS_MISSING');return s;}
  s.blocks=new Map(bs.map(b=>[b.block_id,b]));
  if(s.blocks.size!==bs.length){s.issues.push('DUPLICATE_BLOCK_ID');return s;}
  const block=s.blocks.get(x.block_id);s.block=block;
  if(!block||!text(x.quote)||block.degraded||block.source==='OCR'||!norm(block.text_raw??block.text).includes(norm(x.quote))){s.issues.push('QUOTE_NOT_VERIFIED');return s;}
  if(x.file_sha256!=null&&x.file_sha256!==s.sha){s.issues.push('SIDE_SHA_MISMATCH');return s;}
  if(x.page!=null&&x.page!==block.page){s.issues.push('SIDE_PAGE_MISMATCH');return s;}
  s.verified=true;
  for(const e of env.events){
    if(x.event_id!=null&&x.event_id!==e.event_id)continue;
    const f=e.fields?.[x.field],holder=e.fields?.holder??e.fields?.pledgor??e.fields?.bidder;
    if(fieldOK(s,f)&&sameValue(f.value,x.value)&&(!text(x.entity)||eq(holder?.value,x.entity)))s.bindings.push({event:e,field:f});
  }
  s.binding=s.bindings.length===1?s.bindings[0]:null;
  const raw=String(x.raw_value??'').normalize('NFKC'),ns=raw.match(/-?\d[\d,]*(?:\.\d+)?/g)??[];
  s.sourceUnit=raw.match(/(?:\d)\s*(亿股|万股|股|亿元|万元|元|%)/u)?.[1]??null;
  s.unitKind=['shares','股','万股','亿股'].includes(x.unit)?'shares':['percent','%','fraction'].includes(x.unit)?'ratio':['cny','CNY','元','万元','亿元','amount','AED','USD','HKD','EUR','JPY','GBP'].includes(x.unit)?'amount':null;
  s.normalized=s.value;
  if(s.sourceUnit&&/万|亿/u.test(s.sourceUnit)&&!norm(x.quote).includes(s.sourceUnit)&&!norm(block.header_path??block.table_ref?.header_path).includes(s.sourceUnit))s.issues.push('RAW_SCALE_NOT_IN_EVIDENCE');
  if(s.value!==null&&ns.length===1&&!quotedNumber(x.quote,abs(decimal(ns[0].replaceAll(',','')))))s.issues.push('RAW_NUMBER_NOT_IN_QUOTE');
  if(x.unit==='fraction')s.issues.push('FRACTION_REQUIRES_EXPLICIT_PERCENT_NORMALIZATION');
  if(['万元','亿元','万股','亿股'].includes(x.unit)&&!s.sourceUnit)s.issues.push('SCALED_UNIT_RAW_EVIDENCE_MISSING');
  if(s.value!==null&&ns.length===1&&s.sourceUnit&&s.unitKind){
    const rawNumber=decimal(ns[0].replaceAll(',',''));
    const rawMagnitude=x.field==='change_shares'?abs(rawNumber):rawNumber;
    const n=normalizeStated(rawMagnitude,s.sourceUnit,s.unitKind);s.rawNormalized=n;
    if(n===null)s.issues.push('RAW_UNIT_INVALID');
    else if(['万元','亿元','万股','亿股'].includes(x.unit)){
      // 显式原始单位：值须与原文量一致；标准化只是副本，不修改A。
      if(compare(s.value,rawMagnitude)!==0)s.issues.push('VALUE_RAW_MISMATCH');else s.normalized=n;
    }else if(compare(n,s.value)!==0)s.issues.push('VALUE_RAW_MISMATCH');
  }
  // 文本仅含一数却与抽取值矛盾：是抽取/标准化疑点，不能当成两份原文的业务矛盾。
  if(s.value!==null&&!s.binding&&ns.length===1&&!s.sourceUnit&&!quotedNumber(x.quote,s.value))s.issues.push('VALUE_NOT_SUPPORTED_BY_QUOTE');
  return s;
}
function observation(s){return {case_id:s.input.case_id??null,field:s.input.field??null,entity:s.input.entity??null,
  original_value:s.input.value??null,raw_value:s.input.raw_value??null,normalized_value:s.normalized??null,unit:s.input.unit??null,
  block_id:s.input.block_id??null,quote:s.input.quote??null,block_verified:s.verified,page:s.block?.page??null,
  region:s.block?.region??null,source_type:s.block?.source_type??s.input.source_type??null,
  table_id:s.block?.table_ref?.table_id??null,cell_ref:s.block?.table_ref?.cell_ref??null,header_path:s.block?.header_path??s.block?.table_ref?.header_path??null,
  file_sha256:s.sha,a_run_id:s.env?.run_id??null,code_version:s.env?.run_meta?.code_version??null,is_mock:s.env?.is_mock??null,
  a_event_ids:s.bindings.map(x=>x.event.event_id),a_field_provenance:s.binding?.field.provenance??[],
  binding_method:s.binding?(s.binding.field.provenance.some(p=>p.block_id===s.input.block_id)?'same_block_A_field':'independently_verified_A_field'):null,
  issues:s.issues};}
function dimension(s,key){const f=fact(s,s.input.caliber?.[key]);return f&&text(f.value)&&qtext(f).includes(norm(f.value))?f:null;}
function point(s){const f=fact(s,s.input.caliber?.time);return f&&dates(f.value)&&['as_of','period_start','period_end','event_date','publication_date'].includes(f.role)&&f.provenance.some(p=>dateIn(p.quote,f.value))?f:null;}
function scope(s){
  const f=dimension(s,'scope');if(f&&['single','cumulative'].includes(f.value))return f.value;
  const h=norm(s.block?.header_path??s.block?.table_ref?.header_path??'');
  if(s.binding&&/_this_time$/.test(s.input.field))return 'single';
  if(s.binding&&/_cumulative$/.test(s.input.field))return 'cumulative';
  if(/本次质押后质押股份|累计/u.test(h))return 'cumulative';
  if(/本次质押数量/u.test(h))return 'single';
  return null;
}
function denominator(s){
  const f=fact(s,s.input.caliber?.denominator);
  if(f&&['holder_shares','total_share_capital','net_assets','other'].includes(f.value)&&text(f.definition)
    &&f.provenance.some(p=>norm(p.quote).includes(norm(f.definition))))return {kind:f.value,definition:f.definition,refs:f.provenance};
  const d=s.binding?.field.denominator;if(['holder_shares','total_share_capital','net_assets','other'].includes(d))return {kind:d,definition:null,refs:s.binding.field.provenance};
  return null;
}
function moneyCurrency(s){
  const f=fact(s,s.input.caliber?.currency);if(f&&currency(f.value)&&currencyTokens(qtext(f)).includes(currency(f.value)))return currency(f.value);
  const cs=currencyTokens(s.input.raw_value);if(cs.length===1&&currencyTokens(s.input.quote).includes(cs[0]))return cs[0];
  const c=s.binding?.event.fields.currency;if(fieldOK(s,c)&&currency(c.value)&&currencyTokens(qtext(c)).includes(currency(c.value)))return currency(c.value);
  return null;
}
function tax(s){
  const quote=String(s.input.quote??''),custom=fact(s,s.input.caliber?.tax);
  const q=custom?qtext(custom):norm(quote);
  const readTax=q=>{
    if(/是否含税|含税(?:状态|口径)?(?:未知|不明|未披露)|未(?:明确|说明|披露).{0,8}含税/u.test(q))return null;
    const excluded=/不含税|未税/u.test(q),included=/含税/u.test(q.replace(/不含税|未税/gu,''));
    return excluded&&included?null:excluded?'excluded':included?'included':null;
  };
  const direct=readTax(q);if(direct)return direct;
  const t=s.binding?.event.fields.tax_included;
  return fieldOK(s,t)?readTax(qtext(t)):null;
}
function link(a,b){
  if(!a.verified||!b.verified)return {same:false};
  if(a.sha===b.sha&&a.binding&&b.binding&&a.binding.event.event_id===b.binding.event.event_id)return {same:true,atomic:true,method:'same_document_event'};
  const ka=dimension(a,'event_key'),kb=dimension(b,'event_key'),ia=dimension(a,'issuer_code'),ib=dimension(b,'issuer_code');
  const keyLabel=(s,f)=>f?.provenance.some(p=>new RegExp('(?:事件编号|协议编号|交易编号)[:：]?'+norm(f.value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![A-Za-z0-9_-])').test(norm(p.quote)));
  if(ka&&kb&&ia&&ib&&/^\d{6}$/.test(ia.value)&&ia.value===ib.value&&ka.value===kb.value&&keyLabel(a,ka)&&keyLabel(b,kb)
    &&/证券代码|股票代码/u.test(qtext(ia))&&/证券代码|股票代码/u.test(qtext(ib)))return {same:true,atomic:eq(a.input.entity,b.input.entity),method:'scoped_event_key'};
  if(!a.binding||!b.binding)return {same:false};
  const r=alignDocuments(a.env,b.env);const same=r.status==='same';
  const p=r.event_pairs?.find(x=>x.left.event_id===a.binding.event.event_id&&x.right.event_id===b.binding.event.event_id);
  return {same,atomic:!!p?.direct_field_alignment_allowed,method:'D8.2',d8:r,pair:p};
}
function transferParties(rel){const e=rel.d8?.evidence.find(e=>e.role==='signed_transfer_bundle');return e?{buyer:e.left.buyer.value,sellers:e.left.sellers.map(x=>x.value),date:e.left.date.value}:null;}
function sumParties(sides,rel,options){
  const p=transferParties(rel);if(!p)return null;const map=new Map(),evidence=[];
  for(const [case_id,env] of Object.entries(options.documents??{})){
    const r=alignDocuments(sides[0].env,env);if(r.status!=='same')continue;
    for(const ev of env.events??[]){
      const name=ev.fields?.holder?.value,f=ev.fields?.change_shares,d=ev.fields?.direction;
      if(!p.sellers.includes(name)||d?.value!=='decrease'||decimal(f?.value)===null)continue;
      const ps=f.provenance??[],s=side({case_id,entity:name,event_id:ev.event_id,field:'change_shares',value:f.value,raw_value:f.raw_value,unit:f.unit,block_id:ps[0]?.block_id,quote:ps[0]?.quote},options);
      if(!s.verified||!s.binding||s.issues.length)continue;
      const previous=map.get(name);if(previous&&previous.value!==s.normalized)return {error:'INCONSISTENT_PART_OBSERVATIONS'};
      if(!previous){map.set(name,{entity:name,value:s.normalized});evidence.push(observation(s));}
    }
  }
  if(!p.sellers.every(x=>map.has(x)))return {error:'PARTIAL_AGGREGATE_COVERAGE',covered:[...map.keys()],expected:p.sellers};
  const result=sum([...map.values()].map(x=>x.value));return {name:'share_sum',used_source:'D8_verified_transaction_seller_fields',operands:[...map.values()],result,evidence,allocation_performed:false};
}

/** options.documents 为 case_id -> A 0.3；options.parses 为同源 evidence/0.9。 */
export function attributeCase(input,options={}){
  const supplied=Array.isArray(input?.sides)?input.sides:[];
  const r={case_id:input?.case_id??null,rule_version:VERSION,verdict:'insufficient',attribution_code:'UNEXPLAINED',attribution:'',
    sides:[],computed:[],findings:[],trace:[],requires_review:true,comparison_performed:false,model_explanation:null,
    audit:{input_mutated:false,expected_labels_used:false,exchange_rate_inferred:false,tax_rate_inferred:false,amount_allocation_performed:false}};
  const done=(verdict,code,message,review=false)=>{r.verdict=verdict;r.attribution_code=code;r.attribution=message;r.requires_review=review||verdict==='insufficient';
    r.resolution=verdict==='insufficient'?'unresolved':verdict==='conflict'?'conflict_candidate':r.comparison_performed?'numerically_checked':'caliber_identified_only';
    r.trace.push({rule_id:code,matched:true,verdict});return r;};
  if(!supplied.length||supplied.length>100)return done('insufficient','INVALID_SIDE_COUNT','缺少比较侧或超出100侧上限；保留疑点。');
  const ss=supplied.map(s=>side(s,options));r.sides=ss.map(observation);
  if(ss.some(s=>s.input.value==null||s.input.value===''||s.input.field==='*'))return done('insufficient','MISSING_VALUE','字段缺失或扫描降级；缺失不等于零。');
  if(ss.some(s=>!s.verified))return done('insufficient','EVIDENCE_NOT_VERIFIED','至少一侧缺少可核验的源文档、页块或引文；不能以期望说明补足事实。');
  if(new Set(ss.map(s=>s.env.is_mock)).size>1)return done('insufficient','MIXED_REAL_MOCK','真实与受控构造输入不能混合互证。');
  r.trace.push({rule_id:'EVIDENCE_GATE',matched:true,verified_sides:ss.length});
  const failures=ss.flatMap(s=>s.issues);if(failures.length){r.findings.push(...failures);return done('insufficient','VALUE_EVIDENCE_MISMATCH','输入值、单位或出处不一致，先复核抽取/标准化，不能归为业务矛盾。');}
  const [a,b]=ss;

  // 明示双币金额是原文的两个记录，绝不由除法反推汇率。
  for(const s of ss){
    const q=norm(s.input.quote),m=q.match(/([\d,]+(?:\.\d+)?)阿联酋迪拉姆[（(]折合人民币([\d,]+(?:\.\d+)?)元/u);
    if(m&&s.input.field==='bid_amount'&&s.normalized===decimal(m[2].replaceAll(',',''))&&moneyCurrency(s)==='CNY'){
      if(!ss.every(t=>t.sha===s.sha&&t.input.block_id===s.input.block_id))continue;
      if(ss.some(t=>t!==s&&(t.input.field!=='currency'&&t.input.field!=='bid_amount'||t.input.field==='bid_amount'&&t.normalized!==s.normalized)))continue;
      if(ss.some(t=>t.input.field==='currency'&&currency(t.input.value)!=='CNY'))return done('insufficient','CURRENCY_RECORD_CONFLICT','币种字段与明示人民币折合值不一致。');
      r.disclosed_amounts=[{currency:'AED',value:decimal(m[1].replaceAll(',',''))},{currency:'CNY',value:decimal(m[2].replaceAll(',',''))}];
      r.findings.push('NO_GENERAL_EXCHANGE_RATE_AUTHORIZED');
      return done('explainable_difference','ISSUER_DISCLOSED_EQUIVALENT','公告已明示原币金额与人民币折合金额，保留双记录；不计算或推广隐含汇率。');
    }
  }
  if(ss.length===1){
    if(text(a.input.entity)&&a.binding)return done('explainable_difference','SINGLE_SIDE_DISCLOSURE','本输入仅有该主体一侧披露，不构成矛盾；不据此断言对方整份文件未披露，也不填零。');
    return done('insufficient','NO_COMPARISON_CONTEXT','单侧输入且主体/比较对象未建立；即使正文金额可读，也不能判断跨文档关系。');
  }
  if(ss.length!==2)return done('insufficient','MULTI_SIDE_ROLE_UNSPECIFIED','多侧输入必须先明确合计、分项和身份，不能仅凭一个数等于其余之和归因。');
  const rel=link(a,b);r.alignment={same_transaction:rel.same,atomic:rel.atomic??false,method:rel.method??null};

  // 本次/累计、分母不同为已知的不可比口径，不进行减法或分母倒推。
  const as=scope(a),bs=scope(b);
  if(as&&bs&&as!==bs&&a.input.unit===b.input.unit&&a.input.field.replace(/_(this_time|cumulative)$/u,'')===b.input.field.replace(/_(this_time|cumulative)$/u,'')
    &&(a.sha===b.sha||rel.same))return done('explainable_difference','CUMULATIVE_VS_SINGLE','本次与累计口径明确不同，不能直接相减解释为单次增量；两值也可能相等，不能说必然不同。');
  const ad=denominator(a),bd=denominator(b);
  if(a.unitKind==='ratio'&&b.unitKind==='ratio'&&ad&&bd&&(ad.kind!==bd.kind||(ad.definition&&bd.definition&&!eq(ad.definition,bd.definition)))&&(a.sha===b.sha||rel.same)){
    r.denominators={left:ad,right:bd};return done('explainable_difference','DENOMINATOR_DIFFERENT','比例分母范围不同，不能比较百分数大小或推算分母。');
  }
  if([a.input.field,b.input.field].includes('tax_included')&&[a.input.field,b.input.field].includes('bid_amount')&&a.sha===b.sha&&a.input.block_id===b.input.block_id){
    const t=a.input.field==='tax_included'?a:b,amount=t===a?b:a;
    const expected=tax(t)==='included'?'true':tax(t)==='excluded'?'false':null;
    if(expected&&String(t.input.value).toLowerCase()===expected&&amount.normalized!==null)return done('explainable_difference','TAX_METADATA_BINDING','该记录确认金额的含税属性；不是两个金额相等的证明。未披露税率，不倒算税额。');
    return done('insufficient','TAX_METADATA_CONFLICT','含税字段与原文不一致或未披露，保留疑点。');
  }

  // 更正须明确指出替代的记录并有可核验的发布先后，不能由“更正”二字或列表顺序推断。
  const corrected=ss.find(s=>/更正为|修正为/u.test(s.input.quote));
  if(corrected){
    const other=corrected===a?b:a,c=corrected.input.caliber?.correction,dt=point(corrected),ot=point(other),notice=dimension(other,'notice_number');
    if(c&&c.replaces_file_sha256===other.sha&&c.replaces_field===other.input.field&&fact(corrected,c)&&/更正为|修正为/u.test(qtext(c))
      &&notice&&c.replaces_notice_number===notice.value&&qtext(c).includes(norm(notice.value))&&rel.same
      &&dt&&ot&&dt.role==='publication_date'&&ot.role==='publication_date'&&dt.value>ot.value&&eq(a.input.entity,b.input.entity)&&a.input.field===b.input.field){
      r.correction={replaces_file_sha256:other.sha,old_value:other.normalized,new_value:corrected.normalized,history_preserved:true};
      return done('restated','EXPLICIT_LINKED_CORRECTION','明确更正目标与发布先后均有出处，保留旧记录并标记被更正，不回写A。');
    }
    return done('insufficient','CORRECTION_LINK_OR_ORDER_MISSING','检测到更正语句，但缺明确替代对象或先后依据；不能自动用后一个输入覆盖前值。');
  }
  if(!rel.same){
    // 不同观察时点不要求同一原子事件；但标的、业务编号和指标仍须明确。
    return done('insufficient','EVENT_IDENTITY_UNPROVEN','尚未证明同一交易/标的观察；同公司、同主体、同数字都不能替代事件对齐。');
  }
  const parties=transferParties(rel);
  const aggregate=parties&&ss.some(s=>norm(s.input.entity).split(/[、和，,]/u).length>1);
  const subset=parties&&a.input.field==='change_shares'&&b.input.field==='change_shares'
    &&((parties.sellers.includes(a.input.entity)&&eq(b.input.entity,parties.buyer))||(parties.sellers.includes(b.input.entity)&&eq(a.input.entity,parties.buyer)));
  if(aggregate||(subset&&a.normalized!==b.normalized)){
    const calc=sumParties(ss,rel,options);if(calc&&!calc.error){r.computed.push(calc);r.comparison_performed=true;
      const total=ss.find(s=>eq(s.input.entity,parties.buyer))??ss.find(s=>norm(s.input.entity).split(/[、和，,]/u).length>1);
      if(!total||total.normalized!==calc.result)return done('insufficient','AGGREGATE_SUM_NOT_RECONCILED','明确合计与分项关系，但程序求和不一致，保留疑点；不向个人分摊差额。');
      return done('explainable_difference','AGGREGATE_DETAIL_RECONCILED','完整且不重复的转让方分项经精确求和与总额一致；合计不拆记个人。');
    }
    r.findings.push(calc?.error??'AGGREGATE_BINDING_MISSING');return done('explainable_difference','AGGREGATE_PARTIAL_COVERAGE','已识别合计与明细口径，完整分项不足，尚未完成数值勾稽；保留未解释部分。',true);
  }
  if(parties&&!eq(a.input.entity,b.input.entity)){
    const buyer=ss.find(s=>eq(s.input.entity,parties.buyer)),seller=ss.find(s=>parties.sellers.includes(s.input.entity));
    if(buyer&&seller&&parties.sellers.length===1&&buyer.binding?.event.fields.direction?.value==='increase'&&seller.binding?.event.fields.direction?.value==='decrease'){
      const bx=buyer.binding.event.fields,sx=seller.binding.event.fields;
      const changes=[bx.change_shares,sx.change_shares];
      const changeEqual=fieldOK(buyer,changes[0])&&fieldOK(seller,changes[1])&&decimal(changes[0].value)===decimal(changes[1].value)&&decimal(changes[0].value)===buyer.normalized&&buyer.normalized===seller.normalized;
      const fieldsMatch=buyer.input.field==='change_shares'&&seller.input.field==='change_shares';
      const fullTransfer=buyer.input.field==='shares_after'&&seller.input.field==='shares_before'&&fieldOK(buyer,bx.shares_before)&&fieldOK(seller,sx.shares_after)&&decimal(bx.shares_before.value)==='0'&&decimal(sx.shares_after.value)==='0';
      if(changeEqual&&(fieldsMatch||fullTransfer)){r.comparison_performed=true;return done('corroborated','VERIFIED_TRANSFER_COUNTERPARTIES','同笔转让的明确买卖双方及相反方向已核验，转让量一致；期末/期初匹配还核验买方原持股与卖方余股为零。');}
    }
    return done('insufficient','COUNTERPARTY_LINK_NOT_RECONCILED','同交易不同主体尚未证明完整转移或对应份额；不能仅凭非圆整数相等判互证。');
  }
  if(!eq(a.input.entity,b.input.entity)||!text(a.input.entity))return done('insufficient','SUBJECT_SCOPE_UNPROVEN','主体范围不足或不同，不直接对比。');

  const ap=point(a),bp=point(b);
  if(ap&&bp&&ap.role===bp.role&&ap.role!=='publication_date'&&ap.value!==bp.value&&a.input.field===b.input.field&&a.input.unit===b.input.unit){
    r.time_basis={left:ap,right:bp};return done('explainable_difference','TIME_BASIS_DIFFERENT','同指标的实际观察时点不同，不能直接判矛盾；不以发布日期代替观察日，也不猜测变化原因。');
  }
  if(a.input.field!==b.input.field)return done('insufficient','FIELD_SEMANTICS_NOT_ALIGNED','字段含义不同且未建立可验证映射，保留疑点。');
  if(!a.binding||!b.binding)return done('insufficient','A_FIELD_BINDING_UNCONFIRMED','未能绑定唯一且可核验的已抽取A字段；待复核或未标准化字段不升级为互证/矛盾。');
  if(a.normalized===null||b.normalized===null)return done('insufficient','NUMERIC_VALUE_UNAVAILABLE','缺少可精确处理的十进制值；不将空值或超精度浮点当数字。');
  if(a.unitKind!==b.unitKind||!a.unitKind)return done('insufficient','UNIT_DIMENSION_MISMATCH','物理/业务单位不一致，不能跨维度比较。');
  if(a.unitKind==='ratio'&&(!ad||!bd||ad.kind!==bd.kind||ad.kind==='other'&&(!ad.definition||!bd.definition)))return done('insufficient','DENOMINATOR_UNPROVEN','比例分母未明，不能据百分数差异判断矛盾。');
  if(as!==bs)return done('insufficient','CUMULATIVE_BASIS_UNKNOWN','一侧累计/本次范围未明，不能默认同口径。');
  const exactTime=rel.method==='same_document_event'||(rel.method==='D8.2'&&rel.atomic)||(ap&&bp&&ap.value===bp.value&&ap.role===bp.role&&ap.role!=='publication_date');
  if(!rel.atomic||!exactTime)return done('insufficient','OBSERVATION_TIME_UNPROVEN','交易关联不足以证明同一原子观察或同一时点，保留疑点。');
  if(a.unitKind==='amount'){
    const ac=moneyCurrency(a),bc=moneyCurrency(b),at=tax(a),bt=tax(b);
    if(!ac||!bc)return done('insufficient','CURRENCY_UNKNOWN','币种缺少依据；元、$或地区本身不足以定币种。');
    if(ac!==bc){
      if(!at||!bt||at!==bt)return done('insufficient','FX_TAX_BASIS_UNALIGNED','跨币种金额的税口径也未对齐；单个汇率不能解释全部差额。');
      const fx=a.input.caliber?.fx??b.input.caliber?.fx,s=a.input.caliber?.fx?a:b;
      const from=fx?.from===ac?a:fx?.from===bc?b:null,to=from===a?b:a;
      const directionText=fx&&qtext(fx).includes(`1${fx.from}=${fx.value}${fx.to}`);
      if(fx&&fact(s,fx)&&from&&fx.to===(from===a?bc:ac)&&directionText&&decimal(fx.value)!==null&&compare(fx.value,'0')===1&&dates(fx.date)
        &&ap&&bp&&ap.value===fx.date&&bp.value===fx.date&&fx.provenance.some(p=>dateIn(p.quote,fx.date))
        &&currencyTokens(qtext(fx)).includes(ac)&&currencyTokens(qtext(fx)).includes(bc)&&quotedNumber(qtext(fx),fx.value)){
        const converted=multiply(from.normalized,fx.value);r.computed.push({name:'exchange_rate',used_source:'explicit_scoped_rate',rate:String(fx.value),from:fx.from,to:fx.to,date:fx.date,input:from.normalized,result:converted,evidence:fx.provenance});
        r.comparison_performed=true;if(converted===to.normalized)return done('explainable_difference','EXPLICIT_FX_RECONCILED','明确方向、日期与适用记录的汇率经精确计算可解释差异；不推广到其他日期。');
        return done('insufficient','FX_NOT_RECONCILED','有据汇率计算仍不一致，保留疑点。');
      }
      return done('insufficient','FX_BASIS_MISSING','币种不同，但缺适用日期/方向/汇率或明示折合依据；不自行换算。');
    }
    if(!at||!bt)return done('insufficient','TAX_BASIS_UNKNOWN','至少一侧税口径未披露，不默认含税或未税。');
    if(at!==bt){
      const rate=a.input.caliber?.tax_rate??b.input.caliber?.tax_rate,s=a.input.caliber?.tax_rate?a:b;
      if(rate&&fact(s,rate)&&decimal(rate.value)!==null&&compare(rate.value,'0')>=0&&compare(rate.value,'100')<=0
        &&/税率/u.test(qtext(rate))&&qtext(rate).includes(norm(rate.value)+'%')){
        const net=at==='excluded'?a:b,gross=net===a?b:a,coefficient=sum(['1',multiply(rate.value,'0.01')]),result=multiply(net.normalized,coefficient);
        r.computed.push({name:'tax_rate',used_source:'explicit_same_event_tax_rate',rate_percent:String(rate.value),input:net.normalized,result,evidence:rate.provenance});r.comparison_performed=true;
        if(result===gross.normalized)return done('explainable_difference','EXPLICIT_TAX_RECONCILED','同事件明示税率解释含税/未税差异；原金额保留。');
        return done('insufficient','TAX_NOT_RECONCILED','已知税率计算仍不一致，保留疑点；不调税率凑数。');
      }
      return done('insufficient','TAX_RATE_MISSING','已识别含税与未税口径不同，但没有可适用税率，差额仍待解释。');
    }
  }
  const qualified=ss.some(s=>/暂定|暂估|约|至少|至多|不超过|预计|[<>≤≥~～]/u.test(String(s.input.raw_value??'')));
  if(qualified)return done('insufficient','QUALIFIED_AMOUNT_NOT_EXACT','近似、暂定或上下界不按精确值判断；需要明确精度/范围依据。');
  if(a.normalized===b.normalized){r.comparison_performed=true;
    if(a.sourceUnit&&b.sourceUnit&&a.sourceUnit!==b.sourceUnit){r.computed.push({name:'unit_scale',used_source:'explicit_raw_units',left:a.normalized,right:b.normalized});return done('explainable_difference','EXPLICIT_UNIT_RECONCILED','原文单位明确且精确归一后相等；不是仅凭一万倍关系猜单位。');}
    return done('corroborated','SAME_OBSERVATION_EQUAL','事件、主体、字段和适用口径一致，精确十进制数值相同。');
  }
  const rounding=a.input.caliber?.rounding??b.input.caliber?.rounding,s=a.input.caliber?.rounding?a:b;
  if(rounding&&fact(s,rounding)&&Number.isInteger(rounding.value)&&rounding.value>=0&&rounding.value<=30&&qtext(rounding).includes(`四舍五入保留${rounding.value}位小数`)){
    const rounded=roundHalfUp((s===a?b:a).normalized,rounding.value);
    if(rounded===s.normalized){r.computed.push({name:'rounding',used_source:'explicit_rounding_precision',places:rounding.value,result:rounded,evidence:rounding.provenance});r.comparison_performed=true;return done('explainable_difference','EXPLICIT_ROUNDING','有明确舍入规则并通过精确复算；不使用通用0.5%容差。');}
  }
  r.comparison_performed=true;return done('conflict','SAME_BASIS_CONFLICT','双侧原文、同一原子事件/观察时点和全部适用口径均成立，精确值仍不一致；作为有证据的矛盾提交人工终审。',true);
}
