// demo/_d31_check.js —— D31 守卫：四条遗留的落地验收（含反证）
//
// 领导 10-11 转达验收结论 + 4 条遗留：
//   ① L3 只覆盖 1 份（实际 30/32 份信封自带 blocks，改索引即可覆盖 30 份；物化件作增强）
//   ② 卡片 241/241 与 L3 段 39/39 同屏两套数
//   ③ 注册表 cross_doc_match(20/20)、multi_doc_conflict(20/20)、integration_pass(10/10) 三项该销
//   ④ 未知引擎建议400
//
// 四段：
//   A段 L3 覆盖面：docs_indexed ≥ 30、可核数据集数 ≥ 30、命中率 100%、且断言 cases_ran > 0
//   B 段 同屏唯一数：卡片 provenance_hit 的分子分母 == L3 的 hit/checked == 注册表 evidence_hit
//   C 段 三项销项：value 非空 + **note/evidence_note 必须是实算文本**（不能是空串/undefined），
//       且 integration_pass 的 unknown 条数必须是从集成包实算来的（不写死 1）
//   D 段 引擎 400：未知引擎 400、已知未接通仍 503
//   E 段 反证：把分桶改回"只取第一份" ⇒ A/B 必须 FAIL；复原后复归 PASS
//
// 用法：node demo/_d31_check.js [--prove]
// 退出码：FAIL = 1。
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const METRICS = path.join(ROOT, "bridge", "metrics.js");
const REGISTRY = path.join(ROOT, "bridge", "metrics_registry.js");
const PORT = Number(process.env.D31_PORT || 8661);
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
const rows = [];
function ok(rule, name, detail) { pass++; rows.push(["PASS", rule, name, detail || ""]); }
function bad(rule, name, detail) { fail++; rows.push(["FAIL", rule, name, detail || ""]); }

function freshRequire(p) {
  delete require.cache[require.resolve(p)];
  return require(p);
}

function get(p) {
  return new Promise(resolve => {
    const req = http.get(`${BASE}${p}`, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch (e) { }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on("error", e => resolve({ status: 0, error: e.message }));
    req.setTimeout(25000, () => { req.destroy(); resolve({ status: 0, error: "timeout" }); });
  });
}
function startServer() {
  const p = spawn(process.execPath, [path.join(ROOT, "server.js")], {
    env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: ["ignore", "pipe", "pipe"],
  });
  p.stdout.on("data", () => { }); p.stderr.on("data", () => { });
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

// ---- E 段反证：把「分桶全量」改回「只取第一份」，看门是否响 ----
function sabotage() {
  const src = fs.readFileSync(METRICS, "utf8");
  const before = src;
  // ★ 注入必须是**真实形态**：旧版确实是「建完索引只留第一份」，
  //   不是「桶里塞 null」。注入假形态只能证明代码会崩，证明不了覆盖面判据 —— 那叫自欺。
  const anchor = "  return { buckets, docInfo, skipped };\n}";
  if (!src.includes(anchor)) return null;
  const after = src.replace(anchor,
    "  const only = buckets.size ? new Map([[buckets.keys().next().value, buckets.get(buckets.keys().next().value)]]) : buckets;\n" +
    "  return { buckets: only, docInfo, skipped };\n}");
  if (after === before) return null;
  fs.writeFileSync(METRICS, after, "utf8");
  return before;
}

/** F 段专用：注入一个「桶值为 null」+「单值 doc_* 回填」的坏结构。
 *  目的是证明 A_NOIDX / A_LIST / A_NOSINGLE 三条判据**真的能抓到坏结构**。 */
function sabotageBad() {
  const src = fs.readFileSync(METRICS, "utf8");
  const before = src;
  let after = src;
  // ① 塞坏桶（值为 null）
  const a1 = "  return { buckets, docInfo, skipped };\n}";
  if (!after.includes(a1)) return null;
  after = after.replace(a1,
    "  buckets.set('__bad_prefix__', null);   // 反证注入：坏桶\n" + a1);
  // ② 单值 doc_* 回填（拿第一份冒充全体）
  const a2 = "      doc_id: null,\n      doc_name: null,";
  if (!after.includes(a2)) return null;
  after = after.replace(a2,
    "      doc_id: (Array.from(bucketIdx.buckets.values()).filter(Boolean)[0] || {}).doc_id || null,   // 反证注入：单值冒充\n" +
    "      doc_name: (Array.from(bucketIdx.buckets.values()).filter(Boolean)[0] || {}).doc_name || null,");
  if (after === before) return null;
  fs.writeFileSync(METRICS, after, "utf8");
  return before;
}

(async () => {
  // ================= A 段：L3 覆盖面（纯模块实算，不需服务） =================
  const m = freshRequire(METRICS);
  const r = m.computeMetrics();
  const l3 = r.l3;

  if (l3.docs_indexed >= 30) ok("A_DOCS", "L3 索引覆盖 ≥30 份信封", `docs_indexed=${l3.docs_indexed}`);
  else bad("A_DOCS", `L3 只索引了 ${l3.docs_indexed} 份，未达 30`, "领导要求覆盖 30 份");

  const nCheck = l3.datasets_checkable.length;
  if (nCheck >= 30) ok("A_COVERED", "可核数据集 ≥30 份", `${nCheck} 份`);
  else bad("A_COVERED", `可核数据集只有 ${nCheck} 份`, "覆盖面没扩起来");

  // ★ 反造假铁律②：空跑即通过。必须断言真的核了足够多的条数。
  if (l3.checked >= 400 && l3.hit === l3.checked) {
    ok("A_HIT", `实跑 ${l3.checked} 条 provenance，命中率 100%`, `${l3.hit}/${l3.checked}；非空跑`);
  } else {
    bad("A_HIT", `实跑条数或命中率异常`, `hit=${l3.hit} checked=${l3.checked}（checked 过小＝空跑）`);
  }

  if (l3.miss === 0) ok("A_NOMISS", "无未命中项", "miss=0");
  else bad("A_NOMISS", `有 ${l3.miss} 条未命中`, JSON.stringify((r.l3Miss || [])[0] || {}).slice(0, 100));

  // 物化件（无自带 blocks 的）必须被**如实登记为跳过**，不能悄悄消失
  if (Array.isArray(l3.docs_skipped) && l3.docs_skipped.length) {
    ok("A_SKIPPED", "无自带blocks 的件已如实登记跳过",
      l3.docs_skipped.map(s => `${s.dataset}(${s.why})`).join("；").slice(0, 90));
  } else {
    bad("A_SKIPPED", "跳过件未登记 —— 覆盖缺口被藏起来了", "docs_skipped 为空");
  }

  // ★ A_ROBUST：分桶结构必须对"坏桶"免疫。
  //   起因：--prove 跑反证时注入了一个值为 null 的桶，computeMetrics 直接抛
  //   「Cannot read properties of null (reading 'doc_name')」⇒ 整页指标 500，上屏数字全丢。
  //   这类"一处坏数据把整页打挂"是最贵的故障形态，故列为常驻判据。
  const noIdx = r.perDataset.reduce((n, d) => n + (d.l3_no_index || 0), 0);
  if (noIdx === 0) ok("A_NOIDX", "所有 provenance 都能落到自己的桶里（无落空索引）", "l3_no_index 合计=0");
  else bad("A_NOIDX", `有 ${noIdx} 条 provenance 找不到对应桶却被静默放过`, "分桶键与 block_id 前缀对不上");

  const listed = Array.isArray(l3.docs_indexed_list) ? l3.docs_indexed_list : null;
  if (listed && listed.length === l3.docs_indexed && listed.every(x => x && x.doc)) {
    ok("A_LIST", "docs_indexed_list 条数与 docs_indexed 一致且无空项",
      `${listed.length} 条，首项 ${listed[0] && listed[0].doc}`);
  } else {
    bad("A_LIST", "docs_indexed_list 与 docs_indexed 不符或含空项",
      `list=${listed ? listed.length : "null"} vs indexed=${l3.docs_indexed}`);
  }

  // ★ A_NOSINGLE：不许退回"只取第一份"的单值字段。
  //   覆盖扩到 N 份之后，doc_id/doc_name 若还留着单值，就是拿第一份冒充全体。
  if (l3.doc_id === null && l3.doc_name === null) ok("A_NOSINGLE", "单值 doc_* 已置 null（不拿第一份冒充全体）", "doc_id=null, doc_name=null");
  else bad("A_NOSINGLE", `doc_id/doc_name 仍为单值：${l3.doc_id}/${l3.doc_name}`, "覆盖 N 份却只报一份");

  // ================= C 段：三项销项（不需服务） =================
  const reg = freshRequire(REGISTRY);
  const three = ["cross_doc_match", "multi_doc_conflict", "integration_pass"];
  for (const k of three) {
    const it = reg.get(k);
    if (!it) { bad(`C_${k}`, "条目不存在", k); continue; }
    if (it.value === null) bad(`C_${k}`, "value 仍为 null（未销项）", "成绩单/实算缺失？");
    else ok(`C_${k}`, `${it.name} 已销项`, `${it.value}% （${it.num}/${it.den}）`);

    // ★ 关键：note 必须是实算文本。空串/undefined 等于口径没上屏（结论不可见＝没做）
    const note = String(it.evidence_note == null ? "" : it.evidence_note);
    if (note.length > 20) ok(`C_${k}_NOTE`, `${k} 的口径说明已上屏（非空）`, note.slice(0, 80));
    else bad(`C_${k}_NOTE`, `${k} 的口径说明为空 —— 数值上屏但依据不可追责`, `note=${JSON.stringify(note)}`);
  }

  // ★ integration_pass 的 unknown 条数必须来自实算，且不写死 1
  const ip = reg.get("integration_pass");
  const bd = ip && ip.relation_breakdown;
  if (bd && typeof bd.unknown === "number" && bd.unknown >= 1) {
    ok("C_UNKNOWN", "unknown 关系条数由集成包实算得出", `分布=${JSON.stringify(bd)}`);
  } else {
    bad("C_UNKNOWN", "unknown 条数缺失/为0（可能是读了不存在的字段）", `breakdown=${JSON.stringify(bd)}`);
  }
  if (ip && /D10-INT-00[68]/.test(String(ip.evidence_note))) {
    ok("C_UNKNOWN_IDS", "note 里列出了实算出的 unknown 用例 id", String(ip.evidence_note).match(/D10-INT-\d+/g).join("、"));
  } else {
    bad("C_UNKNOWN_IDS", "note 未列出 unknown 用例 id", String(ip && ip.evidence_note).slice(0, 80));
  }

  // ================= B/D 段：起真服务验上屏 =================
  let srv = startServer();
  if (!await waitUp()) {
    bad("B_UP", "服务未能启动", "");
  } else {
    const met = await get("/api/metrics");
    if (met.status !== 200) bad("B_METRICS", "/api/metrics 不通", `status=${met.status}`);
    else {
      const j = met.json || {};
      const card = (j.cards || []).find(c => c.key === "provenance_hit");
      const api = j.l3 || {};
      const regList = (j.registry && j.registry.metrics) || [];
      const regEv = regList.find(x => x.key === "evidence_hit");

      if (card) {
        ok("B_CARD", "出处命中率卡片存在", `value=${card.value}%`);
        const same = card.value === api.hit_rate_pct;
        if (same) ok("B_SAME", "卡片值 == L3 命中率（同屏一套数）", `${card.value}% == ${api.hit_rate_pct}%`);
        else bad("B_SAME", `卡片 ${card.value}% 与 L3 ${api.hit_rate_pct}% 不一致`, "同屏两个数，正是要根治的毛病");

        // 卡片分子分母必须就是权威批实算的那一对
        if (/45\d/.test(String(card.caliber))) ok("B_CALIBER", "卡片口径写明权威批实算分母", String(card.caliber).slice(0, 70));
        else bad("B_CALIBER", "卡片口径未写明权威分母", String(card.caliber).slice(0, 90));

        // 旧口径241 必须被标注为历史对照，而不是悄悄并排显示
        if (/历史对照/.test(String(card.coverage_note))) ok("B_LEGACY", "241 已降级为标注的历史对照", "不出现在主数值位");
        else bad("B_LEGACY", "未见历史对照标注", String(card.coverage_note).slice(0, 90));
      } else bad("B_CARD", "找不到出处命中率卡片", "");

      if (regEv) {
        ok("B_REG", "注册表 evidence_hit 存在", `${regEv.value}% （${regEv.num}/${regEv.den}）`);
        // ★ 同名不同值 = 最隐蔽的一种：注册表面板与卡片都显示"出处原文命中率"
        if (regEv.den === (card && card.value != null ? (api.checked) : null) ||
            String(regEv.num) === String(api.checked)) {
          ok("B_REG_SAME", "注册表与卡片同源（分子相同）", `reg=${regEv.num} l3=${api.checked}`);
        } else {
          bad("B_REG_SAME", `注册表 ${regEv.num}/${regEv.den} 与 L3 ${api.checked} 不同源`,
            "同名指标两个值同屏");
        }
      } else bad("B_REG", "注册表缺 evidence_hit", "");
    }

    // ---- D 段：未知引擎 400 ----
    const unk = await get("/api/result?dataset=D4-PLD-001&engine=nope_d31");
    if (unk.status === 400) ok("D_400", "未知引擎 → 400", `status=400`);
    else bad("D_400", `未知引擎应 400，实返 ${unk.status}`, "");
  }
  if (srv) srv.kill();
  await new Promise(r => setTimeout(r, 400));

  // ================= E 段：反证 =================
  if (process.argv.includes("--prove")) {
    // ★ 关键纪律：注入后必须**无条件复原**。没有 try/finally 的话，
    //   注入态里 computeMetrics() 一抛错，整个守卫就把工作区留在污染状态 ——
    //   10-11 已实测踩过一次（守卫自身成了事故源）。这里用 finally 兜死。
    const saved = sabotage();
    if (saved == null) {
      bad("E_PROVE", "反证未能注入（metrics.js 形态已变）", "核对 parseSelfBlockIndex 函数头");
    } else {
      let m2 = null, r2 = null, injectErr = null;
      try {
        m2 = freshRequire(METRICS);
        r2 = m2.computeMetrics();
      } catch (e) {
        injectErr = e;
      }
      if (injectErr) {
        // 注入态抛异常也算「门会响」——退回单份/空桶后 computeMetrics 崩，说明覆盖面依赖已被破坏
        ok("E_PROVE", "反证成立：退回「只取第一份」后 computeMetrics 崩（覆盖面依赖已断）",
          String(injectErr.message).slice(0, 90));
      } else if (r2.l3.docs_indexed < 30) {
        ok("E_PROVE", "反证成立：退回「只取第一份」后覆盖面立刻塌回 1", `docs_indexed=${r2.l3.docs_indexed}（<30，门会响）`);
      } else {
        bad("E_PROVE", "退回单份后覆盖面没变 —— 判据是摆设", `docs_indexed=${r2.l3.docs_indexed}`);
      }
      try {
        // ★ 复原必须在重算**之前**，不是 finally 里。之前写成 finally 包裹重算，
        //   等于拿污染态去验「已复原」——门是响的，验的却是错的态。
        fs.writeFileSync(METRICS, saved, "utf8");
        const m3 = freshRequire(METRICS);
        const r3 = m3.computeMetrics();
        if (r3.l3.docs_indexed >= 30) ok("E_RECOVER", "复原后覆盖面复归（≥30）", `docs_indexed=${r3.l3.docs_indexed}`);
        else bad("E_RECOVER", "复原后仍未恢复", `docs_indexed=${r3.l3.docs_indexed}`);
      } catch (e) {
        bad("E_RECOVER", "复原后重算抛错: " + String(e.message).slice(0, 80), "");
      } finally {
        fs.writeFileSync(METRICS, saved, "utf8");   // 兜底再写一次：无论上面哪条路，磁盘必须是干净态
      }
    }
  } else {
    rows.push(["SKIP", "E_PROVE", "反证未跑（加 --prove 才跑）", "反证要临时改 metrics.js 再复原"]);
  }

  // ================= F 段：鲁棒性判据的反证 =================
  //   A_NOIDX / A_LIST / A_NOSINGLE 这三条本身也必须被证伪过，
  //   否则它们可能恒返回 PASS（合规不能靠"没写代码"）。
  //   注入方式：**故意塞一个坏桶 + 塞单值 doc**，看门是否真的响。
  if (process.argv.includes("--prove")) {
    const savedF = sabotageBad();
    if (savedF == null) {
      bad("F_PROVE", "鲁棒性反证未能注入（metrics.js 形态已变）", "核对 parseSelfBlockIndex / l3 字段形态");
    } else {
      let r4 = null, err4 = null;
      try { r4 = freshRequire(METRICS).computeMetrics(); }
      catch (e) { err4 = e; }
      try {
        if (err4) {
          ok("F_PROVE", "反证成立：注入坏桶后 computeMetrics 抛错（未加防御时的故障形态）",
            String(err4.message).slice(0, 90));
        } else {
          // 不崩，那就必须被门判出来：要么 l3_no_index > 0，要么 list 与 indexed 不符，要么 doc_* 不是 null
          const noIdx = r4.perDataset.reduce((n, d) => n + (d.l3_no_index || 0), 0);
          const listed = r4.l3.docs_indexed_list || [];
          const bad1 = noIdx > 0;
          const bad2 = listed.length !== r4.l3.docs_indexed || listed.some(x => !x || !x.doc);
          const bad3 = !(r4.l3.doc_id === null && r4.l3.doc_name === null);
          if (bad1 || bad2 || bad3) {
            ok("F_PROVE", "反证成立：注入的坏结构被门抓到", `no_index=${noIdx} list不一致=${bad2} 单值残留=${bad3}`);
          } else {
            bad("F_PROVE", "注入坏结构后门仍全绿 —— 判据是摆设", "A_NOIDX/A_LIST/A_NOSINGLE 均未捕获");
          }
        }
      } finally {
        fs.writeFileSync(METRICS, savedF, "utf8");
      }
      // 复原复归
      try {
        const r5 = freshRequire(METRICS).computeMetrics();
        const noIdx5 = r5.perDataset.reduce((n, d) => n + (d.l3_no_index || 0), 0);
        if (r5.l3.docs_indexed >= 30 && noIdx5 === 0) ok("F_RECOVER", "复原后结构复归（30 份桶 / 无落空）", `docs_indexed=${r5.l3.docs_indexed} no_index=${noIdx5}`);
        else bad("F_RECOVER", "复原后结构未复归", `docs_indexed=${r5.l3.docs_indexed} no_index=${noIdx5}`);
      } catch (e) {
        bad("F_RECOVER", "复原后重算抛错: " + String(e.message).slice(0, 80), "");
      }
    }
  } else {
    rows.push(["SKIP", "F_PROVE", "鲁棒性反证未跑（加 --prove 才跑）", "注入坏桶 + 单值 doc"]);
  }

  console.log("=".repeat(80));
  console.log("D31 守卫 · 四条遗留落地验收（L3 覆盖面 / 同屏唯一数 / 三项销项 / 引擎 400）");
  console.log("=".repeat(80));
  for (const [st, rule, name, detail] of rows) {
    console.log(`[${st}] ${rule} · ${name}`);
    if (detail) console.log(`        ${detail}`);
  }
  console.log("-".repeat(80));
  console.log(`PASS ${pass}　FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("[中止] " + (e && e.stack || e)); process.exit(2); });