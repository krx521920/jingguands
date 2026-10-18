/** Load the shared delivery scorecard only while its inputs and ratios remain valid. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const REPO = path.resolve(__dirname, '../../../..');
function readDeliveryMetrics(root = REPO, file = path.join(root, 'evaluation/2026-10-17-delivery-metrics/metrics.json')) {
  try {
    const sheet = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (sheet.schema !== 'finstruct.delivery-metrics/1' || !sheet.input_hashes || !Object.keys(sheet.input_hashes).length || !Array.isArray(sheet.scores)) throw new Error('成绩单格式无效');
    if (!sheet.input_sets || Object.keys(sheet.input_sets).length !== 4) throw new Error('成绩单缺少输入集合，请重新生成');
    for (const [dir, set] of Object.entries(sheet.input_sets)) {
      const actual = fs.readdirSync(path.resolve(root, dir)).filter(f => f.endsWith(set.suffix) && !set.excluded.includes(f)).sort();
      if (JSON.stringify(actual) !== JSON.stringify(set.files)) throw new Error('输入集合已变化，请重新生成成绩单：' + dir);
    }
    for (const [relative, expected] of Object.entries(sheet.input_hashes)) {
      const bytes = fs.readFileSync(path.resolve(root, relative));
      const actual = crypto.createHash('sha256').update(relative.endsWith('.png') ? bytes : bytes.toString('utf8').replace(/\r\n/g, '\n')).digest('hex');
      if (actual !== expected) throw new Error('输入已变化，请重新生成成绩单：' + relative);
    }
    for (const [relative, expected] of Object.entries(sheet.artifact_hashes || {})) {
      const actual = crypto.createHash('sha256').update(fs.readFileSync(path.resolve(path.dirname(file), relative), 'utf8').replace(/\r\n/g, '\n')).digest('hex');
      if (actual !== expected) throw new Error('验收产物已变化，请重新生成成绩单：' + relative);
    }
    for (const metric of sheet.scores) {
      if (metric.unit !== '%' || metric.value == null) continue;
      if (!Number.isFinite(metric.num) || !Number.isFinite(metric.den) || metric.den <= 0 || metric.num < 0 || metric.num > metric.den || metric.value !== +(100 * metric.num / metric.den).toFixed(2)) throw new Error('百分比与分子分母不一致：' + metric.key);
    }
    return sheet;
  } catch (error) { return { schema: 'finstruct.delivery-metrics/1', scores: [], error: error.message }; }
}
function overlayDeliveryMetrics(metrics, sheet) {
  const aliases = { expected_field_recall: 'gold_expected_field_recall' };
  const shared = new Set(['field_accuracy', 'field_coverage', 'evidence_hit_strict', 'evidence_hit', 'standardized_rate', 'cross_doc_match', 'multi_doc_conflict', 'integration_pass', 'perf_20page', 'expected_field_recall', 'abstain_correct']);
  const result = metrics.map(metric => {
    const current = sheet.scores.find(s => s.key === (aliases[metric.key] || metric.key));
    if (!current) return sheet.error && shared.has(metric.key) ? { ...metric, value: null, num: null, den: null, status: 'not_covered', status_label: '未测', meets_target: null, evidence_note: sheet.error } : metric;
    return { ...metric, ...current, key: metric.key, caliber: current.note, evidence_note: current.note, status_label: current.value == null ? '未测' : '已实测', source_script: sheet.generator, input_fingerprint: sheet.input_hashes, meets_target: current.target != null && current.value != null ? (current.direction === 'lower' ? current.value <= current.target : current.value >= current.target) : null };
  });
  for (const current of sheet.scores.filter(s => !result.some(m => m.key === s.key || aliases[m.key] === s.key))) result.push({ ...current, category: 'delivery', status_label: '已实测', caliber: current.note, evidence_note: current.note, meets_target: null });
  return result;
}
module.exports = { readDeliveryMetrics, overlayDeliveryMetrics };
