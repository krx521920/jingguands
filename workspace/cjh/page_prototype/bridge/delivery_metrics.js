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
    for (const [relative, expected] of Object.entries(sheet.input_hashes)) {
      const actual = crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root, relative), 'utf8').replace(/\r\n/g, '\n')).digest('hex');
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
  // ★ 2026-10-17 合并消解（陈，页面展示层）：
  //   ① 魏版在 sheet 校验失败时把全部 shared 键置 not_covered —— 但本页注册表数值来自
  //      bridge/caliber.js **本地实算**（C2 规则下 evaluation/ 输入本就不全在库），
  //      因交付成绩单缺输入而抹掉已有实算＝把「未测」错用到「已实测」项上。
  //      改为：保留实算值，仅在 evidence_note 披露交付成绩单校验失败原因（诚实披露，不冒充）。
  //   ② sheet（13:00 构建）早于 Gold v1.2（16:05）：其 field_accuracy/gold_expected_field_recall
  //      是 v1.1 口径（437/437=100）。若与本地 caliber 实算不一致，**以 Gold v1.2 为准**，
  //      保留本地值并在 evidence_note 披露差异（待魏侧重建交付成绩单）。
  const sheetErrNote = sheet.error ? '交付成绩单校验未通过（' + sheet.error + '）——本项数值来自 bridge/caliber.js 本地实算（Gold v1.2 口径），未受影响' : null;
  const result = metrics.map(metric => {
    const current = sheet.scores.find(s => s.key === (aliases[metric.key] || metric.key));
    if (!current) {
      if (sheet.error && shared.has(metric.key)) return { ...metric, delivery_sheet_error: sheet.error, evidence_note: sheetErrNote };
      return metric;
    }
    // ② Gold v1.2 防回灌：sheet 与本地实算分子分母不一致 ⇒ 以本地（v1.2）为准，差异披露
    const staleGold = metric.value != null && current.value != null
      && (current.num !== metric.num || current.den !== metric.den);
    if (staleGold) {
      return { ...metric, delivery_sheet_note: '交付成绩单（' + sheet.generator + '）为 Gold v1.1 口径 ' + current.num + '/' + current.den + ' = ' + current.value + '%，与本页 Gold v1.2 实算 ' + metric.num + '/' + metric.den + ' 不一致——以 Gold v1.2 为准，待魏侧重建交付成绩单（宗 2026-10-17 答辩口径 §二）' };
    }
    return { ...metric, ...current, key: metric.key, caliber: current.note, evidence_note: current.note, status_label: current.value == null ? '未测' : '已实测', source_script: sheet.generator, input_fingerprint: sheet.input_hashes, meets_target: current.target != null && current.value != null ? (current.direction === 'lower' ? current.value <= current.target : current.value >= current.target) : null };
  });
  for (const current of sheet.scores.filter(s => s.group === '本轮真实抽取验收')) {
    // ★ 宗裁定 2026-10-17 §一④：「页面/CLI 字段一致率 125/125」不通过——同源幂等≠独立抽取一致。
    //   按裁定选项①改名；web_cli_independent 继续标未测，本卡不得作为其销项。
    if (current.key === 'web_cli_independent') {
      result.push({
        ...current, key: 'same_source_same_result',
        name: '同源结果一致率（same_source_same_result）',
        caliber: '本项证的是同源同函数幂等（页面与 CLI 共用同一抽取源与同一函数），不是独立抽取一致；'
          + '★ 宗裁定 2026-10-17 §一④：原名「页面/CLI 字段一致率」不成立，已按选项①改名；'
          + 'web_cli_independent（两次独立 model call＋各自 run_id＋逐字段 diff）继续标未测，本卡不得作为其销项',
        evidence_note: current.note, category: 'delivery', status_label: '已实测', meets_target: null,
      });
      continue;
    }
    result.push({ ...current, category: 'delivery', status_label: '已实测', caliber: current.note, evidence_note: current.note, meets_target: null });
  }
  return result;
}
module.exports = { readDeliveryMetrics, overlayDeliveryMetrics };
