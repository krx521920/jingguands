/** Node.js 24；只读取包内冻结证据，输出 JSON；不修改原文件或 Gold。 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { checkAwardEnvelope, normalizeCurrency } from './src_D6/award_check_D6.ts';
import { normalizeFieldValue } from './依据_D6/上游标准化原始_D6.mjs';
import { validateAgainstSchema } from './依据_D6/schema_validator_D6.mjs';
import { checkRegistry } from './依据_D6/registry_D6.mjs';
import { checkProvenance } from './依据_D6/checks_D6.mjs';
const bytes = path => readFileSync(new URL(path, import.meta.url));
const read = path => JSON.parse(bytes(path).toString('utf8'));
const gold = read('依据_D6/Gold原始_D6.json'), upstream = read('依据_D6/上游原始_D6.json');
const proposal = read('字段修订建议_D6.json'), schema = read('依据_D6/公共契约_D6.json');
const parsed = read('依据_D6/解析原始_D6.json');
const tests = [], details = {};
const test = (name, fn) => { fn(); tests.push({name,status:'PASS'}); };
const compose = base => {
  assert.equal(base.source.file_sha256, proposal.source.file_sha256);
  const copy = structuredClone(base), ev = copy.events.find(e => e.event_id === proposal.event_id);
  Object.assign(ev.fields, structuredClone(proposal.proposed_fields));
  return copy;
};
const event = x => checkAwardEnvelope(x).events[0];
const codes = x => event(x).findings.map(f => f.code);
const candidate = compose(upstream);
const validate = x => [...validateAgainstSchema(x,schema),...checkRegistry(x),...checkProvenance(x)];
test('冻结依据SHA256完整，D6工具为本地原始版本', () => {
  for (const m of read('依据清单_D6.json')) assert.equal(createHash('sha256').update(bytes(m.local)).digest('hex'),m.sha256);
});
test('原币、人民币折合值的引文和坐标定位到同一原始解析块', () => {
  assert.equal(parsed.doc.file_sha256,gold.source.file_sha256);
  const b = parsed.pages.flatMap(p => p.blocks).find(b => b.block_id === proposal.source.block_id);
  for (const f of Object.values(proposal.proposed_fields)) {
    assert.ok(b.text_raw.includes(f.raw_value));
    for (const p of f.provenance) {
      assert.equal(p.page,b.page); assert.deepEqual(p.region,b.region);
      assert.ok(b.text_raw.includes(p.quote));
    }
  }
  assert.ok(b.text_raw.includes('173,800,000阿联酋迪拉姆（折合人民币317,915,000元）'));
});
test('RMB/人民币归一CNY，AED/阿联酋迪拉姆保持AED', () => {
  for (const v of ['RMB','人民币','CNY']) assert.equal(normalizeCurrency(v),'CNY');
  for (const v of ['AED','阿联酋迪拉姆']) assert.equal(normalizeCurrency(v),'AED');
});
test('上游旧适配器可复现：双币种原文的首数字覆盖正确人民币值', () => {
  const f = structuredClone(gold.events[0].fields.bid_amount); f.value = 317915000;
  assert.equal(normalizeFieldValue('bid_amount',f),null);
  assert.equal(f.value,173800000); assert.equal(f.standardized,true);
  details.old_normalizer_reproduced_wrong_value = f.value;
});
test('原Gold多金额拦截，原上游币种冲突拦截', () => {
  assert.ok(codes(gold).includes('MULTI_AMOUNT_OR_FX'));
  assert.ok(codes(upstream).includes('CURRENCY_CONFLICT'));
  assert.equal(event(gold).normalized.bid_amount,null);
  assert.equal(event(upstream).normalized.bid_amount,null);
  details.original_gold = event(gold); details.original_upstream = event(upstream);
});
test('明确选取人民币子串后，旧适配器不再覆盖为AED数值', () => {
  const f = structuredClone(proposal.proposed_fields.bid_amount);
  assert.equal(normalizeFieldValue('bid_amount',f),null); assert.equal(f.value,317915000);
});
test('两种基线应用同一候选后金额可用，含税仍未知且不分配', () => {
  for (const base of [gold,upstream]) {
    const composed = compose(base), r = checkAwardEnvelope(composed), e = r.events[0];
    assert.equal(e.normalized.currency,'CNY'); assert.equal(e.normalized.bid_amount,'317915000');
    assert.equal(e.normalized.tax_included,null); assert.equal(e.status,'needs_review');
    assert.deepEqual(e.findings.map(f => f.code),['TAX_UNKNOWN']);
    assert.deepEqual(e.calculations.allocations,[]); assert.equal(r.audit.exchangeRateApplied,false);
    assert.equal(r.audit.taxConversionApplied,false); assert.equal(r.audit.revenueInferred,false);
  }
  details.candidate_report = checkAwardEnvelope(candidate);
});
test('只改数值、不明确选取原文子串，仍需人工复核', () => {
  const x = structuredClone(gold); x.events[0].fields.bid_amount.value = 317915000;
  assert.ok(codes(x).includes('MULTI_AMOUNT_OR_FX')); assert.equal(event(x).normalized.bid_amount,null);
});
test('人民币子串与错误原币数值不一致时拦截', () => {
  const x = structuredClone(candidate); x.events[0].fields.bid_amount.value = 173800000;
  assert.ok(codes(x).includes('AMOUNT_VALUE_MISMATCH')); assert.equal(event(x).normalized.bid_amount,null);
});
test('仅有AED金额不得装入cny字段或自行换汇', () => {
  const x = structuredClone(candidate), f = x.events[0].fields;
  Object.assign(f.currency,{raw_value:'阿联酋迪拉姆',value:'AED'});
  Object.assign(f.bid_amount,{raw_value:'173,800,000阿联酋迪拉姆',value:173800000});
  assert.ok(codes(x).includes('FOREIGN_OR_UNKNOWN_CURRENCY'));
  assert.equal(event(x).normalized.bid_amount,null); assert.equal(checkAwardEnvelope(x).audit.exchangeRateApplied,false);
});
test('候选字段符合公共结构/注册表/出处要求，原信封既有问题显式保留', () => {
  for (const f of Object.values(proposal.proposed_fields)) assert.deepEqual(validateAgainstSchema(f,schema.$defs.field_value,schema),[]);
  for (const [name,base] of [['gold',gold],['upstream',upstream]]) {
    const composed = compose(base);
    assert.deepEqual(validate(composed),validate(base));
    assert.deepEqual(checkRegistry(composed),[]); assert.deepEqual(checkProvenance(composed),[]);
    details[name+'_existing_schema_issues'] = validate(base);
  }
});
test('只替换两个字段，非金额字段和源输入不变，事件不重复', () => {
  const before = JSON.stringify(upstream); checkAwardEnvelope(upstream);
  assert.equal(JSON.stringify(upstream),before); assert.equal(candidate.events.length,upstream.events.length);
  const x = structuredClone(candidate); x.events[0].fields.bid_amount = upstream.events[0].fields.bid_amount;
  x.events[0].fields.currency = upstream.events[0].fields.currency; assert.deepEqual(x,upstream);
});
test('隐含比率仅用于一致性检查，未填入公共字段或当成市场汇率', () => {
  const r = proposal.exchange_rate;
  assert.equal(317915000n*34760n,173800000n*63583n);
  assert.equal(r.market_rate,null); assert.equal(r.rate_date,null); assert.equal(r.applied,false);
  assert.equal(r.implied_ratio.used_to_compute_amount,false);
  assert.deepEqual(Object.keys(proposal.proposed_fields).sort(),['bid_amount','currency']);
});
process.stdout.write(JSON.stringify({case_id:proposal.case_id,mode:'offline_proposal_replay',node:process.version,
  gold_modified:false,external_fx_applied:false,passed:tests.length,failed:0,tests,details},null,2)+'\n');
