// 一次性工具：把魏文宇分支的抽取入口导成最小可运行副本（不污染我的分支）
// 依赖：run_extract.mjs + lib/{schema_validator,registry,fang_normalize,checks}.mjs + interface/event-envelope.schema.json
// REPO_ROOT = resolve(import.meta.dirname,'..','..') ⇒副本根必须是 <root>
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const SHA = "93c8ae28";
const DEST = "D:/chenjh/code/program/jingguanpluge/.weirun";
const FILES = [
  "scripts/jingguan/run_extract.mjs",
  "scripts/jingguan/lib/schema_validator.mjs",
  "scripts/jingguan/lib/registry.mjs",
  "scripts/jingguan/lib/fang_normalize.mjs",
  "scripts/jingguan/lib/checks.mjs",
  "interface/event-envelope.schema.json",
];

let ok = 0; const errs = [];
for (const f of FILES) {
  const dest = path.join(DEST, f);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) { ok++; continue; }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    const buf = execSync(`git show "${SHA}:${f}"`, { encoding: "buffer", maxBuffer: 1e8, cwd: "D:/chenjh/code/program/jingguanpluge/jingguands" });
    fs.writeFileSync(dest, buf); ok++;
  } catch (e) { errs.push(f + " :: " + String(e.message).slice(0, 70)); }
}
console.log("导出", ok, "/", FILES.length);
errs.forEach((e) => console.log("  ERR", e));
