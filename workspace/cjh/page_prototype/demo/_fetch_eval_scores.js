// demo/_fetch_eval_scores.js —— 按 sha 从交付树取评测侧成绩单到本机 evaluation/（不入库）
//
// 为什么需要它：
//   metrics_registry.js 的 cross_doc_match / multi_doc_conflict / integration_pass /
//   perf_20page 四项动态读评测侧成绩单。但 C2 规则下evaluation/ 不入库，
//   clone 后这些文件不存在 ⇒ 四项自动退回「未测」（这正是设计意图：缺失不填数）。
//   要让本地拿到数，跑一次本脚本。取件**按 sha 校验**，不靠文件名猜。
//
// 纪律：
//   ① 只取、不改、不删 evaluation/ 下任何既有文件。
//   ② 取件清单与 sha 全部来自远端树，逐份核对后才落盘。
//   ③ 落盘后由 metrics_registry 读取，页面数字可追到具体文件。
//
// 用法：node demo/_fetch_eval_scores.js --src delivery/v2.0 [--verify-only]
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const REPO = path.resolve(ROOT, "..", "..", "..");
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SRC = arg("--src", "delivery/v2.0");
const VERIFY_ONLY = argv.includes("--verify-only");

// 注册表要读的四个成绩单（路径相对 evaluation/）
const WANT = [
  "D11/results/crossdoc-firsttest-score.json",
  "D11/results/d9-v02-score.json",
  "D10/results/score-weiwenyu-bundle.json",
];

function git(args, enc) {
  const o = { cwd: REPO, maxBuffer: 1 << 28, encoding: enc || "utf8" };
  return execFileSync("git", args, o);
}

let ok = 0, mismatch = 0, missing = 0;
const rows = [];

for (const rel of WANT) {
  const spec = `origin/${SRC}:evaluation/${rel}`;
  let buf;
  try { buf = git(["cat-file", "blob", spec], "buffer"); }
  catch (e) { rows.push([rel, "MISSING", `远端无此路径（${SRC}）`]); missing++; continue; }

  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  const dest = path.join(REPO, "evaluation", ...rel.split("/"));

  // 已在本地且字节一致 ⇒ 不重复写
  if (fs.existsSync(dest)) {
    const cur = crypto.createHash("sha256").update(fs.readFileSync(dest)).digest("hex");
    if (cur === sha) { rows.push([rel, "SAME", sha.slice(0, 12)]); ok++; continue; }
    rows.push([rel, "DIFF_LOCAL", `本地 ${cur.slice(0, 12)} ≠ 远端 ${sha.slice(0, 12)}，不覆盖`]); mismatch++;
    continue;
  }
  if (VERIFY_ONLY) { rows.push([rel, "ABSENT", "本地缺失（verify-only 未写入）"]); missing++; continue; }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  // 回读校验：落盘字节必须等于远端 blob
  const back = crypto.createHash("sha256").update(fs.readFileSync(dest)).digest("hex");
  if (back !== sha) { rows.push([rel, "WRITE_FAIL", `回读 ${back.slice(0, 12)} ≠ ${sha.slice(0, 12)}`]); mismatch++; continue; }
  rows.push([rel, "FETCHED", sha.slice(0, 12)]);
  ok++;
}

console.log("═".repeat(72));
console.log(`评测侧成绩单取件核对（源 ${SRC}）`);
console.log("═".repeat(72));
for (const [f, st, note] of rows) console.log(`[${st.padEnd(11)}] ${f}  ${note}`);
console.log("─".repeat(72));
console.log(`OK ${ok}　不一致 ${mismatch}　缺失 ${missing}`);
console.log(VERIFY_ONLY ? "（verify-only：未写入任何文件）" : "已落盘到 evaluation/（C2 排除规则下不入库）");
process.exit(mismatch ? 1 : 0);