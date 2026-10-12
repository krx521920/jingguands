// parity_report.js —— D12：实际对照报告的读取与呈现口径（D12 第 1 项）
//
// ★ 为什么要有这个文件：demo/_parity_real.js 已经把三层对照跑完了，结论躺在
//   demo/_parity_real.json 里。**页面上看不到 = 对读者等于没做**——这正是 D10
//   「web_cli_same_result」的翻版：数据在，但没人能从产物上看出来。
//
// 本文件只做两件事，且都极窄：
//   1. 读取报告（不存在就明说怎么跑，不静默返回空/伪造通过）
//   2. 给每层套上「它证明了什么 / 它不能证明什么」的措辞，页面与材料共用同一套
//
// ★ 措辞纪律（复用 bridge/extractor.js 的反造假铁律）：
//   - 报告文件不存在 ⇒ verdict=not_covered，**不得**回退到任何"通过"表述
//   - 报告存在但 generated_at 早于数据源变更 ⇒ 带 stale 标记，页面须提示
//   - L3 是幂等性不是一致性，措辞里不许出现"一致通过"
"use strict";

const fs = require("fs");
const path = require("path");
// ★ D25 步骤6-③：接data_source 才能判「报告跑的是哪批数据、现在还准不准」。
//   本文件原先只在注释里承诺「generated_at 早于数据源变更 ⇒ 带 stale 标记」，
//   **代码里从未实现** —— 又一条"说了没做"（读者以为有这层保护，实际没有）。
const dataSource = require("./data_source.js");

const ROOT = path.resolve(__dirname, "..");
const REPORT = path.join(ROOT, "demo", "_parity_real.json");

/** 三层各自的措辞。★ 与 demo/_parity_real.js 里的字段一一对应，不允许两处各写一套。 */
const LAYER_PHRASES = {
  L1: {
    title: "L1 文件哈希对照",
    proves: "两侧信封是不是同一份文件。若哈希相同 ⇒ 同源，其后各层的「一致」不作证据。",
    not_proves: "不证明任何字段抽取质量，只证明「比的是两个不同的东西」。",
  },
  L2: {
    title: "L2 跨批逐字段对照",
    proves: "两个抽取批在同一文档上的字段取值是否稳定（value + status 逐字段比）。",
    not_proves: "★ 不证明 Web 与 CLI 一致——两侧都不是 Web/CLI，而是两批离线产物。",
  },
  L3: {
    title: "L3 导出字节对照",
    proves: "导出链路的序列化稳定（无编码/BOM/列序漂移），两侧都是 HTTP 实取字节。",
    not_proves: "★ 不证明抽取一致性——两侧跑的是同一个函数、同一份数据。这是幂等性，不是双路对照。",
  },
};

/** 判据 → 徽标语义。三态，不允许二分（"一致/不一致"会把"没测"混进"通过"）。 */
function badgeOf(verdict) {
  switch (verdict) {
    case "consistent":
    case "distinct":
    case "idempotent":
      return { tone: "ok", mark: "✓", label: "已测·通过" };
    case "divergent":
    case "same_source_partial":
      return { tone: "bad", mark: "✗", label: "已测·有差异" };
    case "not_covered":
    case "partial":
    default:
      return { tone: "neutral", mark: "—", label: "未测" };
  }
}

/**
 * ★ D25 步骤6-③：报告是否已过期 —— **实算当前输入指纹，与报告里存的对账**。
 *
 * D19 铁律⑧的落点：报告里`input_fingerprint` 记的是跑它那一刻的输入目录指纹，
 * 若之后数据换了（换源、刷新权威批、上传新件），报告的数字就**不再描述当前数据**。
 * 数字本身可能仍然正确，但"跑在哪批数据上"这一层已不可引用 —— 页面必须显示 stale。
 *
 * ★ 判过期用**当前实算指纹 ≠ 报告存指纹**，不看日期：
 *   日期会被"同一天改了数据"骗过去，而指纹不会。
 *   指纹算法与 demo/_parity_real.js 用的是同一个（registry.fingerprint / data_source.dirFingerprint）。
 */
function staleness(r) {
  const recorded = (r && r.input_fingerprint && r.input_fingerprint.inputs) || null;
  // ★ 键名必须与 metrics_registry.fingerprint() 的 inputs 完全一致
  //   （{page_data, unified_batch}），不是 data_source 的批次 id ——
  //   键名对不上会**恒判 stale**，那等于把"过期检测"变成"永远报警"，同样是假信号。
  const DIRS = { page_data: "data", unified_batch: dataSource.BATCHES[dataSource.PRIMARY_ID].dir };
  const current = {};
  for (const k of Object.keys(DIRS)) current[k] = dataSource.dirFingerprint(DIRS[k]);
  // 报告里记的是旧结构（只有 page_data），当前两批都在用：
  //   只要**报告没覆盖当前任一批次的指纹**，就无法证明它描述当前数据 ⇒ 判 stale。
  if (!recorded) return { stale: true, reason: "报告未记录输入指纹，无法证明它描述当前数据", current };
  const missing = Object.keys(current).filter(k => !recorded[k]);
  if (missing.length) {
    return {
      stale: true,
      reason: `报告生成于数据源换版前：只覆盖 ${Object.keys(recorded).join("/")}，未覆盖 ${missing.join("/")} —— ` +
              `该报告的数字不描述当前页面所用数据（重跑：node demo/_parity_real.js）`,
      missing_batches: missing,
      current,
    };
  }
  const changed = Object.keys(current).filter(k => recorded[k] && recorded[k].sha256 !== current[k].sha256);
  if (changed.length) {
    return {
      stale: true,
      reason: `报告生成后 ${changed.join("/")} 目录内容已变（指纹不同）—— 须重跑 node demo/_parity_real.js`,
      changed_batches: changed,
      current,
    };
  }
  return { stale: false, reason: "输入指纹与报告记录一致，报告仍描述当前数据", current };
}

function loadReport() {
  if (!fs.existsSync(REPORT)) {
    return {
      available: false,
      verdict: "not_covered",
      reason: "未找到对照报告 demo/_parity_real.json —— 生成命令：node demo/_parity_real.js",
      how_to_generate: "node demo/_parity_real.js",
      layers: [],
      still_not_covered: null,
      headline: "实际对照报告未生成 —— 判未测，不得按「无差异即通过」处理。",
    };
  }
  let r;
  try {
    r = JSON.parse(fs.readFileSync(REPORT, "utf8"));
  } catch (e) {
    return {
      available: false,
      verdict: "not_covered",
      reason: `报告存在但解析失败：${e.message} —— 判未测`,
      how_to_generate: "node demo/_parity_real.js",
      layers: [],
      still_not_covered: null,
      headline: "对照报告损坏 —— 判未测。",
    };
  }

  const st = staleness(r);
  //★ stale 时 verdict 降为 not_covered：过期报告的数字不能当"已测通过"引用。
  //   但**保留原数字并标明** —— 删掉等于把"曾经跑过"也抹了，读者会以为从没跑过。
  const layers = ["L1", "L2", "L3"].map(k => {
    const L = (r.layers || {})[k] || null;
    const P = LAYER_PHRASES[k];
    if (!L) {
      return {
        key: k, title: P.title, verdict: "not_covered",
        badge: badgeOf("not_covered"),
        reason: "报告中缺该层", proves: P.proves, not_proves: P.not_proves,
        numbers: [],
      };
    }
    // ★ 每一层都自带「不能证明什么」。少这一句，读者就会把 L3 的幂等性读成一致性。
    const numbers = [];
    if (L.paired != null) numbers.push(["配对文档对", `${L.paired}`]);
    if (L.identical != null) numbers.push(["字节/字段相同", `${L.identical}`]);
    if (L.fields_compared != null) numbers.push(["字段比对数", `${L.fields_compared}`]);
    if (L.same_pct != null) numbers.push(["字段一致率", `${L.same_pct}%`]);
    if (L.diff_total != null) numbers.push(["字段差异", `${L.diff_total}`]);
    if (L.unpaired_total != null) numbers.push(["单侧独有事件", `${L.unpaired_total}`]);
    if (L.weak_unmatched_total != null) numbers.push(["降级配对", `${L.weak_unmatched_total}`]);
    if (L.http_ok != null) numbers.push(["HTTP 取字节成功", `${L.http_ok}`]);
    if (L.http_failed != null) numbers.push(["HTTP 失败", `${L.http_failed}`]);
    if (L.partial) numbers.push(["partial", "是 —— 不得单独引用"]);

    return {
      key: k,
      title: P.title,
      question: L.question || P.title,
      verdict: L.verdict || "not_covered",
      badge: badgeOf(L.verdict),
      reason: L.reason || null,
      unpaired_note: L.unpaired_note || null,
      proves: L.what_it_proves || P.proves,
      not_proves: L.what_it_does_not_prove || P.not_proves,
      numbers,
      rows: (L.rows || []).length,
    };
  });

  return {
    available: true,
    // ★ 过期报告不算"已测"：verdict 从 measured 降为 stale，页面须显示 stale 标记与重跑命令。
    verdict: st.stale ? "stale" : "measured",
    stale: st.stale === true,
    stale_reason: st.reason,
    stale_detail: { missing_batches: st.missing_batches || null, changed_batches: st.changed_batches || null },
    how_to_regenerate: st.stale ? "node demo/_parity_real.js" : null,
    generated_at: r.generated_at || null,
    input_fingerprint: r.input_fingerprint || null,
    headline: r.headline || "",
    layers,
    still_not_covered: r.still_not_covered || null,
    metrics_reference: r.metrics_reference || null,
  };
}

module.exports = { loadReport, badgeOf, LAYER_PHRASES, REPORT };