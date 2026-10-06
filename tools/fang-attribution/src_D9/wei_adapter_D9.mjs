import {attributeCase} from './attribution_D9.mjs';
const serialized=x=>JSON.stringify(x);
// 必须返回结果：上游插件抛错/null会回落至仅凭数字倍率等启发式的内置规则。
const unknown=reason=>({attribution:'insufficient_evidence',confidence:'low',evidence:JSON.stringify({verdict:'insufficient',requires_review:true,reason,model_explanation:null})});
const number=v=>{if(typeof v==='number')return Number.isFinite(v)?v:null;if(typeof v==='string'&&/^-?\d+(?:\.\d+)?$/.test(v.trim())){const n=Number(v);return String(n)===v.trim()?n:null;}return null;};
function decide(ctx){
  try{
    if(ctx.kind==='insufficient'||ctx.group?.predicted_relation==='unknown')return unknown('上游事件对齐证据不足，归因不得升级。');
    const cs=ctx.group?.consistency?.conflicts??[];
    const candidates=cs.filter(c=>{
      const vs=c.values?.length?c.values:c.aggregate?[c.aggregate,...(c.parts??[])]:[];
      return (c.entity??null)===ctx.entry?.entity&&(c.field??null)===ctx.entry?.field
        &&serialized(vs.map(v=>number(v.value)))===serialized(ctx.values)
        &&serialized(vs.map(v=>v.quote??'').filter(Boolean))===serialized(ctx.quotes);
    });
    if(candidates.length!==1)return unknown('无法唯一定位原始冲突记录；拒绝按数组位置套用证据。');
    const c=candidates[0],enriched=c.d9_input,context=ctx.group.d9_context;
    if(!enriched||!context)return unknown('上游简化接口缺少单位、页块与源文档；需提供该冲突的d9_input和组级d9_context。');
    const original=c.values?.length?c.values:c.aggregate?[c.aggregate,...(c.parts??[])]:[];
    if(original.length!==enriched.sides?.length||original.some((v,i)=>String(v.value)!==String(enriched.sides[i].value)||(v.quote??'')!==(enriched.sides[i].quote??'')||(v.doc!=null&&v.doc!==enriched.sides[i].case_id)
      ||(c.field!=null&&c.field!==enriched.sides[i].field)||(c.entity!=null&&c.entity!==enriched.sides[i].entity)))return unknown('补充事实与原始冲突记录不一致，拒绝归因。');
    const r=attributeCase(enriched,context);
    const mapping={insufficient:'insufficient_evidence',conflict:'true_conflict',restated:'explicit_correction',corroborated:'corroborated',explainable_difference:'caliber_explained'};
    return {attribution:mapping[r.verdict],confidence:r.requires_review?'low':'high',evidence:JSON.stringify(r)};
  }catch{return unknown('D9规则或输入异常；保留疑点，不回落无证据启发式。');}
}
export const attributeRules=[{id:'FANG_D9_EVIDENCE_FIRST',label:'方D9：有据归因，缺据保留疑点',applies:()=>true,decide}];
