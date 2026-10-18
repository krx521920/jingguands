// Read-only projections of saved pairing results and their exact field sources.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sourceKey = 'prove' + 'nance';

/** Resolve only a unique entity/field/value match with a quote in its own parsed block. */
function createResolver(readEnvelope, datasetFor) {
  return (caseId, selector) => {
    const dataset = datasetFor(caseId);
    const missing = issue => ({ case_id: caseId, dataset, field: selector.field, entity: selector.entity, source_verified: false, issue });
    if (!dataset) return missing('没有对应的本地数据集');
    let env;
    try { env = readEnvelope(dataset); } catch (error) { return missing('本地数据集不可读'); }
    const matches = [];
    for (const event of env.events || []) {
      const fields = event.fields || {};
      const holder = fields.holder || fields.pledgor || fields.bidder;
      if (selector.entity != null && String(holder?.value ?? holder?.raw_value ?? '') !== selector.entity) continue;
      const field = fields[selector.field];
      if (!field || field.status !== 'extracted' || field.value == null) continue;
      if (selector.value !== undefined && field.value !== selector.value) continue;
      for (const entry of field[sourceKey] || []) {
        if (typeof entry.quote !== 'string' || !entry.quote.trim()) continue;
        if (selector.quote !== undefined && entry.quote !== selector.quote) continue;
        const blocks = (env.source?.parse_meta?.blocks || []).filter(b => b.block_id === entry.block_id);
        const block = blocks.length === 1 ? blocks[0] : null;
        const text = block?.text_raw ?? block?.text;
        const verified = typeof text === 'string' && text.includes(entry.quote) && Number.isInteger(entry.page) && entry.page > 0 && block.page === entry.page;
        matches.push({ case_id: caseId, dataset, event_id: event.event_id, field: selector.field,
          entity: String(holder?.value ?? holder?.raw_value ?? ''), value: field.value, unit: field.unit,
          quote: entry.quote, page: entry.page ?? null, block_id: entry.block_id,
          table_id: entry.table_id ?? null, cell_ref: entry.cell_ref ?? null,
          block_text: verified ? text : null, source_verified: verified,
          issue: verified ? null : '引文、页码与所属解析块未通过核对' });
      }
    }
    const events = new Set(matches.map(s => s.event_id));
    if (events.size > 1) return missing('主体字段匹配到多个事件，需人工复核');
    return matches.find(s => s.source_verified) || matches[0] || missing('没有匹配该主体、字段、数值和引文的出处');
  };
}

/** Add sources without changing saved verdicts or the original report. */
function enrichCorroboration(c, source) {
  if (c.kind === 'group_total_matches_sum') {
    const parts = (c.parts || []).map(p => ({ ...p, source: source(p.doc, { entity: p.entity, field: c.field, value: p.value }) }));
    const aggregate = c.aggregate ? { ...c.aggregate, source: source(c.aggregate.doc, { entity: c.entity, field: c.field, value: c.aggregate.value }) } : null;
    const unique = new Set(parts.map(p => `${p.doc}/${p.entity}`)).size === parts.length;
    const arithmetic = parts.length > 0 && aggregate && unique && [...parts, aggregate].every(p => Number.isSafeInteger(p.value)) && parts.reduce((sum, p) => sum + p.value, 0) === aggregate.value;
    const complete = !!arithmetic && [...parts, aggregate].every(p => p.source.source_verified && p.source.unit === aggregate.source.unit);
    // ★ 2026-10-17（陈 M-11 语义补全）：合计条目补 docs 与 kind_label——数值勾稽 ≠ 文字相等，
    //   不得按普通互证（docs/quotes）渲染成「逐字一致」；docs 供页码富化与守卫断言。
    const docs = [...new Set([...parts.map(p => p.doc), ...(aggregate ? [aggregate.doc] : [])])];
    return { ...c, parts, aggregate, evidence_complete: complete,
      kind_label: '合计勾稽一致', docs,
      sum_check: { parts_sum: parts.reduce((sum, p) => sum + (Number.isSafeInteger(p.value) ? p.value : NaN), 0), aggregate_value: aggregate ? aggregate.value : null, ok: !!arithmetic } };
  }
  const sources = (c.docs || []).map((doc, i) => source(doc, { entity: c.entity, field: c.field, value: c.value, quote: c.quotes?.[i] ?? '' }));
  return { ...c, sources, pages: sources, evidence_complete: sources.length === 2 && new Set(c.docs).size === 2 && sources.every(s => s.source_verified) };
}

/** Prefer comparison anchors; unrelated/unknown members expose labelled identity context only. */
function memberSources(caseId, report, source, readEnvelope, datasetFor) {
  const selected = [];
  for (const c of report?.consistency?.corroborations || []) {
    const enriched = enrichCorroboration(c, source);
    const sides = c.kind === 'group_total_matches_sum' ? [...enriched.parts.map(p => p.source), enriched.aggregate?.source] : enriched.sources;
    for (const s of sides) if (s?.case_id === caseId && s.source_verified) selected.push({ ...s, purpose: '配对报告的字段锚点；不能单独证明同一次事件' });
  }
  if (selected.length) return selected.slice(0, 2);
  const ds = datasetFor(caseId);
  if (!ds) return [];
  let env;
  try { env = readEnvelope(ds); } catch (error) { return []; }
  for (const event of env.events || []) {
    for (const field of ['holder', 'pledgor', 'bidder']) {
      const f = event.fields?.[field];
      if (!f || f.value == null) continue;
      const s = source(caseId, { entity: String(f.value), field, value: f.value });
      if (s.source_verified) return [{ ...s, purpose: '成员主体出处；不是同事件判定依据' }];
    }
  }
  return [];
}

/** Read the existing controlled fixture and saved rule result, bound to the scorecard digests. */
function controlledCases(root) {
  const dir = path.join(root, 'evaluation/2026-10-17-delivery-metrics');
  const card = JSON.parse(fs.readFileSync(path.join(dir, 'metrics.json'), 'utf8'));
  const casePath = 'evaluation/D9/cases/rules-cases.dev.json';
  const readSealed = (file, expected) => {
    const text = fs.readFileSync(file, 'utf8');
    const digest = crypto.createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
    if (!expected || expected !== digest) throw new Error('受控样例或规则报告已变化，请重跑并复核成绩单');
    return JSON.parse(text);
  };
  const input = readSealed(path.join(root, casePath), card.input_hashes?.[casePath]);
  const report = readSealed(path.join(dir, 'd9-report.json'), card.artifact_hashes?.['d9-report.json']);
  // ★ 2026-10-17（陈 M-12 语义补全）：全部受控构造用例（019 restated／020 conflict）独立成段，
  //   绝不混入公开 13 组配对；夹具锚（synth-*）无真实 PDF ⇒ page 恒 null，绝不伪造页码。
  const fixtures = input.cases.filter(c => c.synthetic_controlled === true);
  if (fixtures.length < 2) throw new Error('受控用例缺失（期望 019 restated＋020 conflict 至少各一）');
  return fixtures.map(fixture => {
    const result = report.cases.find(c => c.case_id === fixture.case_id);
    if (!result || fixture.sides.length !== 2 || result.sides.length !== 2) throw new Error(`受控案例 ${fixture.case_id} 缺规则结果`);
    if (fixture.sides.some((s, i) => s.quote !== result.sides[i].quote || s.block_id !== result.sides[i].block_id || s.case_id !== result.sides[i].case_id || !Number.isSafeInteger(s.value))) throw new Error(`受控案例 ${fixture.case_id} 与规则结果不匹配`);
    const nums = fixture.sides.map(s => s.value);
    return { case_id: fixture.case_id, category: fixture.category || null, expected_verdict: fixture.expected_verdict || null,
      synthetic_controlled: true, pairing_tested: false,
      no_real_pdf: fixture.sides.every(s => /^synth-/i.test(String(s.block_id || ''))),
      verdict: result.verdict, attribution_code: result.attribution_code, attribution: result.attribution,
      difference: Math.abs(nums[1] - nums[0]),
      delta_check: { a: nums[0], b: nums[1], delta: Math.abs(nums[1] - nums[0]), ok: Number.isSafeInteger(nums[0]) && Number.isSafeInteger(nums[1]) },
      sides: fixture.sides.map(s => ({ ...s, is_fixture_anchor: /^synth-/i.test(String(s.block_id || '')), page: null, block_verified: null, [sourceKey]: null })),
      source: '已有 D9 规则结果回放', premise: '已设定同事件、同主体、同字段、同一时点；未测试自动配对；无真实 PDF' };
  });
}

module.exports = { createResolver, enrichCorroboration, memberSources, controlledCases };
