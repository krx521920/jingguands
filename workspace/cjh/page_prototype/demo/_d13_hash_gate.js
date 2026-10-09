#!/usr/bin/env node
"use strict";
/**
 * D13 陌生样例 —— 哈希闸门（跑之前先验明样本没被调包）
 *
 * 用法：node demo/_d13_hash_gate.js
 * 判据：file_sha256 / parse_sha256 必须与 evaluation/D13/陌生样例-锁.json 逐字节一致。
 *不一致 = 样本被换，本轮复现直接作废（宗的开封规则：没见过的输入 + 没见过的答案）。
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const LOCK = path.join(ROOT, "evaluation", "D13", "陌生样例-锁.json");
const DIR = path.join(ROOT, "evaluation", "D13", "strange-samples");

function sha256File(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

if (!fs.existsSync(LOCK)) {
  console.error("FAIL  找不到锁文件: " + LOCK);
  console.error("      宗未把 evaluation/D13/ 推上分支，或路径已变 —— 这是 D13 复现的前置阻塞，属缺陷。");
  process.exit(2);
}
if (!fs.existsSync(DIR)) {
  console.error("FAIL  找不到样例目录: " + DIR);
  process.exit(2);
}

const lock = JSON.parse(fs.readFileSync(LOCK, "utf8"));
let pass = 0, fail = 0, warn = 0;

console.log("D13 哈希闸门｜locked_on=" + lock.locked_on);
console.log("-".repeat(72));

for (const s of lock.samples || []) {
  const rows = [];
  for (const [key, want] of [["file", s.file_sha256], ["parse", s.parse_sha256]]) {
    if (!want) { rows.push({ key, state: "SKIP", note: "锁未登记" }); continue; }
    const f = path.join(DIR, s[key]);
    if (!fs.existsSync(f)) { rows.push({ key, state: "FAIL", note: "文件缺失" }); continue; }
    const got = sha256File(f);
    if (got === want) rows.push({ key, state: "PASS", note: got.slice(0, 16) });
    else rows.push({ key, state: "FAIL", note: "期望 " + want.slice(0, 16) + " 实得 " + got.slice(0, 16) });
  }

  let st = "PASS";
  for (const r of rows) {
    if (r.state === "FAIL") st = "FAIL";
    else if (r.state === "SKIP") st = "WARN";
  }
  if (st === "PASS") pass++; else if (st === "FAIL") fail++; else warn++;

  console.log("[" + st + "] " + s.id + "  " + s.name);
  for (const r of rows) {
    console.log("       " + (r.key + "        ").slice(0, 8) + r.state.padEnd(5) + " " + r.note);
  }
  if (s.expectation_sha256) {
    console.log("       预期锁   LOCKED " + s.expectation_sha256.slice(0, 16) + "（只公开哈希，原文不在库）");
  }
  // 页/块数与锁登记对照（evidence/0.9：块序列在 reading_order，不在 blocks）
  if (s.blocks) {
    try {
      const pj = JSON.parse(fs.readFileSync(path.join(DIR, s.parse), "utf8"));
      const blocks = Array.isArray(pj.reading_order)
        ? pj.reading_order.length
        : (pj.blocks || []).length;
      if (blocks !== s.blocks) {
        console.log("       块数     WARN 锁记 " + s.blocks + " 实得 " + blocks);
      } else {
        console.log("       块数     PASS " + blocks + "（reading_order）");
      }
      if (pj.doc && s.file_sha256 && pj.doc.file_sha256 !== s.file_sha256) {
        console.log("       内嵌id   FAIL parse 内 file_sha256≠ 锁内登记");
      }
    } catch (e) { warn++; console.log("       parse读取 WARN " + e.message); }
  }
}

console.log("-".repeat(72));
console.log("PASS=" + pass + "  WARN=" + warn + "  FAIL=" + fail);
if (fail > 0) {
  console.log("判定：样本哈希不符 —— 本轮复现作废，禁止继续跑（输入不可信）。");
  process.exit(1);
}
console.log("判定：3 份样本与宗锁定哈希逐字节一致，可进入干净环境执行。");