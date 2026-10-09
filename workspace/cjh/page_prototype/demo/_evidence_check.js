#!/usr/bin/env node
/**
 * D11 证据展示核对 —— 出处命中率实测
 *
 * 数据实况（勿臆造）：真实数据集的溯源在**字段内的 provenance[]**，
 * 结构 {block_id, page, region, table_id, cell_ref, source_type, quote}，
 * 不是顶层 evidences[]（后者仅 3 份模拟数据有）。
 *
 * 核对口径（逐层收紧，全部可复现）：
 *   L1溯源存在性：抽取到的字段是否带非空 provenance[]
 *   L2 锚点完备性：provenance 是否具备 block_id + page（region 另计覆盖率）
 *   L3 原文命中：quote 是否真在 block_id 指向的原始解析 block.text / text_raw 中
 *
 * L3 数据前提：本地仅一份原始解析快照
 *   docs/_ref_zhang_D3_pledge.parse.json（doc_id=d44e95085，2 页 127 blocks）
 * 只有 block_id 前缀 ==该 doc_id 的证据可核；其余如实标"无解析包·未核"，
 * 不计入分母——绝不把"没核"当"命中"。
 *
 * 纪律：只读。不改数据、不改代码、不碰封存资产。
 * 输出：_evidence_check.json
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PARSE_SNAPSHOT = path.join(ROOT, "..", "docs", "_ref_zhang_D3_pledge.parse.json");
const OUT = path.join(__dirname, "_evidence_check.json");

// ---------- 载入原始解析快照 → block 索引 ----------
function loadParseIndex() {
  if (!fs.existsSync(PARSE_SNAPSHOT)) return null;
  const j = JSON.parse(fs.readFileSync(PARSE_SNAPSHOT, "utf8"));
  const byBlockId = new Map();
  const tableCells = new Map();   // table_id -> [cell 文本]
  const allText = [];// 整篇纯文本（block_id 缺失时的兜底全文核）
  (j.pages || []).forEach((p) => {
    (p.blocks || []).forEach((b) => {
      if (b && b.block_id) byBlockId.set(b.block_id, b);
      if (b && b.text) allText.push(b.text);
    });
    (p.tables || []).forEach((t) => {
      const arr = tableCells.get(t.table_id) || [];
      (t.cells || []).forEach((c) => {
        if (c && c.text != null) arr.push(String(c.text));
        // 表格也可能把单元格文本摊平成 block
        if (c && c.block_id && !byBlockId.has(c.block_id)) {
          byBlockId.set(c.block_id, { block_id: c.block_id, text: String(c.text || ""), text_raw: String(c.text || ""), page: t.page || (p && p.page) });
        }
      });
      tableCells.set(t.table_id, arr);
    });
  });
  return {
    doc_id: j.doc && j.doc.doc_id,
    doc_name: j.doc && j.doc.file_name,
    page_count: j.pages ? j.pages.length : 0,
    block_count: byBlockId.size,
    byBlockId,
    tableCells,
    fullText: allText.join("\n"),
  };
}

/** 归一化：去空白、全角转半角 —— tolerant 匹配 */
function norm(s) {
  return String(s == null ? "" : s)
    .replace(/[\s　]/g, "")
    .replace(/[，]/g, ",")
    .replace(/[。．]/g, ".")
    .replace(/[：]/g, ":")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/％/g, "%")
    .replace(/／/g, "/")
    .replace(/[－—–]/g, "-")
    .toLowerCase();
}

function matchQuote(quote, blk, idx) {
  const q = norm(quote);
  if (!q) return { hit: false, reason: "quote 为空" };
  if (blk) {
    const inText = norm(blk.text || "").includes(q);
    const inRaw = norm(blk.text_raw || "").includes(q);
    if (inText) return { hit: true, where: "block.text" };
    if (inRaw) return { hit: true, where: "block.text_raw（text 层已清洗）" };
    // 表格单元格
    if (blk.table_id && idx.tableCells.has(blk.table_id)) {
      const hit = idx.tableCells.get(blk.table_id).some((t) => norm(t).includes(q));
      if (hit) return { hit: true, where: "表格单元格" };
    }
    return { hit: false, reason: "该 block 内未找到（含单元格兜底）" };
  }
  // 无 block：退到整篇全文核（诚实标注这是弱核对）
  const hit = norm(idx.fullText).includes(q);
  return { hit, reason: hit ? "命中整篇全文（无 block_id，弱核对）" : "整篇全文亦未找到", weak: true };
}

// ---------- 主流程 ----------
function main() {
  const idx = loadParseIndex();
  const dataDir = path.join(ROOT, "data");
  const datasets = fs
    .readdirSync(dataDir)
    .filter((f) => f.endsWith(".json") && !f.endsWith(".check.json"))
    .map((f) => f.replace(/\.json$/, ""));

  const perDataset = [];
  const t0 = { l1_field_total: 0, l1_field_with_prov: 0 };
  const agg = {
    prov_total: 0,      // provenance 条目总数
    prov_with_block: 0, // 有 block_id
    prov_with_page: 0,  // 有 page
    prov_with_region: 0,// 有 region（4 元素）
    prov_with_quote: 0, // 有 quote
    l3_eligible: 0,     // 属解析快照文档、进入 L3
    l3_checked: 0,
    l3_hit: 0,
    l3_miss: [],
  };

  for (const ds of datasets) {
    const j = JSON.parse(fs.readFileSync(path.join(dataDir, ds + ".json"), "utf8"));
    const events = Array.isArray(j.events) ? j.events : [];
    const dsAgg = { prov: 0, block: 0, page: 0, region: 0, quote: 0, l3_eligible: 0, l3_checked: 0, l3_hit: 0, l3_miss: [] };
    let fieldTotal = 0, fieldWithProv = 0;

    events.forEach((ev) => {
      const f = ev && (ev.fields || ev);
      if (!f || typeof f !== "object") return;
      Object.entries(f).forEach(([fname, fv]) => {
        // 只看形如 {value/…, provenance:[…]} 的字段容器
        if (!fv || typeof fv !== "object") return;
        const status = fv.status;
        const isField = status !== undefined || fv.raw_value !== undefined || fv.provenance !== undefined;
        if (!isField) return;
        fieldTotal++;
        const prov = Array.isArray(fv.provenance) ? fv.provenance : [];
        if (prov.length > 0) fieldWithProv++;
        t0.l1_field_total++;
        if (prov.length > 0) t0.l1_field_with_prov++;

        prov.forEach((pv) => {
          if (!pv) return;
          dsAgg.prov++; agg.prov_total++;
          if (pv.block_id) { dsAgg.block++; agg.prov_with_block++; }
          if (pv.page !== undefined && pv.page !== null) { dsAgg.page++; agg.prov_with_page++; }
          if (Array.isArray(pv.region) && pv.region.length === 4) { dsAgg.region++; agg.prov_with_region++; }
          if (pv.quote) { dsAgg.quote++; agg.prov_with_quote++; }

          // L3：只有 block_id 前缀命中解析快照 doc_id 才算可核
          const bid = pv.block_id;
          if (!idx || !bid) return;
          const prefix = String(bid).split("_")[0];
          if (prefix !== idx.doc_id) return;
          dsAgg.l3_eligible++; agg.l3_eligible++;
          const blk = idx.byBlockId.get(bid) || null;
          dsAgg.l3_checked++; agg.l3_checked++;
          const m = matchQuote(pv.quote, blk, idx);
          if (m.hit) { dsAgg.l3_hit++; agg.l3_hit++; }
          else {
            const rec = { dataset: ds, event_id: ev.event_id || null, field: fname, block_id: bid, quote: String(pv.quote || "").slice(0, 60), reason: m.reason };
            dsAgg.l3_miss.push(rec);
            agg.l3_miss.push(rec);
          }
        });
      });
    });

    perDataset.push({
      dataset: ds,
      data_mode: j.data_mode || (j.is_mock ? "simulated" : "real"),
      run_id: j.run_id || null,
      file_name: (j.source && j.source.file_name) || null,
      parser_version: (j.source && j.source.parse_meta && j.source.parse_meta.parser_version) || null,
      events: events.length,
      fields_total: fieldTotal,
      fields_with_provenance: fieldWithProv,
      l1_rate: fieldTotal ? +(fieldWithProv / fieldTotal).toFixed(4) : null,
      provenance: dsAgg.prov,
      with_block_id: dsAgg.block,
      with_page: dsAgg.page,
      with_region: dsAgg.region,
      with_quote: dsAgg.quote,
      l3: { eligible: dsAgg.l3_eligible, checked: dsAgg.l3_checked, hit: dsAgg.l3_hit, miss: dsAgg.l3_miss.length, miss_samples: dsAgg.l3_miss.slice(0, 12) },
    });
  }

  const pct = (a, b) => (b ? +((a / b) * 100).toFixed(2) : null);

  // ---------- 错指归因：区分「真错指」与「quote 取层错误」 ----------
  // 真错指：quote 在解析快照里能找到，但不在所指的 block 内（指向了别的block）
  // 取层错：quote 在 text_raw 里能命中、text 里不能（张 handoff 明确要求取 text_raw）
  let mispoint = [], layerErr = 0, absentInSnap = 0;
  if (idx) {
    for (const m of agg.l3_miss) {
      const q = norm(m.quote);
      const realBlocks = [];
      for (const [bid, b] of idx.byBlockId) {
        if (norm(b.text || "").includes(q) || norm(b.text_raw || "").includes(q)) realBlocks.push(bid);
      }
      if (!realBlocks.length) { absentInSnap++; continue; }
      const hitRaw = (() => {
        const b = idx.byBlockId.get(m.block_id);
        if (!b) return false;
        return norm(b.text_raw || "").includes(q) || norm(b.text || "").includes(q);
      })();
      if (hitRaw) { layerErr++; continue; }         // theory-fallback
      mispoint.push({ ...m, real_blocks: realBlocks });
    }
  }

  const attributable = mispoint.length + layerErr + absentInSnap;
  const attribution = {
    note: "未命中归因三类：① 真错指——quote 在解析快照中存在但不在所指的 block 内（指向了别的 block）；② 取层错——quote 取了清洗后的 text 而非 text_raw；③ 快照无——quote 在整份快照中都不存在",
    true_mispoint: mispoint.length,
    layer_error: layerErr,
    absent_in_snapshot: absentInSnap,
    attributable_total: attributable,
    // 页面侧责任判定：region 对不对能区分「坐标错」与「仅 block_id 映射错」
    mispoint_detail: mispoint.slice(0, 20),
  };
  const out = {
    generated_at: new Date().toISOString(),
    caliber: {
      L1: "溯源存在性：抽取字段带非空 provenance[] 的比例",
      L2: "锚点完备性：provenance 中 block_id / page / region / quote 各自的覆盖率",
      L3: "原文命中：quote 是否在 block_id 指向的原始解析 block（或同表单元格 / 整篇全文）中",
    },
    parse_snapshot: idx
      ? { path: "workspace/cjh/docs/_ref_zhang_D3_pledge.parse.json", doc_id: idx.doc_id, doc_name: idx.doc_name, page_count: idx.page_count, block_count: idx.block_count }
      : null,
    l3_scope: {
      note: "本地仅一份原始解析快照；仅 block_id 前缀 ==该 doc_id 的证据可做原文核对，其余标'无解析包·未核'且不计入分母",
      doc_id: idx && idx.doc_id,
      eligible: agg.l3_eligible,
      checked: agg.l3_checked,
      hit: agg.l3_hit,
      miss: agg.l3_miss.length,
      hit_rate_pct: pct(agg.l3_hit, agg.l3_checked),
      datasets_checkable: perDataset.filter((d) => d.l3.eligible > 0).map((d) => d.dataset),
      datasets_unverifiable: perDataset.filter((d) => d.l3.eligible === 0).map((d) => d.dataset),
    },
    summary: {
      datasets: perDataset.length,
      fields_total: t0.l1_field_total,
      fields_with_provenance: t0.l1_field_with_prov,
      l1_pct: pct(t0.l1_field_with_prov, t0.l1_field_total),
      provenance_total: agg.prov_total,
      block_id_pct: pct(agg.prov_with_block, agg.prov_total),
      page_pct: pct(agg.prov_with_page, agg.prov_total),
      region_pct: pct(agg.prov_with_region, agg.prov_total),
      quote_pct: pct(agg.prov_with_quote, agg.prov_total),
    },
    l3_miss_all: agg.l3_miss,
    attribution,
    per_dataset: perDataset,
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2), "utf8");

  const s = out.summary, l3 = out.l3_scope;
  console.log("=== D11 出处命中核对 ===");
  console.log("解析快照：" + (out.parse_snapshot ? out.parse_snapshot.doc_id + " / " + out.parse_snapshot.block_count + " blocks / " + out.parse_snapshot.page_count + " 页" : "无（L3 不可执行）"));
  console.log("L1 溯源存在性：" + s.fields_with_provenance + "/" + s.fields_total + " = " + s.l1_pct + "%");
  console.log("L2 锚点完备性（共 " + s.provenance_total + " 条 provenance）：block_id " + s.block_id_pct + "% / page " + s.page_pct + "% / region " + s.region_pct + "% / quote " + s.quote_pct + "%");
  console.log("L3 原文命中：" + l3.hit + "/" + l3.checked + " = " + (l3.hit_rate_pct === null ? "N/A" : l3.hit_rate_pct + "%"));
  console.log("  可核数据集（" + l3.datasets_checkable.length + "）：" + (l3.datasets_checkable.join(", ") || "无"));
  console.log("  无解析包未核（" + l3.datasets_unverifiable.length + "）—— 如实不计入分母");
  if (l3.miss) {
    console.log("\nL3 未命中归因（" + attributable + " 条可归因）：");
    console.log("  ① 真错指（quote 存在但不在所指 block 内）：" + attribution.true_mispoint);
    console.log("  ② 取层错（应取 text_raw）：" + attribution.layer_error);
    console.log("  ③ 快照中不存在：" + attribution.absent_in_snapshot);
    if (mispoint.length) {
      console.log("\n  真错指样例（前 6）：");
      mispoint.slice(0, 6).forEach((m) =>
        console.log("   " + m.dataset + " " + (m.event_id || "?") + "." + m.field +
          "\n     指向 " + m.block_id + "（原文实际在 " + m.real_blocks.join(", ") + "）" +
          "\n     quote「" + m.quote + "」")
      );
    }
  }
  console.log("\n→ " + OUT);
}

main();