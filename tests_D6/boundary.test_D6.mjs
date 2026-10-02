import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAwardEnvelope, normalizeCurrency, normalizeTaxIncluded } from '../src_D6/award_check_D6.ts';
import { fixture } from './fixtures_D6.mjs';

const run = x => checkAwardEnvelope(x, { evidenceMode: 'synthetic_test' });
const codes = r => r.events.flatMap(e => e.findings).map(x => x.code);
const field = x => x.events[0].fields;
const changeShares = (f, s) => { f.consortium_shares.value = s; f.consortium_shares.raw_value = s; };
const noConsortium = f => { f.bidder.value = f.bidder.raw_value = '甲公司'; for (const k of ['consortium_members', 'consortium_shares']) Object.assign(f[k], { value: null, raw_value: null, status: 'not_applicable', provenance: [], standardized: false }); };

test('明确金额份额：精确计算并保留字段与出处', () => {
  const x = fixture(), before = JSON.stringify(x), r = run(x);
  assert.equal(r.status, 'verified'); assert.deepEqual(r.events[0].calculations.allocations.map(a => a.amount), ['600000', '400000']);
  assert.equal(JSON.stringify(x), before); assert.deepEqual(r.events[0].observed, x.events[0].fields);
  r.events[0].observed.bid_amount.value = '999'; assert.equal(x.events[0].fields.bid_amount.value, '1000000');
});
for (const [v, expected] of [['RMB', 'CNY'], ['人民币', 'CNY'], [' cny ', 'CNY'], ['美元', 'USD'], ['阿联酋迪拉姆', 'AED'], ['港元', 'HKD'], ['欧元', 'EUR'], ['JPY', 'JPY'], ['英镑', 'GBP'], ['元', null], ['¥', null], ['$', null], [null, null], ['', null], ['ZZZ', null]]) test(`币种别名 ${v}`, () => assert.equal(normalizeCurrency(v), expected));
for (const [v, expected] of [[true, true], [false, false], ['true', true], ['false', false], ['含税', true], ['不含税', false], ['unknown', null], [null, null], ['', null], [0, null], [1, null]]) test(`含税值 ${JSON.stringify(v)}`, () => assert.equal(normalizeTaxIncluded(v), expected));

for (const [label, modify, code] of [
  ['缺币种', f => Object.assign(f.currency, { status: 'not_mentioned', value: null }), 'CURRENCY_UNAVAILABLE'],
  ['未知税状态', f => { f.tax_included.value = 'unknown'; }, 'TAX_UNKNOWN'],
  ['税状态矛盾', f => { f.tax_included.value = false; }, 'TAX_CONFLICT'],
  ['税原文未知但标准值有值', f => { f.tax_included.raw_value = '未知'; }, 'TAX_BASIS_UNCONFIRMED'],
  ['金额括号税状态矛盾', f => { f.bid_amount.raw_value = '100万元（不含税）'; }, 'TAX_CONFLICT'],
  ['币种矛盾', f => { f.currency.raw_value = '美元'; }, 'CURRENCY_CONFLICT'],
  ['模糊币种符号', f => { f.currency.raw_value = '$'; }, 'CURRENCY_BASIS_UNCONFIRMED'],
  ['外币不能落在cny', f => { f.currency.value = f.currency.raw_value = 'AED'; }, 'FOREIGN_OR_UNKNOWN_CURRENCY'],
  ['两币种取首值', f => { f.bid_amount.raw_value = '173,800,000阿联酋迪拉姆（折合人民币317,915,000元）'; f.bid_amount.value = 173800000; }, 'MULTI_AMOUNT_OR_FX'],
  ['缺份额', f => Object.assign(f.consortium_shares, { status: 'not_mentioned', value: null }), 'SHARES_UNAVAILABLE'],
  ['不均分成员', f => { f.consortium_shares.value = f.consortium_shares.raw_value = '由双方协商'; }, 'SHARES_FORMAT_UNCONFIRMED'],
  ['缺一成员份额', f => changeShares(f, '中标金额分配比例：甲公司60%'), 'SHARE_MEMBER_MISMATCH'],
  ['低于100', f => changeShares(f, '中标金额分配比例：甲公司60%；乙公司39.99%'), 'SHARE_TOTAL_NOT_100'],
  ['高于100', f => changeShares(f, '中标金额分配比例：甲公司60%；乙公司40.01%'), 'SHARE_TOTAL_NOT_100'],
  ['单一超过100', f => changeShares(f, '中标金额分配比例：甲公司101%；乙公司0%'), 'SHARE_TOTAL_NOT_100'],
  ['负比例', f => changeShares(f, '中标金额分配比例：甲公司-10%；乙公司110%'), 'SHARE_MEMBER_MISMATCH'],
  ['重复份额成员', f => changeShares(f, '中标金额分配比例：甲公司60%；甲公司40%'), 'SHARE_MEMBER_MISMATCH'],
  ['重复名单', f => { f.consortium_members.value = '甲公司、甲公司'; }, 'INVALID_MEMBERS'],
  ['名称不匹配', f => changeShares(f, '中标金额分配比例：甲60%；乙公司40%'), 'SHARE_MEMBER_MISMATCH'],
  ['未声明份额口径', f => changeShares(f, '甲公司60%；乙公司40%'), 'SHARE_BASIS_UNCONFIRMED'],
  ['工程量不是金额', f => changeShares(f, '工程量分配比例：甲公司60%；乙公司40%'), 'SHARE_MEMBER_MISMATCH'],
  ['约数份额', f => { f.consortium_shares.provenance[0].quote = '比例暂定'; }, 'SHARE_BASIS_UNCONFIRMED'],
  ['数值与原文不符', f => { f.bid_amount.value = '100'; }, 'AMOUNT_VALUE_MISMATCH'],
  ['错千分位', f => { f.bid_amount.raw_value = '10,00元'; }, 'AMOUNT_BASIS_UNCLEAR'],
  ['裸数字无单位', f => { f.bid_amount.raw_value = '1000000'; }, 'AMOUNT_BASIS_UNCLEAR'],
  ['未标准化金额', f => { delete f.bid_amount.standardized; }, 'AMOUNT_NOT_STANDARDIZED'],
  ['负金额', f => { f.bid_amount.value = '-1'; }, 'INVALID_AMOUNT'],
  ['非有限金额', f => { f.bid_amount.value = Infinity; }, 'INVALID_AMOUNT'],
  ['不安全number', f => { f.bid_amount.value = 9007199254740992; }, 'INVALID_AMOUNT'],
  ['上界', f => { f.bid_amount.raw_value = '不超过100万元'; }, 'NONEXACT_AMOUNT'],
  ['暂定价格', f => { f.bid_amount.provenance[0].quote = '合同金额暂定100万元'; }, 'NONEXACT_AMOUNT'],
  ['证据缺失', f => { f.consortium_shares.provenance = []; }, 'INCOMPLETE_OR_DEGRADED_EVIDENCE'],
  ['来源降级', f => { f.bid_amount.provenance[0].degraded = true; }, 'INCOMPLETE_OR_DEGRADED_EVIDENCE'],
  ['单元格定位缺失', f => { f.bid_amount.provenance[0].source_type = 'cell'; }, 'INCOMPLETE_OR_DEGRADED_EVIDENCE'],
  ['未知证据类型', f => { f.bid_amount.provenance[0].source_type = 'invented'; }, 'INCOMPLETE_OR_DEGRADED_EVIDENCE'],
  ['错位坐标', f => { f.bid_amount.provenance[0].region = [4, 4, 1, 1]; }, 'INCOMPLETE_OR_DEGRADED_EVIDENCE'],
  ['不适用与联合体冲突', f => { f.consortium_shares.status = 'not_applicable'; f.consortium_shares.value = null; }, 'CONSORTIUM_STATUS_CONFLICT'],
  ['空态有残值', f => { f.currency.status = 'not_mentioned'; }, 'MISSING_WITH_VALUE'],
  ['单位错', f => { f.bid_amount.unit = 'shares'; }, 'INVALID_FIELD'],
]) test(`阻断拆分：${label}`, () => { const x = fixture(); modify(field(x)); const r = run(x); assert.ok(codes(r).includes(code), JSON.stringify(r)); assert.deepEqual(r.events[0].calculations.allocations, []); });

for (const status of ['needs_review', 'not_mentioned', 'not_disclosed', 'not_applicable', 'unreadable']) test(`六态保留：${status}`, () => {
  const x = fixture(), f = field(x); Object.assign(f.bid_amount, { status, value: status === 'needs_review' ? '1000000' : null });
  const r = run(x); assert.equal(r.events[0].observed.bid_amount.status, status); assert.equal(r.events[0].normalized.bid_amount, null); assert.deepEqual(r.events[0].calculations.allocations, []);
});
for (const [raw, value] of [['0元', '0'], ['0.0001万元', '1'], ['1.23456789亿元', '123456789'], ['人民币9,007,199,254,740,993.01元', '9007199254740993.01'], ['０．１万元', '1000']]) test(`金额精确换算：${raw}`, () => {
  const x = fixture(); Object.assign(field(x).bid_amount, { raw_value: raw, value });
  const r = run(x); assert.equal(r.events[0].normalized.bid_amount, value); assert.equal(r.events[0].calculations.allocation_status, 'calculated');
});
test('0%与100%允许，零不是缺失', () => { const x = fixture(); changeShares(field(x), '中标金额分配比例：甲公司0%；乙公司100%'); assert.deepEqual(run(x).events[0].calculations.allocations.map(a => a.amount), ['0', '1000000']); });
test('细小份额无浮点容差', () => { const x = fixture(); changeShares(field(x), '中标金额分配比例：甲公司33.333333333333333333%；乙公司66.666666666666666667%'); const r = run(x); assert.equal(r.events[0].calculations.allocations[0].amount, '333333.33333333333333'); assert.ok(codes(r).includes('SUBCENT_ALLOCATION')); });
test('未税金额只保留未税，不加税', () => { const x = fixture(); Object.assign(field(x).tax_included, { value: false, raw_value: '不含税' }); const r = run(x); assert.equal(r.events[0].calculations.allocations[0].tax_included, false); assert.equal(r.events[0].normalized.bid_amount, '1000000'); });
test('合同约定不是约数', () => { const x = fixture(); field(x).bid_amount.provenance[0].quote = '合同约定总金额为人民币100万元（含税）'; assert.equal(run(x).status, 'verified'); });
test('约为金额阻断分配', () => { const x = fixture(); field(x).bid_amount.note = '金额约为100万元'; assert.ok(codes(run(x)).includes('NONEXACT_AMOUNT')); assert.equal(run(x).events[0].calculations.allocations.length, 0); });
test('非联合体不推导公司收入', () => { const x = fixture(); noConsortium(field(x)); const r = run(x); assert.equal(r.events[0].calculations.allocation_status, 'not_applicable'); assert.equal(r.audit.revenueInferred, false); assert.equal(r.events[0].observed.recognized_revenue.value, null); });
test('多项目和不完整项目隔离', () => { const x = fixture(); x.events.push(structuredClone(x.events[0])); x.events[1].event_id = 'E02'; x.events[1].fields.consortium_shares.status = 'needs_review'; const r = run(x); assert.equal(r.events.length, 2); assert.equal(r.events[0].calculations.allocations.length, 2); assert.equal(r.events[1].calculations.allocations.length, 0); });
test('重复ID两条都阻断', () => { const x = fixture(); x.events.push(structuredClone(x.events[0])); const r = run(x); assert.ok(r.events.every(e => e.status === 'invalid' && e.calculations.allocations.length === 0)); });
test('无适用事件明确skipped', () => { const x = fixture(); x.events[0].event_type = 'equity_change'; assert.equal(run(x).status, 'skipped'); x.events = []; assert.equal(run(x).status, 'skipped'); });
test('真实/合成模式不能混用', () => { const x = fixture(); assert.ok(codes(checkAwardEnvelope(x)).includes('EVIDENCE_MODE_BLOCKED')); x.is_mock = false; assert.ok(codes(run(x)).includes('EVIDENCE_MODE_BLOCKED')); x.events[0].extraction_method = 'rule'; assert.equal(checkAwardEnvelope(x).status, 'verified'); x.source.file_sha256 = 'b'.repeat(64); assert.ok(codes(checkAwardEnvelope(x)).includes('EVIDENCE_MODE_BLOCKED')); });
test('无效输入与选项返回invalid', () => { for (const x of [null, [], {}, 1, 'bad']) assert.equal(run(x).status, 'invalid'); for (const o of [null, { evidenceMode: 'bad' }, { unsafe: true }]) assert.equal(checkAwardEnvelope(fixture(), o).status, 'invalid'); });
test('CLI退出码与单项隔离，保留批次分母', () => {
  const dir = mkdtempSync(join(tmpdir(), 'award-D6-')), path = join(dir, 'input_D6.json'), cli = fileURLToPath(new URL('../src_D6/cli_D6.ts', import.meta.url));
  const exec = value => { writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value)); return spawnSync(process.execPath, [cli, '--synthetic-test', path], { encoding: 'utf8' }); };
  try {
    let out = exec(fixture()); assert.equal(out.status, 0, out.stderr); assert.match(JSON.parse(out.stdout).implementation_sha256, /^[a-f0-9]{64}$/);
    out = exec([fixture(), null, fixture()]); assert.equal(out.status, 1); assert.equal(JSON.parse(out.stdout).total, 3); assert.equal(JSON.parse(out.stdout).counts.verified, 2);
    out = exec([]); assert.equal(out.status, 3); out = exec('{broken'); assert.equal(out.status, 2); assert.equal(out.stdout, '');
    const x = fixture(); field(x).tax_included.value = 'unknown'; assert.equal(exec(x).status, 3);
    assert.equal(spawnSync(process.execPath, [cli], { encoding: 'utf8' }).status, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('冻结示例输出回归', () => {
  const input = JSON.parse(readFileSync(new URL('../examples_D6/award_input_D6.json', import.meta.url)));
  const expected = JSON.parse(readFileSync(new URL('../examples_D6/award_output_D6.json', import.meta.url)));
  assert.deepEqual(run(input), expected);
});
