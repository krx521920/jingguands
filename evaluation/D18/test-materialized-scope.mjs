import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const checker = fileURLToPath(new URL('./check-snapshot-coverage.mjs', import.meta.url));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'd18-scope-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'env'));
  const docs = Array.from({ length: 34 }, (_, i) => {
    const case_id = `C${i}`;
    const bytes = Buffer.from(JSON.stringify({ case_id }));
    fs.writeFileSync(path.join(root, `${case_id}.json`), i < 31 ? bytes : Buffer.from('{}'));
    const file_sha256 = hash(case_id);
    if (i < 32) fs.writeFileSync(path.join(root, 'env', `${case_id}.json`), JSON.stringify({ source: { file_sha256 }, events: [] }));
    return { case_id, parse_path: `${case_id}.json`, file_sha256, parse_file_sha256: hash(bytes) };
  });
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ docs }));
  const run = (...args) => {
    const result = spawnSync(process.execPath, [checker, '--manifest', 'manifest.json', '--envelopes', 'env', '--materialized', '.', '--exclude', 'C31', ...args], { cwd: root, encoding: 'utf8' });
    return { ...result, report: result.stdout.trim() ? JSON.parse(result.stdout) : null };
  };
  return { root, run };
}
test('default scope still checks all 34 entries and rejects the three unselected mismatches', t => {
  const { run } = fixture(t); const result = run();
  assert.equal(result.status, 1);
  assert.equal(result.report.materialized_scope, 'all');
  assert.equal(result.report.materialized_checked, 34);
  assert.equal(result.report.materialized_skipped, 0);
  assert.equal(result.report.materialized_bad, 3);
});
test('selected scope checks the 31 referenced snapshots and reports skipped entries', t => {
  const { run } = fixture(t); const result = run('--materialized-scope', 'selected');
  assert.equal(result.status, 0);
  assert.equal(result.report.materialized_scope, 'selected');
  assert.equal(result.report.materialized_checked, 31);
  assert.equal(result.report.materialized_skipped, 3);
  assert.equal(result.report.materialized_bad, 0);
});
for (const failure of ['tampered', 'missing']) test(`selected scope rejects a ${failure} selected snapshot`, t => {
  const { root, run } = fixture(t); const target = path.join(root, 'C0.json');
  if (failure === 'tampered') fs.writeFileSync(target, '{}'); else fs.unlinkSync(target);
  const result = run('--materialized-scope', 'selected');
  assert.equal(result.status, 1);
  assert.equal(result.report.materialized_checked, 31);
  assert.equal(result.report.materialized_bad, 1);
});
test('unknown materialized scope is rejected explicitly', t => {
  const { run } = fixture(t); const result = run('--materialized-scope', 'typo');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /materialized-scope/);
});
