#!/usr/bin/envnode
/**
 * D11 首次封存测试 —— 页面/报告缺陷巡检（只读）
 *
 * 纪律：
 *  - 只读。不改数据、不改代码、不写封存资产。
 *  - 只跑现有真实数据集（data/ 下 31 份）；封存集未交付前不预看。
 *  - 每条缺陷必须带可复现的请求路径（dataset + 接口），不允许"疑似"。
 *
 * 输出：_survey.json供缺陷清单与图表页消费。
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE || "http://127.0.0.1:8643";
const OUT = path.join(__dirname, "_survey.json");

function get(p) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const req = http.get(BASE + p, (res) => {
      let n = 0;
      const chunks = [];
      res.on("data", (d) => {
        n += d.length;
        chunks.push(d);
      });
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        resolve({
          path: p,
          status: res.statusCode,
          bytes: n,
          ms: Date.now() - t0,
          body,
        });
      });
    });
    req.on("error", (e) =>
      resolve({ path: p, status: 0, bytes: 0, ms: Date.now() - t0, error: e.code || e.message, body: "" })
    );
    req.setTimeout(30000, () => {
      req.destroy();
      resolve({ path: p, status: -1, bytes: 0, ms: Date.now() - t0, error: "TIMEOUT_30s", body: "" });
    });
  });
}

(async function main() {
  const findings = [];
  const perf = [];
  const note = (sev, area, title, repro, expect, actual) => {
    findings.push({ sev, area, title, repro, expect, actual });
  };

  // ---- 0. 数据集清单 ----
  const ds = await get("/api/datasets");
  if (ds.status !== 200) {
    console.log("FATAL /api/datasets status=" + ds.status + " " + (ds.error || ""));
    process.exit(2);
  }
  const list = JSON.parse(ds.body).datasets || [];
  console.log("数据集 " + list.length + " 份");

  // ---- 1. 单文档接口全量巡检 ----
  let okResult = 0,
    failResult = 0;
  const resultStats = [];
  const danglingRefs = [];
  for (const d of list) {
    const r = await get("/api/result?dataset=" + encodeURIComponent(d));
    perf.push({ path: r.path, ms: r.ms, bytes: r.bytes });
    if (r.status !== 200) {
      failResult++;
      note("P0", "单文档", "GET /api/result 返回非 200", "GET /api/result?dataset=" + d, "200 + JSON", r.status + " " + (r.error || ""));
      continue;
    }
    let j;
    try {
      j = JSON.parse(r.body);
    } catch (e) {
      failResult++;
      note("P0", "单文档", "响应不是合法 JSON", "GET /api/result?dataset=" + d, "合法 JSON", "JSON.parse 失败：" + e.message);
      continue;
    }
    okResult++;
    // 结构检查（按真实契约 v0.1：run_id/schema_version/data_mode/events/evidences）
    const problems = [];
    for (const k of ["run_id", "schema_version", "data_mode"]) {
      if (j[k] === undefined || j[k] === null || j[k] === "") problems.push("缺 " + k);
    }
    if (!Array.isArray(j.events)) problems.push("events 非数组（实际 " + typeof j.events + "）");
    if (!Array.isArray(j.evidences)) problems.push("evidences 非数组（实际 " + typeof j.evidences + "）");
    // data_mode 必须是 simulated / real 之一（D1 冻结契约 cjh_workspace_03 §2），否则"模拟/真实"不可分辨
    if (j.data_mode !== "simulated" && j.data_mode !== "real") {
      problems.push("data_mode 取值超出 D1 冻结契约（simulated|real）：" + JSON.stringify(j.data_mode));
    }
    // evidence_id 断链检查：事件字段引用的 evidence_id 必须在 evidences 里存在
    if (Array.isArray(j.events) && Array.isArray(j.evidences)) {
      const evIds = new Set(j.evidences.map((e) => e && e.evidence_id).filter(Boolean));
      const dangling = [];
      let refTotal = 0;
      j.events.forEach((ev) => {
        const f = ev && ev.fields;
        if (!f || typeof f !== "object") return;
        Object.values(f).forEach((fv) => {
          if (fv && typeof fv === "object" && fv.evidence_id) {
            refTotal++;
            if (!evIds.has(fv.evidence_id)) dangling.push(ev.event_id + "." + fv.evidence_id);
          }
        });
      });
      danglingRefs.push({ dataset: d, ref_total: refTotal, dangling_count: dangling.length, samples: dangling.slice(0, 5) });
      if (dangling.length > 0) {
        note("P0", "单文档", "evidence_id 断链（字段引用的证据不存在）", "GET /api/result?dataset=" + d, "全部 evidence_id 可在 evidences 中找到", dangling.length + "/" + refTotal + " 条断链，例：" + dangling.slice(0, 3).join(","));
      }
    }
    if (problems.length) {
      note("P1", "单文档", "响应结构缺字段", "GET /api/result?dataset=" + d, problems.join("；"), "实有键：" + Object.keys(j).join(","));
    }
    resultStats.push({
      dataset: d,
      bytes: r.bytes,
      ms: r.ms,
      data_mode: j.data_mode,
      run_id: j.run_id,
      events: Array.isArray(j.events) ? j.events.length : -1,
      evidences: Array.isArray(j.evidences) ? j.evidences.length : -1,
    });
  }
  console.log("单文档：成功 " + okResult + " / 失败 " + failResult);

  // ---- 2. 导出接口（JSON + CSV 双格式）----
  const exportChecks = [];
  for (const d of list) {
    for (const fmt of ["json", "csv"]) {
      const r = await get("/api/export?dataset=" + encodeURIComponent(d) + "&format=" + fmt);
      perf.push({ path: r.path, ms: r.ms, bytes: r.bytes });
      const rec = { dataset: d, format: fmt, status: r.status, bytes: r.bytes, ms: r.ms };
      if (r.status !== 200) {
        note("P0", "导出", "导出接口非 200", "GET /api/export?dataset=" + d + "&format=" + fmt, "200", r.status + " " + (r.error || ""));
      } else if (r.bytes === 0) {
        note("P0", "导出", "导出内容为空（0 字节）", "GET /api/export?dataset=" + d + "&format=" + fmt, "非空文件", "0 字节");
      } else if (fmt === "csv") {
        // CSV 结构：应有表头且列数一致
        const lines = r.body.split(/\r?\n/).filter((x) => x.trim());
        if (lines.length < 2) {
          note("P1", "导出", "CSV 只有表头无数据行", "GET /api/export?dataset=" + d + "&format=csv", "≥2 行", lines.length + " 行");
        } else {
          const headCols = lines[0].split(",").length;
          let bad = 0;
          for (let i = 1; i < lines.length; i++) {
            // 粗略列数校验（考虑引号内逗号）
            const cols = lines[i].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).length;
            if (cols !== headCols) bad++;
          }
          if (bad > 0) {
            note("P1", "导出", "CSV 列数不一致", "GET /api/export?dataset=" + d + "&format=csv", "各行 " + headCols + " 列", bad + "/" + lines.length - 1 + " 行列数不符");
          }
        }
      }
      exportChecks.push(rec);
    }
  }
  console.log("导出：巡检 " + exportChecks.length + " 次");

  // ---- 3. 跨文档三视图 ----
  // 各接口的真实主数组与 id 字段（按 D10 现状，不做假设）：
  //   /api/pairs      → groups[]    / group_id
  //   /api/verify     → findings[]  / (dataset+event_id+code 为复合键，无单字段 id)
  //   /api/integration→ cases[]     / case_id
  const VIEW_SPEC = [
    { p: "/api/pairs", area: "配对", arr: "groups", idKeys: ["group_id"], idLabel: "group_id" },
    { p: "/api/verify", area: "核验", arr: "findings", idKeys: ["event_id", "code"], idLabel: "dataset+event_id+code（复合键）" },
    { p: "/api/integration", area: "集成", arr: "cases", idKeys: ["case_id"], idLabel: "case_id" },
  ];
  const viewStats = [];
  for (const spec of VIEW_SPEC) {
    const r = await get(spec.p);
    perf.push({ path: r.path, ms: r.ms, bytes: r.bytes });
    if (r.status !== 200) {
      note("P0", spec.area, "接口非 200", "GET " + spec.p, "200 + JSON", r.status + " " + (r.error || ""));
      continue;
    }
    let j;
    try {
      j = JSON.parse(r.body);
    } catch (e) {
      note("P0", spec.area, "响应不是合法 JSON", "GET " + spec.p, "合法 JSON", e.message);
      continue;
    }
    const arr = j[spec.arr];
    if (!Array.isArray(arr)) {
      note("P1", spec.area, "主数组 " + spec.arr + " 缺失或类型错", "GET " + spec.p, spec.arr + " 为数组", "实际顶层键：" + Object.keys(j).join(","));
      continue;
    }
    let missing = 0;
    arr.forEach((it, i) => {
      if (!it || typeof it !== "object") {
        note("P2", spec.area, "条目非对象", "GET " + spec.p + "[" + spec.arr + "][" + i + "]", "对象", typeof it);
        missing++;
        return;
      }
      const hasId = spec.idKeys.every((k) => it[k] !== undefined && it[k] !== null && it[k] !== "");
      if (!hasId) {
        note(
          "P1",
          spec.area,
          "条目缺定位键",
          "GET " + spec.p + "[" + spec.arr + "][" + i + "]",
          spec.idLabel + " 均非空",
          "实有键：" + Object.keys(it).join(",")
        );
        missing++;
      }
    });
    // 统计完备性：provenance 为 null 的条目数（出处缺失，直接影响"出处命中率"指标）
    let provNull = 0;
    if (spec.area === "核验") {
      arr.forEach((it) => {
        if (it && it.provenance === null) provNull++;
      });
    }
    viewStats.push({ view: spec.area, path: spec.p, total: arr.length, missing_keys: missing, provenance_null: provNull });
    console.log(spec.area + "：" + spec.arr + " " + arr.length + " 条，缺定位键 " + missing + (spec.area === "核验" ? "，provenance 为 null " + provNull : ""));
  }

  // ---- 4. 异常输入健壮性 ----
  const badInputs = [
    "/api/result?dataset=__not_exist__",
    "/api/export?dataset=__not_exist__&format=json",
    "/api/export?dataset=pledge.json&format=xml",
    "/api/result",
  ];
  const robustness = [];
  for (const p of badInputs) {
    const r = await get(p);
    robustness.push({ path: p, status: r.status, bytes: r.bytes });
    if (r.status === 200 && r.bytes === 0) {
      note("P0", "健壮性", "无效输入返回 200 空体（应为 4xx）", "GET " + p, "4xx + 错误 JSON", "200 / 0 字节");
    }
    if (r.status === 0 || r.status === -1) {
      note("P0", "健壮性", "无效输入导致服务异常", "GET " + p, "4xx", r.status + " " + (r.error || ""));
    }
  }

  // ---- 5. 性能 ----
  const slow = perf.filter((p) => p.ms > 2000).sort((a, b) => b.ms - a.ms);
  const bigBytes = perf.filter((p) => p.bytes > 5 * 1024 * 1024);

  const out = {
    generated_at: new Date().toISOString(),
    base: BASE,
    dataset_count: list.length,
    result_summary: { ok: okResult, fail: failResult },
    findings,
    perf_worst: perf.slice().sort((a, b) => b.ms - a.ms).slice(0, 15),
    perf_over_2s: slow,
    perf_over_5MB: bigBytes.map((p) => ({ path: p.path, bytes: p.bytes, ms: p.ms })),
    robustness,
    view_stats: viewStats,
    dangling_refs: danglingRefs,
    export_checks: exportChecks,
    result_stats: resultStats,
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2), "utf8");

  console.log("\n=== 缺陷 " + findings.length + " 条 ===");
  const bySev = {};
  findings.forEach((f) => (bySev[f.sev] = (bySev[f.sev] || 0) + 1));
  ["P0", "P1", "P2"].forEach((s) => console.log("  " + s + ": " + (bySev[s] || 0)));
  console.log("\n慢请求 >2s：" + slow.length + "；大响应 >5MB：" + bigBytes.length);
  console.log("→ " + OUT);
})();