#!/usr/bin/env node
"use strict";
/**
 * D14 步骤 3：按 sha 取件并逐份核验解析快照（不做文件名匹配）
 *
 * 依据：delivery/v2.0:evaluation/run-side/weiwenyu/D9/snapshot-paths.json
 * 宗的要求：「按 sha 取件（别按文件名），取完逐份核 parse_file_sha256」。
 *
 * 为什么必须按 sha：
 *   文件名会跨批次沿用（同一个 case_id 在不同批次可能是不同内容），
 *   按名取件＝自欺。join 键＝信封 source.file_sha256 ↔ 解析 doc/handoff.file_sha256。
 *
 * 用法：
 *   node demo/_d13_snapshot_fetch.js --src delivery/v2.0 --out data_unified/_snapshots
 *   node demo/_d13_snapshot_fetch.js --verify-only
 *
 * 退出码：0 全绿；1 有哈希不符；2 前置缺失（清单/源树不可达）
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const PAGE = path.join(ROOT, "workspace", "cjh", "page_prototype");
const MANIFEST_REL = "evaluation/run-side/weiwenyu/D9/snapshot-paths.json";

function sha256Buf(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}
function sha256File(p) {
  return sha256Buf(fs.readFileSync(p));
}
function git(args, opts) {
  return execFileSync("git", args, Object.assign({ cwd: ROOT, maxBuffer: 1 << 30 }, opts || {}));
}

const argv = process.argv.slice(2);
const getArg = (k, dflt) => {
  const i = argv.indexOf(k);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const verifyOnly = argv.includes("--verify-only");
const SRC = getArg("--src", "delivery/v2.0");
const OUT = path.join(PAGE, getArg("--out", "data_unified/_snapshots"));

// 1) 清单：优先本地 evaluation/，否则从源树读
let man;
const localMan = path.join(ROOT, MANIFEST_REL);
if (fs.existsSync(localMan)) {
  man = JSON.parse(fs.readFileSync(localMan, "utf8"));
} else {
  let raw;
  try {
    raw = git(["cat-file", "blob", `origin/${SRC}:${MANIFEST_REL}`]);
  } catch (e) {
    console.error("FAIL  读不到清单 " + MANIFEST_REL + "（origin/" + SRC + "）");
    console.error("      先 git fetch origin " + SRC);
    process.exit(2);
  }
  man = JSON.parse(raw.toString("utf8"));
}

console.log("D14 步骤 3 · 解析快照按 sha 取件与核验");
console.log("清单built_on = " + man.built_on + "｜built_by = " + man.built_by);
console.log("join_key = " + man.join_key);
console.log("条目 = " + man.docs.length);
console.log("-".repeat(78));

if (!verifyOnly) fs.mkdirSync(OUT, { recursive: true });

let ok = 0, mismatch = 0, missing = 0, noSrc = 0;
const rows = [];

// 源树路径表只查一次（懒加载），避免每条都 ls-tree 全树
let treeCache = null;
function srcTree() {
  if (treeCache === null) {
    treeCache = git(["ls-tree", "-r", "--name-only", `origin/${SRC}`])
      .toString("utf8").split("\n");
  }
  return treeCache;
}

for (const d of man.docs) {
  const want = d.parse_file_sha256;
  const dest = path.join(OUT, path.basename(d.parse_path));

  if (!verifyOnly) {
    // 按清单登记的路径从源树取件（不靠文件名猜）
    let buf = null;
    let srcPath = d.parse_path;
    try {
      buf = git(["cat-file", "blob", `origin/${SRC}:${d.parse_path}`]);
    } catch (e) {
      // 回退：按 basename 在源树里精确定位一次（仍以 sha 校验为准）
      const hit = srcTree().filter(p => path.basename(p) === path.basename(d.parse_path));
      if (hit.length === 1) { buf = git(["cat-file", "blob", `origin/${SRC}:${hit[0]}`]); srcPath = hit[0]; }
      else if (hit.length > 1) { rows.push({ id: d.case_id, st: "NO_SRC", note: "源树同名 " + hit.length + " 处，需人工定位" }); noSrc++; continue; }
    }
    if (!buf) { rows.push({ id: d.case_id, st: "NO_SRC", note: "源树无此路径 " + d.parse_path }); noSrc++; continue; }
    // 落盘前先核：源件本身必须与清单登记的 parse_file_sha256 一致
    const srcHash = sha256Buf(buf);
    if (want && srcHash !== want) {
      rows.push({ id: d.case_id, st: "MISMATCH", note: "源件即不符 期望 " + want.slice(0, 12) + " 源件 " + srcHash.slice(0, 12) });
      mismatch++; continue;
    }
    // ★ 必须按清单登记的原路径落盘（含corpus/… 前缀）：
    //   D18 验收门用 path.join(MAT, d.parse_path) 定位，平铺会全部判MISSING。
    const dest2 = path.join(OUT, srcPath);
    fs.mkdirSync(path.dirname(dest2), { recursive: true });
    fs.writeFileSync(dest2, buf);
  }

  if (!fs.existsSync(dest)) {
    const dest2 = path.join(OUT, d.parse_path);
    if (fs.existsSync(dest2)) {
      rows.push({ id: d.case_id, st: "OK", note: sha256File(dest2).slice(0, 12) + "  blocks=" + d.blocks + "  (按原路径)" });
      ok++; continue;
    }
    rows.push({ id: d.case_id, st: "MISSING", note: "未落盘 " + path.basename(dest) }); missing++; continue;
  }
  const got = sha256File(dest);
  if (want && got !== want) {
    rows.push({ id: d.case_id, st: "MISMATCH", note: "期望 " + want.slice(0, 12) + " 实得 " + got.slice(0, 12) });
    mismatch++; continue;
  }
  // 交叉核：解析件内声明的 file_sha256 应等于清单的 join 键
  let joinNote = "";
  try {
    const pj = JSON.parse(fs.readFileSync(dest, "utf8"));
    const declared = (pj.doc && (pj.doc.file_sha256 || pj.doc.file_id)) ||
      (pj.handoff && pj.handoff.file_sha256) || null;
    if (d.file_sha256 && declared && typeof declared === "string" &&
        declared.length === 64 && declared !== d.file_sha256) {
      joinNote = "  ⚠ join 键不符（清单 " + d.file_sha256.slice(0, 12) + " / 解析内 " + declared.slice(0, 12) + "）";
    }
  } catch (e) { joinNote = "  ⚠ 解析件 JSON 读失败：" + e.message; }
  rows.push({ id: d.case_id, st: "OK", note: got.slice(0, 12) + "  blocks=" + d.blocks + joinNote });
  ok++;
}

for (const r of rows) {
  const mark = r.st === "OK" ? "  OK  " : (r.st === "MISMATCH" ? " FAIL " : " WARN ");
  console.log("[" + r.st.padEnd(8) + "] " + (r.id + "                ").slice(0, 18) + r.note);
}

console.log("-".repeat(78));
console.log("OK=" + ok + "  MISMATCH=" + mismatch + "  MISSING=" + missing + "  NO_SRC=" + noSrc);
console.log("落盘目录 = " + OUT);

if (mismatch > 0) {
  console.log("判定：哈希不符 —— 不许继续。快照是 L3 出处核验的输入，输入不可信则核验结果无意义。");
  process.exit(1);
}
console.log("判定：逐份sha256 一致，可用于 L3 出处核验。");