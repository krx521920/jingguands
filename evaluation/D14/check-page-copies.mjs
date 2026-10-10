#!/usr/bin/env node
// check-page-copies.mjs —— 消费副本时效门（评测侧 · D14）
//
// 背景（2026-10-10 D14 本地服务实测查出）：页面为了演示会从各方分支把文件拷进自己的 data/。
//   "拷的是哪一版"文件自己不会说话：陈侧 data/d10/integration_bundle.json 是魏 D10 包的
//   **旧构建**（built_at 08:58 / code_version 4e0b910c），最新是 D11 版（13:00 / bcc0cc6e），
//   两包里 D10-INT-008 的关系判定不同（unrelated vs unknown）——页面照旧包渲染，就会与
//   权威包对不上。评测侧的结构化检查器（evaluation/D10/check-integration.mjs）**查不出**
//   这件事（新旧包都过），所以时效必须单独做门。
//
// 做法：不去猜"看起来像不像新版"，而是拿**唯一正确的字节哈希**比对。清单在
//   evaluation/D14/page-copies-manifest.json（每条都写了上游原件出处）。
//
// 用法：
//   node evaluation/D14/check-page-copies.mjs --page <page_prototype 目录>   # 默认 tmp/page
//   node evaluation/D14/check-page-copies.mjs --json evaluation/D14/page-copies-result.json
// 退出码：任一 gate 项 FAIL（缺失/过期/锚点不符）→ 1；只有 warn 项不达标 → 0（但会打印）。
"use strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const PAGE = arg("--page", "tmp/page");
const OUT = arg("--json", null);
const MANIFEST = arg("--manifest", "evaluation/D14/page-copies-manifest.json");

const sha256 = f => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const rows = [];

const man = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
for (const c of man.copies) {
  const p = path.join(PAGE, c.local);
  if (!fs.existsSync(p)) { rows.push({ ...c, status: "MISSING", got: null }); continue; }
  const got = sha256(p);
  rows.push({ ...c, status: got === c.expect_sha256 ? "MATCH" : "STALE", got });
}

// 权威批次：份数 + 逐份字节 + 锚点，三层都核（少一份也过不了锚点，但份数要单独说）
const b = man.authoritative_batch;
const dir = path.join(PAGE, b.local_dir);
let batch = { status: "MISSING", docs: 0, docs_expected: b.docs, anchor: null, anchor_ok: null, byte_diff: [] };
if (fs.existsSync(dir)) {
  const all = fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort();
  const kept = all.filter(f => !b.excluded.includes(f));
  const refDir = b.reference_dir;
  const byteDiff = [];
  for (const f of all) {
    const ref = path.join(refDir, f);
    if (!fs.existsSync(ref)) { byteDiff.push(f + "(参考缺失)"); continue; }
    if (sha256(path.join(dir, f)) !== sha256(ref)) byteDiff.push(f);
  }
  const lines = kept.map(f => `${f}:${sha256(path.join(dir, f))}`);
  const anchor = crypto.createHash("sha256").update(lines.join("\n")).digest("hex");
  const anchorOk = anchor === b.anchor_sha256;
  const docsOk = kept.length === b.docs;
  batch = {
    status: anchorOk && docsOk && byteDiff.length === 0 ? "MATCH" : "STALE",
    docs: kept.length, docs_expected: b.docs, excluded_present: all.filter(f => b.excluded.includes(f)),
    anchor, anchor_expected: b.anchor_sha256, anchor_ok: anchorOk, byte_diff: byteDiff,
  };
}

const gateFail = rows.filter(r => r.level === "gate" && r.status !== "MATCH").length + (b.level === "gate" && batch.status !== "MATCH" ? 1 : 0);
const warnFail = rows.filter(r => r.level !== "gate" && r.status !== "MATCH").length;
const out = {
  checked_on: new Date().toISOString().slice(0, 10),
  page_dir: PAGE, result: gateFail ? "FAIL" : "PASS", gate_fail: gateFail, warn_fail: warnFail,
  copies: rows.map(r => ({ local: r.local, level: r.level, status: r.status, expect: r.expect_sha256.slice(0, 12), got: r.got ? r.got.slice(0, 12) : null, source: r.source })),
  authoritative_batch: batch,
};
if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify({ result: out.result, page_dir: PAGE, gate_fail: gateFail, warn_fail: warnFail }, null, 2));
for (const r of out.copies) console.log(`  [${r.level === "gate" ? "GATE" : "warn"}] ${r.status.padEnd(7)} ${r.local}`);
console.log(`  [GATE] ${batch.status.padEnd(7)} ${b.local_dir}/  docs=${batch.docs}/${batch.docs_expected} anchor_ok=${batch.anchor_ok} byte_diff=${batch.byte_diff ? batch.byte_diff.length : 0}`);
if (batch.status !== "MATCH" || gateFail) {
  console.log("  处理：对不上就是过期/缺失，不要改清单去迁就现状（清单登记的是上游原件，改清单＝把错的事实写成对的）。");
}
process.exit(gateFail ? 1 : 0);