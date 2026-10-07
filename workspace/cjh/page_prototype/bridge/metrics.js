/**
 * D11 首次封存测试 —— 真实结果统计（服务端聚合）
 *
 * 口径纪律（关键）：
 *  1. 指标全部由 data/ 下真实数据集实算，无任何估算或示例值。
 *  2. 每项指标必须带分母（n）与覆盖范围，绝不把"未核"计入命中。
 *  3. L3 原文命中只在有原始解析快照的文档上执行；其余单列"无解析包·未核"。
 *  4. 不生成任何合成分数——指标不达标就显示不达标，不修饰。
 *
 * 统计脚本 _survey.js / _evidence_check.js 的产出（demo/_*.json）会被优先复用；
 * 未产出时按需现场实算，保证接口任何时候都能返回真数。
 */
const fs = require("fs");
const path = require("path");

// __dirname = <工程根>/bridge，故 data / docs 各上退一级
const DATA_DIR = path.join(__dirname, "..", "data");
const DOCS_DIR = path.join(__dirname, "..", "..", "docs");
const PARSE_SNAPSHOT = path.join(DOCS_DIR, "_ref_zhang_D3_pledge.parse.json");

const pct = (a, b) => (b ? +((a / b) * 100).toFixed(2) : null);

/** 独立实现，避免与 server.js 形成循环依赖（行为与 server.js 的 sendJSON 一致） */
function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function listDataFiles() {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json") && !f.endsWith(".check.json"))
    .map((f) => f.replace(/\.json$/, ""));
}

/** 载入原始解析快照 → block 索引（供 L3 原文命中） */
function loadParseIndex() {
  if (!fs.existsSync(PARSE_SNAPSHOT)) return null;
  const j = JSON.parse(fs.readFileSync(PARSE_SNAPSHOT, "utf8"));
  const byBlockId = new Map();
  const tableCells = new Map();
  const fullText = [];
  (j.pages || []).forEach((p) => {
    (p.blocks || []).forEach((b) => {
      if (b && b.block_id) byBlockId.set(b.block_id, b);
      if (b && b.text) fullText.push(b.text);
    });
    (p.tables || []).forEach((t) => {
      const arr = tableCells.get(t.table_id) || [];
      (t.cells || []).forEach((c) => {
        if (c && c.text != null) arr.push(String(c.text));
      });
      tableCells.set(t.table_id, arr);
    });
  });
  return { doc_id: j.doc && j.doc.doc_id, doc_name: j.doc && j.doc.file_name,
    page_count: (j.pages || []).length, block_count: byBlockId.size,
    byBlockId, tableCells, fullText: fullText.join("\n") };
}

function norm(s) {
  return String(s == null ? "" : s)
    .replace(/[\s　]/g, "").replace(/[，]/g, ",").replace(/[。．]/g, ".")
    .replace(/[：]/g, ":").replace(/[（]/g, "(").replace(/[）]/g, ")")
    .replace(/％/g, "%").replace(/／/g, "/").replace(/[－—–]/g, "-").toLowerCase();
}

function matchQuote(quote, blk, idx) {
  const q = norm(quote);
  if (!q) return { hit: false, reason: "quote 为空" };
  if (blk) {
    if (norm(blk.text || "").includes(q)) return { hit: true, where: "block.text" };
    if (norm(blk.text_raw || "").includes(q)) return { hit: true, where: "block.text_raw" };
    if (blk.table_ref && idx.tableCells.has(blk.table_ref.table_id) &&
        idx.tableCells.get(blk.table_ref.table_id).some((t) => norm(t).includes(q)))
      return { hit: true, where: "表格单元格" };
    return { hit: false, reason: "该 block 内未找到" };
  }
  return { hit: norm(idx.fullText).includes(q), reason: "整篇全文核对（弱）", weak: true };
}

/** 字段容器判定：形如 {value/…, status/…, provenance} */
function isField(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  return v.status !== undefined || v.raw_value !== undefined || v.provenance !== undefined;
}

/**
 * 实算全部指标。
 * 返回结构与 demo/_evidence_check.json 一致，供页面与脚本共用。
 */
function computeMetrics() {
  const idx = loadParseIndex();
  const agg = {
    datasets: 0, fields_total: 0, fields_with_prov: 0,
    prov_total: 0, prov_block: 0, prov_page: 0, prov_region: 0, prov_quote: 0, prov_table: 0, prov_cell_ref: 0,
    l3_eligible: 0, l3_checked: 0, l3_hit: 0,
    status_extracted: 0, status_pending_review: 0, status_other: 0,
    standardized_true: 0, standardized_false: 0, standardized_null: 0,
  };
  const l3Miss = [];
  const perDataset = [];

  for (const ds of listDataFiles()) {
    const j = JSON.parse(fs.readFileSync(path.join(DATA_DIR, ds + ".json"), "utf8"));
    const events = Array.isArray(j.events) ? j.events : [];
    const d = { dataset: ds, file_name: (j.source && j.source.file_name) || null,
      parser_version: (j.source && j.source.parse_meta && j.source.parse_meta.parser_version) || null,
      data_mode: j.data_mode || (j.is_mock ? "simulated" : "real"),
      run_id: j.run_id || null, events: events.length,
      fields_total: 0, fields_with_prov: 0, prov: 0,
      l3_eligible: 0, l3_checked: 0, l3_hit: 0, l3_miss: [] };
    agg.datasets++;

    events.forEach((ev) => {
      const f = ev && (ev.fields || ev);
      if (!f || typeof f !== "object") return;
      Object.entries(f).forEach(([fname, fv]) => {
        if (!isField(fv)) return;
        d.fields_total++; agg.fields_total++;
        const prov = Array.isArray(fv.provenance) ? fv.provenance : [];
        if (prov.length) { d.fields_with_prov++; agg.fields_with_prov++; }

        // 抽取状态 / 标准化 分布
        const st = fv.status;
        if (st === "extracted") agg.status_extracted++;
        else if (st === "pending_review") agg.status_pending_review++;
        else if (st !== undefined) agg.status_other++;
        if (fv.standardized === true) agg.standardized_true++;
        else if (fv.standardized === false) agg.standardized_false++;
        else agg.standardized_null++;

        prov.forEach((pv) => {
          if (!pv) return;
          d.prov++; agg.prov_total++;
          if (pv.block_id) agg.prov_block++;
          if (pv.page !== undefined && pv.page !== null) agg.prov_page++;
          if (Array.isArray(pv.region) && pv.region.length === 4) agg.prov_region++;
          if (pv.quote) agg.prov_quote++;
          if (pv.table_id) agg.prov_table++;
          if (pv.cell_ref) agg.prov_cell_ref++;

          if (!idx || !pv.block_id) return;
          if (String(pv.block_id).split("_")[0] !== idx.doc_id) return;
          d.l3_eligible++; agg.l3_eligible++;
          const blk = idx.byBlockId.get(pv.block_id) || null;
          d.l3_checked++; agg.l3_checked++;
          const m = matchQuote(pv.quote, blk, idx);
          if (m.hit) { d.l3_hit++; agg.l3_hit++; }
          else {
            const rec = { dataset: ds, event_id: ev.event_id || null, field: fname,
              block_id: pv.block_id, quote: String(pv.quote || "").slice(0, 60), reason: m.reason };
            d.l3_miss.push(rec); l3Miss.push(rec);
          }
        });
      });
    });
    d.l1_rate = d.fields_total ? +(d.fields_with_prov / d.fields_total).toFixed(4) : null;
    perDataset.push(d);
  }

  return {
    idx, agg, l3Miss, perDataset,   // agg 一并返回，供handleMetrics 构造口径说明
    summary: {
      datasets: agg.datasets,
      fields_total: agg.fields_total,
      fields_with_prov: agg.fields_with_prov,
      l1_pct: pct(agg.fields_with_prov, agg.fields_total),
      prov_total: agg.prov_total,
      block_id_pct: pct(agg.prov_block, agg.prov_total),
      page_pct: pct(agg.prov_page, agg.prov_total),
      region_pct: pct(agg.prov_region, agg.prov_total),
      quote_pct: pct(agg.prov_quote, agg.prov_total),
      table_id_pct: pct(agg.prov_table, agg.prov_total),
      cell_ref_pct: pct(agg.prov_cell_ref, agg.prov_total),
      standardized_pct: pct(agg.standardized_true, agg.standardized_true + agg.standardized_false),
      extracted_pct: pct(agg.status_extracted, agg.status_extracted + agg.status_pending_review + agg.status_other),
    },
    l3: {
      doc_id: idx && idx.doc_id,
      doc_name: idx && idx.doc_name,
      checked: agg.l3_checked, hit: agg.l3_hit, miss: l3Miss.length,
      hit_rate_pct: pct(agg.l3_hit, agg.l3_checked),
      datasets_checkable: perDataset.filter((d) => d.l3_eligible > 0).map((d) => d.dataset),
      datasets_unverifiable: perDataset.filter((d) => d.l3_eligible === 0).length,
    },
  };
}

/**
 * 组装 /api/metrics 响应。
 * 指标卡按总规划 §验收指标给出目标值，但**达标与否由实算数决定**，
 * 未覆盖的指标显式标"未核"，绝不按目标值填充。
 */
function handleMetrics(res) {
  try {
    const m = computeMetrics();
    const s = m.summary, l3 = m.l3, agg = m.agg;

    // 目标值来自 cjh_workspace_00_总规划.md §验收指标（仅作对照，不参与计算）
    // 口径严格对应总规划原文，不混用近似指标：
    //   字段抽取率 ≥90%   → status === "extracted" 占已判定状态字段的比例
    //   标准化   ≥98%     → standardized === true 占 true/false（未标注不入分母）
    //   出处命中 ≥95%     → L3 原文命中（quote 能在原始解析 block 中找到）
    const TARGETS = [
      { key: "extracted_pct", name: "字段抽取率", target: 90, value: s.extracted_pct, unit: "%",
        caliber: "status=extracted 占已判定状态字段的比例（分子 " + agg.status_extracted +
          " / 分母 " + (agg.status_extracted + agg.status_pending_review + agg.status_other) + "）" },
      { key: "standardized_pct", name: "标准化率", target: 98, value: s.standardized_pct, unit: "%",
        caliber: "standardized=true 占 true/false 之比（分子 " + agg.standardized_true +
          " / 分母 " + (agg.standardized_true + agg.standardized_false) + "，未标注 " +
          agg.standardized_null + " 条不入分母）" },
      { key: "provenance_hit", name: "出处命中率", target: 95, value: l3.hit_rate_pct, unit: "%",
        caliber: "L3 原文命中：" + l3.hit + "/" + l3.checked + "，仅覆盖 " + l3.datasets_checkable.length + " 个有解析包的文档",
        coverage_note: "本地仅 1 份原始解析快照，其余 " + l3.datasets_unverifiable + " 个数据集未核，不计入分母" },
    ];

    const cards = TARGETS.map((t) => {
      const measured = t.value !== null && t.value !== undefined;
      return {
        key: t.key, name: t.name, target: t.target, value: t.value, unit: t.unit,
        caliber: t.caliber, coverage_note: t.coverage_note || null,
        status: !measured ? "unverified" : t.value >= t.target ? "pass" : "below",
        gap: measured ? +(t.value - t.target).toFixed(2) : null,
      };
    });

    // 锚点完备性（内部质量指标，无目标值——目标里没有这一项，不虚构）
    const anchors = [
      { key: "block_id_pct", name: "溯源带 block_id", value: s.block_id_pct, unit: "%", n: s.prov_total },
      { key: "page_pct", name: "溯源带 page", value: s.page_pct, unit: "%", n: s.prov_total },
      { key: "region_pct", name: "溯源带 region", value: s.region_pct, unit: "%", n: s.prov_total },
      { key: "quote_pct", name: "溯源带 quote", value: s.quote_pct, unit: "%", n: s.prov_total },
      { key: "table_id_pct", name: "溯源带 table_id", value: s.table_id_pct, unit: "%", n: s.prov_total },
      { key: "cell_ref_pct", name: "溯源带 cell_ref", value: s.cell_ref_pct, unit: "%", n: s.prov_total },
    ];

    // 按parser 版本分组命中对比（D11 核心发现：0.3.0 vs 0.7.0）
    const byParser = {};
    m.perDataset.filter((d) => d.l3_checked > 0).forEach((d) => {
      const k = d.parser_version || "unknown";
      if (!byParser[k]) byParser[k] = { parser: k, datasets: [], checked: 0, hit: 0, rows: [] };
      byParser[k].datasets.push(d.dataset);
      byParser[k].checked += d.l3_checked;
      byParser[k].hit += d.l3_hit;
      byParser[k].rows.push({ dataset: d.dataset, checked: d.l3_checked, hit: d.l3_hit, miss: d.l3_miss.length });
    });
    const parserCompare = Object.values(byParser).map((g) => ({
      parser: g.parser, datasets: g.datasets, checked: g.checked, hit: g.hit,
      hit_rate_pct: pct(g.hit, g.checked), rows: g.rows,
    })).sort((a, b) => (a.parser < b.parser ? -1 : 1));

    return sendJSON(res, 200, {
      generated_at: new Date().toISOString(),
      caliber_discipline: [
        "全部指标由 data/ 下真实数据集实算，无示例值、无估算",
        "每项带分母 n；'未核'不计入命中分母",
        "L3 原文命中需原始解析快照，当前仅 1 份，覆盖范围如实标注",
        "目标值取自总规划验收指标，仅作对照，不参与计算；不达标即显示不达标",
        "字段抽取率与溯源存在率（L1）是两个不同指标，勿混用：前者看 status，后者看 provenance 是否存在",
      ],
      cards,
      anchors,
      // 溯源存在率（L1）：与"字段抽取率"分开列出，避免口径混淆
      l1_provenance: {
        name: "溯源存在率（L1）",
        value: s.l1_pct, unit: "%",
        with_provenance: s.fields_with_prov, total_fields: s.fields_total,
        caliber: "带非空 provenance[] 的字段 / 字段总数",
        note: "此项不等于总规划的『字段抽取率』（当前 " + s.extracted_pct +
          "%）——抽取率看 status=extracted，本项看有无溯源，两者不可混用",
      },
      summary: s,
      l3: Object.assign({}, l3, {
        snapshot: m.idx ? { doc_id: m.idx.doc_id, doc_name: m.idx.doc_name,
          page_count: m.idx.page_count, block_count: m.idx.block_count } : null,
        miss_samples: m.l3Miss.slice(0, 20),
      }),
      parser_compare: parserCompare,
      per_dataset: m.perDataset,
    });
  } catch (e) {
    return sendJSON(res, 500, { error: "D11 统计装配失败: " + e.message });
  }
}

module.exports = { handleMetrics, computeMetrics };