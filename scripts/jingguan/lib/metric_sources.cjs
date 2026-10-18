/** Read and validate the versioned inputs behind delivery scores without changing evidence. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { FIELD_REGISTRY, STATUSES, checkRegistry } = require('./registry.mjs');
const OVERLAYS = ['evaluation/2026-10-15-caliber/gold-corrections-v1.1.json', 'evaluation/2026-10-18-closure/gold-corrections-v1.4.json'];
const PERFORMANCE = ['runs/batch-20261008T150554/batch_report.json', 'runs/batch-20261008T150658/batch_report.json'];
const REVIEWS = ['evaluation/2026-10-15-caliber/source-review.csv', 'evaluation/2026-10-17-gold-review/弃权复核-第二批69条-20261017.csv'];
const NO_VALUE = new Set(['not_mentioned', 'not_applicable', 'not_disclosed', 'needs_review', 'unreadable']);
function readJson(root, file) { return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')); }

/** Load all 30 required Gold files and apply both mandatory overlays to private objects. */
function loadGoldEvidence(root) {
  const byCaseId = new Map(), byFileId = new Map(), sourceFiles = [], corrections = [];
  for (const day of ['D4', 'D5', 'D6']) {
    const folder = `evaluation/${day}/dev/gold`;
    const files = fs.readdirSync(path.join(root, folder)).filter(f => f.endsWith('.envelope.json')).sort();
    assert.equal(files.length, 10, folder + ': required Gold corpus is incomplete');
    for (const file of files) {
      const relative = folder + '/' + file, gold = readJson(root, relative), id = file.replace('.envelope.json', '');
      assert.ok(gold.source?.file_id && Array.isArray(gold.events) && gold.events.length, relative + ': invalid Gold');
      const eventIds = new Set();
      for (const event of gold.events) {
        assert.ok(typeof event.event_id === 'string' && event.event_id && !eventIds.has(event.event_id), relative + ': duplicate or missing event ID'); eventIds.add(event.event_id);
        const registry = FIELD_REGISTRY[event.event_type];
        assert.ok(registry && event.fields && typeof event.fields === 'object' && !Array.isArray(event.fields), relative + ': event fields required');
        assert.deepEqual(Object.keys(event.fields).sort(), Object.keys(registry).sort(), relative + ': registered Gold fields differ');
        for (const field of Object.values(event.fields)) {
          assert.ok(field && typeof field === 'object' && STATUSES.includes(field.status), relative + ': invalid field status');
          const hasValue = field.value !== null && field.value !== undefined && !(typeof field.value === 'string' && !field.value.trim());
          assert.ok(!hasValue || ['string', 'number', 'boolean'].includes(typeof field.value), relative + ': value must be scalar');
          if (typeof field.value === 'number') assert.ok(Number.isFinite(field.value), relative + ': value must be finite');
          assert.ok(field.status !== 'extracted' || hasValue, relative + ': extracted requires value');
          assert.ok(field.status === 'extracted' || field.status === 'needs_review' || field.value === null, relative + ': non-valued status requires null');
        }
      }
      assert.deepEqual(checkRegistry(gold), [], relative + ': registered field semantics differ');
      assert.ok(!byFileId.has(gold.source.file_id), relative + ': duplicate source identity');
      byCaseId.set(id, gold); byFileId.set(gold.source.file_id, { gold, gold_case_id: id, dir: folder }); sourceFiles.push(relative);
    }
  }
  const seen = new Set();
  for (const [index, file] of OVERLAYS.entries()) {
    const overlay = readJson(root, file);
    assert.equal(overlay.schema, 'gold-corrections/1', file + ': invalid schema');
    assert.equal(overlay.version, index === 0 ? 'v1.1' : 'v1.4', file + ': unexpected version');
    assert.ok(Array.isArray(overlay.corrections) && overlay.corrections.length, file + ': corrections required');
    for (const c of overlay.corrections) {
      const key = `${c.case_id}/${c.event_id}/${c.field}`;
      assert.ok(!seen.has(key), file + ': duplicate correction ' + key); seen.add(key);
      const field = byCaseId.get(c.case_id)?.events.find(e => e.event_id === c.event_id)?.fields?.[c.field];
      assert.ok(field, file + ': unknown Gold target ' + key);
      const before = NO_VALUE.has(field.status) ? field.status : String(field.value);
      assert.equal(before, String(c.from), file + ': from differs from Gold ' + key);
      assert.ok(NO_VALUE.has(c.to) || c.to === 'true' || c.to === 'false', file + ': unsupported correction value ' + key);
      assert.ok(typeof c.reason === 'string' && c.reason.length && typeof c.evidence_block === 'string' && c.evidence_block.length, file + ': missing correction evidence');
      field.status = NO_VALUE.has(c.to) ? c.to : 'extracted';
      field.value = NO_VALUE.has(c.to) ? null : c.to;
      field.raw_value = field.value;
      if (field.value === null) field.standardized = false;
      corrections.push(c);
    }
    sourceFiles.push(file);
  }
  sourceFiles.push('scripts/jingguan/lib/registry.mjs');
  return { byCaseId, byFileId, sourceFiles, corrections, bad: [], overlay: { available: true, version: 'v1.1 + v1.4', applied: corrections.length, errors: [], paths: OVERLAYS } };
}

/** Parse quoted CSV records, including commas, escaped quotes and embedded newlines. */
function csvRows(text) {
  const rows = []; let row = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(value); value = ''; }
    else if (c === '\n' && !quoted) { row.push(value.replace(/\r$/, '')); rows.push(row); row = []; value = ''; }
    else value += c;
  }
  assert.ok(!quoted, 'unterminated CSV quote');
  if (value || row.length) { row.push(value.replace(/\r$/, '')); rows.push(row); }
  const [headers, ...data] = rows.filter(r => r.some(Boolean));
  assert.ok(headers?.length, 'CSV header required');
  return data.map(r => { assert.equal(r.length, headers.length, 'CSV column mismatch'); return Object.fromEntries(headers.map((h, i) => [h, r[i]])); });
}

/** Count explicitly reviewed decisions; pending and unreviewable fields never count as correct. */
function reviewedAbstentions(root, abstentions, goldIndex = loadGoldEvidence(root)) {
  let correct = 0, missed = 0, pending = 0;
  const available = new Set(), groups = new Map(), sourceFiles = [...REVIEWS];
  let unreviewable = 0, counted = 0;
  const frozenSlots = new Map();
  const folder = 'evaluation/D11/firsttest-envelopes';
  for (const file of fs.readdirSync(path.join(root, folder)).filter(f => f.endsWith('.json') && f !== 'DEMO-EQC-HL-0930.json')) {
    const relative = folder + '/' + file, envelope = readJson(root, relative); sourceFiles.push(relative);
    for (const event of envelope.events) for (const [field, value] of Object.entries(event.fields)) {
      if (value.value !== null && value.value !== undefined && value.value !== '') continue;
      counted++;
      frozenSlots.set([file.replace('.json', ''), event.event_id, field].join('/'), value);
      if (!goldIndex.byFileId.has(envelope.source?.file_id)) { unreviewable++; continue; }
      const key = [file.replace('.json', ''), event.event_id, field].join('/');
      assert.ok(!available.has(key), 'duplicate frozen review slot'); available.add(key);
    }
  }
  assert.equal(counted, abstentions, 'abstention scope differs from frozen inputs');
  const first = csvRows(fs.readFileSync(path.join(root, REVIEWS[0]), 'utf8'));
  const second = csvRows(fs.readFileSync(path.join(root, REVIEWS[1]), 'utf8'));
  for (const r of first) {
    const key = [r.case_id, r.envelope_event_id, r.field].join('/');
    assert.ok(available.delete(key), 'review slot missing or duplicated: ' + key);
    if (r.final_decision === 'pending') pending++;
    else { assert.ok(['维持 Gold（无值），不进分母', 'Gold 标签校正建议：见裁定 §四'].includes(r.final_decision), 'unrecognized review decision'); correct++; }
  }
  for (const r of second.filter(r => r.event)) assert.ok(available.delete([r.doc, r.event, r.field].join('/')), 'unknown or duplicate second-batch event');
  for (const key of available) { const [doc, , field] = key.split('/'), group = doc + '/' + field; groups.set(group, (groups.get(group) || 0) + 1); }
  const consumed = new Map(); let withoutEventId = 0;
  for (const r of second) {
    const group = r.doc + '/' + r.field;
    if (!r.event) {
      withoutEventId++; consumed.set(group, (consumed.get(group) || 0) + 1);
      assert.ok(consumed.get(group) <= (groups.get(group) || 0), 'review group missing or duplicated: ' + group);
    }
    if (r.verdict.startsWith('弃权成立')) correct++;
    else { assert.ok(r.verdict.startsWith('漏抽'), 'unrecognized review verdict'); missed++; }
  }
  const reviewed = first.length + second.length;
  for (const [group, count] of groups) assert.equal(consumed.get(group), count, 'review group is incomplete: ' + group);
  assert.equal(reviewed + unreviewable, abstentions, 'reviewed and no-Gold scopes must partition the frozen abstentions');
  const closureFile = 'evaluation/2026-10-18-closure/abstention-review.json';
  const closure = readJson(root, closureFile); sourceFiles.push(closureFile);
  assert.equal(closure.schema, 'finstruct.abstention-review/1');
  for (const [file, expected] of Object.entries(closure.input_hashes)) {
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')).digest('hex'), expected, 'review source changed: ' + file);
    sourceFiles.push(file);
  }
  let decidedCorrect = 0, decidedMissed = 0, scan = 0;
  for (const row of closure.rows) {
    const key = [row.case_id, row.event_id, row.field].join('/'), slot = frozenSlots.get(key);
    assert.ok(slot, 'unknown or duplicate closure slot: ' + key); frozenSlots.delete(key);
    assert.equal(row.envelope_status, slot.status); assert.equal(row.envelope_value, slot.value);
    assert.ok(row.reason && row.prior_review, 'review reason required');
    if (row.decision === 'scan_degradation') { assert.equal(slot.status, 'unreadable'); scan++; }
    else {
      assert.ok(row.source_parse && closure.input_hashes[row.source_parse], 'review source is not fingerprinted');
      if (row.decision === 'correct_abstention') decidedCorrect++;
      else { assert.equal(row.decision, 'missed_value'); decidedMissed++; }
    }
  }
  assert.equal(frozenSlots.size, 0, 'closure review is incomplete');
  assert.equal(scan, unreviewable);
  assert.deepEqual(closure.counts, { correct_abstention: decidedCorrect, missed_value: decidedMissed, scan_degradation: scan });
  return { correct: decidedCorrect, missed: decidedMissed, pending: 0, reviewed: closure.rows.length, total: abstentions, unreviewable: scan, decided: decidedCorrect + decidedMissed, withoutEventId: 0, sourceFiles, scopeNote: '逐事件ID补齐并复核11个条件日期；14项扫描降级单列。属于AI辅助原文复核，不是独立人工盲测。' };
}

/** Return the slowest recorded extraction-stage wall time, preserving the historical scope. */
function historicalPerformance(root) {
  const expectedCases = [['D5-EQC-001', 'D5-EQC-002', 'D5-EQC-003', 'eqc-synth-20p'], ['eqc-synth-20p']], runIds = new Set();
  const samples = PERFORMANCE.flatMap((file, index) => {
    const log = readJson(root, file);
    assert.equal(log.mock, false, file + ': mock performance excluded');
    assert.ok(Array.isArray(log.results) && log.results.length, file + ': no timed results');
    assert.deepEqual(log.results.map(r => r.case).sort(), [...expectedCases[index]].sort(), file + ': historical sample scope changed');
    assert.equal(log.timing?.slowest_ms, Math.max(...log.results.map(r => r.duration_ms)), file + ': timing summary differs');
    return log.results.map(r => {
      assert.equal(r.ok, true, file + ': unsuccessful sample'); assert.ok(Number.isFinite(r.duration_ms) && r.duration_ms > 0, file + ': invalid timing');
      assert.ok(typeof r.run_id === 'string' && r.run_id.length && !runIds.has(r.run_id), file + ': missing or repeated run'); runIds.add(r.run_id);
      return { case: r.case, ms: r.duration_ms, run_id: r.run_id, evidence: file };
    });
  });
  return { seconds: Math.max(...samples.map(s => s.ms)) / 1000, samples, sourceFiles: PERFORMANCE };
}
module.exports = { OVERLAYS, PERFORMANCE, REVIEWS, loadGoldEvidence, reviewedAbstentions, historicalPerformance, csvRows };
