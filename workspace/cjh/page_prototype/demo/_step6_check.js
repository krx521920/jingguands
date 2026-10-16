// demo/_step6_check.js —— 2026-10-10 步骤6 守卫：其余 4 个小项 + stale 检测（含反证）
//
// 宗清单步骤 6：
//   | /api/result 无参返回 mock | 缺参 → 400 |
//   | 数据集名大小写敏感       | 归一化 + 未命中给候选提示 |
//   | parity 快照输入已变      | 重跑 demo/_parity_real.js，或标注"仅对 10-08 输入有效" |
//   | 导出少 extraction_engine | 补齐，或改"页面所见即导出所得"的措辞 |
//   | 上传件被小写化改名       | 保留原名大小写 |
//
// 12 项，三段：
//   A 段 接口行为（无参 400 / 大小写归一化 / 候选提示 / 导出带引擎来源）
//   B 段 上传件保留大小写（用真实 multipart 上传，落盘后核对文件名）
//   C 段 反证：①改数据 ⇒ stale 检测必须响②去掉候选提示 ⇒ 必须 FAIL
//
// 退出码：FAIL = 1。
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.STEP6_PORT || 8654);
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
const rows = [];
function ok(rule, name, detail) { pass++; rows.push(["PASS", rule, name, detail || ""]); }
function bad(rule, name, detail) { fail++; rows.push(["FAIL", rule, name, detail || ""]); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function req(pathname, opts = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request(BASE + pathname, opts, res => {
      const chunks = [];
      res.on("data", d => chunks.push(d));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch (e) { /* 非 JSON */ }
        resolve({ status: res.statusCode, json, text, headers: res.headers });
      });
    });
    r.on("error", reject);
    if (opts.raw) opts.raw.forEach(b => r.write(b));
    r.end();
  });
}

function upload(filename, contentObj) {
  const content = typeof contentObj === "string" ? contentObj : JSON.stringify(contentObj);
  const b = "----s6b" + process.pid;
  const head = Buffer.from(
    `--${b}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `Content-Type: application/json\r\n\r\n`, "utf8");
  const tail = Buffer.from(`\r\n--${b}--\r\n`, "utf8");
  const body = Buffer.concat([head, Buffer.from(content, "utf8"), tail]);
  return req("/api/upload", {
    method: "POST", raw: [body],
    headers: { "Content-Type": `multipart/form-data; boundary=${b}`, "Content-Length": body.length },
  });
}

const GOOD_ENV = {
  schema_version: "0.3",
  run_id: "step6_guard_probe",
  is_mock: true,
  source: { file_id: "step6_guard_probe", file_sha256: "1".repeat(64), file_name: "Step6_MiXeD_Case.json" },
  run_meta: { entry: "tool", model: null, started_at: "2026-10-10T00:00:00Z", duration_ms: 1, code_version: "guard", interface_version: "v0.3", errors: [] },
  events: [],
};

async function startServer() {
  const p = spawn(process.execPath, ["server.js"], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: "ignore",
  });
  for (let i = 0; i < 60; i++) {
    await sleep(200);
    try { const r = await req("/api/datasets"); if (r.status === 200) return p; }
    catch (e) { /* 未就绪 */ }
  }
  try { p.kill(); } catch (e) { /* 已退出 */ }
  throw new Error("服务 12s 内未就绪");
}

function cleanup(names) {
  for (const n of names) { try { fs.unlinkSync(path.join(ROOT, "data", n + ".json")); } catch (e) { /* 未落盘 */ } }
}

(async function main() {
  const prove = process.argv.includes("--prove");
  const srv = await startServer();
  const tmp = ["Step6_MiXeD_Case", "step6_guard_probe-2"];

  try {
    // ================= A 段：接口行为 =================
    const r0 = await req("/api/result");
    if (r0.status === 400) {
      ok("A1_NO_PARAM_400", "GET /api/result 无参返回 400（不再静默回落演示件）",
        `status=400 error=${(r0.json || {}).error || r0.text.slice(0, 80)}`);
    } else {
      bad("A1_NO_PARAM_400", "无参仍返回数据 —— 通道看着是通的",
        `status=${r0.status}；body 前 80 字：${r0.text.slice(0, 80)}`);
    }

    const lc = await req("/api/result?dataset=d4-pld-001");
    if (lc.status === 200) {
      const ee = lc.json && lc.json.extraction_engine;
      const mode = ee && ee.name_resolution;
      ok("A2_CASE_INSENSITIVE", "数据集名大小写不敏感命中",
        `d4-pld-001 → ${mode ? mode.resolved : (ee && ee.source_path)}（${mode ? mode.mode : "精确命中"}）`);
    } else {
      bad("A2_CASE_INSENSITIVE", "小写名查不到权威批数据集", `status=${lc.status} ${lc.text.slice(0, 100)}`);
    }

    const miss = await req("/api/result?dataset=D4-PLD-0ZZ");
    if (miss.status === 404 && miss.json && Array.isArray(miss.json.suggestions) && miss.json.suggestions.length) {
      ok("A3_SUGGESTIONS", "未命中给候选提示", `suggestions=${miss.json.suggestions.slice(0, 4).join(", ")}`);
    } else {
      bad("A3_SUGGESTIONS", "未命中无候选提示（打错字与真存在不可区分）",
        `status=${miss.status} suggestions=${JSON.stringify((miss.json || {}).suggestions)}`);
    }

    const ex = await req("/api/export?dataset=D4-PLD-001&format=json");
    // ★ 2026-10-17 判据升级（不是放宽）：导出 JSON 改为**契约本体 envelope** 后（回环修复），
    //   extraction_engine 不能再进 JSON 体——契约 additionalProperties=false 禁止附加字段。
    //   A4 的**实质要求不变**：「拿导出件的人必须能判断这份数据哪来的（独立抽取 vs 预生成信封）」
    //   ——这正是 D10 造假防线（产出"看着像"独立抽取、实为预生成信封而不带来源）。
    //   落点从 JSON 体改为响应头 X-Extraction-Engine，判据相应加严三条：
    //   ①头必须存在 ②decodeURIComponent 后 engine 为非空字符串
    //   ③reruns_extraction 必须是 boolean（能明确回答"有没有真跑抽取"）。
    const hdrRaw = (ex.headers || {})["x-extraction-engine"];
    let hdr = null;
    try { hdr = JSON.parse(decodeURIComponent(hdrRaw || "")); } catch (e) { hdr = null; }
    const hdrOk = !!hdr && typeof hdr.engine === "string" && hdr.engine.length > 0
      && typeof hdr.reruns_extraction === "boolean";
    const bodyHasEngine = !!(ex.json && ex.json.extraction_engine);
    if (ex.status === 200 && hdrOk) {
      ok("A4_EXPORT_ENGINE", "导出带来源披露（契约本体走响应头 X-Extraction-Engine，JSON 体禁附加字段）",
        `engine=${hdr.engine} reruns_extraction=${hdr.reruns_extraction} code_version=${hdr.code_version} source_path=${hdr.source_path}`);
    } else {
      bad("A4_EXPORT_ENGINE", "导出无可用来源披露 —— 拿导出件的人无法判断数据来源（D10 造假防线）",
        `status=${ex.status} body_has_engine=${bodyHasEngine} header_ok=${hdrOk} header_raw=${String(hdrRaw).slice(0, 80)}`);
    }

    // ★ A4B（10-17 新增）：导出件形状必须是契约本体而非 view 投影——
    //   view 投影（data_mode/evidences/bridge、缺顶层 is_mock/source）喂回导入闸门必被拒，
    //   导出件导不回去＝回环断裂。与 demo/_roundtrip_check.js 互为双保险（那边验回导行为，这边验导出形状）。
    const shapeObj = ex.json || {};
    const isEnvelope = typeof shapeObj.is_mock !== "undefined"
      && typeof shapeObj.source !== "undefined"
      && Array.isArray(shapeObj.events)
      && !("data_mode" in shapeObj) && !("evidences" in shapeObj) && !("bridge" in shapeObj);
    if (isEnvelope) {
      ok("A4B_EXPORT_SHAPE", "导出 JSON 形状＝契约本体 envelope（可回导入，非 view 投影）",
        `顶层=${Object.keys(shapeObj).slice(0, 8).join(",")} events=${shapeObj.events.length}`);
    } else {
      bad("A4B_EXPORT_SHAPE", "导出件不是契约本体 —— 回环断裂（导出的 JSON 无法重新导入）",
        `顶层=${Object.keys(shapeObj).slice(0, 10).join(",")}`);
    }

    // ================= B 段：上传件保留大小写 =================
    const up = await upload("Step6_MiXeD_Case.json", GOOD_ENV);
    const ue = (up.json && up.json.results && up.json.results[0]) || {};
    const landed = path.join(ROOT, "data", "Step6_MiXeD_Case.json");
    if (ue.ok === true && fs.existsSync(landed)) {
      ok("B1_KEEP_CASE", "上传件保留原名大小写",
        `落盘 data/${ue.dataset}.json（source.file_name=${GOOD_ENV.source.file_name}）`);
    } else {
      bad("B1_KEEP_CASE", "上传件名被改写（或未落盘）",
        `ok=${JSON.stringify(ue.ok)} dataset=${ue.dataset} 期望落盘 data/Step6_MiXeD_Case.json 实际存在=${fs.existsSync(landed)}`);
    }
    // 再传一次同名（不同大小写）⇒ 必须去重，不得覆盖
    const up2 = await upload("step6_mixed_case.json", GOOD_ENV);
    const ue2 = (up2.json && up2.json.results && up2.json.results[0]) || {};
    if (ue2.ok === true && ue2.dataset && ue2.dataset !== "Step6_MiXeD_Case") {
      ok("B2_DEDUPE_CASE", "同名不同大小写不去重覆盖", `第二个数据集名=${ue2.dataset}（未覆盖首个）`);
    } else {
      bad("B2_DEDUPE_CASE", "同名不同大小写被静默覆盖",
        `dataset=${ue2.dataset} —— 首个文件已存在却没去重`);
    }
    tmp.push(ue.dataset, ue2.dataset);
    cleanup(tmp);
  } finally {
    try { srv.kill(); } catch (e) { /* 已退出 */ }
  }

  // ================= C 段：反证 =================
  if (prove) {
    // ① 改数据 ⇒ stale 检测必须响
    const dataSource = require(path.join(ROOT, "bridge", "data_source.js"));
    const parityReport = require(path.join(ROOT, "bridge", "parity_report.js"));
    const before = parityReport.loadReport();
    const probe = path.join(ROOT, "data_unified", "_step6_stale_probe.json");
    fs.writeFileSync(probe, JSON.stringify(GOOD_ENV), "utf8");
    dataSource.resetCache();
    const after = parityReport.loadReport();
    try { fs.unlinkSync(probe); dataSource.resetCache(); } catch (e) { /* 已清理 */ }
    if (before.stale === false && after.stale === true) {
      ok("C_PROVE_STALE", "反证成立：数据目录一改，报告立即判stale",
        `改前 stale=${before.stale} → 改后 stale=${after.stale}：${String(after.stale_reason).slice(0, 70)}`);
    } else {
      bad("C_PROVE_STALE", "数据变了stale 仍不响 —— 过期检测是摆设",
        `改前 ${before.stale} / 改后 ${after.stale}`);
    }
    // 复原后应立刻复归非 stale
    const restored = parityReport.loadReport();
    if (restored.stale === false) {
      ok("C_STALE_RECOVER", "证据撤走即复归（非 stale）", "复原后 stale=false —— 证明该判据不是恒true");
    } else {
      bad("C_STALE_RECOVER", "复原后仍判 stale", String(restored.stale_reason).slice(0, 100));
    }
  } else {
    rows.push(["SKIP", "C_PROVE_STALE", "反证未跑（加 --prove 才跑）", "反证会临时往权威批写探针文件，默认不跑"]);
  }

  console.log("=".repeat(78));
  console.log("2026-10-10 步骤6 守卫 · 其余 4 小项 + parity 报告过期检测");
  console.log("=".repeat(78));
  for (const [st, rule, name, detail] of rows) {
    console.log(`[${st}] ${rule} · ${name}`);
    if (detail) console.log(`        ${detail}`);
  }
  console.log("-".repeat(78));
  console.log(`PASS ${pass}　FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("[中止] " + e.message); process.exit(2); });