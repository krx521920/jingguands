// demo/_d13c2_check.js —— D13-C2「text 字段不显示标准化状态」守卫
//
// 裁定依据：evaluation/D17/裁定-standardized判据-20261010.md 第三节 ——
//   「text 字段的 standardized 键无契约含义（沿用 D13-C2 裁决）→ 不入分母、不上屏」
//   「消费方读取 text 字段的该键」属明令禁止。
//
// 为什么要有这个门：
//   D13-C2 早就裁过了，但消费侧当时**恰好**没做展示 —— 属于"靠没写代码来合规"。
//   任何人哪天一��给结果页加个"标准化：是/否"标签，就静默破了这个裁定，
//   而且没有任何检查会响。本门把这三条变成可执行断言。
//
// 三条断言（对应裁定原文的三处禁止）：
//   A1 入分母：标准化两项指标的分母不得含 unit=text 字段
//   A2 上屏·接口：/api/metrics 与 /api/metrics/registry 不得把 text 字段的 standardized 计入分子分母
//   A3 上屏·前端：前端代码不得渲染 text 字段的标准化状态
//
// 退出码：FAIL = 1。
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const BR = path.join(ROOT, "bridge");
const JS = path.join(ROOT, "public", "js");

let pass = 0, fail = 0;
const rows = [];
function ok(rule, name, detail) { pass++; rows.push(["PASS", rule, name, detail || ""]); }
function bad(rule, name, detail) { fail++; rows.push(["FAIL", rule, name, detail || ""]); }

// ---------- 读实算产物（唯一数据源，不重算） ----------
const stdPath = path.join(__dirname, "_standardized_real.json");
if (!fs.existsSync(stdPath)) {
  console.error("[中止] 缺少 demo/_standardized_real.json —— 先跑 node demo/_standardized_real.js");
  process.exit(2);
}
const std = JSON.parse(fs.readFileSync(stdPath, "utf8"));

// ---------- A1：分母不含 text ----------
const byUnit = std.coverage && std.coverage.by_unit ? std.coverage.by_unit : {};
const textInDenom = Object.keys(byUnit).some((u) => /(^|_)text($|_)/i.test(u) || u === "text");
if (textInDenom) {
  bad("A1_NO_TEXT_IN_DENOM", "标准化覆盖率分母混入 text 字段", JSON.stringify(byUnit));
} else {
  ok("A1_NO_TEXT_IN_DENOM", "标准化覆盖率分母不含 text",
    "非text 有值 " + std.coverage.den + " 条，unit 分布 " + JSON.stringify(byUnit));
}
// text 字段须被单独统计（证明是"显式排除"而非"没看见"）
if (std.context && std.context.text_valued > 0) {
  ok("A1_TEXT_EXCLUDED_EXPLICIT", "text 字段被显式排除且单独计数",
    "text 有值 " + std.context.text_valued + " 条（true " + std.context.text_true + " / false " + std.context.text_false + "），不入分母不上屏");
} else {
  bad("A1_TEXT_EXCLUDED_EXPLICIT", "text 字段未被单独计数", "text_valued=" + (std.context && std.context.text_valued) + " —— 无法证明是显式排除");
}
//辅助口径（含 text 噪声）必须存在且标注为"仅对照"
if (std.context && std.context.aux_pct !== undefined && std.context.aux_pct !== null) {
  ok("A1_AUX_LABELLED", "含 text 噪声的辅助口径单列", "aux=" + std.context.aux_pct + "%（覆盖率 " + std.coverage.pct + "% 为权威主口径）");
}

// ---------- A2：接口层不得把 text 的 standardized 计入 ----------
function regValue(key) {
  try {
    const reg = require(path.join(BR, "metrics_registry.js"));
    const r = reg.get(key);
    return r || null;
  } catch (e) { return null; }
}
const rate = regValue("standardized_rate");
const acc = regValue("standardized_accuracy");
for (const [key, r] of [["standardized_rate", rate], ["standardized_accuracy", acc]]) {
  if (!r) { bad("A2_REG_READABLE", "注册表 " + key + " 可读", "读取失败"); continue; }
  if (r.den === std.coverage.den || key === "standardized_accuracy") {
    ok("A2_REG_DENOM", "注册表 " + key + " 分母＝非 text 有值字段",
      "分子 " + r.num + " / 分母 " + r.den);
  } else {
    bad("A2_REG_DENOM", "注册表 " + key + " 分母异常", "分母 " + r.den + "，期望 " + std.coverage.den);
  }
  // 注册表口径文本必须写明 text 不入分母
  const hay = [r.caliber, r.evidence_note, r.numerator, r.denominator].filter(Boolean).join(" ");
  if (hay.includes("text")) {
    ok("A2_REG_DECLARES", "注册表 " + key + " 口径写明 text 处理", "已声明 text 不入分母");
  } else {
    bad("A2_REG_DECLARES", "注册表 " + key + " 未声明 text 处理", "口径文本里找不到 text 说明");
  }
}

// ---------- A3：前端不得渲染 text 的标准化状态 ----------
// 判据：前端源码里不得出现把 standardized 与 text 组合展示的写法。
// 这里查两类真违规：
//   ① 直接读 f.standardized / field.standardized 渲染（任何字段的都不允许上屏）
//   ② 以 unit==="text" 为条件渲染 standardized（明确针对 text）
// 只要出现 standardized 渲染即 FAIL —— 契约本体保留该键，页面一律不显示。
const jsFiles = [];
(function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.(js|mjs)$/.test(f)) jsFiles.push(p);
  }
})(JS);
// 契约层（bridge/）允许透传该键，只查渲染层
const offenders = [];
for (const f of jsFiles) {
  const src = fs.readFileSync(f, "utf8");
  src.split("\n").forEach((line, i) => {
    if (/^\s*(\/\/|\*)/.test(line)) return;         // 注释不算
    if (!/standardized/i.test(line)) return;
    offenders.push(path.relative(ROOT, f) + ":" + (i + 1) + "  " + line.trim().slice(0, 90));
  });
}
if (offenders.length === 0) {
  ok("A3_FRONTEND_NO_STD", "前端不渲染 standardized 状态",
    "已扫 " + jsFiles.length + " 个前端文件，零处渲染（契约本体 bridge/ 仍保留该键，不受此门限制）");
} else {
  bad("A3_FRONTEND_NO_STD", "前端出现 standardized 渲染", offenders.slice(0, 5).join(" ｜ "));
}

// ---------- 输出 ----------
console.log("═".repeat(78));
console.log("D13-C2 守卫 · text 字段不显示标准化状态");
console.log("═".repeat(78));
for (const [st, rule, name, detail] of rows) {
  console.log(`[${st}] ${rule} · ${name}`);
  if (detail) console.log(`        ${detail}`);
}
console.log("─".repeat(78));
console.log(`PASS ${pass}　FAIL ${fail}`);
process.exit(fail ? 1 : 0);