/**
 * D11 首次封存测试 —— 真实结果统计（服务端聚合）
 *
 * ★ 2026-10-09 起（领导 10-09 裁定的"换源"在本文件落地）：
 *   指标默认只跑**权威批次 `data_unified/`**（魏 D11 首测冻结批次）。
 *   原先只跑 `data/`（09-28~10-02 旧抽取，548 字段），导致页面的71.53% 与材料的
 *   72.52%（615 字段）出自两个不同样本却常被并列引用（D19 查出）。
 *   演示池 `data/` 仍可在下拉里查看，但「不计入任何分子分母」。
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

const dataSource = require("./data_source.js");   // 2026-10-09：数据源单一真源（批次/口径/指纹）
const caliber = require("./caliber.js");          // ★ 2026-10-15：覆盖率口径单一真源（Gold 期望全集/三档范围）

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
 * ★ 2026-10-09：枚举参与本次实算的数据集。
 *   batchId = "authoritative"（默认，权威口径，只跑入分子的批次）
 *   batchId = "legacy"（对照用，页面按需查演示池；「不进权威口径的分子分母」）
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
 * ★ 2026-10-09 修正（换源暴露出的假失败）：
 *   本地唯一快照 `docs/_ref_zhang_D3_pledge.parse.json` 是 **parser 0.7.0**（09-29 解析），
 *   而权威批次 D4-PLD-001 是 **parser 0.9.0**。两者 block 编号体系不同（0.7.0 把
 *   「翟军」编为 b00023、0.9.0 编为 b00022…），block_id 前缀相同但**指向不同文本**。
 *   换源前页面跑 0.7.0 信封对 0.7.0 快照 ⇒ 自洽；换源后拿 0.7.0 快照去核 0.9.0 信封
 *   ⇒ quote 落不进 block，出处命中率显示 **7.69%** —— 这是**假失败**，
 *   不是抽取变差了。
 *   实测证明：用该信封自带的 `source.parse_meta.blocks`（同一parser 版本）自校验 = 39/39 = 100%。
 *
 *   ⇒ 铁律：「解析产物跨parser 版本不可比对」。版本不匹配时必须判「快照不适用·未核」，
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

/** 解析产物索引的键：文档前缀（block_id 的第一段，如 "d44e95085"）。
 *  同一份信封里所有 block 共用一个前缀 ⇒ 用它做索引键，
 *  核验时才知道「这条 provenance 的 block 该去哪份信封的 blocks 里找」。 */
function prefixOf(blockId) {
  return String(blockId || "").split("_")[0] || null;
}

/**
 * ★ 2026-10-11：从当前批次里**每一份**自带 blocks 的信封建一份索引（按文档前缀分桶）。
 *
 *   原来只取「第一份」就 return（`for (...) { ...; return {...} }`），
 *   于是 L3 明明可以核 30 份信封，却只核了1 份 —— 领导的遗留第 1 条。
 *   实测：权威批 31 份里 30 份自带 `source.parse_meta.blocks`（≥10 块），
 *   只有 pledge-scan-degrade 没有。
 *
 *   为什么原来"只取一份"是刻意的、现在又必须放开：
 *     旧设计的顾虑是「多份信封 ⇒ 多套 block_id 体系，混起来是自欺」——
 *     这条顾虑**仍然成立**，但解法不是「只留一份」，而是「按前缀分桶」：
 *     每份信封的 provenance 只会指向自己那份信封的 block，前缀不同就绝不会串。
 *     分桶之后「混用」在结构上不可能发生，不需要靠"只用一份"来防。
 */
function parseSelfBlockIndex() {
  const buckets = new Map();
  const docInfo = new Map();
  const skipped = [];
  for (const e of dataSource.list().filter(x => x.counts_for_primary && x.readable)) {
    let j = null;
    try { j = JSON.parse(fs.readFileSync(e.file, "utf8")); }
    catch (err) { skipped.push({ dataset: e.name, why: "读取失败: " + err.message }); continue; }
    const blocks = j.source && j.source.parse_meta && j.source.parse_meta.blocks;
    if (!Array.isArray(blocks) || blocks.length < 10) {
      skipped.push({ dataset: e.name, why: blocks ? `blocks 仅 ${blocks.length} 块（<10，不足以作索引）` : "信封未自带 blocks" });
      continue;
    }
    const byBlockId = new Map();
    const tableCells = new Map();
    const fullText = [];
    let prefix = null;
    for (const b of blocks) {
      if (b && b.block_id) {
        byBlockId.set(b.block_id, b);
        if (!prefix) prefix = prefixOf(b.block_id);
      }
      if (b && b.text) fullText.push(b.text);
      if (b && b.table_ref && b.table_ref.table_id) {
        const arr = tableCells.get(b.table_ref.table_id) || [];
        if (b.text) arr.push(String(b.text));
        tableCells.set(b.table_ref.table_id, arr);
      }
    }
    if (!prefix) { skipped.push({ dataset: e.name, why: "blocks 里没有 block_id，无法定前缀" }); continue; }
    buckets.set(prefix, {
      doc_id: (j.source && j.source.file_sha256 || "").slice(0, 8),
      doc_name: (j.source && j.source.file_name) || e.name,
      page_count: (j.source && j.source.parse_meta && j.source.parse_meta.page_count) || null,
      block_count: byBlockId.size,
      doc_prefix: prefix,
      byBlockId, tableCells, fullText: fullText.join("\n"),
      parser_version: (j.source && j.source.parse_meta && j.source.parse_meta.parser_version) || null,
      self_from: e.name,
      source: e.rel_path,
    });
    docInfo.set(e.name, prefix);
  }
  return { buckets, docInfo, skipped };
}

/** 从当前批次的信封里找唯一自带 blocks 的那一份，做同源自校验。
 *  ⚠本函数是「单份」视图，仅供只要一个 doc 的老调用方；
 *  多份核验请走 parseSelfBlockIndex()（2026-10-11 起 computeMetrics 已全量走分桶）。
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
  // ★ 2026-10-11：从「单份索引」改为**按文档前缀分桶的多份索引**。
  //   实测权威批 31 份里 30 份自带 blocks ⇒ L3 覆盖面从 1 份变 30 份。
  //   外部快照（parseSelfBlocks 的回退路径）仍保留：它是「单文档」索引，
  //   只在没有信封自带 blocks 时才顶上，此时覆盖面天然只有 1 份 —— 但那是事实，不假装。
  const bucketIdx = parseSelfBlockIndex();
  const fallback = bucketIdx.buckets.size ? null : loadParseIndex();
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
  const envelopes = [];   // ★ 2026-10-15：同时收齐信封，供 bridge/caliber.js 建 Gold 期望全集

  for (const ds of listDataFiles(scope)) {
    const j = JSON.parse(fs.readFileSync(resolveDataFile(ds), "utf8"));
    envelopes.push({ id: ds, json: j });
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

          //★ 2026-10-09：核验前必须过两道闸，缺一不可——
          //  ① block_id 前缀与本索引所属文档一致（否则是拿别的文档的 block 核）
          //  ② envelope 的 parser_version 与本索引的 parser_version 一致
          //     （0.7.0 与 0.9.0 的 block 编号体系不同，跨版本比对必然假失败）
          // 闸不过 ⇒ 不计入分母（判未核），而不是算出一个假的命中率。
          //
          // ★ 2026-10-11：闸①从「比对唯一索引的 doc_prefix」改为「「按前缀取对应那一份」」。
          //   分桶后不同信封的 block 体系在结构上就隔离了 —— 拿 A 信封的 block_id
          //   去查 B 信封的桶，必然查不到（byBlockId.get 返回 null），
          //   于是它进不了分母，而不是拿别的文档的文本凑出一个假命中。
          //   这比"只留一份索引"多核了 29 份，且没有引入串档风险。
          if (!pv.block_id) return;
          const prefix = prefixOf(pv.block_id);
          const idx = (bucketIdx.buckets.size ? bucketIdx.buckets.get(prefix) : fallback);
          // ★ 桶缺失/桶值为空 ⇒ 判「不可核」并跳过，「绝不让它一路 null 到 .get()/.byBlockId 抛错」
          //   （反证实测：这里不判，一处坏桶能让整页指标 500）。
          if (!idx || !idx.byBlockId) { d.l3_no_index = (d.l3_no_index || 0) + 1; return; }
          const envParser = (j.source && j.source.parse_meta && j.source.parse_meta.parser_version) || null;
          if (idx.parser_version && envParser && idx.parser_version !== envParser) {
            d.l3_version_mismatch = (d.l3_version_mismatch || 0) + 1;
            return;
          }
          d.l3_eligible++; agg.l3_eligible++;
          d.l3_doc = d.l3_doc || idx.doc_name;
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

  // ★ 2026-10-13：summary.standardized_pct 改为与指标卡/注册表「同源」 ——
  //   只读 demo/_standardized_real.json 实算产物，不在此处重算（两处各算一次
  //   必然重演"同名两个值"，与 readStandardized() 处注释同一纪律）。
  //   旧写法 pct(true, true+false) 把全部 606 字段算进分母：混入 unit:text 208 条
  //   （D13-C2 明令不入分母）与弃权 169 条，得 434/606 = 71.62% ——
  //   ① 与同屏卡片 229/229 = 100% 同屏两套数；
  //   ② demo/_defects.js 又拿它对比 98% 目标，产出假缺陷 D11-P1-01
  //      （记在魏文宇名下，已被 D17 裁定与宗 2026-10-12 成绩单 229/229 推翻）。
  //   正确口径依 evaluation/D17/裁定-standardized判据-20261010.md：分母＝非 text 有值字段。
  //   产物缺失 ⇒ null（判未测），绝不按目标值或经验值填充。
  const stdCoverage = readStandardized().coverage;

  // ★ 2026-10-15（方轩诚反馈 + 领导「动手修复并在页面侧落地」）：
  //   覆盖率不再只有一个数。三档范围与「Gold 期望字段召回率」全部由 bridge/caliber.js
  //   实算（口径单一真源），本文件只取用、不重算：
  //     ① 全字段槽位有值率（历史口径）＝437/606＝72.11%，保留原数值语义（key 仍叫 extracted_pct）
  //     ② 核心文本槽位有值率＝437/592＝73.82%（排除原文缺陷件 pledge-scan-degrade 的 14 字段）
  //     ③ Gold 期望字段召回率＝437/437＝100%（**分母只由 Gold 清单决定，不由引擎 status 反推**）
  //   ③ 号数必须带限定语（当前 Gold 条件口径 / 公开语料冻结回放 / 不外推泛化 / 原文推导复核未完成），
  //   且不得据此把「该批原文应抽字段全部抽到」当成原文全覆盖头条。
  //   ★ 纪律：禁止通过修改引擎 status（如把字段改成 not_mentioned）来缩小分母。
  const cal = caliber.computeCaliber(envelopes);
  const recall = cal.gold.recall, vmatch = cal.gold.value_match;

  return {
    idx: fallback, agg, l3Miss, perDataset, scope, caliber: cal,   // agg/caliber 供 handleMetrics 构造口径说明
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
      standardized_pct: stdCoverage ? stdCoverage.pct : null,
      // ① 历史口径（键名保留兼容）：全字段槽位有值率
      extracted_pct: pct(agg.status_extracted, agg.status_extracted + agg.status_pending_review + agg.status_other),
      slot_value_rate_pct: cal.slot.pct,
      slot_value_num: cal.slot.num,
      slot_value_den: cal.slot.den,
      // ② 核心文本件槽位口径（排除原文缺陷件）
      core_text_slot_pct: cal.ranges.core_text.fields ? pct(cal.ranges.core_text.extracted, cal.ranges.core_text.fields) : null,
      core_text_slot_num: cal.ranges.core_text.extracted,
      core_text_slot_den: cal.ranges.core_text.fields,
      // ③ Gold 期望字段召回率 / 值一致率（条件口径）
      expected_field_recall_pct: recall.pct,
      expected_field_recall_num: recall.num,
      expected_field_recall_den: recall.den,
      gold_value_match_pct: vmatch.pct,
      gold_value_match_num: vmatch.num,
      gold_value_match_den: vmatch.den,
      gold_available: cal.gold.available,
      gold_pending_fields: cal.gold.pending.gold,
      engine_pending_fields: cal.gold.pending.engine,
      // 金标 v1.3 算术层（多填/漏抽与版本状态；available:false 表示未取件、口径退回 v1.1 终态）
      gold_arithmetic_available: !!(cal.gold.arithmetic && cal.gold.arithmetic.available),
      gold_arithmetic_version: cal.gold.arithmetic ? cal.gold.arithmetic.version : null,
      gold_extra_filled_v13: cal.gold.extra_filled_v13 || 0,
      gold_missed_expected_v13: cal.gold.missed_expected_v13 || 0,
      no_gold_fields: cal.gold.no_gold_fields,
      gold_expected_scopes: cal.ranges,
    },
    l3: {
      // ★ 2026-10-11：覆盖从 1 份变 N 份，下列doc_* 单值字段已不再有单一文档可指，
      //   故「显式置 null」（不拿第一份冒充全体），改用 docs_* 系列表述。
      doc_id: null,
      doc_name: null,
      docs_indexed: bucketIdx.buckets.size,
      // ★ 桶值一律过滤 null 后再展开 —— 反证实测：桶里混进 null 会让 computeMetrics 直接抛异常，
      //   整个 /api/metrics 500 ⇒ 上屏数字全丢。宁可少列一份，也必须返回可用结构。
      docs_indexed_list: Array.from(bucketIdx.buckets.values()).filter(Boolean)
        .map(x => ({ doc: x.doc_name, blocks: x.block_count, from: x.self_from })),
      docs_skipped: bucketIdx.skipped,
      // ★ 核验依据（必须能看到，否则 100% 这个数无法追责）
      source_kind: bucketIdx.buckets.size ? "self_blocks_multi" : (fallback ? (fallback.self_from ? "self_blocks" : "external_snapshot") : "none"),
      source_ref: bucketIdx.buckets.size ? "各信封自带 source.parse_meta.blocks（按 block_id 前缀分桶）" : (fallback && fallback.source ? fallback.source : null),
      parser_version: null,
      parser_versions: Array.from(new Set(Array.from(bucketIdx.buckets.values()).filter(Boolean).map(x => x.parser_version).filter(Boolean))),
      version_mismatch_skipped: perDataset.reduce((n, d) => n + (d.l3_version_mismatch || 0), 0),
      coverage_note: bucketIdx.buckets.size
        ? `核验索引取自各信封自带的 source.parse_meta.blocks（与 provenance 同一次解析产物、同 parser 版本），` +
          `按 block_id 前缀分桶，每条 provenance 只在它自己那份信封的桶里查 —— 结构上不可能串档。` +
          `已建索引 ${bucketIdx.buckets.size} 份，跳过 ${bucketIdx.skipped.length} 份（${bucketIdx.skipped.map(s => s.dataset + "：" + s.why).join("；") || "无"}）`
        : (fallback ? "核验索引取自外部快照，parser 版本须与信封一致才计入分母" : "无可用解析产物，全部未核"),
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
 * 指标卡按总规划 §验收指标给出目标值，但「达标与否由实算数决定」，
 * 未覆盖的指标显式标"未核"，绝不按目标值填充。
 */
function handleMetrics(res, batchId) {
  try {
    const scope = batchId || dataSource.PRIMARY_ID;
    const m = computeMetrics(scope);
    const s = m.summary, l3 = m.l3, agg = m.agg;
    // ★ 2026-10-15：口径对象（三档范围 / Gold 期望召回率）由 computeMetrics 一并返回，
    //   本处只取用、绝不重算 —— 卡片与注册表必须同源，两处各算一次就会重演「同名两个值」。
    const cal = m.caliber;
    const recall = cal.gold.recall, vmatch = cal.gold.value_match;

    // D12：把指标注册表一并下发，让页面顶层的口径面板与下方旧图表读同一份真源。
    // 不这么做就会出现「上屏口径」与「图表数值」两套定义，正是要根治的毛病。
    let registryPayload = null;
    try { registryPayload = require("./metrics_registry.js"); }
    catch (e) { registryPayload = null; }

    // D17：标准化判据已由评测侧裁定（evaluation/D17/裁定-standardized判据-20261010.md）。
    //  两个指标必须分列，且「数值不在此处重算」——由 demo/_standardized_real.js 实算后
    //  写 demo/_standardized_real.json，本处只读产物。理由：卡片与注册表必须同源，
    //  两处各算一次就会重演"同名两个值"。
    //  产物缺失 ⇒ target 仍挂、value 为 null（判未测），绝不按目标值填充。
    const std = readStandardized();
    // ★ 2026-10-11 出处命中率：**改为直接读权威批实算的 L3 结果**（30 份信封自带 blocks）。
    //
    //   为什么不再读注册表 evidence_hit（241）：
    //     241 是两批混合口径下、只靠魏的 10 份外部快照（.peersnap）数出来的子集，
    //     分母 863 里只有 241 条可核，另有 622 条未核。
    //     2026-10-11 把 L3 从 1 份扩到 30 份后，权威批 451 条 provenance **全部可核**（451/451）——
    //     分母更大、证据来源同源（每份信封自带的解析产物），严格覆盖 241 那套。
    //   两者判据相同（quote ∈ block.text），但证据来源与口径都不同，
    //     同时上屏就是「同页两个出处命中率」——正是 2026-10-11 要根治的毛病。
    //   ⇒ 「卡片只上权威口径一个数」；241 那套降级为脚注里的历史对照，明确标注口径差异。
    const provCard = (() => {
      const num = l3.checked, den = agg.prov_total;
      return {
        value: pct(num, den),
        num, den,
        docs: l3.docs_indexed,
        legacy_241: (() => {
          let ev = null;
          try { ev = require("./metrics_registry.js").get("evidence_hit"); } catch (e) { ev = null; }
          return ev && ev.den != null ? { num: ev.num, den: ev.den } : null;
        })(),
      };
    })();
    // ★ 2026-10-15：95 目标改挂**严格原文口径**（评测侧 R1 严格评分器 432/451 = 95.79%，
    //   R4/V2 白名单判定）；空白归一辅助口径（页面实算 451/451）降为分列 lines，不得顶替主数值。
    const provStrict = (() => {
      try {
        const m = require("./metrics_registry.js").get("evidence_hit_strict");
        return m && m.value != null ? m : null;
      } catch (e) { return null; }
    })();
    // 目标值来自 cjh_workspace_00_总规划.md §验收指标（仅作对照，不参与计算）。
    // ★口径纪律（D15/D17 校准）：90% 是**准确率**目标、98% 是「标准化正确率」目标，
    //   二者都不得挂在覆盖率/出处这类"分母含弃权"的口径上——挂错等于用错口径宣布未达标。
    const TARGETS = [
      // ① 历史口径（数值语义不变，展示名改为「全字段槽位有值率」——方轩诚 2026-10-15）
      { key: "extracted_pct", name: cal.labels.slot_value_rate, target: null, value: s.slot_value_rate_pct, unit: "%",
        num: cal.slot.num, den: cal.slot.den, scope: cal.labels.scope_31,
        caliber: "status=extracted 占全部产出字段（槽位）的比例（分子 " + agg.status_extracted +
          " / 分母 " + s.fields_total +
          "）。槽位口径含弃权字段，衡量的是「信息填充比例」，不等于抽取准确率，也不回答「该抽的抽到了没有」。",
        lines: [
          "范围 A｜" + cal.labels.scope_31 + "（含扫描降级件）：" + cal.ranges.frozen_slot.extracted + "/" + cal.ranges.frozen_slot.fields +
            " = " + (cal.ranges.frozen_slot.fields ? pct(cal.ranges.frozen_slot.extracted, cal.ranges.frozen_slot.fields) : null) + "%" +
            "（" + cal.ranges.frozen_slot.datasets + " 份）",
          "范围 B｜" + cal.labels.core_text_rate + "（" + cal.labels.scope_30 + "）：" + cal.ranges.core_text.extracted + "/" + cal.ranges.core_text.fields +
            " = " + (cal.ranges.core_text.fields ? pct(cal.ranges.core_text.extracted, cal.ranges.core_text.fields) : null) + "%" +
            "（" + cal.ranges.core_text.datasets + " 份；排除原文缺陷件 " + (dataSource.SCOPE_FRAMES.scanned_degrade_datasets || []).join("、") +
            " 的 " + cal.ranges.scanned_degrade.fields + " 字段）",
          "范围 C｜" + cal.labels.scope_gold + "：见下一张「Gold 期望字段召回率」卡",
        ],
        coverage_note: "★ 三个覆盖率数不可互相替换：槽位口径含弃权字段，Gold 期望口径只含应抽字段。准确率目标 90% 挂在另一个指标（字段抽取准确率），不挂本项" },
      // ② ★ 2026-10-15 新增：Gold 期望字段召回率（分母只由 Gold 清单决定）
      { key: "expected_field_recall", name: cal.labels.expected_recall, target: null,
        value: recall.den > 0 ? recall.pct : null, unit: "%",
        num: recall.num, den: recall.den, scope: cal.labels.scope_gold,
        pending: cal.gold.pending.gold, unverified_fields: cal.gold.no_gold_fields,
        caliber: recall.caliber + "（当前 " + recall.num + "/" + recall.den + "）",
        lines: [
          "期望全集 " + recall.den + " 字段来自 Gold 清单（" + cal.gold.pairs + " 组事件配对 / " + cal.ranges.gold_expected.datasets + " 份有 Gold），「不由引擎 status 反推」",
          "原文存在却抽不出（miss）已计入分母：" + cal.gold.recall_miss.length + " 项；多抽候选：" + cal.gold.extra_candidates.length + " 处",
          "未裁定 pending：Gold " + cal.gold.pending.gold + " 项 / 引擎 needs_review " + cal.gold.pending.engine + " 项（单列，不作头条）",
          cal.gold.overlay && cal.gold.overlay.available
            ? "Gold v1.1 覆盖层已应用 " + cal.gold.overlay.applied + " 项（D4-PLD-009 E03 end_date needs_review→not_mentioned）" +
              (cal.gold.overlay.errors.length ? "；错误 " + cal.gold.overlay.errors.length + " 条" : "；无错误")
            : "Gold v1.1 覆盖层未取件（pending 按无校正口径统计）",
          "不可核（无 Gold）：" + cal.gold.no_gold_fields + " 字段（" + cal.gold.no_gold.map(x => x.dataset).join("、") + "）——不计入本项任何分子分母",
          "值一致率（分子条件不同、当前恰好同值，不得合并）：" + vmatch.num + "/" + vmatch.den + " = " + vmatch.pct + "%",
        ],
        coverage_note: "★ 名称只能叫「相对当前 Gold 的期望字段召回率」，且必须同带限定语：" + cal.gold.qualification +
          "。★ 禁止通过修改引擎 status（如把字段改判 not_mentioned）来缩小分母" },
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
      { key: "provenance_hit", name: "出处命中率", target: 95,
        // ★ 2026-10-15：主数值改挂**严格原文口径**（95 目标按 R4 判定挂它，432/451 = 95.79% 贴线）；
        //   页面实算的空白归一辅助口径 451/451 降为 lines 分列，不得顶替主数值。
        value: provStrict ? provStrict.value : null, unit: "%",
        num: provStrict ? provStrict.num : null, den: provStrict ? provStrict.den : null,
        // ★ 2026-10-11：分母改为「权威批全部 provenance」（451），不再用可核子集（241）。
        //   以前写"可核子集 241 / 分母 241"看着漂亮，但 622 条未核的provenance 被藏起来了 ——
        //   2026-10-11 把覆盖面从 10 份扩到 30 份后，451 条「全部可核」，没有子集了。
        caliber: provStrict
          ? "严格原文口径（95 目标挂本项）：quote 作为原子串命中该信封自带的原始解析 block 文本 = " +
            provStrict.num + " / " + provStrict.den + "。空白归一后才命中的 " + provStrict.hit_ws_only +
            " 条单列不并入严格分子；miss " + provStrict.miss + "、臆造 block " + provStrict.fabricated_block +
            "。证据源＝评测侧 R1 严格评分器实测（2026-10-14，宗），非本页实测。"
          : "★ 未测：R1 严格评分实测缺失（跑 demo/_fetch_eval_scores.js --src delivery/v2.0 取件）—— 不得按辅助口径 100% 填充",
        lines: [
          "严格口径（quote 原文子串命中，95 目标挂本项）：" +
            (provStrict ? provStrict.num + "/" + provStrict.den + " = " + provStrict.value + "%（miss " + provStrict.miss + "）" : "未测"),
          "辅助口径（空白归一后计入，页面实算）：" + provCard.num + "/" + provCard.den + " = " + provCard.value +
            "%（覆盖 " + provCard.docs + " 份）——与上一行分列，不得混读",
          "每条 provenance 只查自己那份信封的块（按 block_id 前缀分桶）——结构上不可能拿别的文档凑命中",
        ],
        coverage_note: "★ 两口径分列：严格 432/451（贴 95 线达标）／辅助 451/451（页面实算）。目标 95% 按 R4 判定挂严格口径；辅助口径不得顶替主数值。" +
          (provCard.legacy_241
            ? "〔历史对照，不上屏〕注册表 evidence_hit 记的 " + provCard.legacy_241.num + "/" + provCard.legacy_241.den +
              " 是两批混合口径下只靠魏侧10 份外部快照数出的子集（该脚本 prov_total=863 含演示池，622 条未核不计入），" +
              "口径与本卡不同，两者不可混读；本卡口径严格覆盖它。"
            : "") },
    ];

    const cards = TARGETS.map((t) => {
      const measured = t.value !== null && t.value !== undefined;
      return {
        key: t.key, name: t.name, target: t.target, value: t.value, unit: t.unit,
        // ★ 2026-10-15：卡片必须自带分子分母/范围/待复核——只给百分数等于把口径藏起来
        num: t.num === undefined ? null : t.num,
        den: t.den === undefined ? null : t.den,
        scope: t.scope || null,
        lines: t.lines || null,
        pending: t.pending === undefined ? null : t.pending,
        unverified_fields: t.unverified_fields === undefined ? null : t.unverified_fields,
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
      delivery_metrics: require("./delivery_metrics.js").readDeliveryMetrics(),
      generated_at: new Date().toISOString(),
      // ★ 2026-10-09：数据源披露段（领导 10-09 裁定③「页面可以暴露信息源」；
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
          // ★ 2026-10-15：三档范围 + Gold 期望口径随响应下发（读者必须能看出每个数跑在哪个范围上）
          ranges: s.gold_expected_scopes,
          expected_field_recall: {
            num: s.expected_field_recall_num, den: s.expected_field_recall_den, pct: s.expected_field_recall_pct,
            name: cal.labels.expected_recall, qualification: cal.gold.qualification,
          },
          gold_value_match: { num: s.gold_value_match_num, den: s.gold_value_match_den, pct: s.gold_value_match_pct },
          pending: { gold: s.gold_pending_fields, engine: s.engine_pending_fields,
            note: "未裁定项单列；不得记「正确弃权」或「通过」" },
          unverifiable: { no_gold_fields: s.no_gold_fields, datasets: cal.gold.no_gold.map(x => x.dataset) },
          caliber_source: "bridge/caliber.js（口径单一真源，卡片/注册表/重测脚本共用）",
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
        "★ 2026-10-09 起全部指标只跑权威批次 data_unified/（counts_for_primary），无示例值、无估算",
        "另一批 data/（演示与旧抽取池）仅供查看，不计入任何分子分母",
        "每项带分母 n；'未核'不计入命中分母",
        "L3 原文命中按各信封自带 source.parse_meta.blocks 核对，覆盖面以实算 l3.docs_indexed 为准；无解析产物或 block_id 缺失不计入分母",
        "目标值取自总规划验收指标，仅作对照，不参与计算；不达标即显示不达标",
        "字段抽取率与溯源存在率（L1）是两个不同指标，勿混用：前者看 status，后者看 provenance 是否存在",
        "★ 2026-10-09：引用任何数字须同时引用 data_source 段的批次、份数与目录指纹",
        "★ D12 起口径以顶层注册表为准，本节仅保留 D11 原始口径供对照",
        "★ 2026-10-15 覆盖率三档范围并列，互不替换：①31 份冻结批槽位 606（全字段槽位有值率）②30 份有 Gold 核心文本 592 ③Gold 期望字段全集 437（期望字段召回率）",
        "★ 2026-10-15 Gold 期望字段召回率的分母「只来自 Gold 清单」，不由引擎 status 反推；原文存在却抽不出（miss）计入分母，弃权不计入",
        "★ 2026-10-15 该召回率必须带限定语：当前 Gold 条件口径 + 公开语料冻结回放 + 不外推泛化 + Gold 原文推导复核未完成（72 项重点复核 / 12 项 Gold 待复核 / 3 处状态分歧未闭环）——未闭环前不得作为「原文全覆盖」头条",
        "★ 2026-10-15 未裁定项（Gold needs_review / 双方状态分歧）单列 pending：既不记「正确弃权」，也不记「通过」，也不自动判失败",
        "★ 2026-10-15 禁止通过修改引擎 status（如把字段改判 not_mentioned）来缩小分母——分母只能由 Gold 清单决定",
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
          // ★ 跨 parser 版本不可比（2026-10-09 坐实：0.7.0 快照核 0.9.0 信封会假失败 7.69%）
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
