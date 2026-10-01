import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkEquityEnvelope } from '../src_D5/equity_check_D5.ts';

const fixture = JSON.parse(readFileSync(new URL('../examples_D5/equity_input_D5.json', import.meta.url), 'utf8'));
const clone = () => structuredClone(fixture);
const check = (v) => checkEquityEnvelope(v, { evidenceMode: 'synthetic_test' });
const codes = (r) => r.events[0].findings.map(f => f.code);
const change = (input, name, value) => { input.events[0].fields[name].value = value; input.events[0].fields[name].raw_value = String(value); };
const scenario = (name, mutate, expected, code) => test(name, () => {
  const input = clone(); mutate(input, input.events[0].fields);
  const original = JSON.stringify(input); const r = check(input);
  assert.equal(r.status, expected); if (code) assert.ok(codes(r).includes(code), JSON.stringify(r.events[0].findings));
  assert.equal(JSON.stringify(input), original);
});

scenario('正常减持：有符号差额和非负变动量分别输出', () => {}, 'verified');
test('精确差额与证据保留', () => {
  const r = check(clone());
  assert.equal(r.events[0].calculations.shares_delta, '-200000');
  assert.equal(r.events[0].calculations.ratio_delta_pp, '-2');
  assert.equal(r.events[0].calculations.change_shares_matches, true);
  assert.deepEqual(r.events[0].observed, fixture.events[0].fields);
  assert.equal(r.audit.sourceContentsVerified, false);
});
scenario('减持方向反转', (v) => change(v, 'direction', 'increase'), 'mismatch', 'DIRECTION_MISMATCH');
scenario('增加方向反转', (v) => { change(v, 'shares_before', '800000'); change(v, 'shares_after', '1000000'); }, 'mismatch', 'DIRECTION_MISMATCH');
scenario('正常增持', (v) => { change(v, 'direction', 'increase'); change(v, 'shares_before', '800000'); change(v, 'shares_after', '1000000'); change(v, 'ratio_before', '8'); change(v, 'ratio_after', '10'); }, 'verified');
scenario('相近值只差两股仍核验方向', (v) => { change(v, 'shares_before', '1000001'); change(v, 'shares_after', '999999'); change(v, 'change_shares', '2'); change(v, 'ratio_after', '10'); }, 'verified');
scenario('大整数超过 2^53 用字符串精确比较', (v) => { change(v, 'shares_before', '900719925474099300002'); change(v, 'shares_after', '900719925474099300001'); change(v, 'change_shares', '1'); }, 'verified');
scenario('不安全 Number 被拒绝', (v) => change(v, 'shares_before', 9007199254740992), 'invalid', 'UNSAFE_NUMBER');
scenario('非整股被拒绝', (v) => change(v, 'shares_before', '100.5'), 'invalid', 'INVALID_NUMBER');
scenario('负持股余额被拒绝', (v) => change(v, 'shares_before', '-1'), 'invalid', 'NEGATIVE_BALANCE');
scenario('变动量不符', (v) => change(v, 'change_shares', '199999'), 'mismatch', 'CHANGE_SHARES_MISMATCH');
scenario('有符号变动量不静默绝对值化', (v) => change(v, 'change_shares', '-200000'), 'needs_review', 'SIGNED_CHANGE_REQUIRES_MAPPING');
scenario('完全退出，明确零有效', (v) => { change(v, 'shares_after', '0'); change(v, 'ratio_after', '0'); change(v, 'change_shares', '1000000'); }, 'verified');
scenario('原始负号、标准化绝对量保留', (v, f) => { f.change_shares.raw_value = '-200,000'; }, 'verified');
scenario('比例与股数反向只提示复核', (v) => change(v, 'ratio_after', '12'), 'needs_review', 'RATIO_DIRECTION_CONFLICT');
scenario('持股不变，被动稀释不误报方向反转', (v) => { change(v, 'shares_after', '1000000'); change(v, 'change_shares', '0'); }, 'needs_review', 'RATIO_CHANGED_WITH_EQUAL_SHARES');
scenario('相等股数不臆造 unchanged 方向', (v) => { change(v, 'shares_after', '1000000'); change(v, 'change_shares', '0'); change(v, 'ratio_after', '10'); }, 'needs_review', 'EQUAL_SHARES_NO_DIRECTION');
scenario('比例小数精确相减', (v) => { change(v, 'ratio_before', '0.3'); change(v, 'ratio_after', '0.1'); }, 'verified');
test('百分比差是百分点，不是相对涨幅', () => { const v = clone(); change(v, 'ratio_before', '0.3'); change(v, 'ratio_after', '0.1'); assert.equal(check(v).events[0].calculations.ratio_delta_pp, '-0.2'); });
scenario('缺比例分母不猜测', (v, f) => { f.ratio_before.denominator = null; }, 'needs_review', 'UNKNOWN_RATIO_BASIS');
scenario('前后分母种类不同不相减', (v, f) => { f.ratio_after.denominator = 'holder_shares'; }, 'needs_review', 'RATIO_BASIS_MISMATCH');
scenario('不扩大到净资产比例', (v, f) => { f.ratio_before.denominator = 'net_assets'; f.ratio_after.denominator = 'net_assets'; }, 'needs_review', 'RATIO_BASIS_MISMATCH');
scenario('比例超过百分之百', (v) => change(v, 'ratio_before', '100.00001'), 'invalid', 'RATIO_OUT_OF_RANGE');
scenario('负比例', (v) => change(v, 'ratio_before', '-1'), 'invalid', 'NEGATIVE_BALANCE');
for (const s of ['not_mentioned', 'not_disclosed', 'not_applicable', 'unreadable', 'needs_review']) {
  scenario(`保留 ${s} 不用作后股数`, (v, f) => { f.shares_after.status = s; f.shares_after.value = s === 'needs_review' ? 800000 : null; }, 'needs_review', 'MISSING_SHARE_PAIR');
}
scenario('缺失值残留数字拒绝', (v, f) => { f.shares_after.status = 'unreadable'; }, 'invalid', 'MISSING_WITH_VALUE');
scenario('未标准化不计算', (v, f) => { f.shares_after.standardized = false; }, 'needs_review', 'UNCONFIRMED_FIELD');
scenario('缺 standardized 标记不能当已标准化', (v, f) => { delete f.shares_after.standardized; }, 'needs_review', 'UNCONFIRMED_FIELD');
scenario('非法单位拒绝', (v, f) => { f.shares_after.unit = '万股'; }, 'invalid', 'INVALID_FIELD');
scenario('约数不参与精确比较', (v, f) => { f.shares_after.raw_value = '约80万股'; }, 'needs_review', 'NONEXACT_FIELD');
scenario('上界不参与精确比较', (v, f) => { f.shares_after.raw_value = '不超过80万股'; }, 'needs_review', 'NONEXACT_FIELD');
scenario('缺日期保留数值但阻断关系', (v, f) => { f.change_date.status = 'not_mentioned'; f.change_date.value = null; }, 'needs_review', 'MISSING_OR_INVALID_PERIOD');
scenario('不存在的日期', (v) => change(v, 'change_date', '2026-02-30'), 'needs_review', 'MISSING_OR_INVALID_PERIOD');
scenario('前后日期反转', (v) => change(v, 'change_date', '2026-09-30/2026-09-01'), 'needs_review', 'MISSING_OR_INVALID_PERIOD');
scenario('缺股东不比较', (v, f) => { f.holder.status = 'not_mentioned'; f.holder.value = null; }, 'needs_review', 'MISSING_HOLDER');
scenario('方向缺失不自动回填', (v, f) => { f.direction.status = 'not_mentioned'; f.direction.value = null; }, 'needs_review', 'MISSING_OR_INVALID_DIRECTION');
scenario('非法方向中文不自动翻译', (v) => change(v, 'direction', '减持'), 'needs_review', 'MISSING_OR_INVALID_DIRECTION');
scenario('cell 丢失定位阻断使用', (v, f) => { f.shares_after.provenance[0].cell_ref = null; }, 'needs_review', 'INCOMPLETE_OR_DEGRADED_EVIDENCE');
scenario('来源降级不作事实', (v, f) => { f.shares_after.provenance[0].source_type = 'scan_region'; }, 'needs_review', 'INCOMPLETE_OR_DEGRADED_EVIDENCE');
scenario('证据坐标反转', (v, f) => { f.shares_after.provenance[0].region = [2, 1, 1, 2]; }, 'needs_review', 'INCOMPLETE_OR_DEGRADED_EVIDENCE');
scenario('阈值未知字段只保留复核', (v, f) => { f.threshold = { value: 5 }; }, 'needs_review', 'UNREGISTERED_FIELD');
test('默认模式拒绝合成数据', () => { const r = checkEquityEnvelope(clone()); assert.equal(r.status, 'needs_review'); assert.equal(r.events[0].calculations.shares_delta, null); });
test('真实引用模式及缺哈希', () => {
  const v = clone(); v.is_mock = false; v.events[0].extraction_method = 'rule';
  assert.equal(checkEquityEnvelope(v).status, 'verified');
  assert.equal(check(v).status, 'needs_review');
  v.source.file_sha256 = null;
  assert.equal(checkEquityEnvelope(v).events[0].calculations.shares_delta, null);
});
test('多主体各算各的，不合并不丢事件', () => {
  const v = clone(); const second = structuredClone(v.events[0]); second.event_id = 'E02'; second.fields.holder.value = '合成股东乙'; second.fields.direction.value = 'increase'; v.events.push(second);
  const r = check(v); assert.deepEqual(r.events.map(e => e.status), ['verified', 'mismatch']);
});
test('重复 ID 明确拒绝', () => { const v = clone(); v.events.push(structuredClone(v.events[0])); assert.equal(check(v).status, 'invalid'); });
test('非股权事件保留 skipped', () => { const v = clone(); v.events[0].event_type = 'pledge'; assert.equal(check(v).status, 'skipped'); });
test('空事件不会冒充通过', () => { const v = clone(); v.events = []; assert.equal(check(v).status, 'skipped'); });
test('损坏 JSON 对象安全返回 invalid', () => { for (const v of [null, [], {}, 1, 'bad']) assert.equal(check(v).status, 'invalid'); });
test('不支持的选项拒绝', () => assert.equal(checkEquityEnvelope(clone(), { threshold: 5 }).status, 'invalid'));
test('CLI 显式模拟运行和默认复核退出码', () => {
  const file = new URL('../examples_D5/equity_input_D5.json', import.meta.url);
  const cli = new URL('../src_D5/cli_D5.ts', import.meta.url);
  const ok = spawnSync(process.execPath, [fileURLToPath(cli), '--synthetic-test', fileURLToPath(file)], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr); assert.equal(JSON.parse(ok.stdout).status, 'verified');
  const review = spawnSync(process.execPath, [fileURLToPath(cli), fileURLToPath(file)], { encoding: 'utf8' });
  assert.equal(review.status, 3, review.stderr);
  assert.match(JSON.parse(ok.stdout).execution.input_sha256, /^[a-f0-9]{64}$/);
  const bad = spawnSync(process.execPath, [fileURLToPath(cli), '--unknown'], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
});
