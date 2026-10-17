#!/usr/bin/env node
// rerun-fang-tolerance.mjs —— 独立复跑方容差回归的**三层**（2026-10-12，评测侧）
//
// 复跑哪三层：① 规则判定（42 例）② 精确算术（18 例）③ 信封机检（schema＋注册表）
// 复跑不了哪四层（另有原因，非本脚本问题）：魏 CLI 42、B 适配 7、默认路径对照 32、原 D9 回归 --test
//   —— 那四层要 spawnSync 起魏侧 CLI 子进程；评测机 Node 无法 spawn（EPERM），故**明确不复跑**。
//
// 用法：node evaluation/2026-10-12-handoff/rerun-fang-tolerance.mjs \
//          --fang-root <方检出（含 src_D9/、tests_D9/、回归用例_D12.mjs、vendor_D8/）> \
//          --wei-root  <魏检出（含 scripts/jingguan/lib/、interface/）> \
//          [--published <方公布的 tolerance_results_*.json>]
// 输出：JSON（含逐条与公布结果的一致性）
"use strict";
import fs from "node:fs"; import path from "node:path"; import {pathToFileURL} from "node:url";
const argv=process.argv.slice(2); const arg=(k,d)=>{const i=argv.indexOf(k);return i>=0?argv[i+1]:d;};
const F=path.resolve(arg("--fang-root",null)||(()=>{throw new Error("--fang-root required")})());
const W=path.resolve(arg("--wei-root",null)||(()=>{throw new Error("--wei-root required")})());
const PUB=arg("--published",null);
const load=(r,p)=>import(pathToFileURL(path.resolve(r,p)).href);
const {pair:rawPair}=await load(F,"tests_D9/fixtures_D9.mjs");
const {buildCases,arithmeticCases}=await load(F,"回归用例_D12.mjs");
const current=await load(F,"src_D9/attribution_D9.mjs"), exact=await load(F,"src_D9/exact_D9.mjs");
const pair=(a,b)=>{const x=rawPair(a,b);
 for(const s of x.input.sides){const e=x.options.documents[s.case_id];e.source.file_name=s.case_id+".synthetic.txt";e.run_meta={entry:"tool",interface_version:"v0.3"};
  const ev=e.events[0];ev.event_id="E01";ev.event_type=s.unit==="cny"?"award_contract":"equity_change";ev.extraction_method="mock";
  if(s.unit==="cny"){ev.fields.bidder=ev.fields.holder;delete ev.fields.holder;}
  for(const f of Object.values(ev.fields)){f.raw_value??=String(f.value);f.unit??="text";f.standardized=true;if(f.unit==="percent")f.denominator="total_share_capital";f.provenance=f.provenance.map(({file_sha256,...p})=>({...p,source_type:"paragraph"}));}}
 return x;};
const money={field:"bid_amount",unit:"cny",currency:"CNY",tax:"含税"};
const m=v=>({...money,value:v,raw:v+"元"});
const rounded=(v,raw,n,extra="")=>({...money,value:v,raw,extra:`四舍五入保留${n}位小数；${extra}`,facts:{rounding:{value:n}}});
const cases=buildCases(rawPair);
const add=(id,reason,x,verdict,code)=>cases.push({id,reason,...x,expected:{verdict,code}});
const C="SAME_BASIS_CONFLICT",I="insufficient",E="explainable_difference";
add("F1-01","exact shares +1",pair({value:"1000"},{value:"1001"}),"conflict",C);
add("F1-02","large shares +10000000 within 0.5 percent",pair({value:"1000000000000"},{value:"1000010000000"}),"conflict",C);
add("F1-03","large shares +1",pair({value:"1000000000000000"},{value:"1000000000000001"}),"conflict",C);
add("F1-04","amount +0.01",pair(m("100"),m("100.01")),"conflict",C);
add("F1-05","amount below one cent still exact",pair(m("100"),m("100.000001")),"conflict",C);
const pct=v=>({field:"ratio_after",unit:"percent",value:v,raw:v+"%",extra:"分母为总股本",facts:{denominator:{value:"total_share_capital",definition:"总股本"}}});
add("F1-06","percent uses percentage points, no relative tolerance",pair(pct("1"),pct("1.0001")),"conflict",C);
add("F1-07","zero versus nonzero",pair(m("0"),m("0.000001")),"conflict",C);
add("F1-08","positive lower midpoint included",pair(rounded("12300","1.23万元",2),m("12250")),E,"EXPLICIT_ROUNDING");
add("F1-09","positive upper midpoint excluded",pair(rounded("12300","1.23万元",2),m("12350")),"conflict",C);
add("F1-10","positive upper interior",pair(rounded("12300","1.23万元",2),m("12349.999999999999999999")),E,"EXPLICIT_ROUNDING");
add("F1-11","negative lower midpoint excluded",pair(rounded("-12300","-1.23万元",2),m("-12350")),"conflict",C);
add("F1-12","negative upper midpoint included",pair(rounded("-12300","-1.23万元",2),m("-12250")),E,"EXPLICIT_ROUNDING");
add("F1-13","both sides rounded: cannot treat one as exact",pair(rounded("1.2","1.2元",1),rounded("1.24","1.24元",2)),I,"ROUNDING_BOTH_SIDES_UNRESOLVED");
add("F1-14","missing disclosure unit",pair(rounded("1.23","1.23",2),m("1.234")),I,"ROUNDING_BASIS_UNPROVEN");
add("F1-15","competing precision statements",pair(rounded("1.23","1.23元",2,"四舍五入保留3位小数"),m("1.234")),I,"ROUNDING_BASIS_UNPROVEN");
add("F1-16","undeclared precision cannot be guessed",pair({...m("12300"),raw:"1.23万元"},m("12345")),"conflict",C);
add("F1-17","same company insufficient event identity",pair({value:"1000",noKey:true},{value:"1001",noKey:true}),I,"EVENT_IDENTITY_UNPROVEN");
add("F1-18","qualified approximate is not exact",pair({value:"1000",raw:"约1000股"},{value:"1001"}),I,"QUALIFIED_AMOUNT_NOT_EXACT");
const summary=r=>({verdict:r.verdict,code:r.attribution_code,result:r.computed.at(-1)?.result??null});
const {validateAgainstSchema}=await load(W,"scripts/jingguan/lib/schema_validator.mjs");
const {checkRegistry}=await load(W,"scripts/jingguan/lib/registry.mjs");
const envelopeSchema=JSON.parse(fs.readFileSync(path.resolve(W,"interface/event-envelope.schema.json"),"utf8"));
const schemaChecks=cases.flatMap(c=>Object.values(c.options.documents).map(env=>({case_id:c.id,errors:[...validateAgainstSchema(env,envelopeSchema),...checkRegistry(env)]})));
const rows=cases.map(c=>{
 const before=JSON.stringify([c.input,c.options]),out=current.attributeCase(c.input,c.options),rev=current.attributeCase({...c.input,sides:[...c.input.sides].reverse()},c.options);
 const pass=out.verdict===c.expected.verdict&&out.attribution_code===c.expected.code&&(!Object.hasOwn(c.expected,"result")||summary(out).result===c.expected.result);
 const symmetric=JSON.stringify(summary(out))===JSON.stringify(summary(rev));
 const immutable=before===JSON.stringify([c.input,c.options]);
 const labelsIgnored=JSON.stringify(out)===JSON.stringify(current.attributeCase({...c.input,expected_verdict:"forged",category:"forged"},c.options));
 return {case_id:c.id,expected:c.expected,after:summary(out),pass:pass&&symmetric&&immutable&&labelsIgnored,symmetric,immutable,labelsIgnored};});
const arithmetic=arithmeticCases.map(c=>({...c,actual:exact[c.op](...c.args),pass:exact[c.op](...c.args)===c.expected}));
const out={rerun_on:new Date().toISOString().slice(0,10),fang_root:F,wei_root:W,version:current.VERSION,
 layers:{
  rules:{passed:rows.filter(r=>r.pass).length,total:rows.length,symmetric_all:rows.every(r=>r.symmetric),immutable_all:rows.every(r=>r.immutable),labels_ignored_all:rows.every(r=>r.labelsIgnored)},
  arithmetic:{passed:arithmetic.filter(a=>a.pass).length,total:arithmetic.length},
  schema:{checked:schemaChecks.length,cases_with_errors:schemaChecks.filter(s=>s.errors.length).length}
 },
 not_rerun:{layers:["魏 CLI 42","B 适配 7","默认路径对照 32","原 D9 回归 --test"],why:"四层都要 spawnSync 起魏侧 CLI 子进程；评测机 Node 无法 spawn（EPERM）"}};
if(PUB){ const pub=JSON.parse(fs.readFileSync(PUB,"utf8"));
 const pr=new Map(pub.rows.map(r=>[r.case_id,r]));
 out.vs_published={rules_same:0,rules_total:rows.length,rules_diff:[],
  arithmetic_same:(()=>{const pa=new Map(pub.arithmetic.map(a=>[a.id,a]));let s=0;for(const a of arithmetic){const p=pa.get(a.id); if(p&&p.actual===a.actual&&p.pass===a.pass)s++;}return s;})(),
  schema_cases_with_errors_published:(pub.schema_checks||[]).filter(s=>s.errors.length).length};
 for(const r of rows){ const p=pr.get(r.case_id); if(p&&p.after.verdict===r.after.verdict&&p.after.code===r.after.code&&p.pass===r.pass) out.vs_published.rules_same++; else out.vs_published.rules_diff.push(r.case_id); }
}
console.log(JSON.stringify(out,null,2));
process.exit(out.layers.rules.passed===out.layers.rules.total&&out.layers.arithmetic.passed===out.layers.arithmetic.total&&out.layers.schema.cases_with_errors===0?0:1);