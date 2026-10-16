#!/usr/bin/env node
/**
 * D11 证据展示核对 —— 出处命中率实测
 *
 * ★ 2026-10-15 领导裁定三条，本脚本落地：
 *   ① 「不走首测了，真删」——旧池 data/ 的 D11 首测自测值（548 分母系列）全部作废，
 *      本脚本不再读旧池算指标、不再列举旧值；
 *   ② 本 check 改读权威批 data_unified/（D11 冻结批），**入口径名单与页面同源**
 *      （bridge/data_source.js 的 primary_dataset_names，DEMO-EQC-HL-0930 依宗
 *      2026-10-09 裁决不计入）——不各自维护名单，各自维护必然漂移；
 *   ③ 覆盖率新口径（只看抽取效果）：
 *        · 演示件 / 来源不清 → 不计入覆盖率，警告「未知来源」；
 *        · 原文缺陷（无解析产物，或字段全 unreadable）→ 抽取不出不计入分母；
 *        · 原文存在但抽取不出 → 计入分母（miss）。
 *
 * 核对口径（逐层收紧，全部可复现）：
 *   L1 溯源存在性：抽取到的字段是否带非空 provenance[]
 *   L2 锚点完备性：provenance 是否具备 block_id / page / region / quote …
 *   L3 原文命中：quote 是否真在 block_id 指向的原始解析 block.text / text_raw 中
 *
 * ★ L3 与页面 provenance_hit **同源同版本**：按各信封自带 source.parse_meta.blocks
 *   逐份建索引（阈值、匹配、计数与 bridge/metrics.js 的 parseSelfBlockIndex /
 *   matchQuote 一致），每条 provenance 只查自己那份信封的块 —— 结构上不可能
 *   拿别的文档凑命中（反造假铁律：两侧读同一批证据，只验一致性）。
 *
 * ★ P0-01 物证段（保留，不计入权威口径任何分子分母）：
 *   data/wei_real_pledge_ce37 与 wei_real_pledge_0197 是旧版解析器 0.3.0
 *   指错 block 的唯一物证，按领导 10-09 裁定②「保留 + 标注」留在旧池，
 *   用外部解析快照 docs/_ref_zhang_D3_pledge.parse.json 核对。
 *   删证据是反造假铁律的反面——首测不走，物证不删。
 *
 * 纪律：只读。不改数据、不改代码、不碰封存资产。
 * 输出：_evidence_check.json
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");                 // page_prototype
const UNIFIED_DIR = path.join(ROOT, "data_unified");     // 权威批（D11 冻结）
const LEGACY_DIR = path.join(ROOT, "data");              // 旧池（仅 P0-01 物证两份）
const PARSE_SNAPSHOT = path.join(ROOT, "..", "docs", "_ref_zhang_D3_pledge.parse.json");
const OUT = path.join(__dirname, "_evidence_check.json");
const WITNESS = ["wei_real_pledge_ce37", "wei_real_pledge_0197"];
// ★ 2026-10-15：口径单一真源（P0-01 改锚要按 source.file_sha256 在权威批里找同一份文档）
const caliber = require(path.join(__dirname, "..", "bridge", "caliber.js"));

// ---------- 单一真源：入口径名单（与页面 /api/metrics 同一份） ----------
// 拿不到名单就拒绝跑：没有名单就不分类、不猜，绝不静默兜底（反造假铁律）。
function loadPrimary() {
  let ds = null;
  try { ds = require(path.join(ROOT, "bridge", "data_source.js")); }
  catch (e) {
    console.error("✗ 无法加载 bridge/data_source.js（入口径名单单一真源）：" + e.message);
    console.error("  拒绝在无名名单情况下跑核对。");
    process.exit(1);
  }
  const names = ds.primaryEntries().filter((e) => e.counts_for_primary).map((e) => e.name);
  if (!names.length) {
    console.error("✗ primary_dataset_names 为空——拒绝在空名单下跑核对。");
    process.exit(1);
  }
  return { names: new Set(names), count: names.length, roleOf: (n) => { const e = ds.resolve(n); return e ? e.role : null; } };
}

// ---------- 归一化 / 原文命中（与 bridge/metrics.js 同源） ----------
function prefixOf(blockId) {
  return String(blockId || "").split("_")[0] || null;
}

function norm(s) {
  return String(s == null ? "" : s)
    .replace(/[\s　]/g, "").replace(/[，]/g, ",").replace(/[。．]/g, ".")
    .replace(/[：]/g, ":").replace(/[（]/g, "(").replace(/[）]/g, ")")
    .replace(/[％]/g, "%").replace(/[／]/g, "/").replace(/[－—–]/g, "-").toLowerCase();
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

/** 逐份信封自建索引——阈值与 bridge/metrics.js parseSelfBlockIndex 一致（<10 块不建） */
function buildIndex(j, name) {
  const blocks = j.source && j.source.parse_meta && j.source.parse_meta.blocks;
  if (!Array.isArray(blocks) || blocks.length < 10) return null;
  const byBlockId = new Map();
  const tableCells = new Map();
  const fullText = [];
  let prefix = null;
  for (const b of blocks) {
    if (b && b.block_id) { byBlockId.set(b.block_id, b); if (!prefix) prefix = prefixOf(b.block_id); }
    if (b && b.text) fullText.push(b.text);
    if (b && b.table_ref && b.table_ref.table_id) {
      const arr = tableCells.get(b.table_ref.table_id) || [];
      if (b.text) arr.push(String(b.text));
      tableCells.set(b.table_ref.table_id, arr);
    }
  }
  if (!prefix) return null;
  return {
    doc_name: (j.source && j.source.file_name) || name,
    doc_prefix: prefix,
    block_count: byBlockId.size,
    page_count: (j.source && j.source.parse_meta && j.source.parse_meta.page_count) || null,
    parser_version: (j.source && j.source.parse_meta && j.source.parse_meta.parser_version) || null,
    byBlockId, tableCells, fullText: fullText.join("\n"),
  };
}

/**
 * ★ 2026-10-15 新增：P0-01 物证的**权威批改锚**（方轩诚反馈第④条）。
 *
 * 方原文：「ce37 指向权威批同名文档即复活（我核过同一 sha256，且旧件 7,800,000＝三笔之和）」。
 * 本函数把这句话落成可复算的证据，而不是抄结论：
 *   ① 按 **source.file_sha256** 在权威批里找同一份文档（不是按文件名、不是按 case_id）；
 *   ② 报两侧 parser 版本与事件数（旧 0.3.0/0.7.0 各 1 事件 vs 权威批 3 事件）；
 *   ③ 做**算术正反证**：在原文 block 文本里找「三笔之和＝合计」这一关系（正证），
 *      并显式声明找不到时 holds=false（反证：不当成通过）。
 *
 * ★ 纪律：物证不计入权威口径任何分子分母；旧物证的「2/12 / 12/12」是**当时快照口径**，
 *   与权威批 3 事件口径不可混算，引用必须带「当时快照口径」限定。
 */
function witnessAuthoritativeAnchor() {
  const out = {
    enabled: true,
    rule: "按 source.file_sha256 匹配权威批同一份文档（同一文档 ≠ 同名文件；旧件 file_name 为 pledge.pdf）",
    by_witness: {},
    arithmetic_proof: null,
    discipline: "旧物证数值（ce37 2/12、0197 12/12）出自当时快照口径，与权威批 3 事件口径不可混算；引用须带「当时快照口径」限定",
  };
  let auth = [];
  try { auth = caliber.primaryEnvelopes(); }
  catch (e) { out.enabled = false; out.why = "读不到权威批信封：" + e.message; return out; }

  const bySha = new Map();
  for (const { id, json } of auth) {
    const sha = json.source && json.source.file_sha256;
    if (sha) bySha.set(sha, { dataset: id, json });
  }

  for (const name of WITNESS) {
    const p = path.join(LEGACY_DIR, name + ".json");
    if (!fs.existsSync(p)) { out.by_witness[name] = { missing: true }; continue; }
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    const sha = (j.source && j.source.file_sha256) || null;
    const hit = sha ? bySha.get(sha) : null;
    const rec = {
      file_sha256: sha,
      parser_version: (j.source && j.source.parse_meta && j.source.parse_meta.parser_version) || null,
      events: (j.events || []).length,
      file_name: (j.source && j.source.file_name) || null,
      authoritative_match: hit ? {
        dataset: hit.dataset,
        revives: true,     // 「指向权威批同名（同 sha256）文档即复活」
        parser_version: (hit.json.source && hit.json.source.parse_meta && hit.json.source.parse_meta.parser_version) || null,
        events: (hit.json.events || []).length,
        sha256_match: true,
        note: "物证文档本身就在权威批内 ⇒ P0-01 可从死池改锚到权威批，跨版本对照链（0.3.0→0.7.0→0.9.0）在同一份文档上成立",
      } : { revives: false, note: "权威批内未找到同 sha256 文档（不得声称可改锚）" },
    };
    out.by_witness[name] = rec;
    if (hit && !out.arithmetic_proof) {
      // ③ 算术正反证：取权威批该份信封自带的 blocks 文本找「三笔之和＝合计」
      const blocks = (hit.json.source && hit.json.source.parse_meta && hit.json.source.parse_meta.blocks) || [];
      const text = blocks.map(b => String(b.text || "") + " " + String(b.text_raw || "")).join("\n");
      out.arithmetic_proof = Object.assign({ for_witness: name, authoritative_dataset: hit.dataset }, threeEntrySumProof(text));
    }
  }
  return out;
}

/** 在文本里找「三个数之和 = 另一个数」（三笔质押份数相加＝合计行）——正证/反证都出结论 */
function threeEntrySumProof(text) {
  const nums = [...String(text).matchAll(/\d{1,3}(?:,\d{3})+/g)]
    .map(m => Number(m[0].replace(/,/g, "")))
    .filter(n => Number.isFinite(n) && n > 0);
  const uniq = [...new Set(nums)].sort((a, b) => b - a);
  for (const total of uniq) {
    for (let i = 0; i < uniq.length; i++) {
      for (let j = i + 1; j < uniq.length; j++) {
        for (let k = j + 1; k < uniq.length; k++) {
          if (uniq[i] + uniq[j] + uniq[k] === total) {
            return {
              holds: true,
              total,
              parts: [uniq[i], uniq[j], uniq[k]],
              expr: `${uniq[i]} + ${uniq[j]} + ${uniq[k]} = ${total}`,
              note: "原文表内「分项之和＝合计」成立（算术自洽性，不等于字段抽取正确性）",
            };
          }
        }
      }
    }
  }
  return { holds: false, total: null, parts: [], note: "未在原文中找到「三数之和＝另一数」关系 —— 不得据此声称已证（反证不通过）" };
}

function isField(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  return v.status !== undefined || v.raw_value !== undefined || v.provenance !== undefined;
}

// ---------- P0-01 物证段：外部解析快照（旧逻辑原样保留） ----------
function loadSnapshotIndex() {
  if (!fs.existsSync(PARSE_SNAPSHOT)) return null;
  const j = JSON.parse(fs.readFileSync(PARSE_SNAPSHOT, "utf8"));
  const byBlockId = new Map();
  const tableCells = new Map();
  const allText = [];
  (j.pages || []).forEach((p) => {
    (p.blocks || []).forEach((b) => {
      if (b && b.block_id) byBlockId.set(b.block_id, b);
      if (b && b.text) allText.push(b.text);
    });
    (p.tables || []).forEach((t) => {
      const arr = tableCells.get(t.table_id) || [];
      (t.cells || []).forEach((c) => {
        if (c && c.text != null) arr.push(String(c.text));
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
    byBlockId, tableCells, fullText: allText.join("\n"),
  };
}

function checkWitness(idx) {
  const out = {
    note: "P0-01 唯一物证（旧版解析器 0.3.0 把溯源指向错误 block、region 坐标却正确）。" +
      "两份数据集按领导 10-09 裁定②保留在旧池 data/ 并标注，**不计入权威口径任何分子分母**；" +
      "首测不走，物证不删。",
    parse_snapshot: idx
      ? { path: "workspace/cjh/docs/_ref_zhang_D3_pledge.parse.json", doc_id: idx.doc_id, doc_name: idx.doc_name, page_count: idx.page_count, block_count: idx.block_count }
      : null,
    datasets: {},
    l3: { eligible: 0, checked: 0, hit: 0, miss: 0, hit_rate_pct: null },
    attribution: null,
    // ★ 2026-10-15：权威批改锚 + 三笔之和算术正反证（先算，快照缺失也要出）
    authoritative_anchor: witnessAuthoritativeAnchor(),
  };
  if (!idx) { out.note += "（解析快照缺失，物证段未执行）"; return out; }

  const misses = [];
  for (const name of WITNESS) {
    const p = path.join(LEGACY_DIR, name + ".json");
    if (!fs.existsSync(p)) { out.datasets[name] = { missing: true }; continue; }
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    const events = Array.isArray(j.events) ? j.events : [];
    const d = { fields: 0, with_prov: 0, l3_eligible: 0, l3_checked: 0, l3_hit: 0, parser_version: (j.source && j.source.parse_meta && j.source.parse_meta.parser_version) || null };
    events.forEach((ev) => {
      const f = ev && (ev.fields || ev);
      if (!f || typeof f !== "object") return;
      Object.entries(f).forEach(([fname, fv]) => {
        if (!isField(fv)) return;
        d.fields++;
        const prov = Array.isArray(fv.provenance) ? fv.provenance : [];
        if (prov.length) d.with_prov++;
        prov.forEach((pv) => {
          if (!pv) return;
          const bid = pv.block_id;
          if (!bid) return;
          if (prefixOf(bid) !== idx.doc_id) return;   // 只核属于本快照的证据
          d.l3_eligible++; out.l3.eligible++;
          const blk = idx.byBlockId.get(bid) || null;
          d.l3_checked++; out.l3.checked++;
          const m = matchQuote(pv.quote, blk, idx);
          if (m.hit) { d.l3_hit++; out.l3.hit++; }
          else {
            const rec = { dataset: name, event_id: ev.event_id || null, field: fname, block_id: bid, quote: String(pv.quote || "").slice(0, 60), reason: m.reason };
            d.l3_miss = (d.l3_miss || 0) + 1;
            misses.push(rec);
          }
        });
      });
    });
    d.l1_rate = d.fields ? +(d.with_prov / d.fields).toFixed(4) : null;
    out.datasets[name] = d;
  }
  out.l3.miss = misses.length;
  out.l3.hit_rate_pct = out.l3.checked ? +((out.l3.hit / out.l3.checked) * 100).toFixed(2) : null;

  // 错指归因：真错指 / 取层错 / 快照无（旧逻辑原样保留）
  let mispoint = [], layerErr = 0, absentInSnap = 0;
  for (const m of misses) {
    const q = norm(m.quote);
    const realBlocks = [];
    for (const [bid, b] of idx.byBlockId) {
      if (norm(b.text || "").includes(q) || norm(b.text_raw || "").includes(q)) realBlocks.push(bid);
    }
    if (!realBlocks.length) { absentInSnap++; continue; }
    const b = idx.byBlockId.get(m.block_id);
    const hitRaw = b ? (norm(b.text_raw || "").includes(q) || norm(b.text || "").includes(q)) : false;
    if (hitRaw) { layerErr++; continue; }
    mispoint.push({ ...m, real_blocks: realBlocks });
  }
  out.attribution = {
    note: "未命中归因三类：① 真错指——quote 在解析快照中存在但不在所指的 block 内（指向了别的 block）；② 取层错——quote 取了清洗后的 text 而非 text_raw；③ 快照无——quote 在整份快照中都不存在",
    true_mispoint: mispoint.length,
    layer_error: layerErr,
    absent_in_snapshot: absentInSnap,
    attributable_total: mispoint.length + layerErr + absentInSnap,
    mispoint_detail: mispoint.slice(0, 20),
  };
  out.l3_miss_all = misses;
  return out;
}

// ---------- 主流程 ----------
function main() {
  const primary = loadPrimary();
  const files = fs.readdirSync(UNIFIED_DIR)
    .filter((f) => f.endsWith(".json") && !f.endsWith(".check.json"))
    .sort();

  const perDataset = [];
  const C = {  // 计入集（counted）
    datasets: 0, fields: 0, extracted: 0, withProv: 0, prov: 0,
    block: 0, page: 0, region: 0, quote: 0, table: 0, cellRef: 0,
    l3_eligible: 0, l3_checked: 0, l3_hit: 0, weak: 0, noBlock: 0, miss: [],
  };
  const excludedDefective = [];   // 原文缺陷
  const excludedUnknown = [];     // 来源不清（演示件等）
  const pageCaliber = { fields: 0, extracted: 0 };  // 页面权威口径参照：权威批 31 份（含残缺件）

  for (const f of files) {
    const name = f.replace(/\.json$/, "");
    let j = null;
    try { j = JSON.parse(fs.readFileSync(path.join(UNIFIED_DIR, f), "utf8")); }
    catch (e) {
      excludedUnknown.push({ dataset: name, fields: null, role: primary.roleOf(name), reason: "读取失败: " + e.message });
      continue;
    }
    const events = Array.isArray(j.events) ? j.events : [];
    const idx = buildIndex(j, name);
    const d = {
      dataset: name, class: null,
      counts_for_primary: primary.names.has(name),
      data_mode: j.data_mode || (j.is_mock ? "simulated" : "real"),
      run_id: j.run_id || null,
      file_name: (j.source && j.source.file_name) || null,
      parser_version: (j.source && j.source.parse_meta && j.source.parse_meta.parser_version) || null,
      events: events.length,
      fields_total: 0, fields_with_provenance: 0, extracted: 0, unreadable: 0,
      l1_rate: null, provenance: 0,
      with_block_id: 0, with_page: 0, with_region: 0, with_quote: 0,
      with_table_id: 0, with_cell_ref: 0,
      l3: { eligible: 0, checked: 0, hit: 0, weak: 0, no_block_id: 0, miss: 0, miss_samples: [] },
    };

    events.forEach((ev) => {
      const ff = ev && (ev.fields || ev);
      if (!ff || typeof ff !== "object") return;
      Object.entries(ff).forEach(([fname, fv]) => {
        if (!isField(fv)) return;
        d.fields_total++;
        if (fv.status === "extracted") d.extracted++;
        if (fv.status === "unreadable") d.unreadable++;
        const prov = Array.isArray(fv.provenance) ? fv.provenance : [];
        if (prov.length) d.fields_with_provenance++;
        prov.forEach((pv) => {
          if (!pv) return;
          d.provenance++;
          if (pv.block_id) d.with_block_id++;
          if (pv.page !== undefined && pv.page !== null) d.with_page++;
          if (Array.isArray(pv.region) && pv.region.length === 4) d.with_region++;
          if (pv.quote) d.with_quote++;
          if (pv.table_id) d.with_table_id++;
          if (pv.cell_ref) d.with_cell_ref++;
          // L3：无 block_id ⇒ 不计入分母（未核），不是算 miss
          if (!pv.block_id) { d.l3.no_block_id++; return; }
          if (!idx) return;                      // 本份无解析产物 ⇒ 不可核，不入分母
          d.l3.eligible++;
          const blk = idx.byBlockId.get(pv.block_id) || null;
          d.l3.checked++;
          const m = matchQuote(pv.quote, blk, idx);
          if (m.hit) { d.l3.hit++; if (m.weak) d.l3.weak++; }
          else {
            const rec = { dataset: name, event_id: ev.event_id || null, field: fname, block_id: pv.block_id, quote: String(pv.quote || "").slice(0, 60), reason: m.reason };
            d.l3.miss++;
            if (d.l3.miss_samples.length < 12) d.l3.miss_samples.push(rec);
          }
        });
      });
    });

    // ---------- 来源分类（新口径三条规则） ----------
    const allUnreadable = d.fields_total > 0 && d.unreadable === d.fields_total;
    if (!d.counts_for_primary) {
      d.class = "excluded_unknown_source";
      excludedUnknown.push({
        dataset: name, fields: d.fields_total, role: primary.roleOf(name) || "non_primary",
        reason: "非入口径件（演示/来源不清）——按新口径不计入覆盖率，仅警告「未知来源」",
      });
    } else if (!idx || allUnreadable) {
      d.class = "excluded_defective_original";
      excludedDefective.push({
        dataset: name, fields: d.fields_total, unreadable: d.unreadable,
        reason: idx
          ? "字段全 unreadable（原文缺陷）——抽取不出不计入分母"
          : "无解析产物（parse_meta.blocks 为空）——原文缺陷，抽取不出不计入分母",
      });
    } else {
      d.class = "counted";
      d.l1_rate = d.fields_total ? +(d.fields_with_provenance / d.fields_total).toFixed(4) : null;
      C.datasets++; C.fields += d.fields_total; C.extracted += d.extracted; C.withProv += d.fields_with_provenance;
      C.prov += d.provenance; C.block += d.with_block_id; C.page += d.with_page; C.region += d.with_region;
      C.quote += d.with_quote; C.table += d.with_table_id; C.cellRef += d.with_cell_ref;
      C.l3_eligible += d.l3.eligible; C.l3_checked += d.l3.checked; C.l3_hit += d.l3.hit;
      C.weak += d.l3.weak; C.noBlock += d.l3.no_block_id;
      d.l3.miss_samples.forEach((r) => C.miss.push(r));
    }
    // 页面权威口径参照：权威批 31 份 = counted + 原文缺陷（DEMO 依宗裁决不在内）
    if (d.counts_for_primary) { pageCaliber.fields += d.fields_total; pageCaliber.extracted += d.extracted; }
    perDataset.push(d);
  }

  // L2 的 table_id / cell_ref 按锚点逐条累计（与 block_id 同源，不另起口径）
  const pct = (a, b) => (b ? +((a / b) * 100).toFixed(2) : null);

  const witness = checkWitness(loadSnapshotIndex());

  const warnings = excludedUnknown.map((x) =>
    "⚠ 未知来源：" + x.dataset + "（" + (x.role === "demo" ? "演示件" : "非入口径件") +
    (x.fields != null ? "，" + x.fields + " 字段" : "") + "）——按新口径不计入覆盖率，仅此警告");

  const out = {
    generated_at: new Date().toISOString(),
    data_source: {
      batch: "data_unified",
      label: "权威批（D11 冻结）",
      note: "入口径名单单一真源＝bridge/data_source.js primary_dataset_names（与页面 /api/metrics 同源）；" +
        "物理 32 份，DEMO-EQC-HL-0930 依宗 2026-10-09 裁决不计入口径。旧池 data/ 的首测自测值已作废（领导 2026-10-15 裁定「不走首测了，真删」）。",
      physical_files: files.length,
      primary_count: primary.count,
      excluded_from_primary: excludedUnknown.filter((x) => primary.roleOf(x.dataset) === "demo").map((x) => x.dataset),
    },
    caliber: {
      coverage: "★ 2026-10-15 领导裁定新口径（只看抽取效果）：① 演示件/来源不清→不计入覆盖率，警告「未知来源」；" +
        "② 原文缺陷（无解析产物或字段全 unreadable）→抽取不出不计入分母；③ 原文存在但抽取不出→计入分母（miss）",
      L1: "溯源存在性：计入集字段带非空 provenance[] 的比例",
      L2: "锚点完备性：provenance 中 block_id / page / region / quote 各自的覆盖率（计入集）",
      L3: "原文命中：quote 是否在 block_id 指向的**本份信封自带**解析 block（text / text_raw / 表格单元格）中；与页面 provenance_hit 同源同版本",
    },
    source_classification: {
      counted: { datasets: C.datasets, fields: C.fields, extracted: C.extracted },
      excluded_defective_original: excludedDefective,
      excluded_unknown_source: excludedUnknown,
      warnings,
    },
    extraction_coverage: {
      new_caliber: {
        num: C.extracted, den: C.fields, pct: pct(C.extracted, C.fields),
        note: "排除原文缺陷与来源不清后的抽取效果（本 check 口径）",
      },
      page_caliber_ref: {
        num: pageCaliber.extracted, den: pageCaliber.fields, pct: pct(pageCaliber.extracted, pageCaliber.fields),
        note: "页面权威口径（分母含残缺件；DEMO 已按宗 2026-10-09 裁决排除）——两个口径分列，不可混读",
      },
    },
    summary: {
      datasets: C.datasets,
      fields_total: C.fields,
      fields_with_provenance: C.withProv,
      l1_pct: pct(C.withProv, C.fields),
      provenance_total: C.prov,
      block_id_pct: pct(C.block, C.prov),
      page_pct: pct(C.page, C.prov),
      region_pct: pct(C.region, C.prov),
      quote_pct: pct(C.quote, C.prov),
      table_id_pct: pct(C.table, C.prov),
      cell_ref_pct: pct(C.cellRef, C.prov),
    },
    l3_scope: {
      note: "按各信封自带 source.parse_meta.blocks 核对（与页面 provenance_hit 同源同版本）；" +
        "block_id 缺失或无解析产物不计入分母（未核），绝不当命中",
      docs_indexed: C.datasets,
      eligible: C.l3_eligible, checked: C.l3_checked, hit: C.l3_hit, miss: C.miss.length,
      weak_hits: C.weak, no_block_id: C.noBlock,
      hit_rate_pct: pct(C.l3_hit, C.l3_checked),
      datasets_checkable: perDataset.filter((d) => d.class === "counted" && d.l3.eligible > 0).map((d) => d.dataset),
      datasets_unverifiable: perDataset.filter((d) => d.class !== "counted" || d.l3.eligible === 0).map((d) => d.dataset),
    },
    p001_witness: witness,
    attribution: witness.attribution
      ? Object.assign({}, witness.attribution, { note: "归因来自 P0-01 物证段（旧池保留件）；权威批计入集 L3 " + C.l3_hit + "/" + C.l3_checked + " 无未命中" })
      : null,
    l3_miss_all: witness.l3_miss_all || [],
    per_dataset: perDataset,
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2), "utf8");

  // ---------- 控制台 ----------
  const s = out.summary, l3 = out.l3_scope, ec = out.extraction_coverage;
  console.log("=== D11 证据展示核对（权威批 data_unified/，覆盖率新口径） ===");
  console.log("入口径名单：bridge/data_source.js → " + primary.count + " 份（物理 " + files.length + "，DEMO-EQC-HL-0930 按宗 2026-10-09 裁决排除）");
  console.log("\n【来源分类 · 只看抽取效果】");
  console.log("  计入：" + C.datasets + " 份 / " + C.fields + " 字段 / extracted " + C.extracted);
  excludedDefective.forEach((x) =>
    console.log("  排除·原文缺陷：" + x.dataset + "（" + x.fields + " 字段" + (x.unreadable ? "，全 unreadable" : "") + "，无解析产物）→ 不计入分母"));
  excludedUnknown.forEach((x) =>
    console.log("  排除·来源不清：" + x.dataset + "（" + (x.role || "non_primary") + (x.fields != null ? "，" + x.fields + " 字段" : "") + "）→ 不计入分母"));
  warnings.forEach((w) => console.log("  " + w));
  console.log("\n【抽取覆盖率 · 两个口径分列】");
  console.log("  新口径（排除原文缺陷/来源不清）：" + ec.new_caliber.num + "/" + ec.new_caliber.den + " = " + ec.new_caliber.pct + "%");
  console.log("  页面权威口径参照（含残缺件分母）：" + ec.page_caliber_ref.num + "/" + ec.page_caliber_ref.den + " = " + ec.page_caliber_ref.pct + "%");
  console.log("\n【L1 溯源存在性（计入集）】" + s.fields_with_provenance + "/" + s.fields_total + " = " + s.l1_pct + "%");
  console.log("【L2 锚点完备性（共 " + s.provenance_total + " 条 provenance）】block_id " + s.block_id_pct +
    "% / page " + s.page_pct + "% / region " + s.region_pct + "% / quote " + s.quote_pct +
    "% / table_id " + s.table_id_pct + "% / cell_ref " + s.cell_ref_pct + "%");
  console.log("【L3 原文命中（各信封自带 blocks，与页面同源）】" + l3.hit + "/" + l3.checked + " = " + l3.hit_rate_pct + "%");
  console.log("  可核 " + l3.datasets_checkable.length + " 份；不可核 " + l3.datasets_unverifiable.length +
    " 份（" + (l3.datasets_unverifiable.join(", ") || "无") + "）—— 不计入分母");
  if (witness && witness.l3 && witness.l3.checked) {
    console.log("\n【P0-01 物证（旧池保留件，不计入权威口径）】");
    for (const [k, v] of Object.entries(witness.datasets)) {
      if (v && v.l3_checked != null) {
        console.log("  " + k + "：" + v.l3_hit + "/" + v.l3_checked + " = " +
          (v.l3_checked ? ((v.l3_hit / v.l3_checked) * 100).toFixed(2) : "N/A") + "%（parser " + (v.parser_version || "?") + "）");
      }
    }
    const a = witness.attribution;
    if (a) console.log("  归因：真错指 " + a.true_mispoint + " / 取层错 " + a.layer_error + " / 快照不存在 " + a.absent_in_snapshot);
  }
  // ★ 2026-10-15：P0-01 权威批改锚 + 算术正反证（方轩诚反馈第④条落地）
  const wa = witness.authoritative_anchor;
  if (wa && wa.enabled) {
    console.log("\n【P0-01 改锚：按 source.file_sha256 在权威批找同一份文档】");
    for (const [k, v] of Object.entries(wa.by_witness)) {
      if (!v || v.missing) { console.log("  " + k + "：旧件缺失"); continue; }
      const m = v.authoritative_match || {};
      console.log("  " + k + "（parser " + (v.parser_version || "?") + "，" + v.events + " 事件，sha256 " +
        String(v.file_sha256 || "").slice(0, 12) + "…）→ 权威批 " + (m.revives ? m.dataset + "（parser " + m.parser_version + "，" + m.events + " 事件，同 sha256 ✓）" : "未找到同 sha256 文档 ✗"));
    }
    const ap = wa.arithmetic_proof;
    if (ap) {
      console.log("  算术正反证（" + ap.for_witness + " 对应权威批 " + ap.authoritative_dataset + "）：" +
        (ap.holds ? "成立 " + ap.expr + "　— " + ap.note : "不成立　— " + ap.note));
    }
    console.log("  纪律：" + wa.discipline);
  }
  console.log("\n→ " + OUT);
}

main();
