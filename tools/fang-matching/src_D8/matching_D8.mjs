/** D8.2 文档交易关联 + 魏方 matching v1 适配。期望标签不进入判定。 */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const load=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const catalog=load('../public_dev_D8/identity_context_D8.json').documents;
const inputs=load('../public_dev_D8/input_manifest_D8.json').documents;
const external=new Map(Object.entries(inputs).filter(([,v])=>v.parse).map(([id,v])=>{
  const p=load('../public_dev_D8/'+v.parse);return [p.doc.file_sha256,p];
}));
export const RULE_VERSION='D8.2';
const clone=x=>structuredClone(x), text=x=>typeof x==='string'&&x.trim().length>0;
const norm=x=>String(x??'').normalize('NFKC').replace(/\s+/gu,'');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const same=(a,b)=>norm(a)===norm(b);
const TYPES=['pledge','equity_change','award_contract'];
const shareFields=['shares_before','shares_after','change_shares'];
function source(env,provided) {
  const sha=env?.source?.file_sha256;
  const invalid=error=>({error,env,sha});
  if(env?.schema_version!=='0.3'||!text(env.run_id)||typeof env.is_mock!=='boolean'||!Array.isArray(env.events)
    ||!env.events.length||!/^[a-f0-9]{64}$/i.test(sha??'')||!text(env.source.file_id)||!text(env.source.file_name)
    ||(env.source.file_id.startsWith('sha256:')&&env.source.file_id.slice(7)!==sha)
    ||env.events.some(e=>!e||typeof e!=='object'||!e.fields||typeof e.fields!=='object')
    ||new Set(env.events.map(e=>e.event_id)).size!==env.events.length
    ||env.events.some(e=>!/^E\d+$/.test(e.event_id)||!TYPES.includes(e.event_type)))return invalid('INVALID_A_ENVELOPE');
  const context=provided?.context===undefined?catalog[sha]:provided.context;
  const parsed=provided?.parsed_document??external.get(sha);
  if(parsed&&(parsed.doc?.file_sha256!==sha||parsed.quality?.degraded))return invalid('PARSE_SOURCE_MISMATCH_OR_DEGRADED');
  const bs=parsed?parsed.pages?.flatMap(p=>p.blocks??[]):env.source.parse_meta?.blocks;
  if(!Array.isArray(bs)||!bs.length||env.source.parse_meta?.degraded)return invalid('PARSE_BLOCKS_MISSING_OR_DEGRADED');
  const blocks=new Map(bs.map(b=>[b.block_id,b]));
  if(blocks.size!==bs.length)return invalid('DUPLICATE_BLOCK_ID');
  const s={env,sha,blocks,context:context?.file_sha256===sha?context:null};
  s.usable=env.events.reduce((n,e)=>n+Object.values(e.fields??{}).filter(f=>field(s,f)).length,0);
  return s;
}
function refs(s,ps) {
  return Array.isArray(ps)&&ps.length>0&&ps.every(p=>{
    const b=s.blocks.get(p?.block_id);
    return b&&Number.isInteger(p.page)&&p.page>0&&p.page===b.page&&text(p.quote)
      &&!p.degraded&&!b.degraded&&b.source!=='OCR'&&p.source_type!=='scan_region'
      &&norm(b.text_raw??b.text).includes(norm(p.quote))
      &&(p.region==null||b.region==null||JSON.stringify(p.region)===JSON.stringify(b.region))
      &&(p.source_type!=='cell'||(text(p.table_id)&&text(p.cell_ref)));
  });
}
function field(s,f) {
  return f?.status==='extracted'&&f.standardized!==false&&f.value!==null&&f.value!==undefined&&refs(s,f.provenance)?f:null;
}
function fact(s,f) {return text(f?.value)&&refs(s,f.provenance)&&f.provenance.some(p=>norm(p.quote).includes(norm(f.value)))?f:null;}
const quote=f=>(f?.provenance??[]).map(p=>norm(p.quote)).join('');
function issuer(s) {
  const code=fact(s,s.context?.issuer_code),name=fact(s,s.context?.issuer_name);
  const validCode=code&&/^\d{6}$/.test(code.value)&&new RegExp('(?:证券代码|股票代码)[:：]?'+code.value+'(?!\\d)','u').test(quote(code))?code:null;
  return {code:validCode,name};
}
function issuerRelation(a,b) {
  const x=issuer(a),y=issuer(b);
  if(x.code&&y.code)return same(x.code.value,y.code.value)?'same':'different';
  if(x.name&&y.name&&same(x.name.value,y.name.value))return 'same';
  return 'unknown';
}
function dates(v) {
  if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}(?:\/\d{4}-\d{2}-\d{2})?$/.test(v))return null;
  const d=v.split('/');if(d.some(x=>!Number.isFinite(Date.parse(x))||new Date(x).toISOString().slice(0,10)!==x))return null;
  return (d[1]??d[0])>=d[0]?[d[0],d[1]??d[0]]:null;
}
function quotedDate(s,f) {
  if(!f||!refs(s,f.provenance)||!dates(f.value))return false;
  return f.value.split('/').every(d=>{
    const [y,m,day]=d.split('-').map(Number),q=quote(f);
    return q.includes(d)||q.includes(`${y}年${m}月${day}日`);
  });
}
function transactions(s) {
  const list=s.context?.transactions??[];
  if(!Array.isArray(list))return [];
  return list.filter(t=>{
    if(t.kind!=='share_transfer_bundle'||t.binding!=='signed_transfer_bundle'||!Array.isArray(t.event_ids)||!t.event_ids.length
      ||new Set(t.event_ids).size!==t.event_ids.length||!quotedDate(s,t.date)||!fact(s,t.buyer)||!Array.isArray(t.sellers)
      ||!t.sellers.length||!t.sellers.every(f=>fact(s,f))||!refs(s,t.statement))return false;
    const q=t.statement.map(p=>norm(p.quote)).join('');
    const buyer=norm(t.buyer.value),sellers=t.sellers.map(f=>norm(f.value));
    if(new Set(sellers).size!==sellers.length||sellers.includes(buyer)||/更正|撤销|作废|并非|不是/u.test(q))return false;
    if(!/签署|签订/u.test(q)||!q.includes('股份转让协议'))return false;
    const roles=(sellers.every(x=>q.includes('转让方):'+x)||q.includes('转让方名称'+x))
      &&(q.includes('受让方):'+buyer)||q.includes('受让方名称'+buyer)));
    const list=q.match(/《股份转让协议》约定[,，]?(.+?)将其合计持有/u)?.[1]?.split(/[、和，,]/u).sort();
    const explicitBundle=q.includes('转让给'+buyer)&&list&&JSON.stringify(list)===JSON.stringify([...sellers].sort());
    if(!roles&&!explicitBundle)return false;
    return t.event_ids.every(id=>{
      const e=s.env.events.find(e=>e.event_id===id),h=field(s,e?.fields?.holder),m=field(s,e?.fields?.method);
      if(e?.event_type!=='equity_change'||!h||!m||!/转让/u.test(String(m.value)))return false;
      const holders=norm(h.value).split(/[、和，,]/u);
      if(!holders.every(x=>[buyer,...sellers].includes(x)))return false;
      const direction=field(s,e.fields.direction);
      if(direction&&(!['increase','decrease'].includes(direction.value)
        ||holders.some(x=>x===buyer?direction.value!=='increase':direction.value!=='decrease')))return false;
      const d=field(s,e.fields.change_date);
      return !d||(quotedDate(s,d)&&same(d.value,t.date.value));
    });
  });
}
function transactionKey(t) {return JSON.stringify([t.kind,t.date.value,norm(t.buyer.value),t.sellers.map(f=>norm(f.value)).sort()]);}
function evref(s,e) {return {file_sha256:s.sha,run_id:s.env.run_id,event_id:e.event_id,event_type:e.event_type};}
function summary(s) {
  if(s.error)return {error:s.error,file_id:s.env?.source?.file_id??null,file_sha256:s.sha??null,
    file_name:s.env?.source?.file_name??null,run_id:s.env?.run_id??null,code_version:s.env?.run_meta?.code_version??null,
    is_mock:s.env?.is_mock??null,issuer_code:null,issuer_name:null,notice_number:null,metadata_evidence:null,
    evidence_status:'unavailable',source_metadata_verification:'input_only'};
  const i=issuer(s),notice=fact(s,s.context?.notice_number);
  return {file_id:s.env.source.file_id,file_sha256:s.sha,file_name:s.env.source.file_name,run_id:s.env.run_id,
    code_version:s.env.run_meta?.code_version??null,is_mock:s.env.is_mock,issuer_code:i.code?.value??null,
    issuer_name:i.name?.value??null,notice_number:notice?.value??null,
    metadata_evidence:{issuer_code:i.code,issuer_name:i.name,notice_number:notice},usable_fields:s.usable};
}
function entity(s,e) {const f=field(s,e.fields?.[{pledge:'pledgor',equity_change:'holder',award_contract:'bidder'}[e.event_type]]);return f&&text(f.value)?f:null;}

/** 文档粒度是同一交易包；原子动作保持独立，不用金额、预期标签或公告编号判同。 */
export function alignDocuments(envA,envB,options={}) {
  const a=source(envA,options.left),b=source(envB,options.right);
  const r={schema_version:'document-alignment/0.2',rule_version:RULE_VERSION,relation_scope:'transaction_bundle',status:'unknown',
    predicted_relation:'unknown',reasons:[],explanation:'',left:summary(a),right:summary(b),evidence:[],event_pairs:[],
    numeric_comparison_executed:false,may_compare:false,expected_relation_used:false,annotations_peer_review_pending:true};
  const end=(status,code,message)=>{
    r.status=status;r.predicted_relation={same:'related',different:'unrelated',unknown:'unknown'}[status];
    r.reasons=[...(status==='unknown'?['INSUFFICIENT_SIGNALS']:[]),code];r.explanation=message;return r;
  };
  if(a.error||b.error)return end('unknown','SOURCE_OR_EVIDENCE_UNAVAILABLE','至少一侧输入或解析证据不可用；不得把缺失判成不同事件。');
  if(a.env.is_mock!==b.env.is_mock)return end('unknown','MIXED_REAL_MOCK','真实与模拟数据不混用。');
  if(!a.usable||!b.usable)return end('unknown','NO_USABLE_FIELDS','至少一侧没有可用字段，输出证据不足。');
  if(!a.env.events.every(e=>entity(a,e))||!b.env.events.every(e=>entity(b,e)))return end('unknown','EVENT_SUBJECT_UNLOCATED','事件主体缺少块级出处，先补齐依据。');
  const ia=issuer(a),ib=issuer(b),ir=issuerRelation(a,b);
  r.evidence.push({role:'issuer_context_only',left:ia,right:ib});
  const ta=new Set(a.env.events.map(e=>e.event_type)),tb=new Set(b.env.events.map(e=>e.event_type));
  if(![...ta].some(x=>tb.has(x)))return end('different','DISJOINT_EVENT_TYPES','双方披露的质押、股权变动或中标原子类型互不重合；更高层关联未推断。');
  if(ta.size===1&&tb.size===1&&ta.has('award_contract')){
    const allDifferent=a.env.events.every(x=>b.env.events.every(y=>{
      const ap=field(a,x.fields.project_name),bp=field(b,y.fields.project_name),at=field(a,x.fields.tenderer),bt=field(b,y.fields.tenderer);
      return ap&&bp&&at&&bt&&!same(ap.value,bp.value)&&!same(at.value,bt.value);
    }));
    if(allDifferent){
      r.evidence.push({role:'distinct_procurement_parties_and_projects',left:a.env.events.map(e=>({event_id:e.event_id,project:e.fields.project_name,tenderer:e.fields.tenderer})),right:b.env.events.map(e=>({event_id:e.event_id,project:e.fields.project_name,tenderer:e.fields.tenderer}))});
      return end('different','DISTINCT_PROCUREMENT_IDENTITIES','每个候选对的采购主体与具体项目均不同，按中标合同粒度分别保留；公司代码本身不是项目编号。');
    }
  }else if(ta.size===1&&tb.size===1&&ir==='different')return end('different','DISTINCT_LISTED_INSTRUMENTS','股票代码明确不同，按标的证券上的股权或质押事件分别保留。');
  if(a.sha===b.sha&&a.env.run_id===b.env.run_id){
    return hash(a.env.events)===hash(b.env.events)?end('same','SAME_SOURCE_OBSERVATION','同源同运行的事件内容一致。'):end('unknown','LOCATOR_CONTENT_CONFLICT','同源同运行内容冲突，需检查输入版本。');
  }
  if(ir==='same'&&ta.size===1&&ta.has('equity_change')&&tb.size===1){
    const ax=transactions(a),bx=transactions(b),matches=[];
    for(const x of ax)for(const y of bx)if(transactionKey(x)===transactionKey(y))matches.push([x,y]);
    if(matches.length===1){
      const [x,y]=matches[0];
      r.evidence.push({role:'signed_transfer_bundle',left:clone(x),right:clone(y)});
      for(const idA of x.event_ids)for(const idB of y.event_ids){
        const e=a.env.events.find(e=>e.event_id===idA),f=b.env.events.find(e=>e.event_id===idB);
        const ha=entity(a,e),hb=entity(b,f),da=field(a,e.fields.direction),db=field(b,f.fields.direction);
        const atomic=ha&&hb&&same(ha.value,hb.value)&&da&&db&&['increase','decrease'].includes(da.value)&&da.value===db.value;
        r.event_pairs.push({left:evref(a,e),right:evref(b,f),relation:atomic?'same_atomic_observation':'same_transaction_complementary',
          reason:atomic?'交易包、主体和方向一致':'同交易中的不同主体、相反动作或合计与分人披露，禁止直接互比',
          direct_field_alignment_allowed:!!atomic,may_compare:false,holder_evidence:{left:ha,right:hb},direction_evidence:{left:da,right:db}});
      }
      const direct=r.event_pairs.filter(p=>p.direct_field_alignment_allowed);
      for(const p of direct)if(direct.filter(q=>q.left.event_id===p.left.event_id).length>1||direct.filter(q=>q.right.event_id===p.right.event_id).length>1){p.direct_field_alignment_allowed=false;p.reason='一对多原子事件歧义；不选第一项';}
      return end('same','SIGNED_TRANSFER_BUNDLE_MATCH','标的公司、签约日期、明确转让方集合与受让方一致，双侧签约和转让原文已定位；同交易可含不同主体动作，不自动合并金额。');
    }
    if(matches.length>1)return end('unknown','MULTIPLE_TRANSACTION_MATCHES','存在多个交易包匹配，需更细的业务编号。');
    if(a.env.events.length===1&&b.env.events.length===1){
      const x=a.env.events[0],y=b.env.events[0],m=field(a,x.fields.method),n=field(b,y.fields.method),d=field(a,x.fields.change_date),e=field(b,y.fields.change_date);
      if(m&&n&&/被动稀释/u.test(m.value)&&/被动稀释/u.test(n.value)&&quotedDate(a,d)&&quotedDate(b,e)){
        const u=dates(d.value),v=dates(e.value);
        r.evidence.push({role:'event_occurrence_intervals',left:clone(d),right:clone(e)});
        if(u[1]<v[0]||v[1]<u[0])return end('different','DISJOINT_DILUTION_INTERVALS','同公司被动稀释的实际发生区间不相交；共享主体和持股数不代表同一事件。');
        return end('unknown','OVERLAPPING_DISCLOSURE_GRANULARITY','区间披露与单次触及存在重叠，需确认事件粒度，不直接判相同或不同。');
      }
    }
  }
  return end('unknown','IDENTITY_NOT_ESTABLISHED','已有公司、主体或数值线索不足以锁定交易；补充签约双方、实际期间或业务唯一编号。');
}

/** 同步数组签名与魏方 --matcher 完全一致。仅返回已对齐且可安全承载的股数字段。 */
export function alignEvents(envA,envB,options={}) {
  const r=alignDocuments(envA,envB,options),out=[];
  if(r.status!=='same')return out;
  const a=source(envA,options.left),b=source(envB,options.right);
  for(const p of r.event_pairs.filter(p=>p.direct_field_alignment_allowed)){
    const x=envA.events.find(e=>e.event_id===p.left.event_id),y=envB.events.find(e=>e.event_id===p.right.event_id);
    for(const name of shareFields){
      const f=field(a,x.fields[name]),g=field(b,y.fields[name]);
      const safe=z=>z?.unit==='shares'&&z.standardized===true&&z.denominator==null
        &&(!z.qualifier||z.qualifier==='exact')&&(!z.scope||z.scope==='single')
        &&!/[约余多近]|不超过|至少|至多/u.test(String(z.raw_value))
        &&/^-?\d+$/.test(String(z.value))&&Number.isSafeInteger(Number(z.value));
      if(!safe(f)||!safe(g))continue;
      out.push({entityA:x.fields.holder.value,entityB:y.fields.holder.value,field:name,valueA:Number(f.value),valueB:Number(g.value),
        quoteA:f.provenance.map(p=>p.quote).join('\n'),quoteB:g.provenance.map(p=>p.quote).join('\n'),
        event_idA:x.event_id,event_idB:y.event_id,evidenceA:clone(f.provenance),evidenceB:clone(g.provenance),rule_version:RULE_VERSION});
    }
  }
  return out;
}

/** 按魏 B report 形状返回；关联解释内的双侧元数据供陈展示。D8 不执行金额/合计核验。 */
export function explainGroup(group,envelopes,options={}) {
  if(!Array.isArray(group?.members)||group.members.length<2||group.members.length!==envelopes.length||new Set(group.members).size!==group.members.length)throw Error('INVALID_GROUP_MEMBERS');
  const document_pairs=[];
  for(let i=0;i<envelopes.length;i++)for(let j=i+1;j<envelopes.length;j++)document_pairs.push({members:[group.members[i],group.members[j]],
    ...alignDocuments(envelopes[i],envelopes[j],{left:options[group.members[i]],right:options[group.members[j]]})});
  // 不把不同文档对的信号最大值拼接成一次关联，不作传递闭包。
  const states=new Set(document_pairs.map(p=>p.predicted_relation));
  const relation=states.size===1?[...states][0]:'unknown';
  return {group_id:group.group_id,members:[...group.members],predicted_relation:relation,
    reasons:states.size===1?[...new Set(document_pairs.flatMap(p=>p.reasons))]:['INSUFFICIENT_SIGNALS','MIXED_PAIR_RELATIONS'],
    a_run_links:envelopes.map((e,i)=>({case_id:group.members[i],a_run_id:e?.run_id??null,code_version:e?.run_meta?.code_version??null,schema_version:e?.schema_version??null,is_mock:e?.is_mock??null})),
    member_meta:envelopes.map((e,i)=>({case_id:group.members[i],...summary(source(e,options[group.members[i]]))})),
    document_pairs,consistency:{corroborations:[],conflicts:[],complementaries:[]},
    consistency_status:'not_executed_D8_alignment_only',numeric_comparison_executed:false,
    relation_label:{related:'同一交易关联',unrelated:'不同事件',unknown:'证据不足／无法判定'}[relation],
    association_explanation:document_pairs.map(p=>p.explanation).join('\n'),
    ui_hint:{show_both_issuer_codes:true,show_both_notice_numbers:true,null_display:'未取得',unknown_is_unrelated:false}};
}
