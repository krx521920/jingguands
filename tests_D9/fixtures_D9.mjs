import {createHash} from 'node:crypto';
// 独立受控事实；不得混入公开18份案例或用作真实公告证明。
export function pair(left={},right={}){
  const options={documents:{},parses:{}};
  const sides=[left,right].map((cfg,i)=>{
    const id=`CONTROL-${i}`,sha=createHash('sha256').update(id).digest('hex'),block=`control-${i}`;
    const value=cfg.value??'100',unit=cfg.unit??'shares',field=cfg.field??'shares_after';
    const raw=cfg.raw??`${value}${unit==='shares'?'股':unit==='percent'?'%':unit==='amount'?'元':unit}`;
    const date=cfg.date??'2026-10-05';
    const quote=cfg.quote??`甲主体 ${field} ${raw} ${cfg.currency??''} ${cfg.tax??''}`;
    const context=`证券代码：600001；事件编号：${cfg.event??'TX-01'}；观察日：${date}；公告编号：N${i}；${cfg.extra??''}`;
    const provenance=[{block_id:block,page:1,quote:context,file_sha256:sha}];
    const fact=(v,extra={})=>({value:v,provenance,...extra});
    const caliber={event_key:fact(cfg.event??'TX-01'),issuer_code:fact('600001'),time:fact(date,{role:cfg.role??'as_of'}),notice_number:fact(`N${i}`)};
    if(cfg.currency)caliber.currency={value:cfg.currency,provenance:[{block_id:block,page:1,quote,file_sha256:sha}]};
    for(const [key,val] of Object.entries(cfg.facts??{}))caliber[key]=fact(val.value,val);
    const s={case_id:id,entity:'甲主体',field,value,raw_value:raw,unit,block_id:block,quote,caliber};
    if(cfg.noTime)delete caliber.time;if(cfg.noKey)delete caliber.event_key;
    const ref=[{block_id:block,page:1,quote,file_sha256:sha}];
    options.documents[id]={schema_version:'0.3',run_id:'CONTROL-D9',is_mock:true,source:{file_id:`sha256:${sha}`,file_sha256:sha,parse_meta:{blocks:[{block_id:block,page:1,text_raw:quote+'\n'+context}]}},events:[{event_id:`event-${i}`,fields:{holder:{status:'extracted',value:'甲主体',provenance:ref},[field]:{status:'extracted',standardized:true,value,unit,raw_value:raw,provenance:ref}}}]};
    return s;
  });
  return {input:{case_id:'CONTROL-D9',sides},options};
}
export const decideFixture=(engine,x)=>engine(x.input,x.options);
