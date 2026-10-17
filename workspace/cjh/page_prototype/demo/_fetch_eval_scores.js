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

// ★ 2026-10-15：本仓 remote-tracking refs 被清空（.git/refs/remotes 空，只余 3 tag），
//   `origin/<branch>:path` 不可用 ⇒ 源解析按 origin/<src> → refs/remotes/origin/<src> → <src>
//   （允许直接传 sha）→ FETCH_HEAD 中同名分支 四级回落。
let SRC_SHA = null;
for (const cand of [`origin/${SRC}`, `refs/remotes/origin/${SRC}`, SRC]) {
  try {
    const out = execFileSync("git", ["rev-parse", "--verify", cand],
      { cwd: REPO, encoding: "utf8" }).toString().trim();
    if (out && /^[0-9a-f]{40,64}$/.test(out)) { SRC_SHA = out; break; }
  } catch (e) { /* 试下一个 */ }
}
if (!SRC_SHA) {
  try {
    const fh = fs.readFileSync(path.join(REPO, ".git", "FETCH_HEAD"), "utf8");
    const line = fh.split(/\r?\n/).find(l => l.includes(`branch '${SRC}'`));
    if (line) SRC_SHA = line.split(/\s+/)[0];
  } catch (e) { /* 无 FETCH_HEAD */ }
}
if (!SRC_SHA || !/^[0-9a-f]{40,64}$/.test(SRC_SHA)) {
  console.error(`无法解析取件源「${SRC}」（试过 origin/${SRC}、${SRC}、FETCH_HEAD）。`
    + `本仓 remote-tracking refs 已空——先 git fetch origin，或 --src <sha>（如 2ded265c）。`);
  process.exit(2);
}

// 注册表/页面/审片材料要读的成绩单与裁定件（路径相对 evaluation/）
// ★ 2026-10-15：默认分支 delivery/v2.0@2ded265c 换入宗正典子树（a881737f8）后新增取件：
//   新版成绩单（-20261015）、Gold v1.1 覆盖层、R1 严格评分实测（432/451）、三份裁定文。
const WANT = [
  "D11/results/crossdoc-firsttest-score.json",
  "D11/results/d9-v02-score.json",
  "D10/results/score-weiwenyu-bundle.json",
  "2026-10-12-scorecard/评分成绩单-20261015.json",
  // ★ 2026-10-17：Gold v1.2（宗 3497ab4f7）——取件源须 --src zongbowen（delivery/v2.0 尚未含）
  "2026-10-12-scorecard/评分成绩单-20261017.json",
  "2026-10-17-gold-review/gold-corrections-v1.2.json",
  "2026-10-17-gold-review/答辩最终口径-20261017.md",
  "2026-10-15-caliber/gold-corrections-v1.1.json",
  "2026-10-14-sprint/R1-评分器加固/严格评分实测-20261014.json",
  "2026-10-15-caliber/裁定-覆盖率分母口径-20261015.md",
  "2026-10-15-caliber/R3R4-冻结锚核对-20261015.md",
  "2026-10-15-acceptance/口径与记载核对-20261015.md",
  "2026-10-15-acceptance/R4-验收成绩与失败清单-20261015.md",
  "2026-10-15-acceptance/V2-审片核对表-20261015.md",
  "2026-10-15-acceptance/性能-3份真实20页PDF实测-20261015.json",
];

function git(args, enc) {
  const o = { cwd: REPO, maxBuffer: 1 << 28, encoding: enc || "utf8" };
  return execFileSync("git", args, o);
}

let ok = 0, mismatch = 0, missing = 0;
const rows = [];

for (const rel of WANT) {
  const spec = `${SRC_SHA}:evaluation/${rel}`;
  let buf;
  try { buf = git(["cat-file", "blob", spec], "buffer"); }
  catch (e) { rows.push([rel, "MISSING", `远端无此路径（${SRC} → ${SRC_SHA.slice(0, 12)}）`]); missing++; continue; }

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
console.log(`评测侧成绩单取件核对（源 ${SRC} → ${SRC_SHA.slice(0, 12)}）`);
console.log("═".repeat(72));
for (const [f, st, note] of rows) console.log(`[${st.padEnd(11)}] ${f}  ${note}`);
console.log("─".repeat(72));
console.log(`OK ${ok}　不一致 ${mismatch}　缺失 ${missing}`);
console.log(VERIFY_ONLY ? "（verify-only：未写入任何文件）" : "已落盘到 evaluation/（C2 排除规则下不入库）");
process.exit(mismatch ? 1 : 0);