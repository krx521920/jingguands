/** 固定 Git 提交的离线联调；不会调用模型、修改原信封或更新队友分支。 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { checkAwardEnvelope } from '../src_D6/award_check_D6.ts';

const repo = process.argv[2] ?? fileURLToPath(new URL('../', import.meta.url));
const pins = { fang: '24d067abc8088f50c0919c12205f5e57be247aeb', wei: '2eb871394dd946b1c23225b24c4d00e2bf4bd7e1', chen: '7cc470e4645ce9a50d5f3ef25282904274627c8c', zong: 'ea1c248b6c942cbf2149fd06c933807541e52a6c', zhang: 'be86f4d9d61a2573f99ceb24402f2c2772260dab' };
const get = (ref, path) => execFileSync('git', ['show', `${ref}:${path}`], { cwd: repo, encoding: 'utf8', maxBuffer: 30e6 });
const json = (ref, path) => JSON.parse(get(ref, path));
const sha = value => createHash('sha256').update(value).digest('hex');
const load = code => import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const validator = await load(get(pins.wei, 'scripts/jingguan/lib/schema_validator.mjs'));
const registry = await load(get(pins.wei, 'scripts/jingguan/lib/registry.mjs'));
const checks = await load(get(pins.wei, 'scripts/jingguan/lib/checks.mjs'));
const schema = json(pins.wei, 'interface/event-envelope.schema.json');
const { checkEquityEnvelope } = await load(stripTypeScriptTypes(get(pins.fang, 'src_D5/equity_check_D5.ts')));
const bridgeBytes = get(pins.chen, 'workspace/cjh/page_prototype/bridge/upstream_bridge.js');
const { default: bridge } = await load(`const module = { exports: {} };\n${bridgeBytes}\nexport default module.exports;`);
const report = { tested_at: new Date().toISOString(), node: process.version, pins, mode: 'offline_replay', model_called: false, source_contents_verified: false, artifacts: { schema_sha256: sha(JSON.stringify(schema)), bridge_sha256: sha(bridgeBytes) }, documents: [], parser_references: [], summary: {} };
const example = JSON.parse(readFileSync(new URL('../examples_D6/award_input_D6.json', import.meta.url), 'utf8'));
const validate = e => [...validator.validateAgainstSchema(e, schema), ...registry.checkRegistry(e), ...checks.checkProvenance(e)];
assert.deepEqual(validate(example), []);
assert.deepEqual(Object.keys(registry.FIELD_REGISTRY.award_contract).sort(), Object.keys(example.events[0].fields).sort());
for (const [group, type, day] of [['gold', 'AWD', 6], ['upstream', 'AWD', 6], ['upstream', 'PLD', 4], ['upstream', 'EQC', 5]]) {
  for (let i = 1; i <= 10; i++) {
    const id = `D${day}-${type}-${String(i).padStart(3, '0')}`;
    const path = group === 'gold' ? `evaluation/D6/dev/gold/${id}.envelope.json` : `runs/batch-20261002T120859/envelopes/${id}.json`;
    const bytes = get(group === 'gold' ? pins.zong : pins.wei, path), input = JSON.parse(bytes), before = JSON.stringify(input);
    const pageBefore = bridge.toContract(input), d5Before = checkEquityEnvelope(input), result = checkAwardEnvelope(input);
    assert.equal(JSON.stringify(input), before, `${id} input mutated`);
    assert.deepEqual(bridge.toContract(input), pageBefore, `${id} page changed`);
    assert.deepEqual(checkEquityEnvelope(input), d5Before, `${id} D5 changed after D6`);
    assert.deepEqual(checkAwardEnvelope(input), result, `${id} D6 changed after D5`);
    assert.equal(result.events.length, input.events.length);
    if (day !== 6) assert.equal(result.status, 'skipped');
    else {
      assert.notEqual(result.status, 'invalid', JSON.stringify(result));
      if ([5, 6].includes(i)) assert.ok(result.events.every(e => e.calculations.allocations.length === 0 && e.findings.some(f => f.code === 'SHARES_UNAVAILABLE')), 'unreported shares must not split');
      if (i === 7) assert.ok(result.events.every(e => e.normalized.bid_amount === null && e.findings.some(f => ['MULTI_AMOUNT_OR_FX', 'CURRENCY_CONFLICT'].includes(f.code))), 'mixed currencies must not pass');
    }
    report.documents.push({ group, id, input_path: path, input_sha256: sha(bytes), event_count: input.events.length, input_unchanged: true, chen_bridge_unchanged: true, d5_d6_order_independent: true, schema_issues: validate(input), status: result.status, events: result.events.map(e => ({ event_id: e.event_id, status: e.status, normalized: e.normalized, calculations: e.calculations, findings: e.findings })) });
  }
}
for (let i = 1; i <= 10; i++) {
  const num = String(i).padStart(3, '0'), id = `D6-AWD-${num}`;
  const rawPath = `evaluation/D6/dev/raw/${id}.raw.json`, bytes = get(pins.zong, rawPath), raw = JSON.parse(bytes);
  const weiPath = `corpus/zhangzhibo/d6/parse/bid-${num}.parse.json`, weiBytes = get(pins.wei, weiPath), parser = JSON.parse(weiBytes);
  const gold = json(pins.zong, `evaluation/D6/dev/gold/${id}.envelope.json`);
  const blocks = new Map(raw.pages.flatMap(p => p.blocks.map(b => [b.block_id, { ...b, page: b.page ?? p.page }])));
  const failures = []; let total = 0;
  for (const ev of gold.events) for (const [name, f] of Object.entries(ev.fields)) for (const p of f.provenance ?? []) {
    total++; const b = blocks.get(p.block_id);
    if (!b || b.page !== p.page || !String(b.text_raw).includes(p.quote)) failures.push({ event_id: ev.event_id, field: name, block_id: p.block_id, reason: !b ? 'block_missing' : b.page !== p.page ? 'page_mismatch' : 'quote_not_in_block' });
  }
  const sourceMatch = gold.source.file_sha256 === raw.doc.file_sha256 && raw.doc.file_sha256 === parser.doc.file_sha256;
  assert.ok(sourceMatch, `${id} file SHA mismatch`);
  report.parser_references.push({ id, raw_path: rawPath, parser_copy_path: weiPath, raw_git_sha256: sha(bytes), parser_git_sha256: sha(weiBytes), source_sha256_matches: sourceMatch, parser_data_equal: JSON.stringify(raw) === JSON.stringify(parser), references: total, unresolved: failures });
}
const batch = json(pins.wei, 'runs/batch-20261002T120859/batch_report.json');
report.upstream_batch_keys = Object.keys(batch); // 上游批次执行情况只作来源记录，不冒充本次重新运行。
report.summary = {
  gold_award_documents: 10, upstream_award_documents: 10, other_documents: 20,
  total_replay_documents: report.documents.length, total_replay_events: report.documents.reduce((n, d) => n + d.event_count, 0),
  gold_award_events: report.documents.filter(d => d.group === 'gold').reduce((n, d) => n + d.event_count, 0),
  upstream_award_events: report.documents.filter(d => d.group === 'upstream' && d.id.startsWith('D6')).reduce((n, d) => n + d.event_count, 0),
  schema_issue_documents: report.documents.filter(d => d.schema_issues.length).length,
  unmodified_inputs: true, chen_bridge_unchanged: true, d5_d6_order_independent: true,
  references: report.parser_references.reduce((n, d) => n + d.references, 0), unresolved_references: report.parser_references.reduce((n, d) => n + d.unresolved.length, 0),
  synthetic_schema_valid: true, registry_aligned: true,
};
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
