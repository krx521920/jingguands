// demo/_engine400_check.js —— 2026-10-11 守卫：未知引擎必须返 400（参数错），不是 503（服务不可用）
//
// 领导 10-11 遗留第 4 条：「未知引擎建议 400」。
//
// ★ 为什么这条必须单独守卫（不是"顺手改一下"）：
//   原实现里`PROVIDERS[r.engine]` 对未知引擎取到 undefined，
//   `undefined && ...` 整条判据退到 else ⇒ 一律 ENGINE_UNAVAILABLE ⇒ HTTP 503。
//   503 的语义是"服务暂时不可用"，会让调用方一直等服务恢复；
//   而正确处置是**改参数**。把参数错误报成服务故障，是接口层的误导。
//
// 三段（含反证）：
//   A 段 未知引擎 → 400（/api/result）；已知但未接通 → 仍 503（不能一律 400，
//       那样真故障会被降级成"你参数写错了"，同样是另一种误导）
//   B 段 /api/parity 未知引擎 → 400，且**不是** not_covered
//       （引擎名打错 ≠ 该能力未覆盖；混同会在未覆盖清单里凭空多一条）
//   C 段 反证：把 UNKNOWN_ENGINE 分支改回 503 ⇒ A/B 两段必须 FAIL；
//       改回来 ⇒ 复归 PASS。证明该判据不是恒真的摆设。
//
// 用法：node demo/_engine400_check.js [--prove]
// 退出码：FAIL = 1。
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.ENGINE400_PORT || 8657);
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
const rows = [];
function ok(rule, name, detail) { pass++; rows.push(["PASS", rule, name, detail || ""]); }
function bad(rule, name, detail) { fail++; rows.push(["FAIL", rule, name, detail || ""]); }

function get(pathAndQuery) {
  return new Promise(resolve => {
    const req = http.get(`${BASE}${pathAndQuery}`, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(body); } catch (e) { /* 非JSON 也算数据 */ }
        resolve({ status: res.statusCode, json, raw: body });
      });
    });
    req.on("error", e => resolve({ status: 0, error: e.message }));
    req.setTimeout(20000, () => { req.destroy(); resolve({ status: 0, error: "timeout" }); });
  });
}

function startServer() {
  const p = spawn(process.execPath, [path.join(ROOT, "server.js")], {
    env: Object.assign({}, process.env, { PORT: String(PORT) }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  p.stdout.on("data", () => { });
  p.stderr.on("data", () => { });
  return p;
}
async function waitUp(tries = 40) {
  for (let i = 0; i < tries; i++) {
    const r = await get("/api/engines");
    if (r.status === 200) return true;
    await new Promise(r2 => setTimeout(r2, 250));
  }
  return false;
}

// ---- 反证用：把 UNKNOWN_ENGINE 的 400 改回 503，验证守卫会响 ----
//   ★ 必须**两处都注入**：/api/result 的分支在 server.js，
//     /api/parity 的 400 是 extractor.parity() 自报 http_error 后由 server 转发的。
//     只注入 server.js 的 result 分支 ⇒ parity 仍是 400 ⇒ 反证半边不响，
//     守卫就会把它算成"判据是摆设"（假警报）。反证必须覆盖它声称覆盖的每一段。
const SERVER = path.join(ROOT, "server.js");
const EXTRACTOR = path.join(ROOT, "bridge", "extractor.js");
function sabotage() {
  const srcS = fs.readFileSync(SERVER, "utf8");
  const srcE = fs.readFileSync(EXTRACTOR, "utf8");
  const patchedS = srcS.replace(
    /if \(e\.code === "UNKNOWN_ENGINE"\) \{\s*return sendJSON\(res, 400,/,
    'if (e.code === "UNKNOWN_ENGINE") {\n        return sendJSON(res, 503,'
  );
  const patchedE = srcE.replace("http_error: 400,", "http_error: 503,");
  if (patchedS === srcS && patchedE === srcE) return null;  // 两处都没替换＝形态变了
  fs.writeFileSync(SERVER, patchedS, "utf8");
  fs.writeFileSync(EXTRACTOR, patchedE, "utf8");
  return { s: srcS, e: srcE };
}
function restore(saved) {
  if (!saved) return;
  fs.writeFileSync(SERVER, saved.s, "utf8");
  fs.writeFileSync(EXTRACTOR, saved.e, "utf8");
}

(async () => {
  const extractor = require(path.join(ROOT, "bridge", "extractor.js"));
  const available = Object.keys(extractor.PROVIDERS);

  // ---------- A 段：/api/result 的引擎错误分类 ----------
  let srv = startServer();
  let up = await waitUp();
  if (!up) {
    bad("A_UP", "服务未能启动", `端口 ${PORT}`);
  } else {
    // 基准：默认引擎必须 200（否则后面全是空跑）
    const base = await get("/api/result?dataset=D4-PLD-001");
    if (base.status === 200) ok("A_BASE", "基准：已知引擎 + 默认参数 → 200", "D4-PLD-001");
    else bad("A_BASE", "基准都不通，后续断言无意义", `status=${base.status}`);

    // A1 未知引擎 → 400
    const unk = await get("/api/result?dataset=D4-PLD-001&engine=%E4%B8%8D%E5%AD%98%E5%9C%A8%E7%9A%84%E5%BC%95%E6%93%8E");
    if (unk.status === 400) ok("A_UNKNOWN_400", "未知引擎 → 400（参数错，不是服务故障）",
      `status=400 error=${JSON.stringify((unk.json || {}).error || "").slice(0, 40)}`);
    else bad("A_UNKNOWN_400", `未知引擎应返 400，实返 ${unk.status}`,
      `503 的语义是"服务暂时不可用"，会让人干等而不是改参数`);

    // A2 错误响应必须带上可用引擎清单（否则调用方无从改对）
    const list = (unk.json || {}).available_engines;
    if (Array.isArray(list) && list.length && list.every(x => available.includes(x))) {
      ok("A_UNKNOWN_HINT", "400 响应回传可用引擎清单", list.join("/"));
    } else {
      bad("A_UNKNOWN_HINT", "400 响应没给可用引擎清单", `available_engines=${JSON.stringify(list)}`);
    }

    // A3 已知但未接通的引擎仍应是 503 —— 不能为了修400 把真故障也降级成400
    const unavail = available.find(id => !extractor.PROVIDERS[id].available().ok);
    if (unavail) {
      const u = await get(`/api/result?dataset=D4-PLD-001&engine=${unavail}`);
      if (u.status === 503) ok("A_UNAVAIL_503", `已知但未接通的引擎 ${unavail} → 仍 503`, "真故障没有被降级成参数错");
      else bad("A_UNAVAIL_503", `${unavail} 未接通却返 ${u.status}`, "把真故障说成参数错，是反向的另一种误导");
    } else {
      rows.push(["SKIP", "A_UNAVAIL_503", "本机全部引擎均可用，无未接通样本", "无法构造 503 样本"]);
    }
  }
  if (srv) { srv.kill(); }
  await new Promise(r => setTimeout(r, 400));

  // ---------- B 段：/api/parity 的未知引擎 ----------
  srv = startServer();
  up = await waitUp();
  if (!up) {
    bad("B_UP", "parity 段服务未能启动", "");
  } else {
    const p = await get("/api/parity?a=file&b=%E4%B8%8D%E5%AD%98%E5%9C%A8");
    if (p.status === 400) ok("B_PARITY_400", "/api/parity 未知引擎 → 400", `status=400`);
    else bad("B_PARITY_400", `/api/parity 未知引擎应返 400，实返 ${p.status}`,
      "参数错混进 not_covered 会在未覆盖清单里凭空多一条");

    const v = (p.json || {}).verdict;
    if (v && v !== "not_covered") ok("B_NOT_NOTCOVERED", "未知引擎未混进 not_covered", `verdict=${v}`);
    else bad("B_NOT_NOTCOVERED", "未知引擎被判成 not_covered（能力缺口）", `verdict=${v}`);

    // 基准：默认 a=file b=cli 仍应 200（不能被改坏）
    const base = await get("/api/parity?a=file&b=cli");
    if (base.status === 200) ok("B_BASE", "基准：默认引擎对照仍 200", `verdict=${(base.json || {}).verdict}`);
    else bad("B_BASE", "默认 parity 被改坏", `status=${base.status}`);
  }
  if (srv) { srv.kill(); }
  await new Promise(r => setTimeout(r, 400));

  // ---------- C 段：反证（把 400 改回 503，门必须响） ----------
  const prove = process.argv.includes("--prove");
  if (prove) {
    const saved = sabotage();
    if (saved == null) {
      bad("C_PROVE_400", "反证未能注入（server.js 代码形态已变）", "替换 400→503 失败，先核对 UNKNOWN_ENGINE 分支写法");
    } else {
      const s2 = startServer();
      const up2 = await waitUp();
      if (!up2) {
        bad("C_PROVE_400", "反证期间服务未能启动", "");
      } else {
        const r1 = await get("/api/result?dataset=D4-PLD-001&engine=nope");
        const r2 = await get("/api/parity?a=file&b=nope");
        if (r1.status !== 400 && r2.status !== 400) {
          ok("C_PROVE_400", "反证成立：改回 503 后守卫立刻失效（说明这两条判据真的在起作用）",
            `注入后 result=${r1.status}、parity=${r2.status}（都不再是 400）`);
        } else {
          bad("C_PROVE_400", "把 400 改回 503 守卫仍通过 —— 判据是摆设",
            `注入后 result=${r1.status}、parity=${r2.status}`);
        }
      }
      if (s2) { s2.kill(); }
      await new Promise(r3 => setTimeout(r3, 400));
      restore(saved);

      // 复原后必须立刻复归 PASS
      const s3 = startServer();
      const up3 = await waitUp();
      if (up3) {
        const back = await get("/api/result?dataset=D4-PLD-001&engine=nope");
        if (back.status === 400) ok("C_RECOVER", "移除注入即复归 400（非恒 false 的假守卫）", "server.js 已复原");
        else bad("C_RECOVER", "复原后仍非 400", `status=${back.status}`);
      } else bad("C_RECOVER", "复原后服务起不来", "");
      if (s3) { s3.kill(); }
      await new Promise(r4 => setTimeout(r4, 300));
    }
  } else {
    rows.push(["SKIP", "C_PROVE_400", "反证未跑（加 --prove 才跑）", "反证要临时改 server.js 再复原，默认不跑"]);
  }

  console.log("=".repeat(78));
  console.log("2026-10-11 守卫 · 未知引擎返 400（含反证）");
  console.log("=".repeat(78));
  for (const [st, rule, name, detail] of rows) {
    console.log(`[${st}] ${rule} · ${name}`);
    if (detail) console.log(`        ${detail}`);
  }
  console.log("-".repeat(78));
  console.log(`PASS ${pass}　FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("[中止] " + (e && e.stack || e)); process.exit(2); });