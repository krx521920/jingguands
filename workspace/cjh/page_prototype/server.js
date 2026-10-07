// server.js —— 零依赖本地服务器：静态资源 + 数据接口
// 相对路径实现：所有路径基于本文件位置推导（__dirname），无绝对路径、无外部依赖。
// 数据源模式：
//   mock   （默认）：读取 data/<dataset>.json —— 本地模拟数据，页面显式标"模拟"
//   remote          ：反向代理到上游真实接口（魏文宇的事件 JSON 服务），通过环境变量配置
// 用法：node server.js  →  http://127.0.0.1:8642
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { toContract } = require("./bridge/upstream_bridge.js");   // 转接口：上游格式 → 契约 v0.3
const { handleMetrics } = require("./bridge/metrics.js");      // D11：真实结果统计（图表页数据源）

const ROOT = __dirname;                       // 工程根（相对锚点）
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const LOG_DIR = path.join(ROOT, "logs");      // D6：上传日志（JSONL，逐文件一行）
const LOG_FILE = path.join(LOG_DIR, "upload_log.jsonl");
const D10_DIR = path.join(DATA_DIR, "d10");   // D10：多公告集成（宗案例 × 魏bundle × 缓存三态 × 张链检）

const PORT = process.env.PORT || 8642;
const DATA_SOURCE = process.env.DATA_SOURCE || "mock";        // mock | remote
const REMOTE_API_URL = process.env.REMOTE_API_URL || "";      // remote 模式的上游地址

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8"
};

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj, null, 2);
  // no-store：演示时杜绝浏览器拿旧缓存数据（D5 教训）
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}

// ---- D3：导出（JSON / CSV）----
// CSV 扁平化：每字段一行；quote 内含逗号/引号/换行按 RFC 4180 转义；BOM 保证 Excel 打开中文不乱码。
const CSV_COLUMNS = [
  "run_id", "data_mode", "event_id", "event_type", "field", "status", "status_raw",
  "value", "normalized", "normalized_unit", "denominator",
  "evidence_id", "block_id", "page", "table_id", "cell_ref", "source_type", "quote"
];

function csvEscape(v) {
  if (v == null) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function contractToCsvRows(data) {
  const rows = [];
  for (const ev of data.events || []) {
    for (const [name, f] of Object.entries(ev.fields || {})) {
      // 一字段可挂多条证据：主证据一行，其余证据各补一行（evidence_ids 展开，不错位）
      const eids = f.evidence_ids || (f.evidence_id ? [f.evidence_id] : []);
      if (!eids.length) eids.push(null);
      for (const eid of eids) {
        const e = eid ? (data.evidences || []).find(x => x.evidence_id === eid) || {} : {};
        rows.push([
          data.run_id, data.data_mode, ev.event_id, ev.event_type, name,
          f.status_override || "success",          // D3：字段级状态（status_raw 保留信封原始 6 态）
          f.status_raw ?? "",
          f.value, f.normalized, f.normalized_unit ?? f.unit,
          f.denominator ? (f.denominator.kind_text || f.denominator.kind) : "",
          eid ?? "", e.block_id ?? "", e.page ?? "", e.table_id ?? "", e.cell_ref ?? "",
          e.source_type ?? "", e.quote ?? ""
        ]);
      }
    }
  }
  return rows;
}

function handleExport(res, urlObj, readDataset) {
  const dataset = urlObj.searchParams.get("dataset") || "";
  const format = (urlObj.searchParams.get("format") || "csv").toLowerCase();
  if (!/^[a-z0-9_-]+$/i.test(dataset)) return sendJSON(res, 400, { error: "invalid dataset name" });
  if (!["json", "csv"].includes(format)) return sendJSON(res, 400, { error: "format must be json|csv" });

  let data;
  try { data = readDataset(dataset); }
  catch (e) {
    if (e && e.code === "NOT_FOUND") return sendJSON(res, 404, { error: "dataset not found: " + dataset });
    return sendJSON(res, 500, { error: "dataset parse failed: " + e.message });
  }

  if (format === "json") {
    const body = JSON.stringify(data, null, 2);
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${dataset}.json"`
    });
    return res.end(body);
  }
  const lines = [CSV_COLUMNS.join(","), ...contractToCsvRows(data).map(r => r.map(csvEscape).join(","))];
  const body = "\uFEFF" + lines.join("\r\n");
  res.writeHead(200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${dataset}.csv"`
  });
  res.end(body);
}

// ---- 数据接口：/api/datasets 与 /api/result?dataset=xxx ----
function listDatasets() {
  try {
    return fs.readdirSync(DATA_DIR)
      .filter(f => f.endsWith(".json") && !f.endsWith(".check.json"))   // D5：.check.json 是方的旁路核验 sidecar，不是数据集
      .map(f => path.basename(f, ".json"));
  } catch {
    return [];
  }
}

function fetchRemote(dataset, res) {
  const url = REMOTE_API_URL + (REMOTE_API_URL.includes("?") ? "&" : "?") + "dataset=" + encodeURIComponent(dataset);
  http.get(url, upstream => {
    let buf = "";
    upstream.on("data", c => (buf += c));
    upstream.on("end", () => {
      try { sendJSON(res, upstream.statusCode || 200, toContract(JSON.parse(buf))); }   // 上游格式过桥
      catch { sendJSON(res, 502, { error: "remote response is not valid JSON" }); }
    });
  }).on("error", e => sendJSON(res, 502, { error: "remote fetch failed: " + e.message }));
}

/** 读取 mock 数据集并过桥；失败抛错（NOT_FOUND / parse error），供 result 与 export 共用。
 *  D5：同名 .check.json（方的 equity_check_D5 旁路核验报告）若存在，挂到 check_report 由转接口合并。 */
function readDataset(dataset) {
  const file = path.join(DATA_DIR, dataset + ".json");
  if (!file.startsWith(DATA_DIR) || !fs.existsSync(file)) {   // 目录逃逸防护
    const err = new Error("dataset not found: " + dataset);
    err.code = "NOT_FOUND";
    throw err;
  }
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  const checkFile = path.join(DATA_DIR, dataset + ".check.json");
  if (fs.existsSync(checkFile)) {
    try { parsed.check_report = JSON.parse(fs.readFileSync(checkFile, "utf8")); }
    catch { /* sidecar 坏了不阻塞主数据，留痕 */ parsed.check_report_error = "check sidecar parse failed"; }
  }
  return toContract(parsed);
}

// ---- D6：批量上传闭环（零依赖 multipart/form-data 解析）----
// 口径：每个文件独立入报告——坏文件（非 JSON / 缺 events / 过桥失败）也必须出现在失败列表，
// 绝不允许"坏文件从批次报告消失"（D6 复盘优先修复项 1）。
const UPLOAD_BATCH_ID = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14) + "-" + process.pid;

/** 解析 multipart/form-data 请求体 → [{ filename, data(Buffer) }]。零依赖：按 boundary 手工切分。 */
function parseMultipart(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  if (!m) { const e = new Error("multipart boundary missing"); e.code = "BAD_REQUEST"; throw e; }
  const boundary = Buffer.from("--" + (m[1] || m[2]).trim());
  const parts = [];
  let pos = buf.indexOf(boundary);
  while (pos !== -1) {
    const next = buf.indexOf(boundary, pos + boundary.length);
    if (next === -1) break;
    // part 内容：跳过 boundary 行的 \r\n，去掉结尾 \r\n
    const chunk = buf.subarray(pos + boundary.length + 2, next - 2);
    const headerEnd = chunk.indexOf("\r\n\r\n");
    if (headerEnd !== -1) {
      const headers = chunk.subarray(0, headerEnd).toString("utf8");
      const body = chunk.subarray(headerEnd + 4);
      const fn = /filename="([^"]*)"/i.exec(headers);
      if (fn) parts.push({ filename: fn[1], data: body });
    }
    pos = next;
  }
  return parts;
}

/** 文件名 → 安全数据集名：非 [a-z0-9_-] 归一为 -，与 /api/result 的名称校验对齐。 */
function safeDatasetName(filename) {
  return path.basename(filename).replace(/\.json$/i, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "upload";
}

/** 数据集名查重：data/ 下已存在则追加 -2、-3…，绝不静默覆盖既有数据集。 */
function dedupeDatasetName(base) {
  if (!fs.existsSync(path.join(DATA_DIR, base + ".json"))) return base;
  for (let i = 2; ; i++) if (!fs.existsSync(path.join(DATA_DIR, base + "-" + i + ".json"))) return base + "-" + i;
}

/** 单文件入账：校验 → 过桥 → 落 data/。返回报告条目（ok 或失败原因，二者必有其一）。 */
function processUploadFile(filename, data) {
  const entry = { filename, size: data.length, batch_id: UPLOAD_BATCH_ID, ts: new Date().toISOString() };
  try {
    if (!/\.json$/i.test(filename)) entry.error = "仅接受 .json 信封文件";
    if (!entry.error && (!data || data.length === 0)) entry.error = "空文件";
    if (!entry.error) {
      const parsed = JSON.parse(data.toString("utf8"));   // 坏 JSON 在此显式失败并进报告
      if (!Array.isArray(parsed.events)) entry.error = "缺少 events 数组（非事件信封）";
      else if (!parsed.schema_version) entry.error = "缺少 schema_version";
      if (!entry.error) {
        toContract(parsed);   // 过桥干跑：转换失败即上传失败（真实闭环的校验闸门）
        const dataset = dedupeDatasetName(safeDatasetName(filename));
        fs.writeFileSync(path.join(DATA_DIR, dataset + ".json"), JSON.stringify(parsed, null, 2) + "\n");
        entry.ok = true;
        entry.dataset = dataset;
        entry.events = parsed.events.length;
      }
    }
  } catch (e) {
    entry.error = e instanceof SyntaxError ? "JSON 解析失败：" + e.message.slice(0, 160) : String(e.message || e).slice(0, 160);
  }
  appendUploadLog(entry);
  return entry;
}

/** 上传日志：JSONL 追加（逐文件一行，含失败项），供 /api/upload/log 下载。 */
function appendUploadLog(entry) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n");
  } catch { /* 日志落盘失败不阻塞上传响应 */ }
}

function handleUpload(req, res) {
  const ct = req.headers["content-type"] || "";
  if (!/multipart\/form-data/i.test(ct)) return sendJSON(res, 400, { error: "content-type must be multipart/form-data" });
  const chunks = [];
  req.on("data", c => chunks.push(c));
  req.on("end", () => {
    let parts;
    try { parts = parseMultipart(Buffer.concat(chunks), ct); }
    catch (e) { return sendJSON(res, 400, { error: e.message }); }
    if (!parts.length) return sendJSON(res, 400, { error: "no file part in request" });
    const results = parts.map(p => processUploadFile(p.filename, p.data));   // 坏文件也进报告
    const ok = results.filter(r => r.ok).length;
    sendJSON(res, 200, {
      batch_id: UPLOAD_BATCH_ID, total: results.length, ok, failed: results.length - ok,
      log: "/api/upload/log",
      results
    });
  });
  req.on("error", () => sendJSON(res, 500, { error: "upload stream error" }));
}

/** 上传日志下载：text/plain 附件（逐行 JSONL，可直接人工排查失败原因）。 */
function handleUploadLog(res) {
  if (!fs.existsSync(LOG_FILE)) {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": 'attachment; filename="upload_log.jsonl"' });
    return res.end("(空) 尚无上传记录\n");
  }
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": 'attachment; filename="upload_log.jsonl"' });
  res.end(fs.readFileSync(LOG_FILE));
}

// ---- D8：跨文档配对视图（宗清单 × 魏B 全量报告 → 双栏分组页数据）----
// 数据放 data/pairs/ 子目录：不进数据集下拉（listDatasets 只看 data/ 顶层 .json）。
const PAIRS_DIR = path.join(DATA_DIR, "pairs");

/** case_id → 本地信封数据集名（能对上才给原文锚点；对不上只给清单元数据，不硬凑）。 */
function localEnvelopeFor(caseId) {
  let m = /^(D5-EQC|D6-AWD)-(\d{3})$/.exec(caseId);
  if (m) return "wei_real_" + (m[1] === "D5-EQC" ? "eqc" : "awd") + "_" + m[2];
  if (caseId === "D4-PLD-001") return "wei_real_PLD001_3ev";
  if (caseId === "D4-PLD-005") return "wei_real_PLD005_release";
  return null;
}

/** 本地信封代表原文锚点：第一个带 provenance.quote 的字段（双栏"原文"侧展示用）。 */
function envelopeSnippet(caseId) {
  const ds = localEnvelopeFor(caseId);
  if (!ds) return null;
  const file = path.join(DATA_DIR, ds + ".json");
  if (!fs.existsSync(file)) return { dataset: ds, quote: null };
  try {
    const env = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const ev of env.events || []) {
      for (const [fname, f] of Object.entries(ev.fields || {})) {
        const p = (f.provenance || []).find(x => x.quote);
        if (p) return { dataset: ds, event_id: ev.event_id, field: fname, quote: p.quote, page: p.page ?? null, block_id: p.block_id ?? null };
      }
    }
    return { dataset: ds, quote: null };
  } catch {
    return { dataset: ds, quote: null, error: "local envelope parse failed" };
  }
}

function handlePairs(res) {
  const mf = path.join(PAIRS_DIR, "pairs_manifest.json");
  if (!fs.existsSync(mf)) return sendJSON(res, 404, { error: "配对清单缺失（data/pairs/pairs_manifest.json）" });
  try {
    const man = JSON.parse(fs.readFileSync(mf, "utf8"));
    const rptFile = path.join(PAIRS_DIR, "b_report.json");
    const rpt = fs.existsSync(rptFile) ? JSON.parse(fs.readFileSync(rptFile, "utf8")) : null;
    const byId = new Map(((rpt && rpt.results) || []).map(r => [r.group_id, r]));
    const groups = man.groups.map(g => ({
      group_id: g.group_id,
      expected_relation: g.expected_relation,
      test_purpose: g.test_purpose || null,
      relation_basis: g.relation_basis || null,
      members: (g.members || []).map(cid => {
        const meta = (g.member_meta || []).find(x => x.case_id === cid) || {};
        const hash = (g.member_hashes || []).find(x => x.case_id === cid) || {};
        return {
          case_id: cid,
          issuer_name: meta.issuer_name || null,
          issuer_code: meta.issuer_code || null,                 // 质疑①：双侧证券代码必须上屏
          notice_number: meta.notice_number ?? null,             // 质疑①：双侧公告编号必须上屏（null 也要显式显示）
          referenced_notice_numbers: meta.referenced_notice_numbers || [],
          notice_note: meta.notice_note || null,
          raw_sha256: hash.raw_sha256 || meta.raw_sha256 || null,
          gold_sha256: hash.gold_sha256 || meta.gold_sha256 || null,
          local: envelopeSnippet(cid)
        };
      }),
      b: (() => {
        const r = byId.get(g.group_id);
        if (!r) return null;
        const cons = r.consistency || {};
        return {
          predicted_relation: r.predicted_relation,              // 质疑②：unknown → "证据不足"，绝非"不同事件"
          reasons: r.reasons || [],
          fields_excluded: r.fields_excluded || [],
          a_run_links: r.a_run_links || [],
          conflicts_total: Array.isArray(cons.conflicts) ? cons.conflicts.length : (typeof cons.conflicts_total === "number" ? cons.conflicts_total : null),
          corroborations_total: Array.isArray(cons.corroborations) ? cons.corroborations.length : null
        };
      })()
    }));
    sendJSON(res, 200, {
      sealed_set_id: man.sealed_set_id,
      corpus: man.corpus,
      corpus_ceiling: man.corpus_ceiling,                        // 诚实边界：同事件上界 4，据实交付不凑 6
      total: groups.length,
      summary: rpt ? {
        b_run: rpt.b_run, checked_on: rpt.checked_on,
        groups_total: rpt.groups_total, groups_checked: rpt.groups_checked,
        related_hit: rpt.related_hit, unrelated_clean: rpt.unrelated_clean,
        insufficient_signalled: rpt.insufficient_signalled
      } : null,
      groups
    });
  } catch (e) {
    sendJSON(res, 500, { error: "配对数据装配失败: " + e.message });
  }
}

// ---- D9：核验清单（先归因再判矛盾）+ 双侧证据视图 ----
// 归因文案来源：方 equity_check_D5 sidecar 的 findings[].message（与方核对的文案，原样上屏不改写）。
// 出处来源：对应数据集信封的字段级 provenance（与张核对的出处：quote+页码+block_id）。
const SEVERITY_ORDER = { conflict: 0, error: 1, review: 2, info: 3 };

/** 信封 + 事件号 + 字段名 → 代表出处（第一条带 quote 的 provenance）。 */
function provenanceOf(env, eventId, fieldName) {
  for (const ev of env.events || []) {
    if (eventId && ev.event_id !== eventId) continue;
    const f = (ev.fields || {})[fieldName];
    if (!f) continue;
    const p = (f.provenance || []).find(x => x.quote);
    if (p) return { field: fieldName, quote: p.quote, page: p.page ?? null, block_id: p.block_id ?? null, source_type: p.source_type ?? null };
  }
  return null;
}

/** 单个 sidecar → 核验清单条目（出处富化）。 */
function verifyFindingsOf(dataset, check) {
  const file = path.join(DATA_DIR, dataset + ".json");
  const out = [];
  let env = null;
  try { if (fs.existsSync(file)) env = JSON.parse(fs.readFileSync(file, "utf8")); } catch { env = null; }
  const push = (ev, f) => {
    const item = {
      dataset,
      event_id: (ev && ev.event_id) || null,
      holder: (ev && ev.holder) || null,
      code: f.code,
      severity: f.severity || "review",
      message: f.message || "",                    // 先归因：方的解释文案
      fields: f.fields || [],
      provenance: null                             // 后出处：张的 provenance
    };
    if (env) {
      for (const fn of item.fields) {
        const p = provenanceOf(env, item.event_id, fn);
        if (p) { item.provenance = p; break; }
      }
    }
    out.push(item);
  };
  for (const f of check.findings || []) push(null, f);               // 数据集级发现
  for (const ev of check.events || []) for (const f of ev.findings || []) push(ev, f);
  return out;
}

function handleVerify(res) {
  try {
    // ① 核验清单：扫全部 sidecar（坏 sidecar 计数不阻塞）
    const findings = [];
    const stats = { datasets_checked: 0, sidecar_errors: 0, by_severity: { conflict: 0, error: 0, review: 0, info: 0 }, verified_events: 0, review_events: 0 };
    for (const f of fs.readdirSync(DATA_DIR)) {
      if (!f.endsWith(".check.json")) continue;
      const dataset = path.basename(f, ".check.json");
      try {
        const check = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf8"));
        stats.datasets_checked++;
        const items = verifyFindingsOf(dataset, check);
        for (const it of items) stats.by_severity[it.severity] = (stats.by_severity[it.severity] || 0) + 1;
        for (const ev of check.events || []) (ev.status === "verified" ? stats.verified_events++ : stats.review_events++);
        findings.push(...items);
      } catch { stats.sidecar_errors++; }
    }
    findings.sort((a, b) =>
      ((SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)) ||
      a.dataset.localeCompare(b.dataset) || String(a.event_id).localeCompare(String(b.event_id)));

    // ② 双侧证据：B 报告互证点（docs/quotes 双侧并排 + 本地页码富化）
    const pairs = [];
    const rptFile = path.join(PAIRS_DIR, "b_report.json");
    if (fs.existsSync(rptFile)) {
      const rpt = JSON.parse(fs.readFileSync(rptFile, "utf8"));
      for (const r of rpt.results || []) {
        const cons = r.consistency || {};
        const localOf = cid => {
          const ds = localEnvelopeFor(cid);
          return ds || null;
        };
        pairs.push({
          group_id: r.group_id,
          predicted_relation: r.predicted_relation,
          corroborations: (cons.corroborations || []).map(c => ({
            ...c,                                        // 整条透传：simple（docs/quotes）与 group_total_matches_sum（aggregate/parts）两种形态都保留
            pages: (c.docs || []).map(d => {
              const ds = localOf(d);
              if (!ds) return null;
              const file2 = path.join(DATA_DIR, ds + ".json");
              if (!fs.existsSync(file2)) return null;
              try {
                const env = JSON.parse(fs.readFileSync(file2, "utf8"));
                // 找该实体该字段：holder=entity 且字段名匹配
                for (const ev of env.events || []) {
                  const holder = (ev.fields || {}).holder;
                  if (holder && String(holder.value ?? holder.raw_value ?? "") !== String(c.entity)) continue;
                  const p = provenanceOf(env, ev.event_id, c.field);
                  if (p) return { dataset: ds, page: p.page, block_id: p.block_id };
                }
                return null;
              } catch { return null; }
            })
          })),
          conflicts: cons.conflicts || []
        });
      }
    }
    const corroborationTotal = pairs.reduce((n, p) => n + p.corroborations.length, 0);
    const conflictTotal = pairs.reduce((n, p) => n + (Array.isArray(p.conflicts) ? p.conflicts.length : 0), 0);
    sendJSON(res, 200, {
      summary: { ...stats, corroboration_total: corroborationTotal, pair_conflict_total: conflictTotal },
      findings,
      pairs
    });
  } catch (e) {
    sendJSON(res, 500, { error: "核验清单装配失败: " + e.message });
  }
}

// ---- D10：多公告集成视图 ----
// 四份队友产物在服务端合并（页面零改动即可换数据源）：
//   integration_cases.json  宗：10 组案例 + expected（预期口径）
//   integration_bundle.json 魏：同 10 组的实判 records / diff_list / report / cache
//   cache_evidence.json     魏：缓存三态实测（冷启 → 重放 → 清缓存重跑）
//   chain_check.json        张：出处链四段检查 + 同名串证据（重复文字组）风险量化
function readD10(name) {
  const f = path.join(D10_DIR, name);
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; }
}

// 宗 expected 是自然语言（"related + 互证9 + 合计勾稽" / "explainable_difference，不判矛盾"），
// 页面要并排显示"预期原文"，同时抽出三态词做徽章比对；抽不出就如实留空，不猜。
function expectedRelationOf(text) {
  const s = String(text || "");
  if (s.includes("unrelated")) return "unrelated";
  if (s.includes("related")) return "related";
  if (s.includes("unknown") || s.includes("insufficient")) return "unknown";
  if (s.includes("explainable_difference")) return "unrelated";  // 判"不矛盾"，落在不同事件侧
  return null;
}

/** 方 D10 报告 → 页面摘要（五段 + 逐成员缓存核对 + 链路 trace）。
 *  只做字段裁剪，不改口径：requires_review / boundary_details 原样透传，页面据此提示复核与边界。 */
function summarizeFang(r) {
  if (!r) return null;
  const rep = r.report || {};
  const d = rep.diffs || {};
  return {
    run_id: r.run_id || null,
    b_run_id: r.b_run_id || null,
    code_version: r.code_version || null,
    schema_version: r.schema_version || null,
    status: r.status || null,
    requires_review: r.requires_review === true,
    relation_label: d.relation_label || null,
    relation: d.relation || null,
    upstream_counts: d.upstream_counts || null,
    diff_item_count: (d.items || []).length,
    diff_items: (d.items || []).map(it => ({
      diff_id: it.diff_id,
      kind: it.kind,
      verdict: it.verdict,
      fields: it.fields || [],
      members: it.members || [],
      attribution_id: it.attribution_id || null,
      calculation_ids: it.calculation_ids || [],
      comparison_performed: it.comparison_performed === true,
      requires_review: it.requires_review === true,
      observations: (it.observations || []).map(o => ({ member_id: o.member_id, entity: o.entity, field: o.field, value: o.value, unit: o.unit || null }))
    })),
    calculations: (rep.calculations || []).map(c => ({
      calculation_id: c.calculation_id,
      operation: c.operation,
      operands: (c.operands || []).map(o => ({ entity: o.entity, value: o.value })),
      result: c.result,
      unit: c.unit || null,
      status: c.status,
      attribution_id: c.attribution_id || null
    })),
    calculation_summary: rep.calculation_summary || null,
    boundaries: rep.boundaries || [],
    boundary_details: (rep.boundary_details || []).map(b => ({ code: b.code, status: b.status, message: b.message, members: b.members || [] })),
    evidence_count: (rep.evidence || []).length,
    cache_check: (r.cache_check || []).map(c => ({
      member_id: c.member_id,
      replay_business_fields_identical: c.replay_business_fields_identical === true,
      changed_business_fields: c.changed_business_fields || [],
      cold_rerun_business_identical: c.cold_rerun_business_identical === true,
      rerun_to_replay_business_identical: c.rerun_to_replay_business_identical === true,
      new_rerun_run_id: c.new_rerun_run_id === true,
      cache_hit_log_verified: c.cache_hit_log_verified === true
    })),
    trace: rep.trace || null
  };
}

const D10_REQUIRED = [  ["input_sha256[]", r => Array.isArray(r.input_sha256) && r.input_sha256.length > 0 && r.input_sha256.length === r.records.length],
  ["run_id", r => !!r.run_id],
  ["code_version", r => !!r.code_version],
  ["schema_version", r => !!r.schema_version],
  ["records", r => Array.isArray(r.records) && r.records.length > 0],
  ["diff_list", r => Array.isArray(r.diff_list)],
  ["report{events,diffs,attribution,boundaries}", r => !!(r.report && r.report.events && r.report.diffs && r.report.attribution && r.report.boundaries)]
];

function handleIntegration(res) {
  try {
    const casesDoc = readD10("integration_cases.json");
    const bundle = readD10("integration_bundle.json");
    const cacheEv = readD10("cache_evidence.json");
    const chain = readD10("chain_check.json");
    const fang = readD10("fang_report_bundle.json");          // 方 D10：核验报告五段（含"计算"段与逐成员缓存核对）
    if (!casesDoc || !bundle) {
      return sendJSON(res, 503, { error: "D10 数据缺失：需要 data/d10/integration_cases.json（宗）与 data/d10/integration_bundle.json（魏）" });
    }

    const chainByCase = new Map((chain && chain.cases || []).map(c => [c.case_id, c]));
    const expByCase = new Map((casesDoc.cases || []).map(c => [c.case_id, c]));
    const fangByCase = new Map(((fang && fang.results) || []).map(r => [r.case_id, r]));

    const cases = (bundle.results || []).map(r => {
      const exp = expByCase.get(r.case_id) || {};
      const cc = chainByCase.get(r.case_id) || null;
      const diffs = (r.report && r.report.diffs) || {};
      const actual = diffs.relation || null;
      const expected = expectedRelationOf(exp.expected);
      const chainOf = id => (cc && (cc.chains || []).find(c => c.case_id === id)) || null;

      return {
        case_id: r.case_id,
        title: r.title || (exp.title || ""),
        purpose: exp.purpose || "",
        members_expected: exp.members || [],
        expected_text: exp.expected || "",
        expected_relation: expected,
        actual_relation: actual,
        relation_match: expected && actual ? expected === actual : null,   // 抽不出预期时留 null，不假装一致
        required_check: D10_REQUIRED.map(([name, fn]) => ({ name, ok: !!fn(r) })),
        members: (r.records || []).map(m => {
          const ch = chainOf(m.case_id);
          const checks = (ch && ch.checks) || null;
          const groups = (ch && ch.duplicate_text_groups) || [];
          const sorted = groups.slice().sort((a, b) => (b.n_blocks - a.n_blocks) || ((b.pages || []).length - (a.pages || []).length));
          return {
            case_id: m.case_id,
            file_sha256: m.file_sha256 || null,
            sha12: (m.file_sha256 || "").slice(0, 12),
            run_id: m.run_id || null,
            is_mock: m.is_mock,
            events: m.events != null ? m.events : null,
            envelope_found: m.envelope_found !== false,
            cache: m.cache || null,
            chain: checks ? {
              file_hash_matches_actual: !!checks.file_hash_matches_actual,
              doc_id_matches_hash: !!checks.doc_id_matches_hash,
              page_consistent: !!checks.page_consistent,
              region_valid: !!checks.region_valid,
              text_raw_present: !!checks.text_raw_present,
              declared_file_id: checks.declared_file_id || null,
              doc_id_expected: checks.doc_id_expected || null,
              duplicate_groups: groups.length,
              cross_page_groups: groups.filter(g => g.cross_page).length,
              duplicate_top: sorted.slice(0, 3).map(g => ({
                text: g.text, n_blocks: g.n_blocks, pages: g.pages || [], cross_page: !!g.cross_page
              }))
            } : null
          };
        }),
        diffs: {
          conflicts: diffs.conflicts != null ? diffs.conflicts : null,
          corroborations: diffs.corroborations != null ? diffs.corroborations : null,
          complementaries: diffs.complementaries != null ? diffs.complementaries : null,
          relation: actual
        },
        attribution: (r.report && r.report.attribution) || null,
        boundaries: (r.report && r.report.boundaries) || [],
        diff_list: r.diff_list || [],
        cache: r.cache || {},
        chain_aligned: cc ? (cc.input_sha256_aligned_with_members !== false) : null,
        chain_present: !!cc,
        // 张侧声明缺失的解析包（≠ 链检失败，是覆盖不全；页面必须区分这两件事）
        chain_missing: ((chain && chain.missing) || []).filter(m => m.case_id === r.case_id),
        // 方 D10 报告（事件/差异/归因/计算/边界 五段 + 逐成员缓存核对），只取页面要显示的摘要字段
        fang: summarizeFang(fangByCase.get(r.case_id))
      };
    });

    const relationCounts = { related: 0, unrelated: 0, unknown: 0 };
    for (const c of cases) if (c.actual_relation && relationCounts[c.actual_relation] != null) relationCounts[c.actual_relation]++;
    const matched = cases.filter(c => c.relation_match === true).length;
    const unverifiable = cases.filter(c => c.relation_match == null).length;
    const requiredFailed = cases.reduce((n, c) => n + c.required_check.filter(x => !x.ok).length, 0);

    sendJSON(res, 200, {
      meta: {
        goal: casesDoc.goal || "",
        total: casesDoc.total || cases.length,
        required_per_case: casesDoc.required_per_case || [],
        cache_tests: casesDoc.cache_tests || [],
        built_at: bundle.built_at || null,
        built_by: bundle.built_by || null,
        code_version: bundle.code_version || null,
        cache_definitions: bundle.cache_definitions || {},
        chain_schema: (chain && chain.schema) || null,
        chain_purpose: (chain && chain.purpose) || null,
        chain_note: (chain && chain.note) || null
      },
      summary: {
        cases: cases.length,
        relation_counts: relationCounts,
        expected_match: matched,
        expected_unverifiable: unverifiable,
        required_failed: requiredFailed,
        conflicts_total: cases.reduce((n, c) => n + (c.diffs.conflicts || 0), 0),
        corroborations_total: cases.reduce((n, c) => n + (c.diffs.corroborations || 0), 0),
        complementaries_total: cases.reduce((n, c) => n + (c.diffs.complementaries || 0), 0),
        cache: cacheEv || null,
        chain_summary: (chain && chain.summary) || null,
        chain_missing: (chain && chain.missing) || [],
        // 方报告侧口径：requires_review 逐组统计（宗 --strict 只校验必填完整性，不覆盖内容复核，故两者并列不合并）
        fang: fang ? {
          code_version: fang.code_version,
          schema_version: fang.schema_version,
          run_id: fang.run_id,
          b_run_id: fang.b_run_id || null,
          built_at: fang.built_at,
          data_mode: fang.data_mode,
          source_versions: fang.source_versions || null,
          present_cases: cases.filter(c => c.fang).length,
          requires_review_cases: cases.filter(c => c.fang && c.fang.requires_review).map(c => c.case_id),
          diff_items_total: cases.reduce((n, c) => n + (c.fang ? c.fang.diff_item_count : 0), 0),
          calculations_total: cases.reduce((n, c) => n + (c.fang ? c.fang.calculations.length : 0), 0),
          boundaries_total: cases.reduce((n, c) => n + (c.fang ? c.fang.boundaries.length : 0), 0),
          // 直接约束页面口径的边界声明（如"陈实际 Web/CLI 同次一致性未在本次独立验证"）
          cache_runtime_boundary: Array.from(new Set(
            cases.flatMap(c => (c.fang ? c.fang.boundary_details : []))
              .filter(b => b.code === "CACHE_RUNTIME_NOT_REEXECUTED")
              .map(b => b.message)
          ))
        } : null
      },
      cases
    });
  } catch (e) {
    sendJSON(res, 500, { error: "D10 集成装配失败: " + e.message });
  }
}

function handleApi(req, res, urlObj) {
  if (urlObj.pathname === "/api/datasets") {
    return sendJSON(res, 200, { source: DATA_SOURCE, datasets: listDatasets() });
  }
  if (urlObj.pathname === "/api/result") {
    const dataset = urlObj.searchParams.get("dataset") || "pledge";
    if (!/^[a-z0-9_-]+$/i.test(dataset)) {
      return sendJSON(res, 400, { error: "invalid dataset name" });
    }
    if (DATA_SOURCE === "remote") return fetchRemote(dataset, res);
    try {
      return sendJSON(res, 200, readDataset(dataset));   // mock 也过桥（上游格式数据集自动转换）
    } catch (e) {
      if (e.code === "NOT_FOUND") return sendJSON(res, 404, { error: e.message });
      return sendJSON(res, 500, { error: "dataset parse failed: " + e.message });
    }
  }
  if (urlObj.pathname === "/api/export") {
    return handleExport(res, urlObj, readDataset);   // D3：导出当前数据集为 JSON/CSV（与页面同源同桥）
  }
  if (urlObj.pathname === "/api/upload" && req.method === "POST") {
    return handleUpload(req, res);                   // D6：批量上传（坏文件进失败列表，不消失）
  }
  if (urlObj.pathname === "/api/upload/log") {
    return handleUploadLog(res);                     // D6：上传日志下载
  }
  if (urlObj.pathname === "/api/pairs") {
    return handlePairs(res);                         // D8：跨文档配对（三态渲染 + 双侧 issuer/notice）
  }
  if (urlObj.pathname === "/api/verify") {
    return handleVerify(res);                        // D9：核验清单（先归因）+ 双侧证据视图
  }
  if (urlObj.pathname === "/api/integration") {
    return handleIntegration(res);                   // D10：多公告集成（10 组）+ 缓存三态 + 出处链
  }
  if (urlObj.pathname === "/api/metrics") {
    return handleMetrics(res);                       // D11：真实结果统计（图表页数据源，实算不估算）
  }
  sendJSON(res, 404, { error: "unknown api" });
}

// ---- 静态资源 ----
function handleStatic(res, urlObj) {
  let rel = decodeURIComponent(urlObj.pathname);
  if (rel === "/" || rel === "") rel = "/index.html";
  const file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("404 Not Found");
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
  res.end(fs.readFileSync(file));
}

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, "http://127.0.0.1");
  if (urlObj.pathname.startsWith("/api/")) return handleApi(req, res, urlObj);
  return handleStatic(res, urlObj);
});

server.listen(PORT, "127.0.0.1", () => {
  const openDemo = process.argv.includes("--open-demo");
  console.log(`[cjh-page-prototype] http://127.0.0.1:${PORT}${openDemo ? "/demo.html" : "/"}`);
  console.log(`[cjh-page-prototype] 数据源: ${DATA_SOURCE}${DATA_SOURCE === "remote" ? ` → ${REMOTE_API_URL}` : " → data/*.json（模拟）"}`);
  console.log(`[cjh-page-prototype] 数据集: ${listDatasets().join(", ") || "（空）"}`);
});
