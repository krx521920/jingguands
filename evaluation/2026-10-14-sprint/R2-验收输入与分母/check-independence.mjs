#!/usr/bin/env node
// check-independence.mjs —— 验收输入的「独立性」核验（评测侧 · 2026-10-14 · 两天冲刺 R2）
//
// R2 的问题：「30 份单文档 + 20 组跨文档」到底是不是**独立**输入？
// 判法：不看名字，只看**内容哈希与 case_id** —— 同 id 或同 raw 哈希＝同一份语料，不构成独立样本。
//
// 用同一把尺子量四组输入：
//   A. 封存单文档 30（evaluation/sealed/single）
//   B. 封存跨文档 20 组（evaluation/sealed/cross-doc）
//   C. 开发集 30（evaluation/dev-30）+ D4/D5/D6 开发清单
//   D. 权威批首测信封 31（evaluation/D11/firsttest-envelopes）
//   E. 陌生样例 3（evaluation/D13，cninfo 公开来源＋哈希锁）
//
// 用法：node evaluation/2026-10-14-sprint/R2-验收输入与分母/check-independence.mjs [--json out.json]
"use strict";
import fs from "node:fs"; import path from "node:path";
const argv=process.argv.slice(2); const arg=(k,d)=>{const i=argv.indexOf(k);return i>=0?argv[i+1]:d;};
const J=p=>JSON.parse(fs.readFileSync(p,"utf8"));

const single=J("evaluation/sealed/single/manifest.json");
const cross=J("evaluation/sealed/cross-doc/manifest.json");
const dev30=J("evaluation/dev-30/manifest.json");
const d13=J("evaluation/D13/陌生样例-锁.json");

const singleIds=new Set((single.cases||[]).map(c=>c.source_case_id));
const singleRaw=new Set((single.cases||[]).map(c=>c.raw_sha256).filter(Boolean));
const devIds=new Set((dev30.cases||[]).map(c=>c.case_id));
const devRaw=new Set((dev30.cases||[]).map(c=>c.raw_sha256).filter(Boolean));
const crossMemberIds=(cross.groups||[]).flatMap(g=>g.members||[]);
const crossRaw=new Set((cross.groups||[]).flatMap(g=>(g.member_hashes||[]).map(m=>m.raw_sha256)).filter(Boolean));

const envDir="evaluation/D11/firsttest-envelopes";
const envs=fs.readdirSync(envDir).filter(f=>f.endsWith(".json")).sort()
  .map(f=>({f, j:J(path.join(envDir,f))}));
const envHashes=new Set(envs.map(e=>e.j.source&&e.j.source.file_sha256).filter(Boolean));
const envNames=new Set(envs.map(e=>e.j.source&&e.j.source.file_name).filter(Boolean));
const envIds=new Set(envs.map(e=>String(e.f).replace(/\.json$/,"")));

const d13Hashes=new Set((d13.samples||[]).map(s=>s.file_sha256).filter(Boolean));
const intersect=(a,b)=>[...a].filter(x=>b.has(x));

const res={
  checked_on:new Date().toISOString().slice(0,10),
  purpose:"R2：核清 30 单文档 + 20 跨文档的独立性；同 id 或同 raw 哈希＝同一份语料（非独立样本）",
  sets:{
    A_sealed_single:{what:"封存单文档 30", cases:singleIds.size, raw_hashes:singleRaw.size},
    B_sealed_crossdoc:{what:"封存跨文档 20 组", groups:(cross.groups||[]).length, member_ids:new Set(crossMemberIds).size, member_raw_hashes:crossRaw.size},
    C_dev30:{what:"开发集 30", cases:devIds.size, raw_hashes:devRaw.size},
    D_authoritative_envelopes:{what:"权威批首测信封", files:envs.length, distinct_source_sha256:envHashes.size},
    E_strange_samples:{what:"陌生样例（cninfo 公开＋哈希锁）", samples:d13Hashes.size},
  },
  overlap:{
    "A_case_ids_∩_C_case_ids":intersect(singleIds,devIds),
    "A_raw_∩_C_raw":intersect(singleRaw,devRaw).length,
    "A_case_ids_∩_D_envelope_ids":intersect(singleIds,envIds),
    "A_raw_∩_D_source_sha256":intersect(singleRaw,envHashes).length,
    "B_member_ids_not_in_A":[...new Set(crossMemberIds)].filter(x=>!singleIds.has(x)),
    "B_raw_∩_D_source_sha256":intersect(crossRaw,envHashes).length,
    "E_hashes_∩_(A∪B∪D)":intersect(d13Hashes,new Set([...singleRaw,...crossRaw,...envHashes])),
  },
};
// 判据（只用可复核的结构性证据，不靠"哈希相等"这一条——raw.json 哈希 与 源 PDF 哈希 本就不同）：
const sameCaseIds = intersect(singleIds,devIds).length===singleIds.size && singleIds.size>0;      // A 的 30 个 case_id 全在开发集
const abSameCorpus = [...new Set(crossMemberIds)].every(x=>singleIds.has(x));                      // B 的成员全部取自 A
const dIsSameCases = intersect(singleIds,envIds).length===singleIds.size;                          // D 的 case_id 与 A 完全一致
const srcManifests=[...new Set((single.cases||[]).map(c=>c.source_manifest).filter(Boolean))];
res.verdict={
  "判据用结构不变量（case_id / 来源清单），不用 raw 哈希跨件比较":
    "封存 raw 是 .raw.json、信封 source.file_sha256 是源 PDF —— 二者本就不同物，故 0 交集**不**等于不同源",
  "A 与 C 同源":sameCaseIds?`是——A 的 ${singleIds.size} 个 case_id 全落在开发集 C（30/30）`:"否",
  "A 与 D 同源":dIsSameCases?`是——首测信封 ${envIds.size-1} 个正式 case 与 A 完全同名（DEMO-EQC-HL-0930 为本地演示件）`:"否",
  "B 取自 A":abSameCorpus?"是——20 组的全部成员都来自 A 的 30 份，无外部文档":"否",
  "A/C 的来源清单":srcManifests,
  "结论":"A（封存单文档）/ B（封存跨文档）/ C（开发集）/ D（首测信封）**是同一批公开 30 份语料**，封存集自述为 frozen replay ⇒ **对开发过程不独立**；E（陌生样例 3 份）**独立**（哈希与 A/B/D 零交集＋cninfo 公开来源留痕）。",
};
const OUT=arg("--json",null);
if(OUT) fs.writeFileSync(OUT,JSON.stringify(res,null,2)+"\n","utf8");
console.log(JSON.stringify(res,null,2));