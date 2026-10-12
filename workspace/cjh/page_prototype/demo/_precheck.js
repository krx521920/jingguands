#!/usr/bin/env node
/**
 * 2026-10-11 · 数据预置守卫（宗核对单第 8 项「展示层现场可跑」六条的机检版）
 *
 * 领导问「页面数据预置完成没有」——口头说"完成了"就是自证。
 * 这道门把六条拆成可复算的断言，任何一条不成立就 FAIL。
 *
 * 六条（宗 10-10 实测原话 → 现在逐条验）：
 *   ① data_unified/ 未入库（clone 后为 0/null）
 *   ② 集成包仍旧构建（008 判定不符）
 *   ③ 用例仍是旧版且按关键词映射（008 映射错）
 *   ④ 标准化口径未收口
 *   ⑤ 解析快照未物化
 *   ⑥ 上传闸门不查契约必填字段
 *
 * ★ 关键设计：**第 ① 条必须在"纯净树"里验**（直接从 HEAD 树 git archive 导出）。
 *   在工作区里数data_unified/ 份数是自欺 —— 工作区可能有未入库的新文件。
 *   本脚本自己起纯净树、自己起服务、自己打真 HTTP。
 *   反证：--prove 会在纯净树里删掉一份权威信封，必须让第 ① 条 FAIL。
 */
const { execFileSync, spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const PAGE = path.resolve(__dirname, "..");
const REPO = path.resolve(PAGE, "..", "..", "..");
const PORT = Number(process.env.PRECHECK_PORT || 8673);
const PROVE = process.argv.includes("--prove");
const TMP = path.join(REPO, "..", "tmp_precheck");

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log("  ✔ " + name + (detail ? "  " + detail : "")); }
  else { fail++; console.log("  ✘ " + name + (detail ? "  " + detail : "")); }
  return cond;
};
const sec = (t) => console.log("\n── " + t);

function sh(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}
function get(pathname) {
  return new Promise((res, rej) => {
    http.get({ host: "127.0.0.1", port: PORT, path: pathname }, r => {
      let b = ""; r.on("data", d => (b += d));
      r.on("end", () => { try { res({ status: r.statusCode, json: JSON.parse(b) }); } catch (e) { rej(e); } });
    }).on("error", rej);
  });
}
async function waitUp(ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await get("/api/datasets"); if (r.status === 200) return true; } catch (e) {}
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
}

(async function main() {
  console.log("2026-10-11 · 数据预置守卫" + (PROVE ? "（含反证）" : ""));

  // ── 导出纯净树：从 HEAD 树 archive，模拟"评委 clone 后拿到的东西" ──
  sec("纯净树导出（git archive HEAD，模拟 clone）");
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  // ★ Windows 的 tar 把 "D:\..." 一律当成远程主机（"Cannot connect to D: resolve failed"），
  //   所以路径只能靠 cwd 传，不能出现在参数里；archive 走 stdin 管道。
  const tarBuf = execFileSync("git", ["archive", "HEAD", "workspace/cjh"], {
    cwd: REPO, maxBuffer: 256 * 1024 * 1024,
  });
  execFileSync("tar", ["-x", "-f", "-"], { cwd: TMP, input: tarBuf, maxBuffer: 256 * 1024 * 1024 });

  const PP = path.join(TMP, "workspace", "cjh", "page_prototype");
  const env = fs.readdirSync(path.join(PP, "data_unified")).filter(f => f.endsWith(".json"));
  const spec = fs.existsSync(path.join(TMP, "workspace", "cjh", "spec", "v0.3", "event-envelope.schema.json"));

  sec("宗第 8 项 · 六条逐条机检");
  // ① data_unified 已入库
  ok("① data_unified 已入库（clone 后非 0/null）", env.length >= 31, "纯净树 " + env.length + " 份");
  // 附带：契约 schema 必须一起在（只导 page_prototype 会让校验器读不到 → 起不来）
  ok("①b 契约 schema 随页面同在（spec/v0.3）", spec);

  // 起服务（工作区代码 ≡ HEAD 代码，因为本脚本运行时工作区与 HEAD 一致；
  //   纯树代码用 archive 的副本启动，验的是"库里那份能不能跑"）
  const srv = spawn(process.execPath, ["server.js"], {
    cwd: PP, env: { ...process.env, PORT: String(PORT) }, stdio: "ignore",
  });
  const up = await waitUp(45000);
  if (!up) {
    console.log("\n✘ 纯净树服务起不来 —— 现场演示会当场翻车，先修这个。");
    console.log("  手动复现：git archive HEAD workspace/cjh | tar -x -C <dir> && cd <dir>/workspace/cjh/page_prototype && node server.js");
    srv.kill();
    process.exit(1);
  }

  try {
    const ds = await get("/api/datasets");
    const mt = await get("/api/metrics");
    const rs = await get("/api/result?dataset=D4-PLD-001");

    // ①续：接口层确认权威批可读
    const auth = (ds.json.sources || []).filter(x => x.batch === "authoritative");
    ok("①c 接口层权威批可读", auth.length >= 31, "sources " + ds.json.sources.length + " / 权威 " + auth.length);
    ok("①d 锚点校验通过", ds.json.data_source && ds.json.data_source.anchor.matches === true);
    ok("①e 权威口径分母 = 606", mt.json.summary && mt.json.summary.fields_total === 606,
      "实际 " + (mt.json.summary && mt.json.summary.fields_total));

    // ②③ 集成包/ 用例：关系判定读 expected_relation，且 008 判 unknown
    //★ 用例集与结果包是两个文件：expected_relation 在 integration_cases.json（用例），
    //   integration_bundle.json 是执行结果（只有 report.diffs.relation）。查错文件会误判成"没刷新"。
    const casesPath = path.join(PP, "data", "d10", "integration_cases.json");
    const bundlePath = path.join(PP, "data", "d10", "integration_bundle.json");
    const cs = JSON.parse(fs.readFileSync(casesPath, "utf8"));
    const bundle = JSON.parse(fs.readFileSync(bundlePath, "utf8"));
    const rows = cs.cases || [];
    const c008 = rows.find(r => String(r.case_id || "").endsWith("008"));
    ok("② 用例集已刷新（含 expected_relation）",
      rows.length > 0 && rows.every(r => r.expected_relation !== undefined),
      "cases " + rows.length);
    ok("②b 结果包与用例集份数一致",
      (bundle.results || []).length === rows.length,
      "results " + (bundle.results || []).length + " / cases " + rows.length);
    ok("③ 008 关系判定为 unknown（非关键词映射的 unrelated）",
      !!c008 && c008.expected_relation === "unknown",
      c008 ? "expected_relation=" + c008.expected_relation : "用例集内无 008");
    // 结果包侧实际判出的关系也要跟用例集一致（两端同源才算真刷新）
    const b008 = (bundle.results || []).find(r => String(r.case_id || "").endsWith("008"));
    const gotRel = b008 && b008.report && b008.report.diffs && b008.report.diffs.relation;
    ok("③b 结果包侧 008 实判=unknown（与用例集一致）", gotRel === "unknown",
      "实判 " + gotRel);
    // 关键词映射的残留：老口径把 explainable_difference 映成 unrelated。
    // ★ 只扫可执行代码（去注释）——那段"已删除的旧映射"是注释里留的反例记录，
    //   用来解释为什么删。正则扫全文会把它当成残留，那是误伤。
    const codeOnly = fs.readFileSync(path.join(PP, "server.js"), "utf8")
      .split("\n").filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    ok("③c 关系判定只读 expected_relation（无关键词映射残留）",
      !/explainable_difference[^;]{0,40}unrelated/.test(codeOnly));
    ok("③d 实判函数存在且读 expected_relation",
      /expected_relation/.test(codeOnly) && /RELATION_ENUM/.test(codeOnly));

    // ④ 标准化口径：两指标分开，无目标的不谎报达标
    const cards = mt.json.cards || [];
    const byKey = k => cards.find(c => c.key === k);
    const cov = byKey("standardized_pct"), acc = byKey("standardized_accuracy_pct");
    ok("④ 标准化两指标已拆分（覆盖/正确率各一卡）", !!cov && !!acc);
    ok("④b 无目标项判 no_target（不谎报达标）",
      !!cov && cov.target === null && cov.status === "no_target",
      cov ? "status=" + cov.status + " target=" + cov.target : "");
    ok("④c 有目标项正常判 pass", !!acc && acc.target !== null && acc.status === "pass",
      acc ? acc.value_text + " target=" + acc.target + " " + acc.status : "");
    // NaN / undefined 不得泄漏到接口
    const raw = JSON.stringify(mt.json);
    ok("④d 接口无 NaN/undefined 泄漏", !/NaN|undefined/.test(raw));

    // ⑤ 快照：不在库里是设计（运行侧资产），但必须能一条命令取回
    const snapInRepo = fs.existsSync(path.join(PP, "data_unified", "_snapshots"));
    ok("⑤ 快照不入库（运行侧资产，不占展示层体积）", !snapInRepo);
    ok("⑤b 取件脚本在库（一条命令可复现）",
      fs.existsSync(path.join(PP, "demo", "_d13_snapshot_fetch.js")));

    // ⑥ 上传闸门接契约机检：代码里必须真用校验结果，不能只是"调用了 toContract"
    const srvSrc = fs.readFileSync(path.join(PP, "server.js"), "utf8");
    const hasCheck = /contract_validation/.test(srvSrc) && /entry\.error\s*=\s*"契约校验未通过/.test(srvSrc);
    ok("⑥ 上传闸门按contract_validation 判失败（不只看 events 数组）", hasCheck);
    const dsSrc = fs.readFileSync(path.join(PP, "bridge", "data_source.js"), "utf8");
    ok("⑥b 数据集清单带契约状态（经 toContract，非直调校验器）",
      /contract\s*:/.test(dsSrc) && /toContract/.test(dsSrc));

    //结果接口的基本可用性（现场第一动作就是点数据集）
    ok("结果接口出事件与证据",
      rs.status === 200 && rs.json.events.length > 0 && (rs.json.evidences || []).length > 0,
      "events " + (rs.json.events || []).length + " / evidences " + ((rs.json.evidences || []).length));

    // ── 反证：抽掉足够多的权威信封，① 必须 FAIL ──
    if (PROVE) {
      sec("反证（证明这道门不是恒 PASS）");
      // ★ 阈值是 31（宗裁定的权威批口径），而目录里实有 32 份。
      //   只撤 1 份 → 剩 31 份，仍 ≥ 阈值 ⇒ 门本就该 PASS。
      //   **反证必须撤到跨过阈值**，否则验的是"门没反应"而不是"门在检"。
      const victims = env.filter(f => f.startsWith("D4-PLD-")).slice(0, 2);
      if (victims.length < 2) throw new Error("反证需要至少 2 份 D4-PLD-* 信封，实际 " + victims.length);
      const backups = victims.map(v => {
        const p = path.join(PP, "data_unified", v);
        return { p, buf: fs.readFileSync(p) };
      });
      backups.forEach(b => fs.unlinkSync(b.p));
      const ds2 = await get("/api/datasets");
      const auth2 = (ds2.json.sources || []).filter(x => x.batch === "authoritative");
      const stillOk = auth2.length >= 31;
      ok("反证：撤走 2 份权威信封后 ① 应 FAIL（当前 " + auth2.length + " 份，阈值 31）", !stillOk,
        stillOk ? "✘ 撤到 " + auth2.length + " 份门还判过 —— 门失灵" : "门正确反映了缺件（" + auth2.length + " < 31）");
      backups.forEach(b => fs.writeFileSync(b.p, b.buf));
      const ds3 = await get("/api/datasets");
      const auth3 = (ds3.json.sources || []).filter(x => x.batch === "authoritative");
      ok("反证：复归后 ① 回到 PASS（" + auth3.length + " 份）", auth3.length >= 31);
    }
  } finally {
    srv.kill();
    fs.rmSync(TMP, { recursive: true, force: true });
  }

  console.log("\n" + "─".repeat(52));
  console.log("PASS " + pass + "　FAIL " + fail);
  if (fail) {
    console.log("⇒ 现场演示前必须先修 FAIL 项。宗核对单第 8 项六条任一不过，评委当场就能看出来。");
  } else {
    console.log("⇒ 六条全过：clone 后即可演示，无隐式前置步骤（快照取件除外，已写进 README 且不阻塞页面）。");
  }
  process.exit(fail ? 1 : 0);
})();