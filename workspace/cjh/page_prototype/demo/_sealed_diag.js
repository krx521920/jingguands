// 诊断：为什么 verify-sealed FAIL —— 是内容变了还是行尾转换？
// D12-C2：evaluation/ 是宗（评测侧）保管的资产，不在本分支入库。
//   本脚本只读、需本机已检出 evaluation/sealed/；缺失即报错退出，绝不静默继续。
const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const ev = require("./_evals_paths.js");

let SEALED;
try { SEALED = ev.sealedDir(); } catch (e) { console.error("[中止] " + e.message); process.exit(2); }

function sha256File(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}
function sha256Buf(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

const man = JSON.parse(fs.readFileSync(path.join(SEALED, "single", "manifest.json"), "utf8"));
const lock = JSON.parse(fs.readFileSync(path.join(SEALED, "hash-lock.json"), "utf8"));
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

let rawOK = 0, rawBad = 0, goldOK = 0, goldBad = 0;
let crlfFixed = 0, stillBad = 0;
const samples = [];

man.cases.forEach((c) => {
  const L = lockMap.get(c.sealed_id);
  if (!L) return;
  const rp = resolve(c.raw);
  const gp = resolve(c.gold);

  // raw
  if (fs.existsSync(rp) && sha256File(rp) === L.raw_sha256) rawOK++;
  else {
    rawBad++;
    if (fs.existsSync(rp)) {
      // 试着把 CRLF 还原成 LF 再算
      const buf = fs.readFileSync(rp);
      const lf = Buffer.from(buf.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
      if (sha256Buf(lf) === L.raw_sha256) {
        crlfFixed++;
        if (samples.length < 3)
          samples.push({ id: c.sealed_id, kind: "raw", why: "CRLF→LF 后 hash 命中" });
      } else if (samples.length < 6) {
        stillBad++;
        samples.push({ id: c.sealed_id, kind: "raw", why: "还原行尾仍不命中", path: rp });
      }
    } else if (samples.length < 6) {
      stillBad++;
      samples.push({ id: c.sealed_id, kind: "raw", why: "文件不存在", path: rp });
    }
  }

  // gold
  if (fs.existsSync(gp) && sha256File(gp) === L.gold_sha256) goldOK++;
  else {
    goldBad++;
    if (fs.existsSync(gp)) {
      const buf = fs.readFileSync(gp);
      const lf = Buffer.from(buf.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
      if (sha256Buf(lf) === L.gold_sha256) crlfFixed++;
      else if (samples.length < 6)
        samples.push({ id: c.sealed_id, kind: "gold", why: "还原行尾仍不命中", path: gp });
    } else if (samples.length < 6) {
      stillBad++;
      samples.push({ id: c.sealed_id, kind: "gold", why: "文件不存在", path: gp });
    }
  }
});

console.log("=== verify-sealed FAIL 真因诊断 ===");
console.log("raw  命中 " + rawOK + " / 不符 " + rawBad);
console.log("gold 命中 " + goldOK + " / 不符 " + goldBad);
console.log("\n其中「把 CRLF 还原成 LF 后 hash 就命中」: " + crlfFixed + " 个");
console.log("还原行尾后仍不符 / 文件缺失: " + stillBad + " 个");
console.log("\n样例:");
samples.forEach((s) => console.log("  " + s.id + " " + s.kind + " — " + s.why + (s.path ? "  " + s.path : "")));

// 检查 .gitattributes 是否规定了这些路径
try {
  const ga = fs.readFileSync(".gitattributes", "utf8");
  const hits = ga.split(/\r?\n/).filter((l) => /evaluation|corpus|json|text|eol/i.test(l));
  console.log("\n=== .gitattributes 相关规则 (" + hits.length + " 条) ===");
  hits.slice(0, 8).forEach((l) => console.log("  " + l));
} catch (e) {
  console.log("\n无 .gitattributes");
}

// 实际行尾检查
const probe = resolve(man.cases[0].gold);
const buf = fs.readFileSync(probe);
const crlfCount = (buf.toString("utf8").match(/\r\n/g) || []).length;
console.log("\n探针 " + probe);
console.log("  CRLF 数 " + crlfCount + " / 总字节 " + buf.length);
console.log("  → 若 CRLF 数 > 0，说明检出时被转换过");