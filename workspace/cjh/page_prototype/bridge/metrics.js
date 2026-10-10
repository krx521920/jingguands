/**
 * D11 首次封存测试 —— 真实结果统计（服务端聚合）
 *
 * ★ D20 起（领导 10-09 裁定的"换源"在本文件落地）：
 *   指标默认只跑**权威批次 `data_unified/`**（魏 D11 首测冻结批次）。
 *   原先只跑 `data/`（09-28~10-02 旧抽取，548 字段），导致页面的71.53% 与材料的
 *   72.52%（615 字段）出自两个不同样本却常被并列引用（D19 查出）。
 *   演示池 `data/` 仍可在下拉里查看，但**不计入任何分子分母**。
 *   数据源批次、份数、指纹由 bridge/data_source.js 单一真源提供，随 /api/metrics 一起下发。
 *
 * 口径纪律（关键）：
 *  1. 指标全部由真实数据集实算，无任何估算或示例值。
 *  2. 每项指标必须带分母（n）与覆盖范围，绝不把"未核"计入命中。
 *  3. L3 原文命中只在有原始解析快照的文档上执行；其余单列"无解析包·未核"。
 *  4. 不生成任何合成分数——指标不达标就显示不达标，不修饰。
 *  5. ★ 每个响应都带 data_source 段：读者必须能看出「这个数跑在哪批数据上」。
 *
 * 统计脚本 _survey.js / _evidence_check.js 的产出（demo/_*.json）会被优先复用；
 * 未产出时按需现场实算，保证接口任何时候都能返回真数。
 */
const fs = require("fs");
const path = require("path");

const dataSource = require("./data_source.js");   // D20：数据源单一真源（批次/口径/指纹）

// __dirname = <工程根>/bridge，故 data / docs 各上退一级
const LEGACY_DATA_DIR = path.join(__dirname, "..", "data");
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

/**
 * ★ D20：枚举参与本次实算的数据集。
 *   batchId = "authoritative"（默认，权威口径，只跑入分子的批次）
 *   batchId = "legacy"（对照用，页面按需查演示池；**不进权威口径的分子分母**）
 *   batchId = "all"（两批都跑，仅用于对账展示，不得作为上屏口径）
 */
function listDataFiles(batchId) {
  const want = batchId || dataSource.PRIMARY_ID;
  if (want === "all") return dataSource.list().map(e => e.name);
  if (want === dataSource.PRIMARY_ID) {
    // ★ 权威口径：只取 counts_for_primary 的条目（已排除本地演示件 DEMO-*）
    return dataSource.list().filter(e => e.counts_for_primary).map(e => e.name);
  }
  return dataSource.list().filter(e => e.batch === want).map(e => e.name);
}

/** 数据集名 → 实际文件路径（跨两批解析，权威优先）。 */
function resolveDataFile(name) {
  const info = dataSource.resolve(name);
  return info ? info.file : path.join(LEGACY_DATA_DIR, name + ".json");
}

/**
 * 载入 L3 出处核验用的原文block 索引。
 *
 * ★ D20 修正（换源暴露出的假失败）：
 *   本地唯一快照 `docs/_ref_zhang_D3_pledge.parse.json` 是 **parser 0.7.0**（09-29 解析），
 *   而权威批次 D4-PLD-001 是 **parser 0.9.0**。两者 block 编号体系不同（0.7.0 把
 *   「翟军」编为 b00023、0.9.0 编为 b00022…），block_id 前缀相同但**指向不同文本**。
 *   换源前页面跑 0.7.0 信封对 0.7.0 快照 ⇒ 自洽；换源后拿 0.7.0 快照去核 0.9.0 信封
 *   ⇒ quote 落不进 block，出处命中率显示 **7.69%** —— 这是**假失败**，
 *   不是抽取变差了。
 *   实测证明：用该信封自带的 `source.parse_meta.blocks`（同一parser 版本）自校验 = 39/39 = 100%。
 *
 *   ⇒ 铁律：**解析产物跨parser 版本不可比对**。版本不匹配时必须判「快照不适用·未核」，
 *     绝不能拿旧快照算出一个看起来像成绩的百分比。反过来，若信封自带 blocks，
 *     优先用它自校验（同一份解析产物，可信度最高）。
 */
function loadParseIndex() {
  // ---- ① 信封自带 blocks 优先（与provenance 同源同版本）----
  const self = parseSelfBlocks();
  if (self) return self;
  // ---- ② 回退外部快照，仅当版本与信封一致时才可用 ----
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
    // ★ block_id 前缀：D3 快照的 doc_id 是 "d44e95085"（d 前缀+ sha8），信封侧 block_id 同格式
    doc_prefix: j.doc && j.doc.doc_id ? String(j.doc.doc_id) : null,
    byBlockId, tableCells, fullText: fullText.join("\n"),
    parser_version: (j.doc && j.doc.parser && (j.doc.parser.name + "/" + j.doc.parser.version)) || null,
    source: PARSE_SNAPSHOT };
}

/**从当前批次的信封里找唯一自带 blocks 的那一份，做同源自校验。
 *  判「唯一」是刻意的：多份信封就必然有多套 block_id 体系，混起来是自欺。*/
function parseSelfBlocks() {
  try {
    for (const e of dataSource.list().filter(x => x.counts_for_primary && x.readable)) {
      const j = JSON.parse(fs.readFileSync(e.file, "utf8"));
      const blocks = j.source && j.source.parse_meta && j.source.parse_meta.blocks;
      if (!Array.isArray(blocks) || blocks.length < 10) continue;
      const byBlockId = new Map();
      const tableCells = new Map();
      const fullText = [];
      for (const b of blocks) {
        if (b && b.block_id) byBlockId.set(b.block_id, b);
        if (b && b.text) fullText.push(b.text);
        if (b && b.table_ref && b.table_ref.table_id) {
          const arr = tableCells.get(b.table_ref.table_id) || [];
          if (b.text) arr.push(String(b.text));
          tableCells.set(b.table_ref.table_id, arr);
        }
      }
      return {
        doc_id: (j.source && j.source.file_sha256 || "").slice(0, 8),
        doc_name: (j.source && j.source.file_name) || e.name,
        page_count: (j.source && j.source.parse_meta && j.source.parse_meta.page_count) || null,
        block_count: byBlockId.size,
        // ★ 前缀从 block_id 反推（"d44e95085_p001_b00001" → "d44e95085"），
        //   不能拿 file_sha256 前8 位直接当——那边没有 d 前缀，比对永远不等。
        doc_prefix: String((blocks.find(b => b && b.block_id) || {}).block_id || "").split("_")[0] || null,
        byBlockId, tableCells, fullText: fullText.join("\n"),
        parser_version: (j.source && j.source.parse_meta && j.source.parse_meta.parser_version) || null,
        // ★ 关键标记：本索引来自信封自身，不是外部快照
        self_from: e.name,
        source: e.rel_path,
      };
    }
  } catch (e) { /* 坏文件跳过 */ }
  return null;
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
function computeMetrics(batchId) {
  const idx = loadParseIndex();
  const scope = batchId || dataSource.PRIMARY_ID;
  const agg = {
    datasets: 0, fields_total: 0, fields_with_prov: 0,
    prov_total: 0, prov_block: 0, prov_page: 0, prov_region: 0, prov_quote: 0, prov_table: 0, prov_cell_ref: 0,
    l3_eligible: 0, l3_checked: 0, l3_hit: 0,
    status_extracted: 0, status_pending_review: 0, status_other: 0,
    standardized_true: 0, standardized_false: 0, standardized_null: 0,
  };
  const l3Miss = [];
  const perDataset = [];

  for (const ds of listDataFiles(scope)) {
    const j = JSON.parse(fs.readFileSync(resolveDataFile(ds), "utf8"));
    const events = Array.isArray(j.events) ? j.events : [];
    const src = dataSource.resolve(ds);
    const d = { dataset: ds, file_name: (j.source && j.source.file_name) || null,
      parser_version: (j.source && j.source.parse_meta && j.source.parse_meta.parser_version) || null,
      data_mode: j.data_mode || (j.is_mock ? "simulated" : "real"),
      run_id: j.run_id || null, events: events.length,
      // ★ 每份都带批次与角色——逐数据集表格也能看出它算不算进权威口径
      batch: src ? src.batch : null,
      batch_label: src ? src.batch_label : null,
      role: src ? src.role : "unknown",
      counts_for_primary: src ? src.counts_for_primary : false,
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

          //★ D20：核验前必须过两道闸，缺一不可——
          //  ① block_id 前缀与本索引所属文档一致（否则是拿别的文档的 block 核）
          //  ② envelope 的 parser_version 与本索引的 parser_version 一致
          //     （0.7.0 与 0.9.0 的 block 编号体系不同，跨版本比对必然假失败）
          // 闸不过 ⇒ 不计入分母（判未核），而不是算出一个假的命中率。
          if (!idx || !pv.block_id) return;
          if (String(pv.block_id).split("_")[0] !== idx.doc_prefix) return;
          const envParser = (j.source && j.source.parse_meta && j.source.parse_meta.parser_version) || null;
          if (idx.parser_version && envParser && idx.parser_version !== envParser) {
            d.l3_version_mismatch = (d.l3_version_mismatch || 0) + 1;
            return;
          }
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
    idx, agg, l3Miss, perDataset, scope,   // agg 一并返回，供handleMetrics 构造口径说明
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
      // ★ 核验依据（必须能看到，否则 100% 这个数无法追责）
      source_kind: idx && idx.self_from ? "self_blocks" : (idx ? "external_snapshot" : "none"),
      source_ref: idx && idx.source ? idx.source : null,
      parser_version: idx && idx.parser_version ? idx.parser_version : null,
      version_mismatch_skipped: perDataset.reduce((n, d) => n + (d.l3_version_mismatch || 0), 0),
      coverage_note: idx && idx.self_from
        ? "核验索引取自信封自带的 source.parse_meta.blocks（与 provenance 同一次解析产物，同parser 版本）"
        : (idx ? "核验索引取自外部快照，parser 版本须与信封一致才计入分母" : "无可用解析产物，全部未核"),
      checked: agg.l3_checked, hit: agg.l3_hit, miss: l3Miss.length,
      hit_rate_pct: pct(agg.l3_hit, agg.l3_checked),
      datasets_checkable: perDataset.filter((d) => d.l3_eligible > 0).map((d) => d.dataset),
      datasets_unverifiable: perDataset.filter((d) => d.l3_eligible === 0).length,
    },
  };
}

/** 读标准化两项实算产物（demo/_standardized_real.js 产出）。
 *  ★ 不在此处重算：卡片与注册表必须读同一份产物，否则必然重演"同名两个值"。
 *  ★ 缺失或分母 0 ⇒ 返回 null（判未测），绝不按目标值或经验值填充。 */
function readStandardized() {
  const p = path.join(__dirname, "..", "demo", "_standardized_real.json");
  let r = null;
  try { r = JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { r = null; }
  if (!r) return { coverage: null, accuracy: null, context: null };
  const cov = r.coverage && r.coverage.den > 0 ? r.coverage : null;
  const acc = r.accuracy && r.accuracy.den > 0 ? r.accuracy : null;
  return { coverage: cov, accuracy: acc, context: r.context || null };
}

/**
 * 组装 /api/metrics 响应。
 * 指标卡按总规划 §验收指标给出目标值，但**达标与否由实算数决定**，
 * 未覆盖的指标显式标"未核"，绝不按目标值填充。
 */
function handleMetrics(res, batchId) {
  try {
    const scope = batchId || dataSource.PRIMARY_ID;
    const m = computeMetrics(scope);
    const s = m.summary, l3 = m.l3, agg = m.agg;

    // D12：把指标注册表一并下发，让页面顶层的口径面板与下方旧图表读同一份真源。
    // 不这么做就会出现「上屏口径」与「图表数值」两套定义，正是要根治的毛病。
    let registryPayload = null;
    try { registryPayload = require("./metrics_registry.js"); }
    catch (e) { registryPayload = null; }

    // D17：标准化判据已由评测侧裁定（evaluation/D17/裁定-standardized判据-20261010.md）。
    //  两个指标必须分列，且**数值不在此处重算**——由 demo/_standardized_real.js 实算后
    //  写 demo/_standardized_real.json，本处只读产物。理由：卡片与注册表必须同源，
    //  两处各算一次就会重演"同名两个值"。
    //  产物缺失 ⇒ target 仍挂、value 为 null（判未测），绝不按目标值填充。
    const std = readStandardized();
    // ★ 出处命中率：卡片与注册表必须同源，否则同屏出现两个分母（39/241）。
    //   取注册表 evidence_hit 的实测值为准；L3 明细降级为口径说明里的补充视图。
    const provCard = (() => {
      let ev = null;
      try { ev = require("./metrics_registry.js").get("evidence_hit"); } catch (e) { ev = null; }
      const den = ev && ev.den != null ? ev.den : null;
      const num = ev && ev.num != null ? ev.num : null;
      const docs = (ev && ev.evidence_note && (/覆盖\s*(\d+)\s*份文档/.exec(ev.evidence_note) || [])[1]) || "0";
      return { value: ev ? ev.value : null, num: num == null ? "—" : num, den: den == null ? "—" : den, docs: docs };
    })();
    // 目标值来自 cjh_workspace_00_总规划.md §验收指标（仅作对照，不参与计算）。
    // ★口径纪律（D15/D17 校准）：90% 是**准确率**目标、98% 是**标准化正确率**目标，
    //   二者都不得挂在覆盖率/出处这类"分母含弃权"的口径上——挂错等于用错口径宣布未达标。
    const TARGETS = [
      { key: "extracted_pct", name: "字段抽取覆盖率", target: null, value: s.extracted_pct, unit: "%",
        caliber: "status=extracted 占已判定状态字段的比例（分子 " + agg.status_extracted +
          " / 分母 " + (agg.status_extracted + agg.status_pending_review + agg.status_other) +
          "）；弃权字段计入分母。权威分母 606",
        coverage_note: "★ 准确率目标 90% 对应的是另一个指标（字段抽取准确率 437/437），不挂本项" },
      { key: "standardized_pct", name: "标准化覆盖率", target: null,
        value: std.coverage ? std.coverage.pct : null, unit: "%",
        caliber: std.coverage
          ? "标准化覆盖率＝standardized=true 的非 text 有值字段 / 非 text 有值字段（分子 " +
            std.coverage.num + " / 分母 " + std.coverage.den + "）"
          : "标准化覆盖率＝standardized=true 的非 text 有值字段 / 非 text 有值字段（未测，无实算产物）",
        coverage_note: "★ 判据依 evaluation/D17/裁定-standardized判据-20261010.md；text 字段不入分母（D13-C2）；目标 98% 挂在「标准化正确率」，不挂本项" +
          (std.coverage ? "（含 text 噪声的辅助口径 " + std.context.aux_pct + "% 仅作对照）" : "") },
      { key: "standardized_accuracy_pct", name: "标准化正确率", target: 98,
        value: std.accuracy ? std.accuracy.pct : null, unit: "%",
        caliber: std.accuracy
          ? "非 text 有值且有 Gold 期望的字段中，value 与 Gold 规范值一致（分子 " +
            std.accuracy.num + " / 分母 " + std.accuracy.den + "）"
          : "非 text 有值且有 Gold 期望的字段中，value 与 Gold 规范值一致（未测）",
        coverage_note: "value 即规范化后的取值，值层一致即标准化正确（与标准化覆盖率分列，不得相加）" },
      { key: "provenance_hit", name: "出处命中率", target: 95, value: provCard.value, unit: "%",
        caliber: "出处原文命中率＝quote 落在原始解析 block.text 内（分子 " +
          provCard.num + " / 分母 " + provCard.den + "）。数据源＝指标注册表 evidence_hit" +
          (provCard.value === null ? "（★ 未测：实算产物缺失，不得按 100% 填充）" : ""),
        coverage_note: "★ 覆盖 " + provCard.docs + " 份文档（有原文快照），可核子集 " +
          provCard.num + " 条 provenance；其余未覆盖文档的 provenance 未核，不计入分母。" +
          "本卡是强判据（quote ∈ block.text），退化为整篇包含只记 weak 不计入分子。" +
          (l3.checked ? " L3 明细（本页自校验，同源信封 blocks）：" + l3.hit + "/" + l3.checked + "，覆盖 " + l3.datasets_checkable.length + " 份文档。" : "") },
    ];

    const cards = TARGETS.map((t) => {
      const measured = t.value !== null && t.value !== undefined;
      return {
        key: t.key, name: t.name, target: t.target, value: t.value, unit: t.unit,
        caliber: t.caliber, coverage_note: t.coverage_note || null,
        // ★ 无目标项不得判pass：`value >= null` 恒为 true，会把「覆盖率」这类
        //   自建口径的指标谎报成达标。target 为 null 时只报实测值，不报达标与否。
        status: !measured ? "unverified"
          : (t.target === null || t.target === undefined) ? "no_target"
            : (t.value >= t.target ? "pass" : "below"),
        gap: measured && t.target !== null && t.target !== undefined
          ? +(t.value - t.target).toFixed(2) : null,
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
      // ★ D21：数据源披露段（领导 10-09 裁定③「页面可以暴露信息源」；
      //   宗 10-09 裁决要求附批次标识与锚点，见 data_source.js 的 ANCHOR）。
      //   ★ 文案里禁用 markdown 标记——这些串会被 textContent 原样渲染到页面上。
      data_source: Object.assign({}, dataSource.disclose(), {
        scope,
        scope_note:
          scope === dataSource.PRIMARY_ID
            ? "本次响应为权威口径：只跑「" + dataSource.primary().label + "」中 counts_for_primary 的 " +
              s.datasets + " 份，其余批次不计入任何分子分母。"
            : "★ 注意：本次响应跑的是非权威批次「" + scope + "」，数字不可与材料成绩并列引用。",
        measured_now: {
          datasets: s.datasets,
          events: m.perDataset.reduce((n, d) => n + (d.events || 0), 0),
          fields_total: s.fields_total,
          extracted_n: agg.status_extracted,
          extracted_d: agg.status_extracted + agg.status_pending_review + agg.status_other,
          extracted_pct: s.extracted_pct,
        },
      }),
      // ★ D12：口径注册表（单一真源）。页面顶层按三类分列渲染，下方旧图表保留对照。
      //   不这么做就会出现「上屏口径」与「图表数值」两套定义，正是要根治的毛病。
      registry: registryPayload ? {
        categories: registryPayload.CATEGORIES,
        status_legend: registryPayload.STATUS,
        metrics: registryPayload.list(),
        not_covered: registryPayload.notCovered(),
        coverage_statement: registryPayload.coverageStatement(),
        fingerprint: registryPayload.fingerprint(),
        discipline: [
          "准确率 / 覆盖率 / 出处命中率分列，三者不相加、不合并成综合分",
          "每项带自己的分子分母；分母不同的两个数不可比",
          "status=not_covered 即未测，禁止按目标值或经验值填充",
          "引用任何成绩须同时引用 input_fingerprint 与 source_script",
        ],
      } : null,
      caliber_discipline: [
        "★ D20 起全部指标只跑权威批次 data_unified/（counts_for_primary），无示例值、无估算",
        "另一批 data/（演示与旧抽取池）仅供查看，不计入任何分子分母",
        "每项带分母 n；'未核'不计入命中分母",
        "L3 原文命中需原始解析快照，当前仅 1 份，覆盖范围如实标注",
        "目标值取自总规划验收指标，仅作对照，不参与计算；不达标即显示不达标",
        "字段抽取率与溯源存在率（L1）是两个不同指标，勿混用：前者看 status，后者看 provenance 是否存在",
        "★ D20：引用任何数字须同时引用 data_source 段的批次、份数与目录指纹",
        "★ D12 起口径以顶层注册表为准，本节仅保留 D11 原始口径供对照",
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
          page_count: m.idx.page_count, block_count: m.idx.block_count,
          source_ref: m.idx.source || null,
          source_kind: m.idx.self_from ? "self_blocks" : "external_snapshot",
          parser_version: m.idx.parser_version || null,
          // ★ 跨 parser 版本不可比（D20 坐实：0.7.0 快照核 0.9.0 信封会假失败 7.69%）
          parser_mismatch_warning: "解析产物跨 parser 版本 block 编号体系不同，版本不匹配的字段一律不计入分母（判未核），不折算成命中率",
        } : null,
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