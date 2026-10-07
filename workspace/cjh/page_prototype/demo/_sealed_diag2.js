// 对比：本地文件 hash vs git blob hash vs manifest 记录 hash —— 三方定位
const fs = require("fs");
const crypto = require("crypto");
const { execSync } = require("child_process");

const SHA = process.argv[2] || "259af54d82f4fed46aef65d0ca53f9770c4cc71b";
const man = JSON.parse(fs.readFileSync("evaluation/sealed/single/manifest.json", "utf8"));
const lock = JSON.parse(fs.readFileSync("evaluation/sealed/hash-lock.json", "utf8"));
const lockMap = new Map(lock.single_cases.map((c) => [c.sealed_id, c]));

function resolve(rel) {
  const parts = ["evaluation", "sealed", "single"];
  for (const seg of rel.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg === "." || seg === "") continue;
    else parts.push(seg);
  }
  return parts.join("/");
}
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

// 从宗分支读 blob 原始字节
function blobOf(path) {
  try {
    return execSync('git cat-file blob "' + SHA + ":" + path + '"', { maxBuffer: 1e8 });
  } catch (e) {
    return null;
  }
}

const rows = [];
man.cases.forEach((c) => {
  const L = lockMap.get(c.sealed_id);
  if (!L) return;
  const rp = resolve(c.raw), gp = resolve(c.gold);
  [
    ["raw", rp, L.raw_sha256],
    ["gold", gp, L.gold_sha256],
  ].forEach(([kind, p, want]) => {
    const localBuf = fs.existsSync(p) ? fs.readFileSync(p) : null;
    const blobBuf = blobOf(p);
    rows.push({
      id: c.sealed_id,
      kind,
      path: p,
      want,
      local: localBuf ? sha(localBuf) : "缺文件",
      blob: blobBuf ? sha(blobBuf) : "缺 blob",
    });
  });
});

const badLocal = rows.filter((r) => r.local !== r.want);
const badBlob = rows.filter((r) => r.blob !== r.want);
console.log("=== 三方比对（" + rows.length + " 个 raw/gold）===");
console.log("本地文件 hash 与 manifest 不符: " + badLocal.length);
console.log("宗分支 blob hash 与 manifest 不符: " + badBlob.length);
console.log("\n→ 若两者数目相同且一致，说明「宗分支自身就与 manifest 不同步」");

console.log("\n=== 清单（前 25 条不符）===");
badLocal.slice(0, 25).forEach((r) => {
  const sameBlob = r.local === r.blob;
  console.log(
    r.id + " " + r.kind +
    "\n   manifest  " + r.want.slice(0, 24) +
    "\n   本地文件  " + r.local.slice(0, 24) +
    "\n   宗分支blob " + r.blob.slice(0, 24) +
    (sameBlob ? "   [本地==blob ⇒ 检出无损，是源侧不同步]" : "   [本地≠blob ⇒ 检出过程有问题]")
  );
});

// 差异归类：manifest 里的 hash 到底对应哪个文件？
// 尝试：manifest 的 gold 路径 vs 同case 在别处的 gold
console.log("\n=== 深挖：D7-SEALED-001 gold 的三方===");
const r0 = rows.find((r) => r.id === "D7-SEALED-001" && r.kind === "gold");
console.log("manifest 路径:", r0.path);
console.log("manifest hash:", r0.want);
// 该 case 的 gold_sha256 也记在 hash-lock；对比 manifest 内 raw/gold 自带 sha
const mcase = man.cases.find((c) => c.sealed_id === "D7-SEALED-001");
console.log("manifest.cases[0].gold_sha256:", mcase.gold_sha256);
console.log("hash-lock 的 gold_sha256:    ", L_gold());
function L_gold() {
  return lockMap.get("D7-SEALED-001").gold_sha256;
}