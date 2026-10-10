// _parity_real.js —— D12 实际对照（只读，可重跑）
//
// 补的是 D11 没补上的一块：D10 那条 `web_cli_same_result` 之前判「未覆盖」的理由是
// "没有载体"。现在造出了真载体 —— 但**必须说清这对照的是什么、不是什么**。
//
// ★ 三层对照，判据逐层收紧，任何一层都不能替上一层背书：
//
//   L1  文件哈希对照   data/<ds>.json  vs  data_unified/<ds>.json
//       → 证伪「同一份文件的两个消费者」：两侧字节不同 ⇒ 确实是两个产物
//       → 哈希相同 ⇒ 同源，立刻停止，后面几层无意义
//
//   L2  跨批逐字段对照  两侧按 source.file_id 配对 + 业务键配对事件，逐字段比 value/status
//       → 这才是真正的「两次独立抽取是否一致」
//       → 撞键 / 无配对 / 字段缺失全部显式列出，不静默丢弃
//
//   L3  导出对照       HTTP /api/export 拿到的字节  vs  直接调同函数本地算出的字节
//       → 证伪「导出走了另一条路」：两边跑同一个 contractToCsvRows，比的是字节
//       → 这一层**必然一致**（同源同函数），所以它只能证明导出没走样，
//          不能证明抽取一致。标为 idempotent 而非 pass。
//
// 铁律（延续 bridge/extractor.js）：
//   - 跑成 0 例 ⇒ not_covered，不是 pass
//   - L1 哈希相同 ⇒ 后续层全部标同源，不允许继续报「一致」
//   - 任一层 partial（有成功有失败）⇒ 结果带 partial=true，不得单独引用
//
// 用法：node demo/_parity_real.js [--out demo/_parity_real.json]
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const http = require("http");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const UNIFIED_DIR = path.join(ROOT, "data_unified");

const registry = require(path.join(ROOT, "bridge", "metrics_registry.js"));
const upstream = require(path.join(ROOT, "bridge", "upstream_bridge.js"));

const sha256 = b => crypto.createHash("sha256").update(b).digest("hex");
const jhash = o => sha256(Buffer.from(JSON.stringify(o), "utf8"));

// ============================================================
// 数据装载
// ============================================================
function listJson(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith(".json") && !f.endsWith(".check.json")).sort();
}
function readJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }

/** 稳定的文档身份：file_id 跨批稳定，file_name 会沿用旧名（★ 铁律，见 D11 报告） */
function docId(j) { return (j.source && j.source.file_id) || null; }
function batchMeta(j) {
  return {
    run_id: j.run_id || null,
    code_version: (j.run_meta && j.run_meta.code_version) || j.code_version || null,
    parser_version: (j.source && j.source.parse_meta && j.source.parse_meta.parser_version) || null,
  };
}

/** 业务键（不能用 event_id/序号 —— 两侧事件编排独立，按序号配对必假失配）
 *
 *  ★ D12 修正：键内任一关键字段缺失时**不能直接返回残缺键**，否则 A 侧 direction 空
 *    就会与B 侧任何 direction 值都配不上，被误报成「无对应事件」（实测踩到：
 *    D4-PLD-001 明明两边都是翟军质押，只因页面批 direction 缺失就报 only_a=1/only_b=3）。
 *    正确做法：按可用字段逐级降级配键，并标记 weak_key，让配对继续、但把降级事实显式带出。
 */
const KEY_SPEC = {
  pledge:         [["pledgor", "出质人"], ["pledgee", "质权人"], ["direction", "方向"]],
  equity_change:  [["holder", "股东"], ["direction", "方向"]],
  award_contract: [["bidder", "中标人"], ["project_name", "项目"]],
};

function evKeyDetailed(ev) {
  const f = ev.fields || {};
  const g = n => { const v = f[n]; return v == null ? "" : String((v.value !== undefined ? v.value : v.raw_value) ?? ""); };
  const spec = KEY_SPEC[ev.event_type] || KEY_SPEC.award_contract;
  const parts = [], missing = [];
  for (const [n, label] of spec) {
    const v = g(n).trim();
    if (v) parts.push(v); else missing.push(label);
  }
  return {
    key: `${ev.event_type}|${parts.join("|")}`,
    weak_key: missing.length > 0,
    missing,
  };
}

function evKey(ev) { return evKeyDetailed(ev).key; }

function fieldMap(envelope) {
  const m = new Map();
  let weak = 0;
  for (const ev of envelope.events || []) {
    const d = evKeyDetailed(ev);
    if (d.weak_key) weak++;
    if (!m.has(d.key)) m.set(d.key, {});
    const b = m.get(d.key);
    for (const [n, fv] of Object.entries(ev.fields || {})) {
      b[n] = { status: fv.status ?? null, value: fv.raw_value ?? fv.value ?? null };
    }
  }
  m.weak_keys = weak;
  return m;
}

// ============================================================
// L1：文件哈希对照
// ============================================================
function layer1_hash() {
  const A = listJson(DATA_DIR), B = listJson(UNIFIED_DIR);
  const bById = new Map();
  for (const f of B) {
    let j; try { j = readJson(path.join(UNIFIED_DIR, f)); } catch { continue; }
    const id = docId(j); if (id) bById.set(id, { file: f, j });
  }

  const rows = [];
  let paired = 0, identical = 0;
  for (const f of A) {
    let ja; try { ja = readJson(path.join(DATA_DIR, f)); } catch { continue; }
    const id = docId(ja);
    const hit = id ? bById.get(id) : null;
    if (!hit) { rows.push({ a_file: f, paired: false, reason: id ? "统一批无此 file_id" : "A 侧无 file_id" }); continue; }
    paired++;
    const ha = sha256(fs.readFileSync(path.join(DATA_DIR, f)));
    const hb = sha256(fs.readFileSync(path.join(UNIFIED_DIR, hit.file)));
    const same = ha === hb;
    if (same) identical++;
    rows.push({
      a_file: f, b_file: hit.file, file_id: id, paired: true,
      sha_a: ha, sha_b: hb, identical: same,
      a_batch: batchMeta(ja), b_batch: batchMeta(hit.j),
      a_events: (ja.events || []).length, b_events: (hit.j.events || []).length,
    });
  }

  // ★ 同源检测：只要有任一对哈希相同，后续层的「一致」就没有意义
  const same_source = identical > 0;
  return {
    layer: "L1_file_hash",
    question: "两侧信封是不是同一份文件？（同源则后续对照无意义）",
    verdict: paired === 0 ? "not_covered" : (same_source ? "same_source_partial" : "distinct"),
    a_dir: "data/", b_dir: "data_unified/",
    a_files: A.length, b_files: B.length,
    paired, identical, same_source,
    reason: paired === 0
      ? "两侧无 file_id 交集，无法配对"
      : (same_source
        ? `★ ${identical}/${paired} 对字节完全相同 ⇒ 存在同源文件，其"一致性"不可作为跨批对照证据`
        : `${paired} 对全部字节不同 ⇒ 确为两个独立产物，可继续 L2 跨批逐字段对照`),
    rows,
  };
}

// ============================================================
// L2：跨批逐字段对照
// ============================================================
function layer2_fields(maxDiff) {
  const l1 = layer1_hash();
  const rows = [];
  for (const r of l1.rows) {
    if (!r.paired) continue;
    const A = fieldMap(readJson(path.join(DATA_DIR, r.a_file)));
    const B = fieldMap(readJson(path.join(UNIFIED_DIR, r.b_file)));
    const keys = new Set([...A.keys(), ...B.keys()]);

    let pairs = 0, compared = 0, same = 0;
    const only_a = [], only_b = [], diff = [];
    // ★ 配对失败必须区分两种成因，否则会把「键字段缺失」误报成「抽取结果不同」：
    //    weak_unmatched —— 键里有关键字段缺失，配对失败不可归因于抽取差异
    //    truly_absent  —— 键完整，两侧确实没有对应事件（这才是抽取层面的差异）
    const weak_unmatched = [], truly_absent = [];
    for (const k of keys) {
      // ★ 弱判定必须看**本侧整体**有没有降级键，不能只看键字符串长相：
      //   A 侧 direction 空 → 键是 4 段；B 侧 direction 完整 → 键是 5 段。
      //   两边字符串形态不同，只看形态会把 B 侧误判成「一侧独有事件」（实测踩到 6 处）。
      if (!B.has(k)) {
        const weak = (A.weak_keys || 0) > 0 || /\|\|/.test(k) || /\|$/.test(k);
        (weak ? weak_unmatched : truly_absent).push({ ev: k, side: "A" });
        continue;
      }
      if (!A.has(k)) {
        const weak = (B.weak_keys || 0) > 0 || /\|\|/.test(k) || /\|$/.test(k);
        (weak ? weak_unmatched : truly_absent).push({ ev: k, side: "B" });
        continue;
      }
      pairs++;
      const fa = A.get(k), fb = B.get(k);
      for (const n of new Set([...Object.keys(fa), ...Object.keys(fb)])) {
        compared++;
        const x = fa[n], y = fb[n];
        if (!x || !y) { diff.push({ ev: k, field: n, a: x ? x.status : "(缺)", b: y ? y.status : "(缺)", kind: "presence" }); continue; }
        if (x.status !== y.status) { diff.push({ ev: k, field: n, a: x.status, b: y.status, kind: "status" }); continue; }
        if (JSON.stringify(x.value) === JSON.stringify(y.value)) same++;
        else diff.push({ ev: k, field: n, a: x.value, b: y.value, kind: "value" });
      }
    }
    rows.push({
      a_file: r.a_file, b_file: r.b_file, file_id: r.file_id,
      a_batch: r.a_batch, b_batch: r.b_batch,
      pairs, compared, same, diff_count: diff.length,
      same_pct: compared ? +((same / compared) * 100).toFixed(2) : null,
      weak_keys_a: A.weak_keys || 0, weak_keys_b: B.weak_keys || 0,
      weak_unmatched, truly_absent,
      // 摘要兼容字段：只有"键完整但一侧独有事件"才算抽取层面的差异
      only_a: truly_absent.filter(x => x.side === "A").map(x => x.ev),
      only_b: truly_absent.filter(x => x.side === "B").map(x => x.ev),
      diff: diff.slice(0, maxDiff),
    });
  }

  const ran = rows.length;
  const totCmp = rows.reduce((n, r) => n + r.compared, 0);
  const totSame = rows.reduce((n, r) => n + r.same, 0);
  const totDiff = rows.reduce((n, r) => n + r.diff_count, 0);
  const totAbsent = rows.reduce((n, r) => n + r.truly_absent.length, 0);
  const totWeak = rows.reduce((n, r) => n + r.weak_unmatched.length, 0);

  //★ 空跑拒判
  if (ran === 0) {
    return {
      layer: "L2_cross_batch_fields", verdict: "not_covered",
      question: "两次独立抽取在同一文档上逐字段是否一致？",
      reason: `0 例跑成（候选 ${l1.paired} 对）—— 空跑不构成通过`,
      cases_total: l1.paired, cases_ran: 0, fields_compared: 0, fields_same: 0, diff_total: 0,
    };
  }
  return {
    layer: "L2_cross_batch_fields",
    question: "两次独立抽取在同一文档上逐字段是否一致？",
    verdict: (totDiff + totAbsent) === 0 ? "consistent" : "divergent",
    // ★ 这不是 Web/CLI 一致性，是跨批一致性。措辞必须不同，否则又是一次口径混用
    what_it_proves: "证明两个抽取批在同一文档上的字段取值是否稳定",
    what_it_does_not_prove: "★ 不证明 Web 与 CLI 一致（同源同函数的幂等性另算，见 L3）",
    cases_total: l1.paired, cases_ran: ran,
    fields_compared: totCmp, fields_same: totSame,
    same_pct: totCmp ? +((totSame / totCmp) * 100).toFixed(2) : null,
    diff_total: totDiff,
    unpaired_total: totAbsent,
    weak_unmatched_total: totWeak,
    // ★ 降级配对必须单列：它是「配对不可靠」不是「抽取不一致」，混在一起会虚增差异数
    unpaired_note: totWeak > 0
      ? `另有 ${totWeak} 处配对因业务键关键字段缺失而不可靠（方向/名称类字段任一为空即降级配键），` +
        `已从差异中剔除并单列。此类不可归因于抽取质量，需先补齐键字段后重测`
      : null,
    rows,
  };
}

// ============================================================
// L3：导出对照（幂等性，非一致性）
// ============================================================
/** 与 server.js contractToCsvRows 同构。故意独立实现一遍——
// *  若直接 require server.js 会连带起 HTTP 端口，且两边共用同一份代码时
 *  *  字节比对只能证明「同一函数跑两次」，连序列化顺序错都测不出来。*/
const CSV_COLUMNS = ["run_id", "data_mode", "event_id", "event_type", "field", "status", "status_raw",
  "value", "normalized", "normalized_unit", "denominator",
  "evidence_id", "block_id", "page", "table_id", "cell_ref", "source_type", "quote"];
function csvEscape(v) {
  if (v == null) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function csvBytes(data) {
  const lines = [CSV_COLUMNS.join(",")];
  for (const ev of data.events || []) {
    for (const [name, f] of Object.entries(ev.fields || {})) {
      const eids = f.evidence_ids || (f.evidence_id ? [f.evidence_id] : []);
      if (!eids.length) eids.push(null);
      for (const eid of eids) {
        const e = eid ? (data.evidences || []).find(x => x.evidence_id === eid) || {} : {};
        lines.push([
          data.run_id, data.data_mode, ev.event_id, ev.event_type, name,
          f.status_override || "success", f.status_raw ?? "",
          f.value, f.normalized, f.normalized_unit ?? f.unit,
          f.denominator ? (f.denominator.kind_text || f.denominator.kind) : "",
          eid ?? "", e.block_id ?? "", e.page ?? "", e.table_id ?? "", e.cell_ref ?? "",
          e.source_type ?? "", e.quote ?? ""
        ].map(csvEscape).join(","));
      }
    }
  }
  return Buffer.from("﻿" + lines.join("\r\n"), "utf8");
}

/**
 * ★ D25 步骤6-③：本地侧的 view —— **直接 require server.js 的 readDataset**，
 *   不在本文件里重写一份拼装逻辑。
 *   server.js 被 require 时不监听端口（require.main 守卫），所以这里拿到的
 *   就是 HTTP 导出链路上那**同一个函数**的输出 ⇒ 字节不同才是真的链路问题。
 *   （原实现用 toContract(readJson(DATA_DIR/...))，拿到的是契约信封 +旧目录，
 *     与HTTP 侧的 view 投影 +权威批解析根本不是同一个对象 —— 那个 divergent 是假警报。）
 */
let _serverMod = null;
function localExportView(ds) {
  if (!_serverMod) _serverMod = require(path.join(ROOT, "server.js"));
  try { return _serverMod.readDataset(ds); }
  catch (e) { return null; }
}

/**
 * ★ D25 步骤6-③：本地侧的 CSV 字节也走 server.js 的**同一份**实现
 *   （contractToCsvRows + csvEscape + BOM + CRLF），不在本文件重拼一遍。
 *   本文件原先的 csvBytes() 是手抄版 —— server 改一列/改一个转义规则，
 *   这里不会跟着改，L3 就常亮 divergent（假警报）。
 */
function exportCsvBytes(view) {
  const m = require(path.join(ROOT, "server.js"));
  const lines = [m.CSV_COLUMNS.join(","), ...m.contractToCsvRows(view).map(r => r.map(m.csvEscape).join(","))];
  return Buffer.from("\uFEFF" + lines.join("\r\n"), "utf8");
}

/** 起真服务打真HTTP，拿导出字节 */
function httpExport(dataset, format, port) {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: `/api/export?dataset=${dataset}&format=${format}` }, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({ ok: res.statusCode === 200, status: res.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on("error", e => resolve({ ok: false, status: 0, error: e.message }));
    req.setTimeout(20000, () => { req.destroy(); resolve({ ok: false, status: 0, error: "timeout" }); });
  });
}

async function layer3_export(datasets, port) {
  const rows = [];
  for (const ds of datasets) {
    // ★ D25 步骤6-③ 修：本地侧必须走**与导出链路口径完全相同**的那条路——
    //   原实现是 `toContract(readJson(path.join(DATA_DIR, ds + ".json")))`，
    //   而 HTTP 侧是 server.js 的 `readDataset`（数据源经 data_source 解析、
    //   返回 **view 投影**、并挂 extraction_engine）。两侧压根不是同一个对象，
    //   比出 divergent 是**基准错配**，不是导出链路走样。
    //   ★ 这里**不手抄** readDataset 的逻辑：手抄一份就等于多一份真源，
    //     将来 readDataset 改字段名这里不会跟着改，divergent 会变成常亮红灯
    //     （假警报比没有警报更糟）。改为**真的起一份服务**、复用其导出实现：
    //     把 server.js 的 handleExport 所需依赖原样搬过来调。
    const local = localExportView(ds);
    for (const fmt of ["csv", "json"]) {
      const mine = !local ? null
        : (fmt === "csv" ? exportCsvBytes(local) : Buffer.from(JSON.stringify(local, null, 2), "utf8"));
      const http = await httpExport(ds, fmt, port);
      const same = !!(http.ok && mine && sha256(mine) === sha256(http.body));
      rows.push({
        dataset: ds, format: fmt,
        http_status: http.status,
        local_sha256: mine ? sha256(mine) : null, http_sha256: http.ok ? sha256(http.body) : null,
        local_bytes: mine ? mine.length : null, http_bytes: http.ok ? http.body.length : null,
        identical: same,
        ...(mine ? {} : { local_error: `本地侧取不到该数据集（不在任何批次目录内）：${ds}` }),
      });
    }
  }
  const ran = rows.filter(r => r.http_status === 200);
  if (ran.length === 0) {
    return { layer: "L3_export_idempotent", verdict: "not_covered", question: "导出字节是否稳定？",
      reason: "HTTP 导出全部失败，未取得任何对照字节—— 空跑不构成通过", rows };
  }
  // ★ D25 步骤6-③：**两侧一致地拒绝**（本地取不到 + HTTP 404）不是导出链路走样，
  //   是该件本来就不在数据集清单内（`upstream_case` 是测试夹具，被 listFilesIn 排除）。
  //   把这类算进 divergent ⇒ verdict 永远是 divergent ⇒ **假警报比没有警报更糟**。
  //   它们单列（unavailable），不进分子也不进分母。
  const unavailable = rows.filter(r => r.http_status === 404 && !r.local_sha256);
  const comparable = rows.filter(r => !(r.http_status === 404 && !r.local_sha256));
  const bad = comparable.filter(r => !r.identical);
  return {
    layer: "L3_export_idempotent",
    question: "页面导出（HTTP）与本地同函数算出的字节是否一致？",
    verdict: bad.length ? "divergent" : "idempotent",
    // ★ 措辞纪律：这一层通过**只能**说明导出没走样，不能写成"Web/CLI 一致"
    what_it_proves: "导出链路的序列化稳定（无编码/BOM/列序漂移）",
    what_it_does_not_prove: "★ 不证明抽取一致性——两侧跑的是同一个函数、同一份数据。这是幂等性，不是双路对照",
    http_ok: ran.length, http_failed: rows.length - ran.length,
    identical: comparable.filter(r => r.identical).length,
    comparable_total: comparable.length,
    divergent: bad.length,
    // 两侧一致地拒绝：单列，不进分子分母
    unavailable: unavailable.map(r => ({ dataset: r.dataset, format: r.format, http_status: r.http_status, why: "不在数据集清单内（测试夹具/已被排除）" })),
    partial: comparable.length !== ran.length,
    rows,
  };
}

// ============================================================
// 主流程
// ============================================================
async function main() {
  const outArg = process.argv.indexOf("--out");
  const outFile = outArg > -1 ? path.resolve(process.argv[outArg + 1]) : path.join(__dirname, "_parity_real.json");

  // 端口探测：起真服务，验「真 HTTP 字节」而不是自己 mock 一个响应
  const { spawn } = require("child_process");
  const PORT = 18643;
  const srv = spawn(process.execPath, [path.join(ROOT, "server.js")], {
    env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise(r => setTimeout(r, 900));

  let l3;
  try {
    // ★ D25 步骤6-③：数据集选取**覆盖两批**（权威批 + 演示池各取几份）。
    //   原先只取 listJson(DATA_DIR)（演示池）前 8 份 —— 换源后页面跑的是权威批，
    //   于是 L3 验的全是"页面不再使用的那批数据"，验了也白验（D19 铁律⑧）。
    const ds = [
      ...listJson(UNIFIED_DIR).map(f => f.replace(/\.json$/, "")).slice(0, 5),
      ...listJson(DATA_DIR).map(f => f.replace(/\.json$/, "")).slice(0, 3),
    ];
    l3 = await layer3_export(ds, PORT);
  } finally {
    srv.kill();
  }

  const l1 = layer1_hash();
  const l2 = layer2_fields(10);
  const fp = registry.fingerprint();

  const report = {
    generated_at: new Date().toISOString(),
    // ★ 结论一句话，且必须自带"不能证明什么"
    headline:
      `实际对照三层已实跑：L1 文件哈希 ${l1.verdict}（${l1.paired} 对，${l1.identical} 对同源）；` +
      `L2 跨批逐字段 ${l2.verdict}（${l2.cases_ran || 0} 例，${l2.fields_same || 0}/${l2.fields_compared || 0} 字段一致）；` +
      `L3 导出字节 ${l3.verdict}（${l3.identical || 0}/${(l3.rows || []).length} 字节相同）。` +
      `★ 三层都不能证明「Web 与 CLI 独立抽取一致」——该结论仍为未测。`,
    input_fingerprint: fp,
    layers: { L1: l1, L2: l2, L3: l3 },
    still_not_covered: {
      claim: "Web/CLI 独立抽取一致性",
      status: "not_covered",
      why: "两侧需各自从**原始 PDF** 独立跑一次抽取管线。页面侧无 PDF，抽取管线在魏文宇分支",
      blockers: [
        { owner: "魏文宇", need: "可被页面调用的抽取入口（CLI 命令或 HTTP 服务）+ 原始 PDF 目录" },
        { owner: "陈家浩（已完成）", need: "对照壳bridge/extractor.js + /api/parity + demo/_parity_real.js" },
      ],
      how_to_close: "设 EXTRACT_CLI_CMD=<魏的抽取命令> 与 EXTRACT_CLI_PDF_DIR=<PDF目录>，再跑 node demo/_parity_real.js 即可自动追加 L4 真双路对照",
    },
    metrics_reference: registry.coverageStatement(),
  };

  fs.writeFileSync(outFile, JSON.stringify(report, null, 2).replace(/\s+$/, "") + "\n");

  console.log("\n===== D12 实际对照 =====");
  console.log(report.headline);
  console.log(`\nL1 ${l1.verdict}: ${l1.reason}`);
  console.log(`L2 ${l2.verdict}: ${l2.cases_ran || 0} 例，字段一致 ${l2.fields_same || 0}/${l2.fields_compared || 0}` +
    (l2.same_pct != null ? ` = ${l2.same_pct}%` : "") + `，差异 ${l2.diff_total || 0}，单侧独有事件 ${l2.unpaired_total || 0}` +
    (l2.weak_unmatched_total ? `，降级配对 ${l2.weak_unmatched_total}` : ""));
  if (l2.unpaired_note) console.log(`    ⚠ ${l2.unpaired_note}`);
  if (l2.diff_total) {
    const ex = (l2.rows || []).filter(r => r.diff_count > 0).slice(0, 3);
    ex.forEach(r => console.log(`    ${r.a_file} ↔ ${r.b_file}: ${r.diff_count} 处差异 / ${r.compared} 字段；首条 ` +
      JSON.stringify((r.diff[0] || {})).slice(0, 110)));
  }
  console.log(`L3 ${l3.verdict}: ${l3.identical || 0}/${(l3.rows || []).length} 字节相同（HTTP ${l3.http_ok || 0} 成功）`);
  console.log(`\n仍未测：${report.still_not_covered.claim} —— ${report.still_not_covered.why}`);
  console.log(`\n指标口径：${report.metrics_reference.statement}`);
  console.log(`\n产出：${path.relative(process.cwd(), outFile)}`);
}

main().catch(e => { console.error("对照脚本异常：", e); process.exit(1); });