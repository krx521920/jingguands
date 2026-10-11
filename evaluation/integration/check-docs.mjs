#!/usr/bin/env node
// 文档一致性校验器（评测侧）
// 背景：2026-10-09 连续 3 次自纠都是「资产改了、引用它的文档没跟着改」。
// 本校验器把该类错误变成机器可查，纳入推送前检查。
// 用法：node evaluation/integration/check-docs.mjs [--json out]
import fs from 'node:fs'; import path from 'node:path';
const argv=process.argv.slice(2); const arg=(k,d)=>{const i=argv.indexOf(k);return i>=0?argv[i+1]:d;};
const OUT=arg('--json',null);
const issues=[];
const ALLOW=JSON.parse(fs.readFileSync('evaluation/integration/check-docs-allow.json','utf8')).externalRefPrefixes;

// ---------- 收集文档 ----------
const docs=[];
(function walk(d){
  for(const e of fs.readdirSync(d,{withFileTypes:true})){
    const p=path.join(d,e.name);
    if(e.isDirectory()) walk(p);
    else if(e.name.endsWith('.md')) docs.push(p.replaceAll('\\','/'));
  }
})('evaluation');

// ---------- 真源：schema 枚举 ----------
const SCHEMA='interface/event-envelope.schema.json';
let schemaEnums=new Set();
if(fs.existsSync(SCHEMA)){
  const t=fs.readFileSync(SCHEMA,'utf8');
  for(const m of t.matchAll(/"enum"\s*:\s*\[([^\]]*)\]/g)){
    for(const v of m[1].matchAll(/"([^"]+)"/g)) schemaEnums.add(v[1]);
  }
}
// 已知 enum 值（schema 不一定在本地时兜底）——与 D1 签署表同源
const KNOWN=[ 'extracted','not_disclosed','not_applicable','not_mentioned','unreadable','needs_review',
 'shares','cny','percent','date','date_range','text','count',
 'holder_shares','total_share_capital','net_assets','other',
 'pledge','equity_change','award_contract','increase','decrease','release' ];
for(const v of KNOWN) schemaEnums.add(v);
// 内部/历史出现的非枚举标识（避免误报）
const NOT_ENUM=new Set(['run_id','run_meta','case_id','event_id','file_id','file_sha256','doc_id','block_id','cell_ref','table_id','source_type','schema_version','parse_meta','page_count','parser_version','is_mock','event_type','code_version','a_run_id','a_run_links','batch_report','call_log','evidence_status','hash_basis','lock_semantics','product_sha256','input_sha256','anchor_sha256','expectation_sha256','actual_value','needs_review_','pepper_','result_snapshot_integrity','raw_value','block_bytes','meta_version','source_layer','ref_v']);
// 已废弃/错误枚举黑名单（历史纠错中确认为错的写法）
const DEPRECATED=[['held_shares','holder_shares']];
// 勘误语境关键词（出现则不判错）
const ERRATA_CTX=/勘误|错误|原写|此前|应为|修正|作废|deprecat|历史|纠正/i;

function editDistance1(a,b){
  if(Math.abs(a.length-b.length)>1) return false;
  // 简单近似：长度相同差 1 字符，或长度差 1 是插入/删除
  if(a.length===b.length){ let d=0; for(let i=0;i<a.length;i++) if(a[i]!==b[i]) d++; return d===1; }
  const [s,l]=a.length<b.length?[a,b]:[b,a];
  let i=0,j=0,diff=0;
  while(i<s.length&&j<l.length){ if(s[i]===l[j]){i++;j++;} else {diff++;j++; if(diff>1)return false;} }
  return true;
}

const enumLike=/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/;   // 形如 xxx_yyy（排除单段标识）

for(const d of docs){
  const raw=fs.readFileSync(d,'utf8'); const lines=raw.split(/\r?\n/);
  const docIsErrata = ERRATA_CTX.test(d) || ERRATA_CTX.test(lines.slice(0,6).join(' '));
  lines.forEach((line,i)=>{
    const ln=i+1;
    // ---- C2 废弃枚举 ----
    for(const [bad,good] of DEPRECATED){
      if(!line.includes(bad)) continue;
      if(docIsErrata||ERRATA_CTX.test(line)) continue;   // 勘误文档/语境豁免
      issues.push({rule:'C2_DEPRECATED_ENUM',file:d,line:ln,token:bad,hint:`应写 ${good}`,text:line.trim().slice(0,90)});
    }
    // ---- C1 文件引用存在性（仅核本仓评测树；上游/他仓文件视为外部）----
    for(const m of line.matchAll(/`([^`]+)`/g)){
      let ref=m[1].trim().replace(/^(node|python3?|npm run|pnpm|bash|sh)\s+(-m\s+)?/i,'').trim();
      if(ref.includes('{')) continue;
      if(ref.includes('=')) ref=ref.split('=').pop().trim().replace(/^["']|["']$/g,'');
      if(ref.startsWith('http')||ref.includes('<')||ref.includes('*')||ref.includes('…')||ref.includes('|')) continue;
      if(!/\.(md|json|mjs|cjs|py|pdf|csv|txt|ya?ml)$/i.test(ref)) continue;
      if(!ref.includes('/')) continue;
      const dir=path.posix.dirname(d);
      const anc=[]; let cur=dir; while(cur && cur!=='.'){ anc.push(cur); cur=path.posix.dirname(cur); } anc.push('');
      const cands=anc.map(a=>a?path.posix.join(a,ref):ref).concat(['evaluation/'+ref]);
      if(cands.some(c=>fs.existsSync(c))) continue;
      if(ALLOW.some(x=>ref.startsWith(x))) continue;
      const EXT_PREFIXES=['runs/','scripts/','corpus/','sample/','tools/','interface/','reviews/','apps/','docs/'];
      if(EXT_PREFIXES.some(x=>ref.startsWith(x))) continue;
      issues.push({rule:'C1_MISSING_FILE_REF',file:d,line:ln,token:ref,hint:'本仓评测树内未找到（相对文档目录与仓库根均已试）',text:line.trim().slice(0,90)});
    }
    // ---- C4 引用不入库目录（tmp/）——2026-10-10 新增 ----
    // 起因：single-doc-firsttest.md 引用了 `tmp/d11-single.mjs`；本机存在（未入库）→ 我的门误判为绿，
    //       魏在干净克隆里才报出来。tmp/ 永不随包，引用它=文档坏味道，一律标出。
    for(const m of line.matchAll(/`([^`]+)`/g)){
      const ref=m[1].trim();
      if(/^tmp\//.test(ref)) issues.push({rule:'C4_TMP_REF',file:d,line:ln,token:ref,hint:'引用了不入库目录 tmp/（干净克隆里不存在）——改为描述性文字或指向已入库文件',text:line.trim().slice(0,90)});
    }    // ---- C3 近似枚举（疑似笔误）----
    for(const m of line.matchAll(/`([a-z][a-z0-9_]{3,})`/g)){
      const tok=m[1];
      if(!enumLike.test(tok)) continue;
      if(schemaEnums.has(tok)||NOT_ENUM.has(tok)) continue;
      if(ERRATA_CTX.test(line)) continue;
      const near=[...schemaEnums].find(e=>editDistance1(tok,e));
      if(near) issues.push({rule:'C3_NEAR_ENUM_TYPO',file:d,line:ln,token:tok,hint:`与枚举 ${near} 仅差 1 字符，疑似笔误`,text:line.trim().slice(0,90)});
    }
  });
}

const byRule={};
for(const x of issues) byRule[x.rule]=(byRule[x.rule]||0)+1;
const out={checked_on:new Date().toISOString().slice(0,10),docs:docs.length,result:issues.length?'FAIL':'PASS',byRule,issues};
if(OUT) fs.writeFileSync(OUT,JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({result:out.result,docs:out.docs,byRule,count:issues.length},null,2));
if(issues.length){ console.log('--- 前 20 条 ---'); for(const x of issues.slice(0,20)) console.log(`[${x.rule}] ${x.file}:${x.line} \`${x.token}\` — ${x.hint}`); }
process.exit(issues.length?1:0);
