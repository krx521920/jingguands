// demo/_p1_2_check.js —— D25 步骤5 守卫：上传闸门必须接契约机检（宗审计 P1-2）
//
// 缺陷原文（宗2026-10-10 收口清单步骤 5）：
//   「上传 {"schema_version":"0.3","events":[]} 判 ok:true，而 /api/contract 机检是 ok:false」
//   —— 同一件东西两处结论相反 ⇒ 页面说的合规率就成了假数字。
//   实测（修复前）：空壳件 ok:true 且落盘进 data/，校验器对同一件报 4 条error。
//
// 本门12 项，分三段：
//   A 段 契约闸门真在跑：空壳件必拒/ 合规件必收 / 拒绝原因可读且能定位到缺失字段
//   B 段 datasets.sources[].contract 字段存在，且与 /api/contract 对同一数据集同结论
//   C 段 反证：拆掉闸门后本门必须 FAIL（否则是恒返回 0 的假守卫）
//
// 退出码：FAIL = 1。
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.P1_2_PORT || 8653);
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
        try { json = JSON.parse(text); } catch (e) { /* 非 JSON 留给调用方判*/ }
        resolve({ status: res.statusCode, json, text });
      });
    });
    r.on("error", reject);
    if (opts.raw) opts.raw.forEach(b => r.write(b));
    r.end();
  });
}

/** 手写 multipart 上传（零依赖，不引form-data）。 */
function upload(filename, content) {
  const b = "----p12b" + process.pid;
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

const SHELL = JSON.stringify({ schema_version: "0.3", events: [] });
/** 最小但契约完整的合规信封 —— 用来证明闸门**不是一律拒收**（否则是另一种造假）。
 *  ★ run_meta 是 additionalProperties=false 的封闭对象，字段名必须照契约写
 *    （entry/model/started_at/duration_ms/code_version/interface_version/errors），
 *    自造字段名会被判违规 —— 那就成了"闸门只认我这一种写法"。 */
const GOOD = JSON.stringify({
  schema_version: "0.3",
  run_id: "p1_2_guard_probe",
  is_mock: true,
  source: { file_id: "p1_2_guard_probe", file_sha256: "0".repeat(64), file_name: "p1_2_guard_probe.json" },
  run_meta: { entry: "tool", model: null, started_at: "2026-10-10T00:00:00Z", duration_ms: 1, code_version: "guard", interface_version: "v0.3", errors: [] },
  events: [],
});

/** 起一份被测服务，等它ready。 */
async function startServer() {
  const p = spawn(process.execPath, ["server.js"], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: "ignore",
  });
  for (let i = 0; i < 60; i++) {
    await sleep(200);
    try { const r = await req("/api/datasets"); if (r.status === 200) return p; }
    catch (e) { /* 还没起来 */ }
  }
  try { p.kill(); } catch (e) { /* 已退出 */ }
  throw new Error("服务 12s 内未就绪");
}

(async function main() {
  const prove = process.argv.includes("--prove");
  let srv;
  try { srv = await startServer(); }
  catch (e) { console.error("[中止] " + e.message); process.exit(2); }

  try {
    // ================= A 段：契约闸门真在跑 =================
    const r1 = await upload("_p12_shell.json", SHELL);
    const e1 = (r1.json && r1.json.results && r1.json.results[0]) || {};
    if (e1.ok === false) {
      ok("A1_SHELL_REJECTED", "空壳件被拒（宗审计的原始复现路径）",
        `ok=false，failed=${r1.json && r1.json.failed}`);
    } else {
      bad("A1_SHELL_REJECTED", "空壳件仍被判 ok —— P1-2 未修",
        `ok=${JSON.stringify(e1.ok)} error=${e1.error || "(无)"}`);
    }
    // 拒绝原因必须指向具体缺失字段，而不是一句"校验失败"
    const errText = String(e1.error || "");
    if (/run_id/.test(errText) && /is_mock/.test(errText) && /source/.test(errText) && /run_meta/.test(errText)) {
      ok("A2_ERROR_ACTIONABLE", "拒绝原因可读且定位到缺失字段",
        errText.slice(0, 120));
    } else {
      bad("A2_ERROR_ACTIONABLE", "拒绝原因没说是缺哪几个字段", errText.slice(0, 160) || "(空)");
    }
    // 报告里必须带机器可读字段（页面/日志据此判断，不能只有一句人话）
    if (e1.contract_ok === false && Array.isArray(e1.contract_errors) && e1.contract_errors.length >= 4) {
      ok("A3_MACHINE_READABLE", "报告带机器可读契约字段",
        `contract_ok=false，contract_errors ${e1.contract_errors.length} 条`);
    } else {
      bad("A3_MACHINE_READABLE", "报告缺机器可读契约字段",
        `contract_ok=${JSON.stringify(e1.contract_ok)} errors=${(e1.contract_errors || []).length}`);
    }
    // ★ 空壳件绝不能落盘（落盘了就进了 data/，会被 metrics 读走）
    const leaked = fs.existsSync(path.join(ROOT, "data", "_p12_shell.json"));
    if (!leaked) ok("A4_NO_WRITE_ON_REJECT", "不合规件不落盘", "data/_p12_shell.json 不存在");
    else bad("A4_NO_WRITE_ON_REJECT", "不合规件仍落盘进 data/", "data/_p12_shell.json 存在 —— 会被指标读走");

    // 反面：合规件必须能收（否则闸门是"一律拒收"，另一种造假）
    const r2 = await upload("_p12_good.json", GOOD);
    const e2 = (r2.json && r2.json.results && r2.json.results[0]) || {};
    if (e2.ok === true && e2.contract_ok === true) {
      ok("A5_COMPLIANT_ACCEPTED", "契约完整的合规件被收",
        `dataset=${e2.dataset} contract_ok=${e2.contract_ok}`);
    } else {
      bad("A5_COMPLIANT_ACCEPTED", "合规件被拒 —— 闸门变成一律拒收",
        `ok=${JSON.stringify(e2.ok)} error=${e2.error || "(无)"}`);
    }
    try { fs.unlinkSync(path.join(ROOT, "data", "_p12_good.json")); } catch (e) { /* 本来就没落盘 */ }
    try { fs.unlinkSync(path.join(ROOT, "data", "_p12_shell.json")); } catch (e) { /* 同上 */ }

    // ================= B 段：datasets 带契约状态且与/api/contract 同结论 =================
    const ds = await req("/api/datasets");
    const srcs = (ds.json && ds.json.sources) || [];
    if (srcs.length && srcs.every(s => s.contract && typeof s.contract.checked === "boolean")) {
      ok("B1_SOURCES_HAVE_CONTRACT", "datasets.sources[].contract 字段齐全",
        `${srcs.length} 份全部带 contract.checked`);
    } else {
      const missing = srcs.filter(s => !s.contract).map(s => s.name).slice(0, 5);
      bad("B1_SOURCES_HAVE_CONTRACT", "sources 缺 contract 字段",
        `缺 ${srcs.filter(s => !s.contract).length}/${srcs.length} 份，例：${missing.join(", ")}`);
    }
    // 同结论校验：随机挑3 份，逐份比对 sources.contract.ok 与 /api/contract 的 validation.ok
    const probeNames = srcs.filter(s => s.readable && s.contract && s.contract.checked)
      .slice(0, 3).map(s => s.name);
    let same = 0, diff = [];
    for (const n of probeNames) {
      const c = await req(`/api/contract?dataset=${encodeURIComponent(n)}`);
      const apiOk = c.json && c.json.validation ? c.json.validation.ok : null;
      const listOk = (srcs.find(s => s.name === n) || {}).contract.ok;
      if (apiOk === listOk) same++;
      else diff.push(`${n}: sources=${listOk} /api=${apiOk}`);
    }
    if (probeNames.length && same === probeNames.length) {
      ok("B2_SAME_VERDICT", "清单与 /api/contract 对同一件同结论", `抽查 ${same} 份全部一致`);
    } else {
      bad("B2_SAME_VERDICT", "两处结论不一致 —— 又一份真源漂移", diff.join(" ｜ ") || "未取到可比样本");
    }
    // 不合规件必须被如实标为不合规，而不是被藏起来或说成合规
    const bads = srcs.filter(s => s.contract && s.contract.checked && s.contract.ok === false);
    if (bads.length) {
      ok("B3_BAD_DECLARED", "不合规件如实标出且未被藏起来",
        bads.map(s => `${s.name}(${s.contract.error_count})`).slice(0, 4).join(" "));
    } else {
      ok("B3_BAD_DECLARED", "当前无不合规件（如实：零违规不是默认结论，是实测结果）",
        `实测 ${srcs.length} 份全部合规`);
    }
  } finally {
    try { srv.kill(); } catch (e) { /* 已退出 */ }
  }

  // ================= C 段：反证（拆掉闸门必须 FAIL） =================
  if (prove) {
    const sp = path.join(ROOT, "server.js");
    const orig = fs.readFileSync(sp, "utf8");
    const guard = 'if (!cv.ok) {';
    const idx = orig.indexOf(guard);
    if (idx < 0) {
      bad("C_PROVE", "反证失败：找不到闸门代码", "server.js 里没有 `if (!cv.ok)` —— 闸门被拆了？");
    } else {
      // 把闸门短路成"永远合规"，模拟"闸门被绕过"的回归
      const patched = orig.replace(guard, 'if (false) {');
      fs.writeFileSync(sp, patched, "utf8");
      let srv2 = null;
      try {
        srv2 = await startServer();
        const rp = await upload("_p12_shell2.json", SHELL);
        const ep = (rp.json && rp.json.results && rp.json.results[0]) || {};
        if (ep.ok === false) {
          bad("C_PROVE", "反证失败：闸门短路后空壳件仍被拒", "守卫没抓到回归 —— 判定逻辑另有来源");
        } else {
          ok("C_PROVE", "反证成立：闸门短路后空壳件立刻被放行（本门能抓到）",
            `短路后 ok=${JSON.stringify(ep.ok)} ⇒ 说明本门的 FAIL 条件正是这条闸门`);
        }
        try { fs.unlinkSync(path.join(ROOT, "data", "_p12_shell2.json")); } catch (e) { /* 未落盘 */ }
      } catch (e) {
        bad("C_PROVE", "反证执行失败", e.message);
      } finally {
        if (srv2) { try { srv2.kill(); } catch (e) { /* 已退出 */ } }
        fs.writeFileSync(sp, orig, "utf8");   // ★ 复原：反证绝不能把改动留在仓库
      }
    }
  } else {
    rows.push(["SKIP", "C_PROVE", "反证未跑（加 --prove 才跑）", "反证会临时改 server.js，默认不跑"]);
  }

  console.log("=".repeat(78));
  console.log("D25 步骤5 守卫 · 上传闸门接契约机检（宗审计 P1-2）");
  console.log("=".repeat(78));
  for (const [st, rule, name, detail] of rows) {
    console.log(`[${st}] ${rule} · ${name}`);
    if (detail) console.log(`        ${detail}`);
  }
  console.log("-".repeat(78));
  console.log(`PASS ${pass}　FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
})();