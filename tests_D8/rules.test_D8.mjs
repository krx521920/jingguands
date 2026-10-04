import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {alignEventPair,alignEnvelopes,eventLocator} from '../src_D8/alignment_D8.mjs';
import {alignD7Pair,indexContext,verifyGroupD8,alignEvents} from '../src_D8/adapters_D8.mjs';
import {makeSide,developmentPairs} from './fixtures_D8.mjs';
const clone=structuredClone;
const pair=()=>[makeSide('award_contract','L'),makeSide('award_contract','R')];
const run=([a,b])=>alignEventPair(a,b);
const has=(r,c)=>r.reason_codes.some(x=>x.endsWith(c));
for(const p of developmentPairs()) test(p.case_id,()=>{
  const before=JSON.stringify(p),r=alignEventPair(p.left,p.right);
  assert.equal(r.status,p.expected);assert.equal(r.may_compare,false);assert.equal(r.audit.numeric_comparison_executed,false);
  assert.equal(JSON.stringify(p),before);assert.equal(alignEventPair(p.right,p.left).status,p.expected);
  assert.ok(r.reason_codes.length);assert.ok(r.explanation);
});
for(const [label,mutate,code] of [
  ['same company and equal numbers',p=>{delete p[0].identity;delete p[1].identity;},'IDENTITY_NOT_ESTABLISHED'],
  ['no identity anywhere',p=>{p[0].envelope.events[0].fields={};p[1].envelope.events[0].fields={};},'ENTITY_EVIDENCE_INSUFFICIENT'],
  ['no parse for business key',p=>{delete p[0].parsed_document;},'KEY_EVIDENCE_INSUFFICIENT'],
  ['wrong parse SHA',p=>{p[0].parsed_document.doc.file_sha256='0'.repeat(64);},'INVALID_OR_UNLOCATED_INPUT'],
  ['wrong event binding',p=>{p[0].identity.event_ref='other';},'KEY_SCOPE_INVALID'],
  ['candidate not confirmed',p=>{p[0].identity.key.status='needs_review';},'KEY_EVIDENCE_INSUFFICIENT'],
  ['unstandardized key',p=>{p[0].identity.key.standardized=false;},'KEY_EVIDENCE_INSUFFICIENT'],
  ['missing quote',p=>{p[0].identity.key.provenance[0].quote='';},'KEY_EVIDENCE_INSUFFICIENT'],
  ['empty block id',p=>{p[0].identity.key.provenance[0].block_id='';},'KEY_EVIDENCE_INSUFFICIENT'],
  ['wrong page',p=>{p[0].identity.key.provenance[0].page=2;},'KEY_EVIDENCE_INSUFFICIENT'],
  ['invented key quote',p=>{p[0].identity.key.provenance[0].quote='伪造标段编号 OTHER';},'KEY_EVIDENCE_INSUFFICIENT'],
  ['degraded block',p=>{p[0].parsed_document.pages[0].blocks[0].degraded=true;},'ENTITY_EVIDENCE_INSUFFICIENT'],
  ['duplicate event id',p=>{p[0].envelope.events.push(clone(p[0].envelope.events[0]));},'INVALID_OR_UNLOCATED_INPUT'],
  ['false source file id',p=>{p[0].envelope.source.file_id='sha256:'+'f'.repeat(64);},'INVALID_OR_UNLOCATED_INPUT'],
  ['different namespace not negative proof',p=>{
    p[0].identity.namespace.raw_value=p[0].identity.namespace.value='600002';
    for(const f of [...Object.values(p[0].envelope.events[0].fields),p[0].identity.namespace,p[0].identity.key])for(const q of f.provenance)q.quote=q.quote.replaceAll('600001','600002');
    p[0].parsed_document.pages[0].blocks[0].text_raw=p[0].parsed_document.pages[0].blocks[0].text_raw.replaceAll('600001','600002');
  },'NAMESPACE_NOT_ALIGNED'],
]) test(label,()=>{const p=pair();mutate(p);const r=run(p);assert.equal(r.status,'unknown');assert.ok(has(r,code),JSON.stringify(r.reason_codes));});

test('same local observation and changed content',()=>{
  const a=makeSide();assert.equal(alignEventPair(a,clone(a)).status,'same');
  const b=clone(a);b.envelope.events[0].fields.bid_amount.value=999;assert.ok(has(alignEventPair(a,b),'LOCATOR_CONTENT_CONFLICT'));
});
test('same file different runs does not reuse E01',()=>{
  const a=makeSide(),b=clone(a);delete a.identity;delete b.identity;b.envelope.run_id='other';assert.equal(alignEventPair(a,b).status,'unknown');
});
test('numbers not used as identity or equality comparison',()=>{
  const p=pair();p[0].envelope.events[0].fields.bid_amount.value='90071992547409930001';p[1].envelope.events[0].fields.bid_amount.value=0;
  const r=run(p);assert.equal(r.status,'same');assert.equal(r.may_compare,false);assert.equal(r.audit.numeric_comparison_executed,false);
});
test('same key but unrelated actor does not compare transfer counterparties',()=>{
  const p=pair();const s=p[1];s.envelope.events[0].fields.bidder.raw_value=s.envelope.events[0].fields.bidder.value='乙方科技股份有限公司';
  for(const f of [...Object.values(s.envelope.events[0].fields),s.identity.namespace,s.identity.key])for(const q of f.provenance)q.quote=q.quote.replaceAll('甲方','乙方');
  s.parsed_document.pages[0].blocks[0].text_raw=s.parsed_document.pages[0].blocks[0].text_raw.replaceAll('甲方','乙方');
  assert.ok(has(run(p),'SAME_TRANSACTION_DIFFERENT_SUBJECT'));
});
test('unknown direction never becomes reverse match',()=>{
  const a=makeSide('equity_change','L'),b=makeSide('equity_change','R');delete a.envelope.events[0].fields.direction;
  assert.ok(has(alignEventPair(a,b),'DIRECTION_EVIDENCE_INSUFFICIENT'));
});
test('direction value contrary to raw is unknown',()=>{
  const a=makeSide('equity_change','L'),b=makeSide('equity_change','R');b.envelope.events[0].fields.direction.value='decrease';
  assert.ok(has(alignEventPair(a,b),'DIRECTION_EVIDENCE_INSUFFICIENT'));
});
test('two explicit action directions stay separate atomic events',()=>{
  const a=makeSide('pledge','L'),b=makeSide('pledge','R');
  b.envelope.events[0].fields.direction.value=b.envelope.events[0].fields.direction.raw_value='release';
  for(const f of [...Object.values(b.envelope.events[0].fields),b.identity.namespace,b.identity.key]) for(const q of f.provenance)q.quote=q.quote.replaceAll('pledge','release');
  b.parsed_document.pages[0].blocks[0].text_raw=b.parsed_document.pages[0].blocks[0].text_raw.replaceAll('pledge','release');
  const r=alignEventPair(a,b);assert.equal(r.status,'different');assert.ok(has(r,'ACTION_DIRECTION_DIFFERENT'));
});
test('identifier prefix is not a token match',()=>{
  const p=pair();p[0].identity.key.value=p[0].identity.key.raw_value='LOT-2026-00';assert.ok(has(run(p),'KEY_TOKEN_NOT_EXACT'));
});
test('revision language requires review instead of declaring different keys',()=>{
  const p=pair();const s=p[0];
  for(const f of [...Object.values(s.envelope.events[0].fields),s.identity.namespace,s.identity.key])for(const q of f.provenance)q.quote='更正公告：'+q.quote;
  s.parsed_document.pages[0].blocks[0].text_raw='更正公告：'+s.parsed_document.pages[0].blocks[0].text_raw;
  assert.ok(has(run(p),'KEY_QUALIFIED_OR_CORRECTED'));
});
test('multi-match downgraded and no first-row choice',()=>{
  const [a,b]=pair();const ev=clone(a.envelope.events[0]);ev.event_id='E02';a.envelope.events.push(ev);
  const id2=clone(a.identity);id2.event_ref=eventLocator(a.envelope,'E02');
  const r=alignEnvelopes(a.envelope,b.envelope,{left:{parsed_document:a.parsed_document,identities:{E01:a.identity,E02:id2}},right:{parsed_document:b.parsed_document,identities:{E01:b.identity}}});
  assert.equal(r.counts.same,0);assert.equal(r.counts.unknown,2);assert.ok(r.pairs.every(p=>has(p,'MULTIPLE_MATCHES')));
});
test('grouping has no transitive inference and ignores expected_relation',()=>{
  const [a,b]=pair();const g={group_id:'g',members:['a','b'],expected_relation:'same'};
  const x=verifyGroupD8(g,[a.envelope,b.envelope]);g.expected_relation='different';assert.deepEqual(verifyGroupD8(g,[a.envelope,b.envelope]),x);
  assert.equal(x.document_pairs[0].counts.unknown,1);assert.equal(x.numeric_comparison_executed,false);
  assert.equal(verifyGroupD8(g,[a.envelope,null]).missing_envelopes[0],'b');
});
test('Zhang issuer/date/version are context, not event identity',()=>{
  const [a,b]=pair();const i={files:[{case_id:'L',file_id:a.envelope.source.file_id}],issuer_index:{'code:600001':['L']},date_index:{'2008-01-01':[{case_id:'L',hits:[]},{case_id:'other',hits:[{quote:'other'}]}]},version_index:[]};
  const x=indexContext(i,a.envelope);assert.equal(x.used_for_identity,false);assert.equal(x.date_candidates.length,1);assert.equal(x.date_candidates[0].hits.length,0);
  assert.equal(indexContext(i,b.envelope).status,'unknown');
});
test('D7 adapter preserves originals and returns separate D8 schema',()=>{
  const side=s=>({source:{...s.envelope.source,source_schema_version:'0.3',run_id:s.envelope.run_id,is_mock:true},event_id:'E01',event_type:'award_contract',observations:Object.fromEntries(Object.entries(s.envelope.events[0].fields).map(([k,f])=>[k,{original:f}]))});
  const [a,b]=pair(),p={schema_version:'b-alignment-draft/0.1',interface_status:'proposal_D7',pair_id:'p',left:side(a),right:side(b)};
  const before=JSON.stringify(p),r=alignD7Pair(p);assert.equal(r.status,'unknown');assert.equal(r.schema_version,'event-alignment/0.1');assert.equal(JSON.stringify(p),before);
  const withKey=alignD7Pair(p,{left:{identity:a.identity,parsed_document:a.parsed_document},right:{identity:b.identity,parsed_document:b.parsed_document}});assert.equal(withKey.status,'same');
});
test('legacy export forwards safe matching v1 empty result on missing input',()=>assert.deepEqual(alignEvents(),[]));
test('pair expansion bounded, empty input not declared unrelated',()=>{
  const [a,b]=pair();assert.throws(()=>alignEnvelopes(a.envelope,b.envelope,{max_pairs:0}),/PAIR_LIMIT/);
  assert.deepEqual(alignEnvelopes({events:[]},{events:[]}).reason_codes,['NO_EVENT_PAIRS']);
});
test('CLI validates usage without invoking model or writing artifacts',()=>{
  const p=spawnSync(process.execPath,[fileURLToPath(new URL('../src_D8/cli_D8.mjs',import.meta.url))],{encoding:'utf8'});
  assert.equal(p.status,2);assert.match(p.stderr,/Usage/);
});
