"use strict";
/**
 * L4 前置核验· Web/CLI 真双路对照的「能不能跑」体检（只读，不发API 请求）
 *
 * ★ 为什么要单独一个体检：自检里的假 CLI 证明的是**适配层机制**成立，
 *   但它用的是造出来的 stub 输入。真跑之前必须核实三件事，否则跑出来的数不可信：
 *
 *   ① 输入侧资产是否齐（张的 parse JSON 能不能对上页面批的 case）
 *   ② 魏的入口脚本是否真在仓库里、能否被 spawn
 *   ③ 密钥是否在 —— 不在就必须在这里停住，**绝不能落到 --mock**
 *
 *   本脚本**不发任何模型请求**，只做静态核验。
 *
 * 用法：node demo/_l4_preflight.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
// ★ D14：引入 extractor 会顺带把 page_prototype/.env 读进 process.env。
//   本脚本是独立进程，不 require extractor 就读不到密钥，会误报「未设置」——
//   那样会让人以为密钥没配，实际上只是这个脚本没加载 .env。误报比漏报更费时间。
const _extractor = require(path.join(ROOT, "bridge", "extractor.js"));
const DOTENV_FILE = _extractor.DOTENV_FILE;

const REPO = process.env.EXTRACT_CLI_REPO
  || "D:/chenjh/code/program/jingguanpluge/.weirun";    // 魏的入口副本（demo/_fetch_wei_cli.js 导出）
const PARSE_DIR = process.env.EXTRACT_CLI_PARSE_DIR
  || "D:/chenjh/code/program/jingguanpluge/.peerdata/parse";
const CLI_REL = "scripts/jingguan/run_extract.mjs";

let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) { pass++; console.log(`  PASS  ${n}${x ? "  — " + x : ""}`); } else { fail++; console.log(`  FAIL  ${n}${x ? "  — " + x : ""}`); } };

console.log("\n【A】魏的入口脚本");
const cliPath = path.join(REPO, CLI_REL);
const hasCli = fs.existsSync(cliPath);
ok(hasCli, `入口存在：${CLI_REL}（REPO=${REPO}）`, hasCli ? `${fs.statSync(cliPath).size}B` : "缺失 —— 跑 demo/_fetch_wei_cli.js 从魏分支导出");
if (hasCli) {
  const src = fs.readFileSync(cliPath, "utf8");
  ok(/--parse/.test(src) && /--input/.test(src), "入口支持 --parse / --input（对齐适配层契约）");
  ok(/--out-dir/.test(src), "入口支持 --out-dir（输出落盘约定）");
  ok(/JINGGUAN_LLM_API_KEY/.test(src) && /DEEPSEEK_API_KEY/.test(src), "入口读 JINGGUAN_LLM_API_KEY / DEEPSEEK_API_KEY");
  ok(/is_mock/.test(src), "入口对 mock 有显式标记（可被页面侧二次守卫捕获）");
  // 依赖完整性：入口 import 的 4 个 lib + schema 都得在
  const deps = ["scripts/jingguan/lib/schema_validator.mjs", "scripts/jingguan/lib/registry.mjs",
    "scripts/jingguan/lib/fang_normalize.mjs", "scripts/jingguan/lib/checks.mjs",
    "interface/event-envelope.schema.json"];
  const missDep = deps.filter(d => !fs.existsSync(path.join(REPO, d)));
  ok(missDep.length === 0, "入口依赖齐备（4 个 lib + schema）", missDep.length ? "缺 " + missDep.join(",") : `${deps.length}/${deps.length}`);
  // ★ 事件类型注册表覆盖：页面批有 guarantee 类，registry 里没有 ⇒ 该类无法重跑
  const reg = fs.readFileSync(path.join(REPO, "scripts/jingguan/lib/registry.mjs"), "utf8");
  const regTypes = ["pledge", "equity_change", "award_contract"].filter(t => new RegExp(`^\\s*${t}:`, "m").test(reg));
  ok(!/^\s*guarantee:/m.test(reg),
     "★ 覆盖缺口已记录：registry 无 guarantee（bank_guarantee 类无法用 CLI 重跑）",
     `registry 实有：${regTypes.join(", ")}`);
}

console.log("\n【B】输入侧资产（张的解析 JSON）");
const hasDir = fs.existsSync(PARSE_DIR);
ok(hasDir, `解析目录存在：${PARSE_DIR}`, hasDir ? `${fs.readdirSync(PARSE_DIR).length} 份` : "缺失");
let parseFiles = [];
if (hasDir) {
  parseFiles = fs.readdirSync(PARSE_DIR).filter(f => f.endsWith(".parse.json"));
  ok(parseFiles.length > 0, "有 .parse.json 可喂--parse", `${parseFiles.length} 份`);
  // 真实性：必须有 pages[].blocks[].text，不能是空壳
  let real = 0, blocks = 0;
  for (const f of parseFiles) {
    const j = JSON.parse(fs.readFileSync(path.join(PARSE_DIR, f), "utf8"));
    let nb = 0;
    for (const p of j.pages || []) for (const b of p.blocks || []) if (b && (b.text || b.text_raw)) nb++;
    if (nb > 0) real++;
    blocks += nb;
  }
  ok(real === parseFiles.length, "全部解析文件含非空 blocks[].text（非空壳）", `${real}/${parseFiles.length} 份，共 ${blocks} blocks`);
}

console.log("\n【C】与页面批 case 的可对照性");
const dataDir = path.join(ROOT, "data");
const dataU = path.join(ROOT, "data_unified");
function ids(d) { try { return fs.readdirSync(d).filter(f => f.endsWith(".json") && !f.endsWith(".check.json") && f !== "upstream_case.json").map(f => f.replace(/\.json$/, "")); } catch (e) { return []; } }
const dataIds = ids(dataDir), dataUIds = ids(dataU);
const base = f => f.replace(/^wei_real_(D\d)_/, "");
const parseIds = new Set(parseFiles.map(f => f.replace(/\.parse\.json$/, "")));
// 页面批文件名前缀是 wei_real_xxx，取其 case 本体
const pageBases = new Set(dataIds.map(base));
const unifiedBases = new Set(dataUIds);
const hitPage = [...pageBases].filter(x => parseIds.has(x));
const hitUnified = [...unifiedBases].filter(x => parseIds.has(x));
ok(hitPage.length > 0 || hitUnified.length > 0, "解析资产能与页面批/统一批对上号", `页面批命中 ${hitPage.length} 例：${hitPage.slice(0, 6).join(",")}；统一批命中 ${hitUnified.length} 例：${hitUnified.slice(0, 6).join(",")}`);
ok(hitUnified.length >= 2, "统一批至少 2 例可做 file↔cli 对照", `${hitUnified.length} 例`);

console.log("\n【D】密钥（决定能否真跑）");
const hasKey = Boolean(process.env.JINGGUAN_LLM_API_KEY || process.env.DEEPSEEK_API_KEY);
ok(hasKey, "LLM 密钥在环境里",
   hasKey ? `已设置（来源：${DOTENV_FILE ? path.basename(DOTENV_FILE) : "process.env"}）`
          : "★未设置 —— 只能 --mock，mock 不得计入成绩，本次到此为止");
if (hasKey) {
  const b = process.env.JINGGUAN_LLM_BASE_URL || "https://api.deepseek.com（默认）";
  console.log(`  端点：${b}｜模型：${process.env.JINGGUAN_LLM_MODEL || "deepseek-chat（默认）"}`);
}

console.log("\n【E】适配层已按魏的契约改完（静态核对）");
const exSrc = fs.readFileSync(path.join(ROOT, "bridge", "extractor.js"), "utf8");
ok(/"--parse"|"--input"/.test(exSrc) && /--out-dir/.test(exSrc) && /--event-type/.test(exSrc),
   "适配层拼参已换成 argv 三件套（--parse/--out-dir/--event-type）");
ok(/events\.json/.test(exSrc), "输出按落盘约定读 events.json（不是 stdout）");
ok(!/PDF_PATH/.test(exSrc), "已废弃 env PDF_PATH（魏的入口不收 PDF）");
ok(/EXTRACT_CLI_EVENT_TYPE_MAP/.test(exSrc), "事件类型映射可用环境变量覆盖");
ok(/PLD|EQC|AWD/.test(exSrc) && /D4|D5|D6/.test(exSrc), "含数据集缩写/批次级映射（PLD/EQC/AWD、D4/D5/D6）");

console.log("\n【F】自检状态");
try {
  const { execSync } = require("child_process");
  const out = execSync(`"${process.execPath}" "${path.join(__dirname, "_engine_check.js")}"`, { encoding: "utf8", cwd: ROOT });
  const m = /PASS (\d+) \/ FAIL (\d+)/.exec(out);
  ok(m && Number(m[2]) === 0, "引擎自检全绿", m ? `PASS ${m[1]} / FAIL ${m[2]}` : "未读到汇总行");
} catch (e) {
  const out = String(e.stdout || "");
  const m = /PASS (\d+) \/ FAIL (\d+)/.exec(out);
  ok(false, "引擎自检全绿", m ? `PASS ${m[1]} / FAIL ${m[2]}` : String(e.message).slice(0, 60));
}

console.log("\n=== 体检结论 ===");
const canRun = hasCli && hasDir && parseFiles.length > 0 && hasKey;
console.log(`  PASS ${pass} / FAIL ${fail}`);
console.log(`  L4 真跑前置：${canRun ? "✔ 齐备" : "✘ 未齐 —— " + [
  !hasCli ? "魏的入口脚本不在本地工作树" : null,
  !parseFiles.length ? "解析资产缺失" : null,
  !hasKey ? "无 LLM 密钥" : null,
].filter(Boolean).join("；")}`);
console.log("  提醒：即便前置齐备，LLM 抽取有温度与模型版本波动；「逐字节全等」不是合理预期，");
console.log("        判据须由双方约定（建议按字段值比对 + 差异逐条归因，而非整包哈希）。");
process.exit(fail ? 1 : 0);
