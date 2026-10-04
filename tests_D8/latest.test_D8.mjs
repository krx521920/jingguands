import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {alignDocuments,alignEvents,explainGroup} from '../src_D8/matching_D8.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../public_dev_D8/'+p,import.meta.url),'utf8'));
const env=id=>read('envelopes_D8/'+id+'_D8.json');
const contexts=read('identity_context_D8.json').documents;
const pair=()=>[env('D5-EQC-001'),env('D5-EQC-002')];
const ctx=e=>structuredClone(contexts[e.source.file_sha256]);
for(const set of ['pairs.dev30_D8.json','demo_pairs_D8.json'])for(const g of read(set).groups)test(g.group_id+' public pair',()=>{
  const [a,b]=g.members.map(env),before=JSON.stringify([a,b]);
  const r=alignDocuments(a,b);assert.equal(r.predicted_relation,g.expected_relation==='insufficient'?'unknown':g.expected_relation);
  assert.equal(r.numeric_comparison_executed,false);assert.equal(r.may_compare,false);assert.equal(JSON.stringify([a,b]),before);
  if(r.status!=='same')assert.deepEqual(alignEvents(a,b),[]);
});
test('public examples are 4+8+1, not synthetic six positives',()=>{
  const g=read('pairs.dev30_D8.json').groups;assert.equal(g.length,13);
  assert.deepEqual(['related','unrelated','insufficient'].map(s=>g.filter(x=>x.expected_relation===s).length),[4,8,1]);
});
test('same company, same date and equal values alone remain unknown',()=>{
  const [a,b]=pair();assert.equal(alignDocuments(a,b,{left:{context:null},right:{context:null}}).status,'unknown');
});
test('removing just transaction annotation preserves company but cannot prove event',()=>{
  const [a,b]=pair(),x=ctx(a),y=ctx(b);x.transactions=[];y.transactions=[];
  assert.equal(alignDocuments(a,b,{left:{context:x},right:{context:y}}).status,'unknown');
});
for(const [name,mutate] of [
  ['unlocated block',c=>c.transactions[0].statement[0].block_id='invented'],
  ['wrong signing date',c=>c.transactions[0].date.value='2026-09-24'],
  ['unquoted buyer',c=>c.transactions[0].buyer.value='无依据的人'],
  ['changed seller roles',c=>{const t=c.transactions[0];[t.buyer,t.sellers[0]]=[t.sellers[0],t.buyer];}],
  ['seller set incomplete',c=>c.transactions[0].sellers.pop()],
  ['wrong source hash',c=>c.file_sha256='f'.repeat(64)],
  ['wrong event reference',c=>c.transactions[0].event_ids=['E999']],
  ['bad page',c=>c.transactions[0].statement[0].page=999],
  ['bad quote',c=>c.transactions[0].statement[0].quote='并不存在的引文'],
])test(name+' cannot force related',()=>{
  const [a,b]=pair(),c=ctx(a);mutate(c);assert.equal(alignDocuments(a,b,{left:{context:c}}).status,'unknown');
});
test('A numeric values cannot change transaction identity',()=>{
  const [a,b]=pair();for(const e of a.events)for(const k of ['shares_before','shares_after','change_shares'])e.fields[k].value='90071992547409930001';
  assert.equal(alignDocuments(a,b).status,'same');assert.equal(alignEvents(a,b).length,0);
});
test('safe integer strings keep the matcher contract; superprecision not coerced',()=>{
  const [a,b]=pair(),before=alignEvents(a,b);assert.equal(before.length,9);
  for(const e of a.events)for(const k of ['shares_before','shares_after','change_shares'])e.fields[k].value=String(e.fields[k].value);
  assert.deepEqual(alignEvents(a,b),before);
});
test('missing direction is not reverse matching',()=>{
  const a=env('D5-EQC-004'),b=env('D5-EQC-005');delete a.events[0].fields.direction;
  assert.equal(alignDocuments(a,b).status,'same');assert.deepEqual(alignEvents(a,b),[]);
});
test('direction inconsistent with named transaction role cannot authorize comparison',()=>{
  const [a,b]=pair();a.events[0].fields.direction.value='increase';assert.equal(alignDocuments(a,b).status,'unknown');assert.deepEqual(alignEvents(a,b),[]);
});
test('aggregate is not split into individual shareholders',()=>{
  const a=env('D5-EQC-001'),b=env('D5-EQC-003');assert.equal(alignDocuments(a,b).status,'same');assert.deepEqual(alignEvents(a,b),[]);
});
test('transfer counterparties remain complementary atomic actions',()=>{
  const r=alignDocuments(env('D5-EQC-004'),env('D5-EQC-005'));
  assert.equal(r.event_pairs[0].relation,'same_transaction_complementary');assert.equal(r.event_pairs[0].direct_field_alignment_allowed,false);
});
test('same-company real negative ignores shared 249519764 shares',()=>{
  const a=env('D5-EQC-006'),b=env('DEMO-EQC-HL-0930');
  assert.equal(a.events[0].fields.shares_before.value,b.events[0].fields.shares_before.value);
  assert.ok(alignDocuments(a,b).reasons.includes('DISJOINT_DILUTION_INTERVALS'));
});
test('granularity challenge files are unknown, not called different for lack of match',()=>{
  for(const id of ['D5-EQC-006','DEMO-EQC-HL-0930'])assert.equal(alignDocuments(env('DEMO-EQC-HL-SIMPLE'),env(id)).status,'unknown');
});
test('source metadata on both sides survives; missing issuer code is not invented',()=>{
  const r=explainGroup({group_id:'g',members:['a','b']},[env('D5-EQC-002'),env('D5-EQC-003')]);
  assert.equal(r.member_meta[1].issuer_code,null);assert.equal(r.member_meta[0].issuer_code,'920580');
  assert.ok(r.member_meta.every(x=>x.file_sha256&&x.run_id));
  assert.equal(r.member_meta[0].notice_number,null);assert.equal(r.member_meta[1].notice_number,null);
  assert.ok(env('D5-EQC-002').source.parse_meta.blocks.some(b=>b.text_raw?.includes('前次')&&b.text_raw?.includes('2025-097')));
});
test('scan-degraded side retains file and run trace without fabricating issuer metadata',()=>{
  const a=env('pledge-scan-degrade'),b=env('D6-AWD-001');
  const r=explainGroup({group_id:'g',members:['scan','award']},[a,b]);
  assert.equal(r.predicted_relation,'unknown');assert.equal(r.member_meta[0].file_sha256,a.source.file_sha256);
  assert.equal(r.member_meta[0].run_id,a.run_id);assert.equal(r.member_meta[0].issuer_code,null);
});
test('expected relation and grouping labels do not participate',()=>{
  const args={group_id:'g',members:['a','b'],expected_relation:'related',relation_basis:'foo'};
  const [a,b]=pair(),r=explainGroup(args,[a,b]);args.expected_relation='unrelated';args.relation_basis='invented';
  assert.deepEqual(explainGroup(args,[a,b]),r);
});
test('three member mixed groups have no transitive inference',()=>{
  const r=explainGroup({group_id:'g',members:['a','b','c']},[...pair(),env('D5-EQC-006')]);
  assert.equal(r.document_pairs.length,3);assert.equal(r.predicted_relation,'unknown');assert.deepEqual(r.consistency.conflicts,[]);
});
test('missing envelope emits unknown with null trace fields',()=>{
  const r=explainGroup({group_id:'g',members:['a','b']},[null,env('D5-EQC-001')]);assert.equal(r.predicted_relation,'unknown');assert.equal(r.a_run_links[0].a_run_id,null);
});
test('mixed mock and real, empty and malformed events cannot cause a same judgment',()=>{
  for(const malformed of [null,{}, {schema_version:'0.3',events:[null]}, {...env('D5-EQC-001'),events:[]}])assert.equal(alignDocuments(malformed,env('D5-EQC-002')).status,'unknown');
  const [a,b]=pair();a.is_mock=true;assert.equal(alignDocuments(a,b).status,'unknown');
});
test('degraded, edited or mismatched evidence prevents positive judgments',()=>{
  const [a,b]=pair();a.source.parse_meta.blocks=[];assert.equal(alignDocuments(a,b).status,'unknown');
  const [c,d]=pair();const t=ctx(c).transactions[0];c.source.parse_meta.blocks.find(b=>b.block_id===t.statement[0].block_id).text_raw='changed';
  assert.equal(alignDocuments(c,d).status,'unknown');
});
test('duplicate atomic event mapping yields no arbitrary first-row field pair',()=>{
  const [a,b]=pair(),c=ctx(a),copy=structuredClone(a.events[0]);copy.event_id='E09';a.events.push(copy);c.transactions[0].event_ids.push('E09');
  const pairs=alignEvents(a,b,{left:{context:c}});assert.equal(pairs.filter(p=>p.entityA==='蔚文绪').length,0);
});
test('unsafe qualifiers and cumulative scope excluded from legacy matcher',()=>{
  const [a,b]=pair();a.events[0].fields.change_shares.scope='cumulative';a.events[0].fields.shares_after.qualifier='approx';
  assert.equal(alignEvents(a,b).length,7);
});
