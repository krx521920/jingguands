/** 从固定 Git 对象读取团队输入和消费者；不复制语料、不修改其他分支。 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkEquityEnvelope } from '../src_D5/equity_check_D5.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const pins = {
  fang_base: '5fe05e89be6899ef7d38a2ef49c2dc132cb1d239',
  wei_core: '477b4f420553e8a52c2fbccc464d7561b239c443',
  wei_actual: '3c8a6ee9c2aaabe5e0fcce3b9853f5d2c2f4643e',
  chen: '1ceab9c5c103ba600bd88f475b52ef38670cbb4c',
  zong: 'a75e0cdcd2cb5422a0a6181ca7f6183fdc2a687d',
  zhang: '847c035749827cdddf863ba752188f3b31084119',
};
const get = (ref, path) => execFileSync('git', ['show', `${ref}:${path}`], { cwd: root, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 });
const json = (ref, path) => JSON.parse(get(ref, path));
const digest = (s) => createHash('sha256').update(s).digest('hex');
const load = (code) => import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const validator = await load(get(pins.wei_actual, 'scripts/jingguan/lib/schema_validator.mjs'));
const registry = await load(get(pins.wei_actual, 'scripts/jingguan/lib/registry.mjs'));
const checks = await load(get(pins.wei_actual, 'scripts/jingguan/lib/checks.mjs'));
const schema = json(pins.wei_actual, 'interface/event-envelope.schema.json');
const bridgeSource = get(pins.chen, 'workspace/cjh/page_prototype/bridge/upstream_bridge.js');
const { default: bridge } = await load(`const module = { exports: {} };\n${bridgeSource}\nexport default module.exports;`);
const report = { tested_at: new Date().toISOString(), node: process.version, pins, mode: 'offline_replay', source_contents_verified: false, model_called: false, challenge_cases: [], documents: [], parser_references: [], synthetic_schema_issues: [] };
const fixture = JSON.parse(readFileSync(new URL('../examples_D5/equity_input_D5.json', import.meta.url), 'utf8'));
report.synthetic_schema_issues = [...validator.validateAgainstSchema(fixture, schema), ...registry.checkRegistry(fixture), ...checks.checkProvenance(fixture), ...checks.checkEquityDirection(fixture)];
assert.deepEqual(report.synthetic_schema_issues, []);
const challenge = json(pins.zong, 'evaluation/D5/challenges/direction-inversion-cases.json');
for (const c of challenge.cases) {
  const input = structuredClone(fixture), f = input.events[0].fields;
  for (const k of ['direction', 'shares_before', 'shares_after', 'ratio_before', 'ratio_after']) {
    f[k].value = c.event[k] ?? null;
    f[k].raw_value = c.event[k] == null ? null : String(c.event[k]);
    f[k].status = c.event[k] == null ? 'not_mentioned' : 'extracted';
  }
  f.change_shares.value = c.event.shares_after == null ? null : Math.abs(c.event.shares_after - c.event.shares_before);
  f.change_shares.status = f.change_shares.value === null ? 'not_mentioned' : 'extracted';
  f.change_shares.raw_value = String(f.change_shares.value);
  const r = checkEquityEnvelope(input, { evidenceMode: 'synthetic_test' });
  const codes = r.events[0].findings.map(f => f.code);
  const actual = { direction_issue: codes.includes('DIRECTION_MISMATCH'), ratio_conflict: codes.includes('RATIO_DIRECTION_CONFLICT') };
  if (c.expect.requires_review) actual.requires_review = r.status === 'needs_review';
  assert.deepEqual(actual, c.expect, c.case_id);
  report.challenge_cases.push({ case_id: c.case_id, passed: true, expected: c.expect, actual, status: r.status });
}
for (const group of ['gold', 'upstream']) {
  for (let i = 1; i <= (group === 'gold' ? 10 : 6); i++) {
    const id = `D5-EQC-${String(i).padStart(3, '0')}`;
    const path = group === 'gold' ? `evaluation/D5/dev/gold/${id}.envelope.json` : `evaluation/D5/evidence/upstream/${id}.upstream.json`;
    const bytes = get(pins.zong, path), input = JSON.parse(bytes), before = JSON.stringify(input);
    const schemaIssues = [...validator.validateAgainstSchema(input, schema), ...registry.checkRegistry(input), ...checks.checkProvenance(input), ...checks.checkEquityDirection(input)];
    const pageBefore = bridge.toContract(input);
    const result = checkEquityEnvelope(input);
    assert.equal(JSON.stringify(input), before, `${id}: original must remain unchanged`);
    assert.deepEqual(bridge.toContract(input), pageBefore, `${id}: Chen consumer output must remain unchanged`);
    assert.equal(result.events.length, input.events.length);
    assert.equal(result.status === 'invalid', false, `${id}: ${JSON.stringify(result.events.map(e => e.findings))}`);
    report.documents.push({ group, case_id: id, input_path: path, input_sha256: digest(bytes), event_count: result.events.length, status: result.status,
      input_unchanged: true, chen_bridge_unchanged: true, upstream_schema_issues: schemaIssues,
      events: result.events.map(e => ({ event_id: e.event_id, holder: e.holder, status: e.status, calculations: e.calculations, findings: e.findings })) });
  }
}
for (let i = 1; i <= 10; i++) {
  const id = `D5-EQC-${String(i).padStart(3, '0')}`;
  const path = `sample/D5/parse/${id}.parse.json`;
  const bytes = get(pins.zhang, path), p = JSON.parse(bytes);
  const gold = json(pins.zong, `evaluation/D5/dev/gold/${id}.envelope.json`);
  const blocks = new Map(p.pages.flatMap(page => page.blocks.map(b => [b.block_id, b])));
  const refs = gold.events.flatMap(e => Object.entries(e.fields).flatMap(([name, f]) => (f.provenance ?? []).map(ref => ({ event_id: e.event_id, field: name, ref }))));
  const unresolved = [];
  for (const { event_id, field, ref } of refs) {
    const b = blocks.get(ref.block_id);
    if (!b || b.page !== ref.page || !String(b.text_raw).includes(ref.quote)) unresolved.push({ event_id, field, block_id: ref.block_id, reason: !b ? 'block_not_found' : b.page !== ref.page ? 'page_mismatch' : 'quote_not_in_block' });
  }
  report.parser_references.push({ case_id: id, path, git_content_sha256: digest(bytes), schema_version: p.schema_version ?? null, page_count: p.pages?.length ?? null, evidence_references: refs.length, unresolved, source_sha256_matches: gold.source.file_sha256 === p.handoff?.source?.file_sha256 });
}
report.summary = {
  challenge_pass: report.challenge_cases.length,
  gold_documents: report.documents.filter(d => d.group === 'gold').length,
  upstream_documents: report.documents.filter(d => d.group === 'upstream').length,
  gold_events: report.documents.filter(d => d.group === 'gold').reduce((n, d) => n + d.event_count, 0),
  upstream_events: report.documents.filter(d => d.group === 'upstream').reduce((n, d) => n + d.event_count, 0),
  original_inputs_unchanged: report.documents.every(d => d.input_unchanged),
  chen_bridge_unchanged: report.documents.every(d => d.chen_bridge_unchanged),
  upstream_schema_issue_documents: report.documents.filter(d => d.upstream_schema_issues.length).length,
  parser_evidence_references: report.parser_references.reduce((n, p) => n + p.evidence_references, 0),
  parser_unresolved_references: report.parser_references.reduce((n, p) => n + p.unresolved.length, 0),
};
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
