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
ok(byId.cli && !byId.cli.available && /EXTRACT_CLI_CMD/.test(byId.cli.reason),
   "cli 未配置时 available=false 且原因指向环境变量", byId.cli && byId.cli.reason);
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
  console.log("\n【3】CLI 通道实跑（用假 CLI 模拟魏侧入口）");
  const pdfDir = fs.mkdtempSync(path.join(os.tmpdir(), "cjh-pdf-"));
  const ids = extractor.PROVIDERS.file.list();
  for (const id of ids) fs.writeFileSync(path.join(pdfDir, id + ".pdf"), "%PDF-1.4 stub");

  process.env.EXTRACT_CLI_CMD = "node " + path.join("demo", "_fake_extract_cli.js");
  process.env.EXTRACT_CLI_PDF_DIR = pdfDir;

  const live = extractor.describeEngines();
  ok(live.find(e => e.id === "cli").available === true, "设环境变量后 cli 变为可用");
  ok(extractor.defaultEngine() === "cli", "有 live 引擎时默认切到 live（自动优先）", extractor.defaultEngine());

  const r = await extractor.parity(ids, { a: "file", b: "cli" });
  ok(r.verdict === "pass", "同源假 CLI 跑全量 → pass（链路通）", `${r.cases_ran}/${r.cases_total} 例，${r.fields_same}/${r.fields_compared} 字段`);
  ok(r.cases_ran === r.cases_total && r.cases_total > 0, "全部 case 跑成，无失败例");

  // ============================================================
  console.log("\n【4】空对象拒判（不能把「无对照对象」当成通过）");
  const empty = await extractor.parity([], { a: "file", b: "cli" });
  ok(empty.cases_total === 0, "空 case 列表 → cases_total=0", String(empty.cases_total));
  ok(empty.verdict === "not_covered", "空清单判 not_covered（不是 pass）", empty.verdict);
  ok(/空对照清单/.test(empty.reason || ""), "原因写明「无对照对象，不构成通过」", empty.reason);

  // PDF 目录消失 ⇒ 引擎被判未接通，parity 在更早一层就拒判（同样不判 pass）
  fs.rmSync(pdfDir, { recursive: true, force: true });
  const noPdf = await extractor.parity(ids, { a: "file", b: "cli" });
  ok(noPdf.verdict === "not_covered", "PDF 目录消失 → 判 not_covered（不是 pass）", noPdf.verdict);
  ok(/未全部接通/.test(noPdf.reason || ""), "原因指向引擎未全部接通", noPdf.reason);
  ok((noPdf.blockers || []).some(b => /PDF/.test(b.reason)), "阻塞项点明 PDF 目录问题");

  // ★ 引擎仍可用、但每例都跑不成（PDF 目录在、文件全缺）⇒ 走「空跑拒判」分支
  const pdfDir2 = fs.mkdtempSync(path.join(os.tmpdir(), "cjh-pdf2-"));   // 空目录
  process.env.EXTRACT_CLI_PDF_DIR = pdfDir2;
  const noFiles = await extractor.parity(ids, { a: "file", b: "cli" });
  ok(noFiles.cases_ran === 0 && noFiles.cases_total === ids.length, "如实报告 0 例跑成", `${noFiles.cases_ran}/${noFiles.cases_total}`);
  ok(noFiles.verdict === "not_covered", "有引擎但 0 例跑成 → 仍判 not_covered", noFiles.verdict);
  ok(/空跑/.test(noFiles.reason || ""), "原因写明「空跑不构成通过」", noFiles.reason);
  ok((noFiles.cases[0] || {}).reason && /PDF/.test(noFiles.cases[0].reason), "逐例给出失败原因", (noFiles.cases[0] || {}).reason);
  fs.rmSync(pdfDir2, { recursive: true, force: true });

  // 补回 PDF 供第 5 段注入差异测试复用（并把 PDF 目录指回 pdfDir —— 上一段切到了 pdfDir2）
  fs.mkdirSync(pdfDir, { recursive: true });
  for (const id of ids) fs.writeFileSync(path.join(pdfDir, id + ".pdf"), "%PDF-1.4 stub");
  process.env.EXTRACT_CLI_PDF_DIR = pdfDir;
  ok(extractor.describeEngines().find(e => e.id === "cli").available === true, "PDF 目录复位后 cli 恢复可用");

  // ============================================================
  console.log("\n【5】注入差异必须被抓（防止永远 pass 的假对照）");
  const tamper = path.join(pdfDir, "..", "tamper-" + Date.now() + ".js");
  fs.writeFileSync(tamper, [
    '"use strict";',
    'const fs=require("fs"),path=require("path");',
    'const j=JSON.parse(fs.readFileSync(path.resolve(process.cwd(),"data",process.env.CASE_ID+".json"),"utf8"));',
    'const ev=(j.events||[])[0];',
    'if(ev&&ev.fields&&Object.keys(ev.fields).length){const k=Object.keys(ev.fields)[0];ev.fields[k].raw_value="【篡改】x";}',
    'process.stdout.write(JSON.stringify(j));'
  ].join("\n"));
  process.env.EXTRACT_CLI_CMD = "node " + tamper;

  const tam = await extractor.parity(ids, { a: "file", b: "cli" });
  ok(tam.verdict === "mismatch", "注入差异 → 判 mismatch", tam.verdict);
  ok(tam.diff_total > 0, "差异被逐字段捕获", `捕获 ${tam.diff_total} 处，覆盖 ${tam.cases.filter(c => c.diff_count > 0).length}/${tam.cases_ran} 例`);
  ok(tam.fields_same < tam.fields_compared, "一致字段数严格小于比对字段数");

  fs.unlinkSync(tamper);
  fs.rmSync(pdfDir, { recursive: true, force: true });

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
