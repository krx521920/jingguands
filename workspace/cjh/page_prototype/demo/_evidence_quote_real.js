#!/usr/bin/env node
/**
 * D13 · 出处原文命中率实测（quote ∈ block.text）
 *
 * ★ 为什么有 this脚本：10-07 我把「出处命中率」记成「未测·无原文快照可回跳」，
 *   那是错的——快照在魏分支 evaluation/D9/parses-blocks/，不在我当时的检索路径内。
 *   宗 10-07 独立发现同一问题并自陈「检索不全 ≠ 文件不存在」（他的第 4 次同类误判）。
 *   两边独立撞上同一堵墙，说明这堵墙是我检索方式的问题，不是数据的问题。
 *
 * 判据（强判据，不退化）：
 *   命中 = provenance.quote 落在 block.text 或 block.text_raw 内
 *   不接受「整篇全文包含」——那会把无出处字段算成命中
 *
 * 分母纪律（本脚本的命门）：
 *   分母 = ★ 所在文档有快照的 provenance 条数，不是全部 provenance。
 *   快照未覆盖的文档单独计数并如实标「未核」，绝不并入分母。
 *   snapshots=0 ⇒ 直接判not_covered（空跑不构成通过）。
 *
 * 纪律：只读。不改数据、不改快照、不碰封存资产。
 * 快照来源：魏文宇分支 93c8ae28evaluation/D9/parses-blocks/*.parse-blocks.json
 * 输出：demo/_evidence_quote_real.json
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SNAP_DIR = process.env.SNAP_DIR
  || path.resolve(ROOT, "..", "..", "..", "..", ".peersnap");   // D:/chenjh/code/program/jingguanpluge/.peersnap
const DATA_DIRS = [
  { dir: path.join(ROOT, "data"), batch: "page_data" },
  { dir: path.join(ROOT, "data_unified"), batch: "unified_batch" },
];
const OUT = path.join(__dirname, "_evidence_quote_real.json");

// ---------- 载入快照 → file_id -> Map(block_id -> block) ----------
function loadSnapshots() {
  const idx = new Map();
  if (!fs.existsSync(SNAP_DIR)) return idx;
  for (const f of fs.readdirSync(SNAP_DIR)) {
    if (!f.endsWith(".json")) continue;
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(SNAP_DIR, f), "utf8")); }
    catch (e) { continue; }
    const fid = (j.doc && j.doc.file_id) || "";
    if (!fid) continue;
    const blocks = new Map();
    for (const p of j.pages || []) {
      for (const b of p.blocks || []) if (b && b.block_id) blocks.set(b.block_id, b);
    }
    idx.set(fid, {
      file: f,
      doc_id: (j.doc && j.doc.doc_id) || "",
      parser: (j.doc && j.doc.parser && j.doc.parser.version) || "",
      page_count: (j.doc && j.doc.page_count) || 0,
      block_count: blocks.size,
      blocks,                     // ★ 必须带上block 表，否则核验阶段全是 not_found
    });
  }
  return idx;
}

// ---------- 扫两侧信封的 provenance ----------
function collectProvenance(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json") || f.endsWith(".check.json") || f === "upstream_case.json") continue;
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch (e) { continue; }
    for (const ev of j.events || []) {
      for (const [fname, fv] of Object.entries(ev.fields || {})) {
        for (const p of fv.provenance || []) {
          if (p && (p.block_id || p.quote)) {
            out.push({
              dataset: f,
              file_id: (j.source && j.source.file_id) || "",
              field: fname,
              event_type: ev.event_type || "",
              block_id: p.block_id || null,
              quote: p.quote || null,
            });
          }
        }
      }
    }
  }
  return out;
}

function main() {
  const snaps = loadSnapshots();
  const prov = [];
  for (const d of DATA_DIRS) {
    for (const p of collectProvenance(d.dir)) prov.push({ ...p, batch: d.batch });
  }

  // ★ 空跑拒判：没有快照就没有任何可核证据，此时"通过"毫无意义
  if (snaps.size === 0) {
    const res = {
      layer: "L_evidence_hit", verdict: "not_covered",
      question: "字段的 quote 能否在原始解析 block 文本中定位到？",
      reason: `快照目录为空或不存在（${SNAP_DIR}）—— 空跑不构成通过`,
      snapshots: 0, prov_total: prov.length, prov_verifiable: 0,
    };
    fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
    console.log(`L-evidence  not_covered: 快照 0 份，prov ${prov.length} 条全部未核`);
    return;
  }

  // 可核子集= 所在文档有快照
  const verifiable = prov.filter((p) => snaps.has(p.file_id));
  const unverifiable = prov.length - verifiable.length;

  let okId = 0, hitQuote = 0, missId = 0, noQuote = 0;
  const missSamples = [];
  for (const p of verifiable) {
    if (!p.quote) { noQuote++; continue; }
    const snap = snaps.get(p.file_id);
    const block = p.block_id ? snap.blocks.get(p.block_id) : null;
    if (!block) {
      missId++;
      if (missSamples.length < 8) missSamples.push({ dataset: p.dataset, field: p.field, why: "block_id_not_found", block_id: p.block_id });
      continue;
    }
    okId++;
    const hay = [block.text, block.text_raw].filter(Boolean).join("\n");
    if (hay.includes(p.quote)) hitQuote++;
    else if (missSamples.length < 8) missSamples.push({ dataset: p.dataset, field: p.field, why: "quote_not_in_block", quote: String(p.quote).slice(0, 60) });
  }

  const res = {
    layer: "L_evidence_hit",
    question: "字段的 quote 能否在原始解析 block 文本中定位到？",
    generated_at: new Date().toISOString(),
    snapshot_source: SNAP_DIR,
    snapshot_count: snaps.size,
    snapshot_blocks: [...snaps.values()].reduce((n, s) => n + s.block_count, 0),
    prov_total: prov.length,
    prov_verifiable: verifiable.length,
    prov_unverifiable: unverifiable,
    docs_covered: new Set(verifiable.map((p) => p.file_id)).size,
    block_id_resolved: okId,
    block_id_unresolved: missId,
    no_quote: noQuote,
    quote_hit: hitQuote,
    hit_rate_pct: okId ? +((hitQuote / okId) * 100).toFixed(2) : null,
    verdict: okId === 0 ? "not_covered" : (missId === 0 && hitQuote === okId ? "pass" : "partial"),
    what_it_proves: "在有原文快照的文档上，字段quote 能定位回原文 block",
    what_it_does_not_prove: `★ 不代表全量：仅覆盖 ${new Set(verifiable.map((p) => p.file_id)).size} 份文档 / ${verifiable.length} 条 provenance（总${prov.length} 条），其余 ${unverifiable} 条未核，不计入分母`,
    caliber: "强判据：quote 必须落在 block.text / text_raw 内。不接受整篇全文包含（会把无出处字段算成命中）",
    miss_samples: missSamples,
  };

  fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  console.log(`L-evidence  ${res.verdict}: 快照 ${res.snapshot_count} 份（${res.snapshot_blocks} blocks）`);
  console.log(`  可核子集 ${verifiable.length}/${prov.length} 条，覆盖 ${res.docs_covered} 份文档`);
  console.log(`  block_id 可定位 ${okId} / 定位不到 ${missId} / 无 quote ${noQuote}`);
  console.log(`  ★ quote ∈ block.text 命中 ${hitQuote}/${okId} = ${res.hit_rate_pct}%`);
  if (missSamples.length) console.log("  未命中样例: " + JSON.stringify(missSamples.slice(0, 3)));
}

if (require.main === module) main();
module.exports = { loadSnapshots, collectProvenance };
