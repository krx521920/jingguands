// 一次性工具：从张智博分支导出 D4/D5 的解析产物与原始 PDF 到本地临时目录
// 用途：L4 真双路对照的输入侧资产。逐个 git show 40 次会 SIGTERM，故后台跑。
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const SHA = "4b46d44d";
const LIST = "D:/chenjh/code/program/jingguanpluge/.peerlist.json";
const OUT = "D:/chenjh/code/program/jingguanpluge/.peerdata";

const pick = JSON.parse(fs.readFileSync(LIST, "utf8"));
for (const sub of ["parse", "raw"]) fs.mkdirSync(path.join(OUT, sub), { recursive: true });

let ok = 0; const errs = [];
for (const f of pick) {
  const sub = f.includes("/parse/") ? "parse" : "raw";
  const dest = path.join(OUT, sub, f.split("/").pop());
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) { ok++; continue; }
  try {
    const buf = execSync(`git show "${SHA}:${f}"`, { encoding: "buffer", maxBuffer: 1e8 });
    fs.writeFileSync(dest, buf); ok++;
  } catch (e) { errs.push(f + " :: " + String(e.message).slice(0, 80)); }
}
console.log("导出成功", ok, "失败", errs.length);
errs.slice(0, 5).forEach((e) => console.log("  ERR", e));
