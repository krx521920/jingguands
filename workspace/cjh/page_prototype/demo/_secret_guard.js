// _secret_guard.js —— 密钥泄漏守卫（D14，可重跑，退出码即结论）
//
// ★ 为什么要它：密钥一旦入库，git 历史删不干净（每个 clone 都背着），
//   且 GitHub 一旦有 push 权限就等于公开泄露。D10 之后立的铁律是
//   「结论不可见 = 等于没做」，这里同理：**密钥可见于仓库 = 已经泄露**，
//   光靠"我记得别提交"是不可验证的纪律，必须有脚本顶住。
//
// 它验三件事（不是 grep 一下就完）：
//   ① 本机密钥文件存在，且**被git 忽略**（双重保险：根 .gitignore + 本机 .git/info/exclude）
//   ② 已跟踪文件（git ls-files）里没有任何疑似密钥
//   ③ 待提交区（git diff --cached / 未跟踪文件）里也没有 —— 提交前那一秒的检查
//
// ★ 检查范围只限我方目录（workspace/cjh/）：上游 packages/ apps/ 是别人的资产，
//   全仓扫会把队友的历史问题算到我头上，且那些不是我能修的。
//
// 用法：
//   node demo/_secret_guard.js            # 全查
//   node demo/_secret_guard.js --staged   # 只查暂存区（提交前跑这个）
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const REPO = path.resolve(ROOT, "..", "..", "..");     // page_prototype/ → 仓库根（退三级）
const MINE = "workspace/cjh/";// 我方资产范围
const DOTENV = path.join(ROOT, ".env");

// 疑似密钥的判定：宁可误报也不漏报。
//   sk- 开头（DeepSeek/OpenAI 风格）、DEEPSEEK/JINGGUAN 密钥赋值、常见云厂商 AK 串。
const PATTERNS = [
  /sk-[A-Za-z0-9]{20,}/,                            // DeepSeek / OpenAI 风格
  /\b(AKIA|ASIA)[0-9A-Z]{16}\b/,                    // AWS AccessKeyId
  /(DEEPSEEK|JINGGUAN_LLM|LLM_API)[A-Z_]*\s*[=:]\s*["']?[A-Za-z0-9_-]{20,}/i,
];
const SCAN_EXT = [".js", ".mjs", ".cjs", ".ts", ".json", ".md", ".csv", ".txt", ".yml", ".yaml", ".env", ".sh", ".py", ".html", ".css"];
const SKIP_DIR = new Set(["node_modules", ".git", "screenshots", "video"]);

// ★ 守卫自身要防"误伤"：自检脚本里必须有假密钥才能验证链路活着
//   （demo/_engine_check.js 的 sk-selftest-NOT-A-REAL-KEY）。若一律命中，
//   守卫第一次跑就红，此后所有人都会开始忽略它的输出——**假的警报比没有警报更糟**。
//   故放行两类：（a）同句明确写了这是测试/占位值；（b）命中值本身自述为假。
//   放行必须是"显式声明"，不存在"看起来像测试"就放过——那等于给真密钥开后门。
const SELF_DECLARED = /NOT-A-REAL-KEY|NOT[-_]?REAL|FAKE|DUMMY|PLACEHOLDER|EXAMPLE|自检假|占位|测试密钥/i;

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log(`  PASS  ${name}${extra ? "  — " + extra : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${extra ? "  — " + extra : ""}`); }
};

/** git 命令（不经过 shell） */
function git(args) {
  const r = spawnSync("git", args, { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.error || r.status !== 0) return null;
  return String(r.stdout || "");
}

/** 扫描一批文件内容，返回命中列表 [{file, line, text}] */
function scanFiles(files) {
  const hits = [];
  for (const f of files) {
    const abs = path.join(REPO, f);
    if (!fs.existsSync(abs)) continue;
    if (!SCAN_EXT.includes(path.extname(f).toLowerCase())) continue;
    if (SKIP_DIR.has(path.basename(path.dirname(f)))) continue;
    let text;
    try { text = fs.readFileSync(abs, "utf8"); } catch (e) { continue; }
    const lines = text.split(/\r?\n/);
    lines.forEach((ln, i) => {
      for (const re of PATTERNS) {
        if (!re.test(ln)) continue;
        // 显式声明为测试/占位的放行（见 SELF_DECLARED 处的理由）
        if (SELF_DECLARED.test(ln)) return;
        // 报告时脱敏：只留前 6 位 + 长度，不把完整密钥打进日志/材料
        const masked = ln.replace(/([A-Za-z0-9_-]{6})[A-Za-z0-9_-]{10,}/g, "$1***REDACTED***");
        hits.push({ file: f, line: i + 1, text: masked.trim().slice(0, 120) });
        return;
      }
    });
  }
  return hits;
}

// ============================================================
console.log("\n【1】密钥文件本身：存在 + 被 git 忽略");
const hasDotenv = fs.existsSync(DOTENV);
ok(hasDotenv, "page_prototype/.env 存在（密钥有地方放，不散落代码里）", hasDotenv ? path.relative(REPO, DOTENV) : "缺失");

const ig = git(["check-ignore", "-v", "workspace/cjh/page_prototype/.env"]);
ok(ig !== null, "git check-ignore 确认 .env 被忽略", ig ? ig.trim().split("\n")[0] : "未被忽略！");

const infoExclude = path.join(REPO, ".git", "info", "exclude");
const excl = fs.existsSync(infoExclude) ? fs.readFileSync(infoExclude, "utf8") : "";
ok(/page_prototype\/\.env/.test(excl), "本机 .git/info/exclude 也排除了它（双保险，防上游改 .gitignore）");

const status = git(["status", "--porcelain"]) || "";
ok(!/\.env\b/.test(status), "git status 里看不到 .env（不会被误 add）", status.match(/.*\.env.*/)?.[0] || "干净");

// ============================================================
console.log("\n【2】已跟踪文件：不得含密钥");
const tracked = (git(["ls-files", MINE]) || "").split(/\r?\n/).filter(Boolean);
const hitsTracked = scanFiles(tracked);
ok(hitsTracked.length === 0, `已跟踪文件（${tracked.length} 个）无密钥`,
   hitsTracked.length ? hitsTracked.slice(0, 5).map(h => `${h.file}:${h.line}`).join(", ") : "");

// ============================================================
console.log("\n【3】未跟踪 / 待提交区：提交前那一秒的检查");
const staged = (git(["diff", "--cached", "--name-only"]) || "").split(/\r?\n/).filter(Boolean);
ok(staged.filter(f => /(^|\/)\.env(\.|$)/.test(f)).length === 0, "暂存区无 .env",
   staged.filter(f => /\.env/.test(f)).join(", ") || "无");

const untracked = (git(["ls-files", "--others", "--exclude-standard", MINE]) || "").split(/\r?\n/).filter(Boolean);
const hitsUntracked = scanFiles(untracked);
ok(hitsUntracked.length === 0, `未跟踪且未被忽略的文件（${untracked.length} 个）无密钥`,
   hitsUntracked.length ? hitsUntracked.slice(0, 5).map(h => `${h.file}:${h.line}`).join(", ") : "");

// ============================================================
console.log("\n=== 汇总 ===");
console.log(`  PASS ${pass} / FAIL ${fail}`);
if (hitsTracked.length || hitsUntracked.length) {
  console.log("\n★ 发现疑似密钥，处理顺序：");
  console.log("   1. 立刻在提供方后台吊销该密钥（它已在磁盘上，别等提交历史清理完）");
  console.log("   2. 把值移入 page_prototype/.env，代码改为从 process.env 读");
  console.log("   3. 确认文件被 .gitignore / .git/info/exclude 覆盖");
  console.log("   4. 若已提交过：git rm --cached + 联系领导（历史重写须授权）");
}
process.exit(fail ? 1 : 0);