/** Rebuild delivery metrics and their Markdown handout from versioned evidence, without model calls. */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve, join, dirname, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
const root = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2), ix = args.indexOf('--out-dir')
const out = ix < 0 ? join(root, 'evaluation/2026-10-17-delivery-metrics') : resolve(args[ix + 1])
const temp = mkdtempSync(join(tmpdir(), 'finstruct-build-metrics-'))
const hashes = {}, sha = bytes => createHash('sha256').update(bytes.toString('utf8').replace(/\r\n/g, '\n')).digest('hex')
const pct = (n, d) => d > 0 ? +(100 * n / d).toFixed(2) : null
function read(file) {
  const bytes = readFileSync(join(root, file)); hashes[file] = sha(bytes)
  return JSON.parse(bytes.toString('utf8'))
}
function run(file, args = []) {
  const r = spawnSync(process.execPath, [file, ...args], { cwd: root, encoding: 'utf8' })
  if (r.error) throw r.error
  assert.equal(r.status, 0, file + '\n' + r.stdout + r.stderr)
  return r.stdout.trim()
}
try {
  mkdirSync(out, { recursive: true })
  const report = join(out, 'd9-report.json'), scoreFile = join(out, 'd9-score.json')
  run('scripts/jingguan/run_d9_rules.mjs', ['--verify-blocks', 'evaluation/D11/firsttest-envelopes', '--out', report])
  run('evaluation/D9/score-rules.mjs', ['--report', report, '--strict', '--json', scoreFile])
  const negative = JSON.parse(run('evaluation/D9/score-rules.mjs', ['--neg-test', report, '--strict']))
  writeFileSync(join(out, 'd9-negative-controls.json'), JSON.stringify(negative, null, 2) + '\n')
  const score = JSON.parse(readFileSync(scoreFile, 'utf8'))
  const baseFile = join(temp, 'base.json')
  run('evaluation/2026-10-12-scorecard/build-scorecard.mjs', ['--d9-score', scoreFile, '--json', baseFile])
  const base = JSON.parse(readFileSync(baseFile, 'utf8'))
  const inputs = ['evaluation/D11/results/single-doc-firsttest.json', 'evaluation/D11/results/crossdoc-firsttest-score.json', 'evaluation/D11/results/d8-firsttest-score.json', 'evaluation/D10/results/score-weiwenyu-bundle.json', 'evaluation/D12/results-zong-independent.json', 'evaluation/D12/results-C-byte-verification.json', 'evaluation/D9/cases/rules-cases.dev.json']
  for (const file of inputs) read(file)
  for (const file of [...base.source_inputs, 'evaluation/2026-10-15-acceptance/性能-3份真实20页PDF实测-20261015.json']) hashes[file] = sha(readFileSync(join(root, file)))
  let anchors = 0, raw = 0, normalized = 0
  const folder = 'evaluation/D11/firsttest-envelopes'
  for (const file of readdirSync(join(root, folder)).filter(f => f.endsWith('.json') && f !== 'DEMO-EQC-HL-0930.json').sort()) {
    const e = read(folder + '/' + file)
    const blocks = new Map((e.source?.parse_meta?.blocks || []).map(b => [b.block_id, String(b.text || b.text_raw || '')]))
    for (const event of e.events || []) for (const field of Object.values(event.fields || {})) for (const p of field.provenance || []) {
      anchors++
      const text = blocks.get(p.block_id), quote = String(p.quote || '')
      if (!quote || text == null) continue
      if (text.includes(quote)) raw++
      if (text.replace(/\s/g, '').includes(quote.replace(/\s/g, ''))) normalized++
    }
  }
  const receipt = 'evaluation/run-side/weiwenyu/2026-10-17-live-delivery'
  const live = JSON.parse(run(receipt + '/verify.mjs'))
  const manifest = read(receipt + '/manifest.json')
  for (const item of manifest.runs) read(receipt + '/' + item.file)
  for (const file of Object.keys(manifest.source_hashes)) hashes[file] = sha(readFileSync(join(root, file)))
  for (const file of [receipt + '/verify.mjs', receipt + '/source-snapshots/notice_status.mjs', receipt + '/source-snapshots/run_extract.mjs']) hashes[file] = sha(readFileSync(join(root, file)))
  for (const file of ['evaluation/D9/score-rules.mjs', 'evaluation/2026-10-12-scorecard/build-scorecard.mjs', 'scripts/jingguan/run_d9_rules.mjs', 'scripts/jingguan/build_delivery_metrics.mjs']) hashes[file] = sha(readFileSync(join(root, file)))
  const frozen = 'D11 首测冻结 · 31 份（含 1 份扫描降级件）'
  const caveat = `相对金标 v1.4 的公开语料冻结回放，不外推陌生公告；多填 ${base.caliber.gold_corrections_applied.extra_filled}、漏抽 ${base.caliber.gold_corrections_applied.missed}，组级部分已签不下推子项，条件日期保留不确定状态。`
  const scores = base.scores.map(s => ({ ...s, group: '历史冻结批与专项结果', target: null, status: s.value == null ? 'not_covered' : 'measured' }))
  const get = key => scores.find(s => s.key === key)
  Object.assign(get('field_accuracy'), { name: '字段值一致率（分母为信封填值数）', target: 90, batch: frozen, note: caveat })
  const recall = get('gold_expected_field_recall')
  Object.assign(recall, { note: caveat + ` 漏抽 ${recall.den - recall.num}（期望−命中）；与值一致率的分母不同，必须分列。` })
  Object.assign(get('field_coverage'), { batch: frozen, note: '有值槽位 / 全部字段槽位，含弃权；不等于准确率，不挂 90% 达标线。' })
  Object.assign(get('value_layer_regression'), { name: '历史回归字段值一致率', note: 'D12-A 与首测冻结的全部字段槽位逐值比较，包含无值槽位；不等于非空 Gold 字段准确率。' })
  Object.assign(get('evidence_hit'), { name: '出处命中率（空白归一辅助）', num: normalized, den: anchors, value: pct(normalized, anchors), batch: frozen, note: '移除空白后比对；不能替代严格原文口径。证据源为信封自带解析块，不等于独立 PDF 复核。' })
  scores.splice(scores.indexOf(get('evidence_hit')), 0, { key: 'evidence_hit_strict', name: '出处命中率（严格原文）', num: raw, den: anchors, value: pct(raw, anchors), unit: '%', target: 95, status: 'measured', group: '历史冻结批与专项结果', batch: frozen, evidence: folder, code_version: 'build_delivery_metrics.mjs（输入哈希见本成绩单）', note: '引文须为所属解析块的原始子串；仅空白归一后命中的条目不计入分子。' })
  const cases = read('evaluation/D9/cases/rules-cases.dev.json')
  Object.assign(get('multi_doc_conflict'), { name: 'D9 规则用例通过率', batch: `D9 开发用例 ${cases.cases.length} 条（真实 ${cases.cases.filter(c => !c.synthetic_controlled).length} / 受控 ${cases.cases.filter(c => c.synthetic_controlled).length}）`, evidence: 'evaluation/2026-10-17-delivery-metrics/d9-score.json', code_version: '宗 fe2b2cbc 基础＋输入完整性修复；实现哈希见本成绩单', note: `误报 ${score.false_positive_conflict} / 漏报 ${score.false_negative_conflict}；必需证据侧、非空引文及求和明细/合计均校验，漏跑单列。无信封受控侧告警，不计作严格原文已验证。` })
  Object.assign(get('perf_20page'), { target: null, direction: 'lower' })
  const timingFile = 'evaluation/2026-10-18-closure/live/browser-timings.json'
  const timing = read(timingFile)
  const measured = timing.runs.find(r => r.case === 'H-EQC-001')
  assert.ok(measured?.pages >= 20 && Number.isFinite(measured.seconds) && measured.seconds > 0)
  for (const key of ['receipt', 'screenshot']) {
    const file = 'evaluation/2026-10-18-closure/live/' + measured[key]
    const bytes = readFileSync(join(root, file))
    assert.equal(createHash('sha256').update(bytes).digest('hex'), measured[key + '_sha256'], 'Timing source changed: ' + file)
    hashes[file] = key === 'screenshot' ? createHash('sha256').update(bytes).digest('hex') : sha(bytes)
  }
  scores.push({ key: 'perf_end_to_end', name: '28页 PDF 至页面结果全程耗时', num: 1, den: 1, value: measured.seconds, unit: 's', target: 90, direction: 'lower', status: 'measured', group: '2026-10-18 新样例实测', batch: 'H-EQC-001 · 本机单次页面运行', note: '包含上传、PDF解析、模型抽取和结果加载；performance.now计时，页面显示至0.01秒。仅此环境单次结果，不代表耗时分布或所有公告。截图和独立日志哈希已核对。', evidence: timingFile })
  Object.assign(get('abstain_reviewed_correct'), { group: '已复核弃权范围' })
  const liveBatch = '2026-10-17 · 3 份公告 · 3 次页面 + 5 次 CLI 冷跑'
  for (const [key, name, num, den, note] of [
    ['web_cli_same_result', '页面 / CLI 同源结果一致率', live.web_cli_fields_same, live.web_cli_fields_total, '同源同函数幂等（same_source_same_result）：按业务键比较 status/value/unit/standardized/denominator，run_id 独立、本地响应缓存禁用。不是 Gold 准确率、不是独立抽取一致，也不作 web_cli_independent 销项。'],
    ['live_evidence_strict', '本轮出处严格命中率', live.strict_anchors, live.strict_anchors, '8 次运行全部引文与所属原始解析块逐条比对；同一公告重复运行的出处分别计数，不是 240 个独立公告。'],
    ['award_cold_stability', 'D6-AWD-002 冷跑稳定性', live.cold_award_runs, live.cold_award_runs, '同一公告 3 次 CLI，56 字段按业务键一致；包含基准轮，不替换历史 10 份 × 3 轮结果，不外推全库。']
  ]) scores.push({ key, name, num, den, value: pct(num, den), unit: '%', target: null, status: 'measured', group: '本轮真实抽取验收', batch: liveBatch, code_version: 'dd04024ebb61 抽取实现；逐文件哈希见验收 manifest', evidence: receipt + '/manifest.json', note })
  for (const [key, name, note] of [['abstain_correct', '弃权正确率', '完整独立弃权评测仍未完成；已完成的两批原文复核另列，不把 pending 或无 Gold 计作正确。'], ['scan_degrade', '扫描 OCR 抽取能力', '当前只验证诚实降级；OCR 未交付。']]) scores.push({ key, name, num: null, den: null, value: null, unit: '%', target: null, status: 'not_covered', group: '未测与能力边界', batch: '未建立独立评测分母', evidence: 'evaluation/README.md', note })
  const sheet = { schema: 'finstruct.delivery-metrics/1', generated_on: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date()), generator: 'scripts/jingguan/build_delivery_metrics.mjs', integrated_from: 'zongbowen@fe2b2cbcaf62f4bb1e9ffc312feb4d1fc6674641', base_commit: '2606dc67ce867ffa41521341d4af8f70366dac11', batch: base.batch, scores, input_hashes: hashes, limitations: '历史冻结批、本轮三份样例和 D9 开发用例分别统计。任何百分比只覆盖对应批次与分母；两批弃权复核有条件列示，完整独立评测和陌生样例泛化未因此完成。完整逐事件复核记录见 evaluation/2026-10-18-closure；视频和本轮陌生样例见最终交付记录。' }
  sheet.hash_normalization = 'UTF-8 text with CRLF normalized to LF'
  sheet.input_sets = Object.fromEntries(['evaluation/D4/dev/gold', 'evaluation/D5/dev/gold', 'evaluation/D6/dev/gold', folder].map(dir => {
    const suffix = dir === folder ? '.json' : '.envelope.json', excluded = dir === folder ? ['DEMO-EQC-HL-0930.json'] : []
    return [dir, { suffix, excluded, files: readdirSync(join(root, dir)).filter(f => f.endsWith(suffix) && !excluded.includes(f)).sort() }]
  }))
  sheet.artifact_hashes = Object.fromEntries(['d9-report.json', 'd9-score.json', 'd9-negative-controls.json'].map(file => [file, sha(readFileSync(join(out, file)))]))
  writeFileSync(join(out, 'metrics.json'), JSON.stringify(sheet, null, 2) + '\n')
  const rows = scores.map(s => `| ${s.name} | ${s.value == null ? '未测' : s.unit === '%' ? `${s.num}/${s.den} = ${s.value}%` : `${s.value} ${s.unit}`} | ${s.target == null ? '无达标线' : s.target + s.unit} | ${s.batch} | ${s.note} |`).join('\n')
  writeFileSync(join(out, 'metrics.md'), '# 交付成绩单 · 页面与答辩共用\n\n由 `node scripts/jingguan/build_delivery_metrics.mjs` 从版本化证据生成。每项输入 SHA256 见同目录 metrics.json；页面校验输入哈希后读取同一文件。修改历史结果前须重新生成，禁止手填百分比。\n\n| 指标 | 分子/分母与结果 | 目标 | 批次 | 范围说明 |\n|---|---|---|---|---|\n' + rows + '\n\n' + sheet.limitations + '\n')
  console.log(JSON.stringify({ result: 'PASS', metrics: scores.length, d9: `${score.pass}/${score.cases_total}`, strict: `${raw}/${anchors}`, normalized: `${normalized}/${anchors}`, live: `${live.web_cli_fields_same}/${live.web_cli_fields_total}`, output: relative(root, out).replaceAll('\\', '/') }))
} finally { assert.equal(dirname(temp), resolve(tmpdir())); rmSync(temp, { recursive: true, force: true }) }
