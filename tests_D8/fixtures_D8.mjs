/** 自建合成开发样例，不包含宗方封存答案；编号事实代表上游已作事件级标注。 */
import {createHash} from 'node:crypto';
import {eventLocator} from '../src_D8/alignment_D8.mjs';

export function makeSide(type='award_contract', tag='left', key='LOT-2026-001') {
  const who=type==='pledge'?'pledgor':type==='equity_change'?'holder':'bidder';
  const label=type==='pledge'?'质押登记编号':type==='equity_change'?'交易编号':'标段编号';
  const direction=type==='pledge'?'pledge':type==='equity_change'?'increase':null;
  const company='甲方科技股份有限公司';
  const text=`证券代码：600001；${company}；${label}：${key}；方向：${direction??'不适用'}；项目名称：东城轨道交通一号线一标段；金额：123456元。`;
  const sha=createHash('sha256').update(tag+'\n'+text).digest('hex');
  const block={block_id:'b-'+tag,page:1,source_type:'paragraph',source:'TEXT_LAYER',text_raw:text,region:[1,1,500,100],degraded:false};
  const fv=(value,unit='text')=>({raw_value:String(value),value,unit,status:'extracted',standardized:true,denominator:null,note:null,
    provenance:[{page:1,block_id:block.block_id,source_type:'paragraph',quote:text,region:block.region}]});
  const fields={[who]:fv(company)};
  if(direction) fields.direction=fv(direction);
  else {fields.project_name=fv('东城轨道交通一号线一标段');fields.bid_amount=fv(123456,'cny');fields.bid_amount.raw_value='123456元';}
  const envelope={schema_version:'0.3',run_id:'mock-'+tag,is_mock:true,source:{file_id:'sha256:'+sha,file_sha256:sha,file_name:tag+'.pdf'},
    events:[{event_id:'E01',event_type:type,fields,extraction_method:'mock'}],run_meta:{entry:'tool',errors:[]}};
  return {envelope,event_id:'E01',parsed_document:{schema_version:'evidence/0.9',doc:{file_sha256:sha},pages:[{page:1,blocks:[block]}],quality:{degraded:false}},
    identity:{event_ref:eventLocator(envelope,'E01'),kind:type==='pledge'?'pledge_registration_id':type==='equity_change'?'equity_transaction_id':'award_lot_id',
      namespace_kind:'security_code',namespace:fv('600001'),key:fv(key)}};
}

export function developmentPairs() {
  const pairs=[];
  for(const type of ['award_contract','pledge','equity_change']) for(let i=1;i<=2;i++) {
    pairs.push({case_id:`same-${type}-${i}`,expected:'same',left:makeSide(type,`same-${type}-${i}-L`,`ID-2026-${i}`),right:makeSide(type,`same-${type}-${i}-R`,`ID-2026-${i}`)});
  }
  for(const type of ['award_contract','pledge','equity_change']) {
    pairs.push({case_id:`different-key-${type}`,expected:'different',left:makeSide(type,`different-${type}-L`,'ID-2026-1'),right:makeSide(type,`different-${type}-R`,'ID-2026-2')});
  }
  for(const [i,[a,b]] of [['pledge','award_contract'],['equity_change','pledge'],['award_contract','equity_change']].entries()) {
    pairs.push({case_id:`different-type-${i}`,expected:'different',left:makeSide(a,`type-${i}-L`),right:makeSide(b,`type-${i}-R`)});
  }
  const left=makeSide('award_contract','unknown-L'),right=makeSide('award_contract','unknown-R');delete left.identity;delete right.identity;
  pairs.push({case_id:'insufficient-company-and-amount',expected:'unknown',left,right});
  return pairs;
}
