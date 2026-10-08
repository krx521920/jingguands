// _engine_check.js —— D12 抽取引擎适配层验证（只读，可重跑）
//
// 验的是「机制是否诚实」，不是「数据是否一致」：
//   ① 引擎清单是否如实报告可用性与能力
//   ② 同源对照是否被判 not_covered（D10 web_cli_same_result 造假的同款陷阱）
//   ③ 未接通 live 引擎时是否给出可执行的解阻信息
//   ④ CLI 通道是否真的能跑通（用 demo/_fake_extract_cli.js + 临时 PDF）
//   ⑤ 注入差异时能否抓住（防止"永远 pass"的假对照）
//   ⑥ 页面是否已不再把 web_cli_same_result 渲染成"一致 ✔"
//
// 用法：node demo/_engine_check.js
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = path.resolve(__dirname, "..");
const extractor = require(path.join(ROOT, "bridge", "extractor.js"));

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log(`  PASS  ${name}${extra ? "  — " + extra : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${extra ? "  — " + extra : ""}`); }
};

// ============================================================
console.log("\n【1】引擎清单与能力声明");
const engines = extractor.describeEngines();
const byId = Object.fromEntries(engines.map(e => [e.id, e]));
ok(engines.length >= 3, "至少注册 3 个引擎（file + 2 个预留）", `实到 ${engines.length}`);
ok(byId.file && byId.file.kind === "prebuilt" && byId.file.caps.reruns_extraction === false,
   "file 引擎诚实声明 reruns_extraction=false（不是独立抽取）");
ok(byId.cli && byId.cli.kind === "live" && byId.cli.caps.reruns_extraction === true,
   "cli 引擎声明 reruns_extraction=true（独立跑抽取）");
ok(byId.cli && !byId.cli.available && /EXTRACT_CLI_PARSE_DIR|密钥/.test(byId.cli.reason),
   "cli 未配置时 available=false 且原因指向可设的环境变量/密钥", byId.cli && byId.cli.reason);
ok(byId.http && !byId.http.available && /EXTRACT_HTTP_URL/.test(byId.http.reason),
   "http 未配置时 available=false 且原因指向 EXTRACT_HTTP_URL");
ok(extractor.defaultEngine() === "file", "无 live 引擎时默认落file（唯一可用）", extractor.defaultEngine());

// ============================================================
console.log("\n【2】同源拒判（D10 造假的同款陷阱）");
(async () => {
  const sameSrc = await extractor.parity(["pledge"], { a: "file", b: "file" });
  ok(sameSrc.verdict === "not_covered", "两侧同为 file → 判 not_covered", sameSrc.verdict);
  ok(sameSrc.same_source === true, "同源时带same_source=true 标记");

  const missing = await extractor.parity(["pledge"], { a: "file", b: "cli" });
  ok(missing.verdict === "not_covered", "cli 未接通 → 判 not_covered（不假装 pass）", missing.verdict);
  ok(Array.isArray(missing.blockers) && missing.blockers.length > 0, "给出阻塞项清单");
  ok(/魏文宇/.test(missing.remedy || ""), "解阻建议明确指向责任人", missing.remedy ? missing.remedy.slice(0, 40) + "…" : "");

  // ============================================================
  console.log("\n【3】CLI 通道实跑（假 CLI 严格复刻魏 run_extract.mjs 的调用契约）");
  // 魏的入口收 --parse/--input，**不收 PDF** ⇒ 这里造的是解析 JSON，不是 .pdf
  const inputDir = fs.mkdtempSync(path.join(os.tmpdir(), "cjh-parse-"));
  const ids = extractor.PROVIDERS.file.list();
  for (const id of ids) {
    fs.writeFileSync(path.join(inputDir, id + ".parse.json"), JSON.stringify({
      schema_version: "0.3", doc: { doc_id: "stub" },
      pages: [{ page: 1, blocks: [{ block_id: "stub_p001_b00001", text: "stub", text_raw: "stub" }] }]
    }));
  }

  // ★ 密钥守卫：无密钥时即便入口和输入都齐，也必须判未接通（不能默默 --mock）
  const keyBackup = {
    a: process.env.JINGGUAN_LLM_API_KEY, d: process.env.DEEPSEEK_API_KEY
  };
  delete process.env.JINGGUAN_LLM_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;

  process.env.EXTRACT_CLI_CMD = "node " + path.join("demo", "_fake_extract_cli.js");
  process.env.EXTRACT_CLI_PARSE_DIR = inputDir;
  process.env.EXTRACT_CLI_REPO = ROOT;
  delete process.env.EXTRACT_CLI_TXT_DIR;

  const noKey = extractor.describeEngines().find(e => e.id === "cli");
  ok(noKey.available === false, "无密钥 → cli 判未接通（不默默回落 mock）", noKey.reason);
  ok(/密钥/.test(noKey.reason || ""), "阻塞原因点明缺 LLM 密钥", (noKey.reason || "").slice(0, 60) + "…");

  // 假密钥：只为验证链路活着。★ 注意这不代表真跑通了——真跑必须有真密钥
  process.env.JINGGUAN_LLM_API_KEY = "sk-selftest-NOT-A-REAL-KEY";
  const live = extractor.describeEngines();
  ok(live.find(e => e.id === "cli").available === true, "设环境变量后 cli 变为可用");
  ok(extractor.defaultEngine() === "cli", "有 live 引擎时默认切到 live（自动优先）", extractor.defaultEngine());

  const r = await extractor.parity(ids, { a: "file", b: "cli" });
  // ★ 预期拒判：本地 30 份信封里有 2 份自认 is_mock=true（share_change / wei_multi_event_test），
  //   另有 1 份guarantee 类不在魏 registry 里。守卫必须精准拒掉这 3 份、且**不误伤**其余 27 份。
  const mockList = JSON.parse(fs.readFileSync(path.join(__dirname, "_mock_datasets.json"), "utf8"));
  const rejected = (r.cases || []).filter(c => !c.ok);
  const rejMock = rejected.filter(c => /is_mock/.test(c.reason || "")).map(c => c.case_id || c.id);
  const rejUnsup = rejected.filter(c => /引擎侧不支持/.test(c.reason || "")).map(c => c.case_id || c.id);
  ok(rejMock.length === mockList.length && mockList.every(m => rejMock.includes(m)),
     "拒判中的 mock 例恰为已知 mock 数据集（未误伤真数据）", `拒 ${rejMock.length}：${rejMock.join(",")}`);
  ok(rejUnsup.length === 1 && rejUnsup[0] === "bank_guarantee",
     "guarantee 类被标「引擎侧不支持」而非混入其他原因", rejUnsup.join(","));
  ok(rejected.length === mockList.length + 1, "拒判总数 = mock + 引擎不支持，无其他", `${rejected.length} = ${mockList.length}+1`);
  // ★ 检查顺序：mock 判定必须在映射判定之前 —— 否则 mock 样本报的是
  //   「无法推断事件类型」，听起来像映射缺项，实际是它本不该参与对照。
  const mockCase = rejected.find(c => /is_mock/.test(c.reason || "") && /不是映射问题/.test(c.reason || ""));
  ok(!!mockCase, "★ mock 样本先被判mock（不被映射错误掩盖）", (mockCase && (mockCase.case_id || mockCase.id)) || "未找到");
  ok(r.cases_ran === ids.length - rejected.length, "其余数据集全部跑成", `${r.cases_ran}/${r.cases_total}`);
  ok(r.verdict === "pass", "可对照部分链路跑通 → pass", `${r.cases_ran}/${r.cases_total} 例，${r.fields_same}/${r.fields_compared} 字段`);

  // ★★ 契约对齐守卫：入参必须是 argv --parse，不是 env CASE_ID/PDF_PATH
  const src = fs.readFileSync(path.join(ROOT, "bridge", "extractor.js"), "utf8");
  ok(/"--parse"|"--input"/.test(src) && /--out-dir/.test(src), "适配层按魏的 argv 契约拼参（--parse/--input/--out-dir）");
  ok(!/PDF_PATH/.test(src), "已废弃 env PDF_PATH 契约（魏的入口不收 PDF）");
  ok(/events\.json/.test(src), "输出按魏的落盘约定读 events.json（不是 stdout）");
  // ★ mock 二次守卫：产物自认 is_mock 必须拒判
  ok(/is_mock/.test(src) && /mock 成绩不得计入/.test(src), "对 is_mock=true 的产物做二次拒判（防上游悄悄回落）");

  // ★★ 事件类型映射覆盖：每个数据集必须落在三类之一——
  //   ① 能映射 ② 引擎侧不支持（guarantee 未在魏 registry）③ 不参与对照（mock 测试样本）
  //   不允许有第四种情况：映射悄悄缺失 ⇒ 跑到一半才 exit 2，排查看不出原因。
  const KNOWN_UNSUPPORTED = ["bank_guarantee"];
  const mockIds = JSON.parse(fs.readFileSync(path.join(__dirname, "_mock_datasets.json"), "utf8"));
  const allIds = extractor.PROVIDERS.file.list();
  const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), "cjh-mp-"));
  for (const id of allIds) {
    fs.writeFileSync(path.join(probeDir, id + ".parse.json"), JSON.stringify({
      schema_version: "0.3", doc: { doc_id: "s" }, pages: [{ page: 1, blocks: [{ block_id: "b1", text: "s", text_raw: "s" }] }]
    }));
  }
  process.env.EXTRACT_CLI_PARSE_DIR = probeDir;
  process.env.JINGGUAN_LLM_API_KEY = "sk-selftest-NOT-REAL";
  const echo2 = path.join(os.tmpdir(), "cjh-echo2-" + Date.now() + ".js");
  fs.writeFileSync(echo2, [
    '"use strict";',
    'const fs=require("fs"),path=require("path");',
    'const od=process.argv[process.argv.indexOf("--out-dir")+1];',
    'fs.mkdirSync(od,{recursive:true});',
    'fs.writeFileSync(path.join(od,"events.json"),JSON.stringify({run_meta:{is_mock:false},events:[],argv:process.argv.slice(2)}));'
  ].join("\n"));
  process.env.EXTRACT_CLI_CMD = "node " + echo2;
  const mapBad = [], mapUnsup = [], mapOk = [];
  for (const id of allIds) {
    const r = extractor.PROVIDERS.cli.run(id);
    if (r.ok) { mapOk.push(id); continue; }
    if (r.unsupported_by_engine) mapUnsup.push(id);
    else if (mockIds.includes(id)) mapOk.push(id);          // ③ mock 样本：不参与对照，不算映射缺失
    else mapBad.push(id + " :: " + String(r.reason).slice(0, 46));
  }
  ok(mapUnsup.length === KNOWN_UNSUPPORTED.length && KNOWN_UNSUPPORTED.every(x => mapUnsup.includes(x)),
     "② 引擎不支持的恰为已知清单（guarantee 未在魏 registry）", `实到 ${mapUnsup.length}：${mapUnsup.join(",")}`);
  ok(mapBad.length === 0, "★ 无「映射悄悄缺失」的数据集（否则跑到一半 exit 2）", mapBad.length ? mapBad.join(" | ") : `可映射 ${mapOk.length}/${allIds.length}`);
  ok(mapOk.length + mapUnsup.length === allIds.length, "每个数据集都有明确归属（可映射/不支持/mock 不参与），无下落不明", `${mapOk.length}+${mapUnsup.length}=${allIds.length}`);
  fs.unlinkSync(echo2);
  fs.rmSync(probeDir, { recursive: true, force: true });
  process.env.EXTRACT_CLI_CMD = "node " + path.join("demo", "_fake_extract_cli.js");
  process.env.EXTRACT_CLI_PARSE_DIR = inputDir;

  // ============================================================
  console.log("\n【3b】mock 产物必须被拒判（mock 不得顶替真跑）");
  const mockCli = path.join(os.tmpdir(), "cjh-mockcli-" + Date.now() + ".js");
  fs.writeFileSync(mockCli, [
    '"use strict";',
    'const fs=require("fs"),path=require("path");',
    'let base=null;for(let i=2;i<process.argv.length;i++){if(process.argv[i]==="--parse")base=path.basename(process.argv[i+1]).replace(/\\.parse\\.json$/,"")}',
    'const j=JSON.parse(fs.readFileSync(path.resolve(process.cwd(),"data",base+".json"),"utf8"));',
    'j.is_mock=true; j.run_meta=Object.assign({},j.run_meta,{is_mock:true});',
    'const od=process.argv[process.argv.indexOf("--out-dir")+1];',
    'fs.mkdirSync(od,{recursive:true});fs.writeFileSync(path.join(od,"events.json"),JSON.stringify(j));'
  ].join("\n"));
  process.env.EXTRACT_CLI_CMD = "node " + mockCli;
  // ★ 挑一个确定「非 mock、非引擎不支持」的 case 来验 mock 守卫 ——
  //   否则拒判原因会被更早的那一层（unsupported）抢走，验的就不是 mock 守卫了。
  const cleanIds = ids.filter(x => !mockList.includes(x) && x !== "bank_guarantee").slice(0, 2);
  const mockRes = await extractor.parity(cleanIds, { a: "file", b: "cli" });
  ok(mockRes.cases_ran === 0, "mock 产物一律不算跑成", `${mockRes.cases_ran}/${mockRes.cases_total}（用例 ${cleanIds.join(",")}）`);
  ok(mockRes.verdict === "not_covered", "全例 mock → 判 not_covered（不是 pass）", mockRes.verdict);
  ok(/is_mock=true/.test((mockRes.cases[0] || {}).reason || ""), "逐例原因写明产物自认 is_mock", (mockRes.cases[0] || {}).reason);
  fs.unlinkSync(mockCli);

  // 复位到正规假 CLI
  process.env.EXTRACT_CLI_CMD = "node " + path.join("demo", "_fake_extract_cli.js");

  // ============================================================
  console.log("\n【4】空对象拒判（不能把「无对照对象」当成通过）");
  const empty = await extractor.parity([], { a: "file", b: "cli" });
  ok(empty.cases_total === 0, "空 case 列表 → cases_total=0", String(empty.cases_total));
  ok(empty.verdict === "not_covered", "空清单判 not_covered（不是 pass）", empty.verdict);
  ok(/空对照清单/.test(empty.reason || ""), "原因写明「无对照对象，不构成通过」", empty.reason);

  // 输入目录消失 ⇒ 引擎被判未接通，parity 在更早一层就拒判（同样不判 pass）
  fs.rmSync(inputDir, { recursive: true, force: true });
  const noIn = await extractor.parity(ids, { a: "file", b: "cli" });
  ok(noIn.verdict === "not_covered", "输入目录消失 → 判 not_covered（不是 pass）", noIn.verdict);
  ok(/未全部接通/.test(noIn.reason || ""), "原因指向引擎未全部接通", noIn.reason);
  ok((noIn.blockers || []).some(b => /目录不存在/.test(b.reason)), "阻塞项点明输入目录问题", (noIn.blockers || [])[0] && (noIn.blockers[0].reason || "").slice(0, 50));

  // ★ 引擎仍可用、但每例都跑不成（目录在、文件全缺）⇒ 走「空跑拒判」分支
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "cjh-parse2-"));
  process.env.EXTRACT_CLI_PARSE_DIR = emptyDir;
  const noFiles = await extractor.parity(ids, { a: "file", b: "cli" });
  ok(noFiles.cases_ran === 0 && noFiles.cases_total === ids.length, "如实报告 0 例跑成", `${noFiles.cases_ran}/${noFiles.cases_total}`);
  ok(noFiles.verdict === "not_covered", "有引擎但 0 例跑成 → 仍判 not_covered", noFiles.verdict);
  ok(/空跑/.test(noFiles.reason || ""), "原因写明「空跑不构成通过」", noFiles.reason);
  ok((noFiles.cases[0] || {}).reason && /解析 JSON|纯文本/.test(noFiles.cases[0].reason), "逐例给出失败原因", (noFiles.cases[0] || {}).reason);
  fs.rmSync(emptyDir, { recursive: true, force: true });

  // 补回输入供第 5 段注入差异测试复用
  fs.mkdirSync(inputDir, { recursive: true });
  for (const id of ids) {
    fs.writeFileSync(path.join(inputDir, id + ".parse.json"), JSON.stringify({
      schema_version: "0.3", doc: { doc_id: "stub" },
      pages: [{ page: 1, blocks: [{ block_id: "stub_p001_b00001", text: "stub", text_raw: "stub" }] }]
    }));
  }
  process.env.EXTRACT_CLI_PARSE_DIR = inputDir;
  ok(extractor.describeEngines().find(e => e.id === "cli").available === true, "输入目录复位后 cli 恢复可用");

  // ============================================================
  console.log("\n【5】注入差异必须被抓（防止永远 pass 的假对照）");
  const tamper = path.join(os.tmpdir(), "cjh-tamper-" + Date.now() + ".js");
  fs.writeFileSync(tamper, [
    '"use strict";',
    'const fs=require("fs"),path=require("path");',
    'let base=null;for(let i=2;i<process.argv.length;i++){if(process.argv[i]==="--parse")base=path.basename(process.argv[i+1]).replace(/\\.parse\\.json$/,"")}',
    'const j=JSON.parse(fs.readFileSync(path.resolve(process.cwd(),"data",base+".json"),"utf8"));',
    'const ev=(j.events||[])[0];',
    'if(ev&&ev.fields&&Object.keys(ev.fields).length){const k=Object.keys(ev.fields)[0];ev.fields[k].raw_value="【篡改】x";}',
    'const od=process.argv[process.argv.indexOf("--out-dir")+1];',
    'fs.mkdirSync(od,{recursive:true});fs.writeFileSync(path.join(od,"events.json"),JSON.stringify(j));'
  ].join("\n"));
  process.env.EXTRACT_CLI_CMD = "node " + tamper;

  const tam = await extractor.parity(ids, { a: "file", b: "cli" });
  ok(tam.verdict === "mismatch", "注入差异 → 判 mismatch", tam.verdict);
  ok(tam.diff_total > 0, "差异被逐字段捕获", `捕获 ${tam.diff_total} 处，覆盖 ${(tam.mismatch_detail || []).length}/${tam.cases_ran} 例`);
  ok(tam.fields_same < tam.fields_compared, "一致字段数严格小于比对字段数");
  // ★ D14：parity 的判定必须落在 bridge/parity_criteria.js 的分级判据上，
  //   且不通过时必须指出卡在哪一级 —— 只给一个 mismatch 是没法归因的。
  ok(tam.criteria_version === require(path.join(ROOT, "bridge", "parity_criteria.js")).CRITERIA_VERSION,
     "parity 结果带判据版本号（判据会变，不带版本号的数字不可比）", tam.criteria_version);
  ok(Array.isArray(tam.criteria_meta && tam.criteria_meta.levels) && tam.criteria_meta.levels.length === 5,
     "parity 结果带五级判据说明");
  ok(Array.isArray(tam.criteria_meta && tam.criteria_meta.not_covered_by_these),
     "★parity 结果明写「这套判据不覆盖什么」", (tam.criteria_meta.not_covered_by_these || []).length + " 条");
  ok((tam.mismatch_detail || []).every(d => d.failed_levels.length > 0),
     "每个 mismatch 例都指出了失败的级别（S0..S3）",
     (tam.mismatch_detail || []).map(d => `${d.case_id}:${d.failed_levels.join("/")}`).slice(0, 3).join(" "));
  ok(typeof tam.cases_unjudged === "number", "结果显式给出「跑成功但未产出可判结果」的例数",
     `cases_unjudged=${tam.cases_unjudged}`);
  // 格式差异/类型漂移单列，不混进 diff_total，但必须能看见
  ok(typeof tam.format_only_total === "number" && typeof tam.type_drift_total === "number",
     "格式差异与类型漂移单列计数（不混进 diff_total，但不许消失）",
     `format_only=${tam.format_only_total} type_drift=${tam.type_drift_total}`);

  fs.unlinkSync(tamper);
  fs.rmSync(inputDir, { recursive: true, force: true });
  if (keyBackup.a === undefined) delete process.env.JINGGUAN_LLM_API_KEY; else process.env.JINGGUAN_LLM_API_KEY = keyBackup.a;
  if (keyBackup.d === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = keyBackup.d;

  // ============================================================
  console.log("\n【6】页面已不再把 web_cli_same_result 渲染成「一致 ✔」");
  const ij = fs.readFileSync(path.join(ROOT, "public", "js", "render", "integration.js"), "utf8");
  ok(!/up-badge.*web_cli_same_result.*一致/.test(ij), "case 卡不再用 web_cli_same_result 上绿色徽标");
  ok(/Web\/CLI 未覆盖/.test(ij), "改为中性徽标「Web/CLI 未覆盖」");
  ok(!/int-assert ok.*web_cli_same_result/.test(ij), "缓存面板不再把该字段渲染成 ✓");
  ok(/未覆盖 —— 不构成对照|未覆盖/.test(ij), "缓存面板显式写「判未覆盖」");
  ok(/\/api\/parity/.test(ij), "页面改为调用真实对照接口 /api/parity");

  const css = fs.readFileSync(path.join(ROOT, "public", "css", "style.css"), "utf8");
  ok(/\.int-assert\.neutral/.test(css) && /\.up-badge-neutral/.test(css), "新增中性态样式（不与 ok 混用）");

  const app = fs.readFileSync(path.join(ROOT, "public", "js", "app.js"), "utf8");
  ok(/fetchEngines/.test(app) && /loadEngineMeta/.test(app), "页头接入引擎状态（明示预生成 vs 独立抽取）");

  const srv = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
  ok(!/DATA_SOURCE === "remote"\)\s*return/.test(srv), "旧的 DATA_SOURCE=remote 分支已移除");
  ok(/process\.env\.DATA_SOURCE === "remote" \? "http" : "file"/.test(srv), "保留 DATA_SOURCE=remote → ENGINE=http 兼容别名");
  ok(/\/api\/engines/.test(srv) && /\/api\/parity/.test(srv), "server 暴露 /api/engines 与 /api/parity");
  ok(/extraction_engine/.test(srv), "/api/result 下发 extraction_engine（数据来源随数据走）");

  // ============================================================
  console.log("\n=== 汇总 ===");
  console.log(`  PASS ${pass} / FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error("\n脚本异常：", e);
  process.exit(1);
});
