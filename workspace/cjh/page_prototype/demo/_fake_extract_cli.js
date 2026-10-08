"use strict";
/**
 * 假 CLI —— 严格复刻魏文宇scripts/jingguan/run_extract.mjs 的**调用契约**。
 *
 * ★ 为什么必须复刻：10-08 之前这个脚本吐stdout、读 env CASE_ID/PDF_PATH，
 *   而魏的真实入口是 argv --input/--parse、输出**落盘** events.json。
 *   契约不一致时，自检验的就只是我自己的臆想，不是对方的接口 —— 那样的"通过"没有意义。
 *
 * 与魏的一致点：
 *   ① 入参走 argv：`--input <txt>` 或 `--parse <parse.json>`，另可带 --out-dir / --event-type / --mock
 *   ② 输出落盘 `<out-dir>/events.json`，**不在 stdout**
 *   ③ 缺密钥必须显式 --mock；mock 产物带 is_mock=true
 *   ④ --parse 需要一份带 pages[].blocks[] 的解析 JSON
 *
 * 与魏的不同点（唯一一处，且是故意的）：
 *   假实现把本地同名信封当作"抽取结果"，仅用于证明通道是活的，**不得作为成绩**。
 *   真实现由魏提供。
 */
const fs = require("fs");
const path = require("path");

// ---------- 解析 argv（复刻魏的参数表） ----------
const a = { input: null, parse: null, eventType: null, outDir: "runs", mock: false };
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i];
  if (k === "--input") a.input = process.argv[++i];
  else if (k === "--parse") a.parse = process.argv[++i];
  else if (k === "--event-type") a.eventType = process.argv[++i];
  else if (k === "--out-dir") a.outDir = process.argv[++i];
  else if (k === "--mock") a.mock = true;
}

// ---------- 校验（对齐魏的失败语义：无入参 exit 2、文件不存在 exit 3） ----------
if (!a.input && !a.parse) { process.stderr.write("必须给 --input 或 --parse\n"); process.exit(2); }
const src = a.parse || a.input;
if (!fs.existsSync(src)) { process.stderr.write("输入不存在: " + src + "\n"); process.exit(3); }

if (a.parse) {
  let j;
  try { j = JSON.parse(fs.readFileSync(src, "utf8")); }
  catch (e) { process.stderr.write("--parse 文件非合法 JSON: " + e.message + "\n"); process.exit(3); }
  if (!j.pages || !j.pages.length) { process.stderr.write("--parse 缺 pages[]\n"); process.exit(3); }
}

// ---------- 缺密钥必须显式 --mock（复刻魏的硬约束） ----------
const hasKey = Boolean(process.env.JINGGUAN_LLM_API_KEY || process.env.DEEPSEEK_API_KEY);
if (!hasKey && !a.mock) {
  process.stderr.write("无 JINGGUAN_LLM_API_KEY/DEEPSEEK_API_KEY，必须显式 --mock\n");
  process.exit(5);
}

// ---------- 出数 ----------
const base = path.basename(src).replace(/\.(parse\.json|json|txt|md)$/i, "");
const stub = path.resolve(__dirname, "..", "data", base + ".json");
if (!fs.existsSync(stub)) { process.stderr.write("无 " + base + ".json 作假实现源\n"); process.exit(4); }
const env = JSON.parse(fs.readFileSync(stub, "utf8"));

// ★ mock 时必须自认is_mock=true —— 页面侧的二次守卫要靠这个字段拒判
if (a.mock) {
  env.run_meta = Object.assign({}, env.run_meta, { is_mock: true });
  env.is_mock = true;
}

const outDir = path.resolve(process.cwd(), a.outDir);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "events.json"), JSON.stringify(env, null, 1), "utf8");
process.stderr.write("fake-cli ok  case=" + base + "  out=" + outDir + "\n");
process.exit(0);
