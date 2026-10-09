// extractor.js —— 抽取引擎适配层（D12 预留入口）
//
// 为什么有这个文件：
//   D10 的`web_cli_same_result` 被判"未覆盖"，根本原因是页面侧**没有独立跑抽取的能力**——
//   server.js 只做 readFileSync + JSON.parse，消不掉的对比维度。两��边读同一文件，
//   验的只是"读同一文件的两个消费者行为是否一致"（幂等性），不是 Web/CLI 一致性。
//
// 本层做的事：把「数据从哪来」抽象成 provider，页面/接口只认`extract(caseId)`。
//   file  —— 读 data/<case>.json 预生成信封（当前唯一可用，**不是独立抽取**）
//   cli   —— 预留：spawn 魏文宇的抽取 CLI（EXTRACT_CLI_CMD / EXTRACT_CLI_PDF_DIR）
//   http  —— 预留：HTTP 调魏的抽取服务（EXTRACT_HTTP_URL）
//
// ★ 铁律（写死在这里，不允许后来者绕过）：
//   ① `parity()` 在两侧都是 prebuilt（同源文件）时**必须返回 verdict="not_covered"**，
//      不允许返回 pass。这是 D10 那条造假的根因，不封死就会再犯。
//   ② provider 的`capabilities.reruns_extraction` 必须诚实。file 是 false，
//      页面与成绩单都据此显示"未覆盖"，不允许把它渲染成"一致 ✔"。
//   ③ 未配置的 provider 一律 available()=false 并给出可执行原因，**不静默回落到 file**
//      —— 静默回落就是"假装跑过"，是 D10 已犯过的错。
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { toContract } = require("./upstream_bridge.js");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");

// ---- provider 能力画像（诚实声明，页面据此渲染）----
const CAPS = {
  prebuilt: { reruns_extraction: false, needs_pdf: false, same_file_as_peer: true,  label: "预生成信封（未重新抽取）" },
  live:     { reruns_extraction: true,  needs_pdf: true,  same_file_as_peer: false, label: "独立跑抽取管线" }
};

// ============================================================
// provider: file —— 读本地预生成信封（当前唯一可用）
// ============================================================
const fileProvider = {
  id: "file",
  label: "本地预生成信封",
  owner: "陈家浩（页面侧）",
  kind: "prebuilt",
  caps: CAPS.prebuilt,

  available() {
    return { ok: true, reason: "data/ 目录常驻可用" };
  },

  list() {
    try {
      return fs.readdirSync(DATA_DIR)
        .filter(f => f.endsWith(".json") && !f.endsWith(".check.json") && f !== "upstream_case.json")
        .map(f => path.basename(f, ".json"))
        .sort();
    } catch { return []; }
  },

  /** @returns {{ok:true, envelope:object, run_meta:object}} */
  run(caseId) {
    const safe = String(caseId);
    if (!/^[A-Za-z0-9_-]+$/.test(safe)) {
      return { ok: false, reason: "数据集名含非法字符（仅允许字母数字下划线连字符）" };
    }
    const file = path.join(DATA_DIR, safe + ".json");
    if (!file.startsWith(DATA_DIR) || !fs.existsSync(file)) {
      return { ok: false, reason: `本地无此信封：data/${safe}.json` };
    }
    let raw;
    try { raw = JSON.parse(fs.readFileSync(file, "utf8")); }
    catch (e) { return { ok: false, reason: "信封解析失败：" + e.message }; }

    // 方核验 sidecar：随数据集走，缺失不报错（D6 起沿用的口径）
    const checkFile = path.join(DATA_DIR, safe + ".check.json");
    if (fs.existsSync(checkFile)) {
      try { raw.check_report = JSON.parse(fs.readFileSync(checkFile, "utf8")); }
      catch { raw.check_report_error = "check sidecar parse failed"; }
    }
    return {
      ok: true,
      envelope: raw,
      run_meta: {
        engine: "file",
        engine_owner: this.owner,
        reruns_extraction: false,
        source_path: path.relative(ROOT, file),
        code_version: (raw.run_meta && raw.run_meta.code_version) || raw.code_version || null,
        upstream_run_id: raw.run_id || null
      }
    };
  }
};

// ============================================================
// provider: cli —— 预留：接魏文宇的抽取 CLI（真正独立跑一次）
// 约定（需与魏对齐后固化）：
//   EXTRACT_CLI_CMD      形如 `node scripts/jingguan/extract.mjs`
//   EXTRACT_CLI_PDF_DIR  原始 PDF 所在目录（页面侧当前没有 PDF，必须由魏提供）
//   调用：spawn(CMD, [...args], { env: { ...process.env, CASE_ID, PDF_PATH } })
//   期望：stdout 输出一个信封 JSON（与 file provider 同构），exit=0
// ============================================================

/** 命令字符串 → [可执行, ...args]。
 *  spawnSync 不经过 shell，`"node demo/x.js"` 会被当成单个文件名而 ENOENT，必须先拆。
 *  只按空白拆分（不处理引号）—— 抽取命令不含带空格的参数，够用且不引shell 注入面。 */
function splitCommand(cmd) {
  const parts = String(cmd).trim().split(/\s+/).filter(Boolean);
  return [parts[0] || "node", ...parts.slice(1)];
}

const cliProvider = {
  id: "cli",
  label: "魏文宇抽取 CLI（预留）",
  owner: "魏文宇（需提供可被页面调用的 CLI 抽取入口 + 原始 PDF）",
  kind: "live",
  caps: CAPS.live,

  available() {
    const cmd = process.env.EXTRACT_CLI_CMD;
    const pdfDir = process.env.EXTRACT_CLI_PDF_DIR;
    const missing = [];
    if (!cmd) missing.push("EXTRACT_CLI_CMD（未设抽取命令）");
    if (!pdfDir) missing.push("EXTRACT_CLI_PDF_DIR（未设原始 PDF 目录 —— 页面侧目前没有 PDF）");
    if (!pdfDir || !fs.existsSync(pdfDir)) missing.push(`PDF 目录不存在：${pdfDir || "(未设)"}`);
    return missing.length
      ? { ok: false, reason: "入口未接通：" + missing.join("；") }
      : { ok: true, reason: `已接通：${cmd}｜PDF 目录 ${pdfDir}` };
  },

  list() { return []; },   // 由魏的 CLI 自行枚举，页面侧不猜

  run(caseId) {
    const av = this.available();
    if (!av.ok) return { ok: false, reason: av.reason };

    const cmd = process.env.EXTRACT_CLI_CMD;
    const pdfDir = process.env.EXTRACT_CLI_PDF_DIR;
    const pdf = path.join(pdfDir, caseId + ".pdf");
    if (!fs.existsSync(pdf)) {
      return { ok: false, reason: `PDF 目录内无 ${caseId}.pdf —— 页面侧无法自行解析原始 PDF` };
    }

    const [exe, ...args] = splitCommand(cmd);
    const r = spawnSync(exe, args, {
      env: { ...process.env, CASE_ID: caseId, PDF_PATH: pdf },
      encoding: "utf8",
      timeout: Number(process.env.EXTRACT_CLI_TIMEOUT || 120000),
      maxBuffer: 64 * 1024 * 1024
    });
    if (r.error) return { ok: false, reason: "CLI 调用失败：" + r.error.message };
    if (r.status !== 0) {
      return { ok: false, reason: `CLI exit=${r.status}：${String(r.stderr || "").slice(0, 300)}` };
    }
    let raw;
    try { raw = JSON.parse(r.stdout); }
    catch (e) { return { ok: false, reason: "CLI stdout 非合法 JSON：" + e.message }; };

    return {
      ok: true,
      envelope: raw,
      run_meta: {
        engine: "cli",
        engine_owner: this.owner,
        reruns_extraction: true,
        source_path: pdf,
        code_version: (raw.run_meta && raw.run_meta.code_version) || raw.code_version || null,
        upstream_run_id: raw.run_id || null,
        cli_stderr: String(r.stderr || "").slice(0, 500) || null
      }
    };
  }
};

// ============================================================
// provider: http —— 预留：HTTP 调魏的抽取服务
//   EXTRACT_HTTP_URL  形如 `http://127.0.0.1:8800/extract`
//   调用：GET <URL>?case_id=xxx   期望返回信封 JSON
// ============================================================
const httpProvider = {
  id: "http",
  label: "魏文宇抽取服务（预留）",
  owner: "魏文宇（需提供 HTTP 抽取接口）",
  kind: "live",
  caps: CAPS.live,

  available() {
    const url = process.env.EXTRACT_HTTP_URL;
    return url
      ? { ok: true, reason: `已接通：${url}` }
      : { ok: false, reason: "入口未接通：EXTRACT_HTTP_URL（未设上游抽取服务地址）" };
  },

  list() { return []; },

  async run(caseId) {
    const av = this.available();
    if (!av.ok) return { ok: false, reason: av.reason };
    const base = process.env.EXTRACT_HTTP_URL;
    const url = base + (base.includes("?") ? "&" : "?") + "case_id=" + encodeURIComponent(caseId);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Number(process.env.EXTRACT_HTTP_TIMEOUT || 120000));
    let res, text;
    try {
      res = await fetch(url, { signal: ctrl.signal });
      text = await res.text();
    } catch (e) {
      return { ok: false, reason: "上游抽取服务不可达：" + e.message };
    } finally { clearTimeout(timer); }

    if (!res.ok) return { ok: false, reason: `上游 HTTP ${res.status}：${text.slice(0, 200)}` };
    let raw;
    try { raw = JSON.parse(text); }
    catch (e) { return { ok: false, reason: "上游返回非合法 JSON：" + e.message }; }

    return {
      ok: true,
      envelope: raw,
      run_meta: {
        engine: "http",
        engine_owner: this.owner,
        reruns_extraction: true,
        source_path: url,
        code_version: (raw.run_meta && raw.run_meta.code_version) || raw.code_version || null,
        upstream_run_id: raw.run_id || null
      }
    };
  }
};

const PROVIDERS = { file: fileProvider, cli: cliProvider, http: httpProvider };

// ============================================================
// 统一入口
// ============================================================

/** 引擎清单（页面与 /api/engines 用；诚实暴露可用性，不粉饰） */
function describeEngines() {
  return Object.values(PROVIDERS).map(p => {
    const av = p.available();
    return {
      id: p.id, label: p.label, owner: p.owner, kind: p.kind,
      available: av.ok, reason: av.reason, caps: p.caps
    };
  });
}

function defaultEngine() {
  const live = Object.values(PROVIDERS).filter(p => p.kind === "live" && p.available().ok);
  if (live.length) return live[0].id;
  return "file";
}

/**
 * 抽取一个 case 的信封（过桥到契约 v0.3）。
 * @returns {{ok:true, data:object, engine:string, run_meta:object} | {ok:false, reason:string, engine:string}}
 */
async function extract(caseId, engineId) {
  const p = PROVIDERS[engineId || defaultEngine()];
  if (!p) return { ok: false, engine: engineId || null, reason: `未知引擎：${engineId}` };
  const av = p.available();
  if (!av.ok) return { ok: false, engine: p.id, reason: av.reason };

  const r = await p.run(caseId);
  if (!r.ok) return { ok: false, engine: p.id, reason: r.reason };
  return {
    ok: true, engine: p.id, data: toContract(r.envelope),
    run_meta: Object.assign({ contract_version: "0.3" }, r.run_meta)
  };
}

// ============================================================
// Web/CLI 对照（D10 那条的真实实现）
// ============================================================

/** 业务键（★不能用 event_id / 序号 —— 信封与 Gold 两侧事件编排独立，按 ID 配对必假失配） */
function evKey(ev) {
  const f = ev.fields || {};
  const g = n => { const v = f[n]; return v == null ? "" : String(v.value ?? v.raw_value ?? ""); };
  if (ev.event_type === "pledge") return `pledge|${g("pledgor")}|${g("pledgee")}|${g("direction")}`;
  if (ev.event_type === "equity_change") return `equity_change|${g("holder")}|${g("direction")}`;
  return `award_contract|${g("bidder")}|${g("project_name")}`;
}

function fieldRows(envelope) {
  const rows = new Map();          // evKey → { field → {status, value} }
  for (const ev of envelope.events || []) {
    const k = evKey(ev);
    if (!rows.has(k)) rows.set(k, {});
    const bucket = rows.get(k);
    for (const [n, fv] of Object.entries(ev.fields || {})) {
      bucket[n] = { status: fv.status, value: fv.raw_value ?? fv.value ?? null };
    }
  }
  return rows;
}

/** 逐字段比对两个信封。返回 {pairs, only_a, only_b, same, diff[], compared} */
function diffEnvelopes(a, b) {
  const A = fieldRows(a), B = fieldRows(b);
  const keys = new Set([...A.keys(), ...B.keys()]);
  const out = { pairs: 0, only_a: [], only_b: [], same: 0, compared: 0, diff: [] };
  for (const k of keys) {
    if (!B.has(k)) { out.only_a.push(k); continue; }
    if (!A.has(k)) { out.only_b.push(k); continue; }
    out.pairs++;
    const fa = A.get(k), fb = B.get(k);
    const names = new Set([...Object.keys(fa), ...Object.keys(fb)]);
    for (const n of names) {
      out.compared++;
      const x = fa[n], y = fb[n];
      if (!x || !y) { out.diff.push({ ev: k, field: n, a: x ? x.status : "(缺)", b: y ? y.status : "(缺)", kind: "presence" }); continue; }
      if (x.status !== y.status) { out.diff.push({ ev: k, field: n, a: x.status, b: y.status, kind: "status" }); continue; }
      const sameVal = JSON.stringify(x.value) === JSON.stringify(y.value);
      if (sameVal) out.same++;
      else out.diff.push({ ev: k, field: n, a: x.value, b: y.value, kind: "value" });
    }
  }
  return out;
}

/**
 * ★ Web/CLI 对照。**同源即拒判**。
 * @returns {{verdict:"pass"|"mismatch"|"not_covered", ...}}
 *   not_covered —— 两侧都是预生成信封（同一文件/同一抽取批），不构成对照，按 D10 决议标未覆盖。
 */
async function parity(caseIds, opts) {
  const aEngine = (opts && opts.a) || "file";
  const bEngine = (opts && opts.b) || "cli";

  const A = PROVIDERS[aEngine], B = PROVIDERS[bEngine];
  if (!A || !B) return { verdict: "not_covered", reason: `未知引擎：${!A ? aEngine : bEngine}` };

  const avA = A.available(), avB = B.available();
  if (!avA.ok || !avB.ok) {
    return {
      verdict: "not_covered",
      reason: "对照所需引擎未全部接通",
      blockers: [!avA.ok ? { engine: aEngine, reason: avA.reason } : null, !avB.ok ? { engine: bEngine, reason: avB.reason } : null].filter(Boolean),
      remedy: "需魏文宇提供可被页面调用的抽取入口（CLI 或 HTTP）+ 原始 PDF；页面侧随后仅需设环境变量 EXTRACT_CLI_CMD / EXTRACT_CLI_PDF_DIR"
    };
  }

  // ★ 同源拒判：两侧都声明 same_file_as_peer ⇒ 测的是幂等性不是一致性
  if (A.caps.same_file_as_peer && B.caps.same_file_as_peer) {
    return {
      verdict: "not_covered",
      reason: "两侧均为预生成信封（同一次运行的同一文件），只验到「读同一文件的两个消费者行为一致」＝幂等性，未验抽取一致性",
      same_source: true,
      remedy: "至少一侧须为 live 引擎（reruns_extraction=true）"
    };
  }
  if (A.caps.same_file_as_peer && A.id === B.id) {
    return { verdict: "not_covered", reason: "两侧是同一个引擎", same_source: true };
  }

  // ★ 显式区分「未传」与「传了空列表」：
  //   undefined → 取引擎自带清单（正常全量）
  //   []        → 调用方明确表示无对照对象，必须判 not_covered，不能静默展开成全量跑
  if (Array.isArray(caseIds) && caseIds.length === 0) {
    return {
      verdict: "not_covered",
      reason: "调用方传入空对照清单 —— 无对照对象，不构成通过",
      a_engine: aEngine, b_engine: bEngine,
      cases_total: 0, cases_ran: 0, cases_failed: 0,
      fields_compared: 0, fields_same: 0, diff_total: 0, unpaired_total: 0,
      cases: []
    };
  }
  const list = caseIds && caseIds.length ? caseIds : A.list();
  const cases = [];
  for (const id of list) {
    const [ra, rb] = [await A.run(id), await B.run(id)];
    if (!ra.ok || !rb.ok) {
      cases.push({ case_id: id, ok: false, reason: [!ra.ok ? `A(${aEngine}): ${ra.reason}` : null, !rb.ok ? `B(${bEngine}): ${rb.reason}` : null].filter(Boolean).join("；") });
      continue;
    }
    const d = diffEnvelopes(ra.envelope, rb.envelope);
    cases.push({
      case_id: id, ok: true,
      a: { engine: aEngine, code_version: (ra.run_meta && ra.run_meta.code_version) || null, run_id: ra.envelope.run_id || null },
      b: { engine: bEngine, code_version: (rb.run_meta && rb.run_meta.code_version) || null, run_id: rb.envelope.run_id || null },
      pairs: d.pairs, compared: d.compared, same: d.same, diff_count: d.diff.length,
      only_a: d.only_a, only_b: d.only_b, diff: d.diff.slice(0, 20)
    });
  }

  const ran = cases.filter(c => c.ok);
  const totalDiff = ran.reduce((n, c) => n + c.diff_count, 0);
  const totalOnly = ran.reduce((n, c) => n + c.only_a.length + c.only_b.length, 0);

  // ★ 空跑不得判pass —— "一个都没跑成"与"跑了一致"是两件事。
  //   D10 `web_cli_same_result` 就是这么造假的（补cache 块就变 PASS），这里封死同款漏洞。
  if (ran.length === 0) {
    return {
      verdict: "not_covered",
      reason: `对照未跑成任何一例（${cases.length} 例全部失败）—— 空跑不构成通过`,
      a_engine: aEngine, b_engine: bEngine,
      cases_total: cases.length, cases_ran: 0, cases_failed: cases.length,
      fields_compared: 0, fields_same: 0, diff_total: 0, unpaired_total: 0,
      cases
    };
  }
  //部分失败也要显式带上，不能把失败例静默丢掉
  const partial = cases.length - ran.length;

  return {
    verdict: (totalDiff + totalOnly) === 0 ? "pass" : "mismatch",
    a_engine: aEngine, b_engine: bEngine,
    cases_total: cases.length, cases_ran: ran.length,
    cases_failed: partial,
    partial: partial > 0,          // ★ true 时不得单独引用本结果当"全量通过"
    fields_compared: ran.reduce((n, c) => n + c.compared, 0),
    fields_same: ran.reduce((n, c) => n + c.same, 0),
    diff_total: totalDiff, unpaired_total: totalOnly,
    cases
  };
}

module.exports = { extract, parity, describeEngines, defaultEngine, diffEnvelopes, evKey, PROVIDERS };
