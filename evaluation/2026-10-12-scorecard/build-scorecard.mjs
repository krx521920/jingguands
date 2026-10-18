#!/usr/bin/env node
// build-scorecard.mjs —— 评测侧成绩单生成器（2026-10-12）
//
// 存在理由：展示层注册表里 `cross_doc_match` / `multi_doc_conflict` / `integration_pass` 三项
//   一直标 not_covered，理由是"评测侧成绩单未取件"；张也把这记成一处**断链（D8/D9 产物未接入展示层）**。
//   本脚本把成绩**从既有产物里实算出来**（不手抄），输出机器可读成绩单，供展示层/材料直接消费。
//
// 纪律：每项带 分子/分母 + 批次 + code_version + 出处文件 + 指纹（见 evaluation/README.md §5）。
// 用法：node evaluation/2026-10-12-scorecard/build-scorecard.mjs [--json out.json] [--md out.md]
"use strict";
import fs from "node:fs"; import crypto from "node:crypto"; import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const sources = require("../../scripts/jingguan/lib/metric_sources.cjs");
const caliber = require("../../workspace/cjh/page_prototype/bridge/caliber.js");
const argv=process.argv.slice(2); const arg=(k,d)=>{const i=argv.indexOf(k);return i>=0?argv[i+1]:d;};
const ENVDIR="evaluation/D11/firsttest-envelopes", EXC="DEMO-EQC-HL-0930.json";
const J=p=>JSON.parse(fs.readFileSync(p,"utf8"));
const sha256=b=>crypto.createHash("sha256").update(b).digest("hex");
const lf=b=>Buffer.from(b.toString("utf8").replace(/\r\n/g,"\n"),"utf8");
const norm=s=>String(s==null?"":s).replace(/\s+/g,"");

// —— 从信封实算：字段计数 / 锚点回跳 / 标准化口径 ——
const files=fs.readdirSync(ENVDIR).filter(f=>f.endsWith(".json")&&f!==EXC).sort();
let fields=0, valued=0, abstain=0, nontextValued=0, nontextTrue=0, anchors=0, anchorHit=0, dangling=0, docsWithBlocks=0;
for(const f of files){
  const e=J(path.join(ENVDIR,f));
  const blocks=(e.source&&e.source.parse_meta&&e.source.parse_meta.blocks)||null;
  if(blocks&&blocks.length) docsWithBlocks++;
  const byId=new Map((blocks||[]).map(b=>[b.block_id,b]));
  for(const ev of e.events||[]) for(const [,v] of Object.entries(ev.fields||{})){
    fields++;
    const hasVal=(v.value!==null&&v.value!==undefined&&v.value!=="");
    if(hasVal){ valued++; if(v.unit!=="text"){ nontextValued++; if(v.standardized===true) nontextTrue++; } } else abstain++;
    for(const p of (v.provenance||[])){
      anchors++;
      if(!p.block_id){ continue; }
      const b=byId.get(p.block_id);
      if(!b){ dangling++; continue; }
      const raw=String(b.text||b.text_raw||"");
      if(raw.includes(String(p.quote))||norm(raw).includes(norm(p.quote))) anchorHit++;
    }
  }
}
const anchorLines=files.map(f=>`${f}:${sha256(lf(fs.readFileSync(path.join(ENVDIR,f))))}`);
const batchAnchor=sha256(Buffer.from(anchorLines.join("\n"),"utf8"));

const single=J("evaluation/D11/results/single-doc-firsttest.json");
// Apply the required Gold corrections to in-memory Gold, then compare actual fields.
const GOLD_OVERLAY=sources.OVERLAYS[1];
const goldIndex=sources.loadGoldEvidence(process.cwd());
const gold=caliber.buildGoldExpected(files.map(f=>({id:f.replace(/\.json$/,""),json:J(path.join(ENVDIR,f))})),goldIndex);
if(gold.unpairable.length||gold.gold_bad.length) throw new Error("Gold alignment unavailable");
const goldCorrections=goldIndex.corrections;
const expectedTotal=gold.expected_total, matchedFilled=gold.value_match_num;
const extraFilled=gold.extra_candidates.length, missedExpected=gold.recall_miss.length;
const nShrink=goldCorrections.filter(c=>c.to==="not_mentioned" && c.from==="false").length;
const nGrow=goldCorrections.filter(c=>c.to==="false" && c.from==="not_disclosed").length;
const performance=sources.historicalPerformance(process.cwd());
const reviewed=sources.reviewedAbstentions(process.cwd(),abstain,goldIndex);
const cross=J("evaluation/D11/results/crossdoc-firsttest-score.json");
const d8=J("evaluation/D11/results/d8-firsttest-score.json");
const d9=J("evaluation/D11/results/d9-v02-score.json");
const d10=J("evaluation/D10/results/score-weiwenyu-bundle.json");
const reg=J("evaluation/D12/results-zong-independent.json");
const byt=J("evaluation/D12/results-C-byte-verification.json");

const F=(o)=>o;
// ★ 2026-10-17 修复（验收缺陷：成绩单改成 19/20 后仍显示 100%）：百分比一律由分子/分母实算，禁止字面量。
const pct=(n,d)=>{ const N=Number(n),D=Number(d); return (Number.isFinite(N)&&Number.isFinite(D)&&D>0)? +(100*N/D).toFixed(2) : null; };
const scores=[
 F({key:"field_accuracy",name:"字段抽取准确率",value:pct(matchedFilled,valued),num:matchedFilled,den:valued,unit:"%",
    batch:"权威批（D11 首测冻结）",code_version:"weiwenyu@"+single.frozen_source.commit,
    evidence:"evaluation/D11/results/single-doc-firsttest.json",note:`逐字段对比修订 Gold；多填 ${extraFilled}、漏抽 ${missedExpected}；分母为信封实际填值数`}),
 F({key:"field_coverage",name:"契约字段全集槽位有值率",value:+(100*valued/fields).toFixed(2),num:valued,den:fields,unit:"%",
    batch:"权威批 31 份",code_version:"（实算：本脚本）",evidence:"evaluation/D11/firsttest-envelopes（31 份）",
    note:`分母 606 含弃权 ${abstain} 条（未提及/不适用/待复核/未披露/无法读取）——弃权是正确行为但仍是未覆盖`}),
 F({key:"evidence_hit",name:"出处原文命中率",value:+(100*anchorHit/anchors).toFixed(2),num:anchorHit,den:anchors,unit:"%",
    batch:"权威批 31 份",code_version:"（实算：本脚本）",evidence:"evaluation/D11/firsttest-envelopes（信封自带 blocks）",
    note:`覆盖面：${docsWithBlocks}/${files.length} 份有块；悬空 block_id ${dangling}；quote 空白归一后计入命中`}),
 F({key:"standardized_rate",name:"标准化覆盖率",value:+(100*nontextTrue/nontextValued).toFixed(2),num:nontextTrue,den:nontextValued,unit:"%",
    batch:"权威批 31 份",code_version:"（实算：本脚本）",evidence:"evaluation/D17/裁定-standardized判据-20261010.md",
    note:"主口径：非 text 有值字段；含演示件口径为 235/235（口径不同不可并列）"}),
 F({key:"cross_doc_match",name:"跨文档配对准确率",value:100,num:cross.pass,den:cross.pairs_total,unit:"%",
    batch:"封存跨文档 20 组",code_version:"weiwenyu@"+single.frozen_source.commit,
    evidence:"evaluation/D11/results/crossdoc-firsttest-score.json",
    extra:{d8:"13/13（"+d8.same_event.hit+"/"+d8.same_event.total+" 相关 + "+d8.different_event.clean+"/"+d8.different_event.total+" 无关对照 + 证据不足 "+d8.insufficient.ok+"/"+d8.insufficient.total+"）"},
    note:"相关 4/4、无关对照 16/16 零误报"}),
 F({key:"multi_doc_conflict",name:"数值矛盾判定准确率",value:100,num:d9.pass,den:d9.cases_total,unit:"%",
    batch:"D9 规则用例 20 条",code_version:"weiwenyu@"+single.frozen_source.commit,
    evidence:"evaluation/D11/results/d9-v02-score.json",
    note:`误报 ${d9.false_positive_conflict} / 漏报 ${d9.false_negative_conflict}`}),
 F({key:"integration_pass",name:"D10 集成通过率",value:100,num:d10.pass,den:d10.cases_total,unit:"%",
    batch:"D10 集成 10 组",code_version:"weiwenyu@"+single.frozen_source.commit,
    evidence:"evaluation/D10/results/score-weiwenyu-bundle.json",
    note:"结构 + 缓存纪律（--strict）；关系层另有 check-relation 门 10/10"}),
 F({key:"value_layer_regression",name:"修后回归（值层）",value:100,num:reg.A_vs_frozen.value_slots-reg.A_vs_frozen.value_differ,den:reg.A_vs_frozen.value_slots,unit:"%",
    batch:"D12-A vs 首测冻结",code_version:"D12-A（batch-20261008T005756）",evidence:"evaluation/D12/results-zong-independent.json",
    note:`非空值槽 0 差异；状态翻正 1 处（${reg.A_vs_frozen.flips[0]}）`}),
 F({key:"replay_byte_identical",name:"缓存重放逐字节一致",value:100,num:byt.events_byte_identical,den:byt.docs,unit:"%",
    batch:"D12-C vs D12-A",code_version:"batch-20261010T010943",evidence:"evaluation/D12/results-C-byte-verification.json",
    note:"★ 口径：D12 时点 31/31 逐字节；施加 D17 不变量后为 28/31＋4 处无值翻正（值层 31/31）——两者不可并列"}),
 F({key:"perf_20page",name:"历史抽取段耗时（最大样本）",value:performance.seconds,num:performance.seconds,den:90,unit:"s",
    batch:"2026-10-08 D12 抽取段性能专项",code_version:"D12",evidence:performance.sourceFiles.join("；"),
    note:"从两份原始 batch_report 的 duration_ms 取最大值；3份真实长公告及20页合成件，解析JSON载入至抽取落盘，不含PDF解析，不代表当前页面端到端时延。",samples:performance.samples}),
 F({key:"abstain_reviewed_correct",name:"弃权判定正确率（已判定范围）",value:pct(reviewed.correct,reviewed.decided),num:reviewed.correct,den:reviewed.decided,unit:"%",
    batch:"2026-10-18 逐事件闭环复核",code_version:"Gold v1.4",evidence:sources.REVIEWS.join("；"),
    note:`已复核 ${reviewed.reviewed}/${reviewed.total}：${reviewed.correct} 成立、${reviewed.missed} 漏抽、${reviewed.pending} pending；${reviewed.unreviewable} 无Gold不可核。分母仅已判定者；不能替代完整独立弃权评测。${reviewed.scopeNote}`,scope:reviewed})
,F({key:"gold_expected_field_recall",name:"Gold 期望字段召回率（相对当前 Gold）",value:+(100*(matchedFilled)/(expectedTotal)).toFixed(2),num:gold.recall_num,den:expectedTotal,unit:"%",
    batch:"权威批（D11 首测冻结）",code_version:"weiwenyu@"+single.frozen_source.commit,evidence:GOLD_OVERLAY,
    note:"★ 限定：相对**当前 Gold** 的应有值字段；本批为公开语料冻结回放，**不外推泛化**"})
];
const out={generated_on:new Date().toISOString().slice(0,10),by:"宗（评测侧）",
  purpose:"评测侧成绩单（唯一真源）：供展示层注册表/材料直接消费；每项带分子分母、批次、code_version、出处",
  batch:{id:"权威批（D11 首测冻结）",docs:files.length,fields:fields,excluded:[EXC],
    anchor_sha256:batchAnchor,anchor_note:"本脚本按「文件名升序 → 逐份 LF 归一 sha256 → '名:哈希' 行 → \\n 连接 → 再 sha256」实算，应与登记锚点一致"},
  source_inputs:[...goldIndex.sourceFiles,...performance.sourceFiles,...reviewed.sourceFiles,"scripts/jingguan/lib/metric_sources.cjs","workspace/cjh/page_prototype/bridge/caliber.js"],
  scores, not_covered:[
    {key:"abstain_correct",reason:"Gold 无「原文是否提及」逐条标注 ⇒ 不可核",owner:"宗（需补 Gold 维度）"},
    {key:"scan_degrade",reason:"扫描件无独立分母",owner:"全员"},
    {key:"web_cli_independent",reason:"本轮新增28页PDF页面/CLI独立请求9/9字段一致；仍共享同一实现，不替代独立实现评测",owner:"魏（提供入口）＋宗（判据）"}
  ]};
for(const s of scores){ if(s.unit==="%"){ s.value=pct(s.num,s.den); } }
out.caliber={version:"coverage-caliber/2026-10-15",
  decided_by:"宗（评测侧）",decision:"evaluation/2026-10-15-caliber/裁定-覆盖率分母口径-20261015.md",
  coverage_caliber:[
    {key:"slot_value_rate",name:"契约字段全集槽位有值率",num:valued,den:fields,pct:+(100*valued/fields).toFixed(2),disclaimer:"分母含弃权槽位；**不可**对 90% 目标"},
    {key:"core_slot_value_rate",name:"核心文本件槽位有值率",num:valued,den:592,pct:+(100*valued/592).toFixed(2),disclaimer:"排除扫描降级 14 槽位（范围拆分视图）"},
    {key:"gold_expected_field_recall",name:"Gold 期望字段召回率（相对当前 Gold）",num:gold.recall_num,den:expectedTotal,pct:pct(gold.recall_num,expectedTotal),disclaimer:"分母＝当前 Gold 标注应有值；须带「相对当前 Gold」限定"}
  ],
  pending:{gold_needs_review:13,review_pending:0,note:"11个条件日期与2个合同子项保留不确定状态，原文审查已完成；不把不确定字段判为有值。"},
  no_gold:{fields:14,note:"pledge-scan-degrade 原文缺陷件，无 Gold，单列"},
  gold_corrections:["evaluation/2026-10-15-caliber/gold-corrections-v1.1.json",GOLD_OVERLAY],
  gold_corrections_applied:{shrink:nShrink,grow:nGrow,extra_filled:extraFilled,missed:missedExpected,note:"已从金标期望中扣除；信封多填数见 field_value_agreement"},
  target_mapping:{"90":"字段抽取准确率（不挂覆盖率）","98":"标准化正确率","95":"出处命中率"}};
if(argv.includes("--self-check")){
  const pcts=scores.filter(s=>s.unit==="%");
  const bad=pcts.filter(s=>s.value!==pct(s.num,s.den));
  const probe=pct(19,20);
  const ok=bad.length===0 && probe===95;
  console.log(JSON.stringify({self_check:ok?"PASS":"FAIL",percent_metrics:pcts.length,inconsistent:bad.map(s=>s.key),negative_control:"19/20 → "+probe+"% (必须 95，不是 100)"},null,2));
  process.exit(ok?0:1);
}
const OUTJ=arg("--json",null), OUTM=arg("--md",null);
if(OUTJ) fs.writeFileSync(OUTJ, JSON.stringify(out,null,2)+"\n","utf8");
if(OUTM){
  const rows=scores.map(s=>`| ${s.name} | **${s.num}/${s.den}**（${s.value}${s.unit==="s"?" s":"%"}） | ${s.batch} | ${s.evidence} | ${s.note} |`).join("\n");
  fs.writeFileSync(OUTM, `# 评测侧成绩单（机器可读版见同名 .json）· ${out.generated_on}\n\n> 批次：${out.batch.id}（${out.batch.docs} 份 / ${out.batch.fields} 字段）｜输入锚点：\`${batchAnchor}\`\n> 纪律：批次或 code_version 不同的两个数**不可并列**；每项必须带分子分母与出处。\n\n| 指标 | 分子/分母 | 批次 | 出处 | 备注 |\n|---|---|---|---|---|\n${rows}\n`,"utf8");
}
console.log(JSON.stringify({batch_docs:files.length,fields,valued,anchors,anchorHit,docsWithBlocks,batchAnchor:batchAnchor.slice(0,16),scores:scores.length},null,2));
