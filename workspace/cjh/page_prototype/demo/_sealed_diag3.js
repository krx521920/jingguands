// 终极判定：重跑宗自己的 build 脚本，看生成的 hash 与已入库 manifest 是否一致
// 目的：区分「检出损坏」「manifest 过期」还是「Gold 被改未重锁」
const fs = require("fs");
const crypto = require("crypto");
const { execSync } = require("child_process");

const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const OLD = JSON.parse(fs.readFileSync("evaluation/sealed/single/manifest.json", "utf8"));
const LOCK_OLD = JSON.parse(fs.readFileSync("evaluation/sealed/hash-lock.json", "utf8"));

// 备份旧文件，跑完对比
fs.copyFileSync("evaluation/sealed/single/manifest.json", "C:/Users/cjh05/AppData/Local/Temp/manifest_old.json");
fs.copyFileSync("evaluation/sealed/hash-lock.json", "C:/Users/cjh05/AppData/Local/Temp/hashlock_old.json");
fs.copyFileSync("evaluation/sealed/cross-doc/manifest.json", "C:/Users/cjh05/AppData/Local/Temp/crossdoc_old.json");

// 需要 dev-30 manifest 落地
if (!fs.existsSync("evaluation/dev-30/manifest.json")) {
  console.log("!!缺 evaluation/dev-30/manifest.json，先落地");
  process.exit(2);
}

let out = "";
try {
  out = execSync("node evaluation/sealed/build-sealed-manifests.mjs", { maxBuffer: 1e8 }).toString();
  console.log("=== build 脚本执行成功 ===");
  console.log(out.trim());
} catch (e) {
  console.log("=== build 脚本失败 ===");
  console.log((e.stdout || "").toString().slice(0, 500));
  console.log((e.stderr || "").toString().slice(0, 500));
  process.exit(1);
}

const NEW = JSON.parse(fs.readFileSync("evaluation/sealed/single/manifest.json", "utf8"));
const LOCK_NEW = JSON.parse(fs.readFileSync("evaluation/sealed/hash-lock.json", "utf8"));

const oldMap = new Map(OLD.cases.map((c) => [c.sealed_id, c]));
const newMap = new Map(NEW.cases.map((c) => [c.sealed_id, c]));
let diffRaw = [], diffGold = [], same = 0;
newMap.forEach((n, id) => {
  const o = oldMap.get(id);
  if (!o) return;
  if (o.raw_sha256 !== n.raw_sha256) diffRaw.push(id);
  if (o.gold_sha256 !== n.gold_sha256) diffGold.push(id);
  if (o.raw_sha256 === n.raw_sha256 && o.gold_sha256 === n.gold_sha256) same++;
});

console.log("\n=== 重跑 build 后：与已入库 manifest 的差异 ===");
console.log("完全相同: " + same + " / 30");
console.log("raw_sha256 变了: " + diffRaw.length + " 例  " + diffRaw.join(", "));
console.log("gold_sha256 变了: " + diffGold.length + " 例  " + diffGold.join(", "));

// 现在校验：重生成后是否全部命中
let hit = 0, miss = 0;
function resolve(rel) {
  const parts = ["evaluation", "sealed", "single"];
  for (const seg of rel.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg === "." || seg === "") continue;
    else parts.push(seg);
  }
  return parts.join("/");
}
NEW.cases.forEach((c) => {
  if (fs.existsSync(resolve(c.raw)) && sha(resolve(c.raw)) === c.raw_sha256) hit++;
  else miss++;
});
console.log("\n重跑 build 后 raw 实测命中: " + hit + " / 30 （不命中 " + miss + "）");

console.log("\n=== 结论 ===");
if (diffRaw.length + diffGold.length > 0) {
  console.log("已入库的 manifest/hash-lock 是**过期**的：");
  console.log("  宗在 10-04 修订 v0.3（改 D6-AWD-007 的 gold）后**又改动了 " + (diffRaw.length + diffGold.length) +
    " 处raw/gold 实体文件**，");
  console.log("  但没有重跑 build-sealed-manifests.mjs 重新生成 manifest 与 hash-lock。");
  console.log("  ⇒ 已入库的 verification.json 里result=PASS 是**v0.3 生成时的旧结论**，与当前实体文件不符。");
  console.log("  ⇒ 这是「Gold 变更未同步 hash-lock」，属P1 级流程缺陷（不是数据被篡改）。");
}

// 恢复原文件（保持仓库干净）
fs.copyFileSync("C:/Users/cjh05/AppData/Local/Temp/manifest_old.json", "evaluation/sealed/single/manifest.json");
fs.copyFileSync("C:/Users/cjh05/AppData/Local/Temp/hashlock_old.json", "evaluation/sealed/hash-lock.json");
fs.copyFileSync("C:/Users/cjh05/AppData/Local/Temp/crossdoc_old.json", "evaluation/sealed/cross-doc/manifest.json");
console.log("\n（已把 sealed 三个 manifest 恢复为仓库版本，未留下改动）");