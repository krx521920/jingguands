/**
 * metrics_registry.js —— 指标单一真源（D12 新标准）
 *
 * 为什么有这个文件：
 *   D11 之前，页面上过屏的数、出材料里写的数、脚本实算的数各有一套口径，
 *   同一个"抽取率"在三个地方是三个分母。这是"材料引用成绩"最容易被抓的地方——
 *   不是数错了，是同一个数在不同材料里对不上，且没人能说清哪个是真数。
 *
 * 新标准（三条硬规矩）：
 *   ① 准确率 / 覆盖率 / 出处命中率**分列**，各带自己的分子分母，永不合并成一个"综合分"。
 *   ② 每项指标带 `status`：measured（实测出数）/ unverified（有分母但无可核证据）/
 *      not_covered（分母都不存在，**未测**）。未测项不得按目标值或经验值填充。
 *   ③ 每项指标带 `provenance`：算出它的脚本 + 输入数据的指纹（SHA-256）。
 *      材料引用成绩时必须同时引用这两个字段，否则数字不可复现、不可追责。
 *
 * 用法（页面与脚本共用，勿各写一套）：
 *   const reg = require("./metrics_registry.js");
 *   reg.list()                // 全部指标（页面 /api/metrics 下发）
 *   reg.byCategory("accuracy")
 *   reg.get("field_accuracy") // 单项，含实测值
 *   reg.fingerprint()         // 输入数据指纹，写进材料脚注
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const UNIFIED_DIR = path.join(ROOT, "data_unified");

// ============================================================
// 指标类别定义 —— 三类不可互溶
// ============================================================
const CATEGORIES = {
  accuracy: {
    name: "准确率",
    question: "抽出来的东西对不对？",
    denominator_rule: "分母＝**有 Gold 人工标注**的字段。无标注字段不入分母（不可核验的东西不能算对错）",
    must_not_mix: "不可与覆盖率混用。抽不出来（覆盖率低）不等于抽错了（准确率低）",
  },
  coverage: {
    name: "覆盖率",
    question: "该抽的抽到了没有？",
    denominator_rule: "分母＝契约注册表要求抽取的字段全集（含未提及/不适用/未披露等弃权）",
    must_not_mix: "不可与准确率混用。弃权是正确行为，不是不合格",
  },
  evidence: {
    name: "出处命中率",
    question: "抽出来的值能不能回跳到原文？",
    denominator_rule: "分母＝**已产出且带出处锚点**的字段；无锚点字段另计「锚点缺失」",
    must_not_mix: "不可与「锚点存在率」混用。带 block_id ≠ 能回跳到原文（需blocks[].text）",
  },
  compliance: {
    name: "格式合规",
    question: "产出符不符合契约？",
    denominator_rule: "分母＝已标注 standardized 布尔值的字段；未标注不入分母",
    must_not_mix: "无目标值即不虚构。判定标准本身未统一前，此项不可上屏结论",
  },
};

const STATUS = {
  measured:     { label: "已实测",       desc: "分母存在、有可核证据、数值由脚本实算得出" },
  unverified:   { label: "实测但不可核", desc: "分母存在、数值已算出，但缺少回跳/比对所需的对照物（如无原文快照），**结论不可当验收依据**" },
  not_covered:  { label: "未测",desc: "分母不存在或输入缺失，**未测**。禁止按目标值或经验值填充" },
};

// ============================================================
// 输入数据指纹 —— 材料的成绩脚注必须带这个
// ============================================================
function sha256File(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

/** 数据集清单的稳定指纹：文件名排序后逐个取 sha256，再对清单整体取一次 sha256。
 *  ★ 不用 mtime —— 复制/检出不改 mtime，但内容可能变；只用内容。 */
function dirFingerprint(dir) {
  if (!fs.existsSync(dir)) return { dir: path.basename(dir), exists: false, files: 0, sha256: null };
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort();
  const lines = files.map(f => `${f}:${sha256File(path.join(dir, f))}`);
  const sha256 = crypto.createHash("sha256").update(lines.join("\n")).digest("hex");
  return {
    dir: path.basename(dir),
    exists: true,
    files: files.length,
    sha256,
    per_file: Object.fromEntries(lines.map(l => { const i = l.indexOf(":"); return [l.slice(0, i), l.slice(i + 1).slice(0, 12)]; })),
  };
}

function fingerprint() {
  const page = dirFingerprint(DATA_DIR);
  const unified = dirFingerprint(UNIFIED_DIR);
  return {
    generated_at: new Date().toISOString(),
    inputs: { page_data: page, unified_batch: unified },
    // 页面实算用的就是 page_data；材料若引用统一批成绩，必须写 unified 的 sha
    primary: page.sha256,
    combined_sha256: crypto.createHash("sha256")
      .update(`${page.sha256}|${unified.sha256}`).digest("hex"),
  };
}

// ============================================================
// 实测值的注入点
//   注册表只管「口径与状态」，数值由 metrics.js / 实测脚本算完后回填。
//   这样做的原因：口径（怎么算）与数值（算出来多少）必须能各自独立审计，
//   混在一起就会出现「改数不改口径」或反之，且无从发现。
// ============================================================
const MEASURED = {
  // ---- 准确率 ----
  field_accuracy: {
    value: 100, unit: "%", num: 437, den: 437,
    source_script: "demo/_retest_unified.js",
    evidence_kind: "field_by_field_vs_gold",
    note: "按 source.file_id 配对文件 + 业务键配对事件，逐字段与 Gold 比对；撞键 0/48",
  },
  wrong_fill_rate: {
    value: 0, unit: "%", num: 0, den: 0,
    source_script: "demo/_retest_unified.js",
    evidence_kind: "field_by_field_vs_gold",
    note: "分母为 0（无「非 extracted 却带值」的字段），**不是** 0% 达标，是该类缺陷未出现",
  },

  // ---- 覆盖率 ----
  field_coverage: {
    value: 72.52, unit: "%", num: 446, den: 615,
    source_script: "demo/_retest_unified.js",
    evidence_kind: "hash_verified_input",
    note: "弃权 169 条（未提及 108 / 不适用 30 / 待复核 11 / 未披露 6 / 无法读取 14）计入分母——弃权是正确行为但仍是未覆盖",
  },
  abstain_correct: {
    value: null, unit: "%", num: null, den: null,
    source_script: "demo/_retest_unified.js",
    evidence_kind: "field_by_field_vs_gold",
    note: "弃权是否「正确」需 Gold 逐条标注是否提及，Gold 未标注该维度 ⇒ 不可核",
  },

  // ---- 出处命中率 ----
  //★ 动态读实测结果，不硬编码：快照撤走或脚本没跑时自动退回「未测」，
  //   绝不在页面上留一个无来源的100%（换批即失效的反面：不能让旧数长期挂着）。
  evidence_hit: (() => {
    const p = path.join(__dirname, "..", "demo", "_evidence_quote_real.json");
    let r = null;
    try { r = JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { r = null; }
    const usable = r && r.hit_rate_pct != null && r.block_id_resolved > 0;
    return {
      value: usable ? r.hit_rate_pct : null,
      unit: "%",
      num: usable ? r.quote_hit : null,
      den: usable ? r.block_id_resolved : null,
      source_script: "demo/_evidence_quote_real.js",
      evidence_kind: "quote_in_block_text",
      note: usable
        ? `实测 quote ∈ block.text 命中 ${r.quote_hit}/${r.block_id_resolved}；快照 ${r.snapshot_count} 份（${r.snapshot_blocks} blocks）｜★ 可核子集 ${r.prov_verifiable}/${r.prov_total} 条、覆盖 ${r.docs_covered} 份文档，其余 ${r.prov_unverifiable} 条未核不计入分母`
        : "★ 未测：快照缺失或实测脚本未跑。判据为「quote ∈ block.text」，不退化为整篇全文包含",
      measured_at: usable ? (r.generated_at || null) : null,
      snapshot_source: usable ? r.snapshot_source : null,
    };
  })(),
  anchor_presence: {
    value: 100, unit: "%", num: 460, den: 460,
    source_script: "demo/_retest_unified.js",
    evidence_kind: "hash_verified_input",
    note: "block_id / page / quote 三项均 100%。★ 这是「有出处」不是「出处对得上原文」",
  },
  anchor_table_ref: {
    value: 51.09, unit: "%", num: 235, den: 460,
    source_script: "demo/_retest_unified.js",
    evidence_kind: "hash_verified_input",
    note: "table_id / cell_ref 同为 51.09%，表类字段无法定位到具体单元格——当前唯一明显短板",
  },
  block_region_selfconsistency: {
    value: 100, unit: "%", num: 353, den: 353,
    source_script: "demo/_pairdiff3.js",
    evidence_kind: "field_by_field",
    note: "353 个 block_id 在全量内 region 唯一，0 冲突（映射自洽性，非正确性）",
  },

  // ---- 格式合规 ----
  standardized_rate: {
    value: 99.1, unit: "%", num: 442, den: 446,
    source_script: "demo/_retest_unified.js",
    evidence_kind: "hash_verified_input",
    note: "★ 判定标准与首测（364/521）不一致，两数不可比。需先统一判据再上屏",
  },
};

// ============================================================
// 指标登记表 —— 单一真源。页面 /api/metrics、/api/parity 面板、
// docs 材料表格全部读这里，任何人不得另立一份。
// ============================================================
const REGISTRY = [
  // ---------- 准确率 ----------
  {
    key: "field_accuracy", category: "accuracy", name: "字段抽取准确率",
    target: null,
    numerator: "与 Gold 标注值一致的字段数",
    denominator: "有 Gold 人工标注的字段数（437）",
    status: "measured",
    caliber: "严格逐字段比对；与穷举最优匹配结果均 100%，撞键 0/48",
    blocked_by: null,
  },
  {
    key: "wrong_fill_rate", category: "accuracy", name: "错误填充率",
    target: null,
    numerator: "status 非 extracted 却携带取值的字段数",
    denominator: "全部已判定状态字段（437）",
    status: "measured",
    caliber: "口径纪律：分母为 0 时显示「未出现该类缺陷」而非 0%",
    blocked_by: null,
  },

  // ---------- 覆盖率 ----------
  {
    key: "field_coverage", category: "coverage", name: "字段抽取覆盖率",
    target: 90,
    numerator: "实际产出取值的字段数（446）",
    denominator: "契约注册表要求抽取的字段全集（615）",
    status: "measured",
    caliber: "弃权字段计入分母（弃权是正确行为，但仍是未覆盖）",
    blocked_by: null,
  },
  {
    key: "abstain_correct", category: "coverage", name: "弃权正确率",
    target: null,
    numerator: "Gold 标注为「确实未提及/不适用」的弃权字段数",
    denominator: "全部弃权字段数（169）",
    status: "not_covered",
    caliber: "需 Gold 逐条标注「原文是否提及」，现有 Gold 无此维度",
    blocked_by: "宗博文（评测侧补 Gold 维度）",
  },

  // ---------- 出处命中率 ----------
  {
    key: "evidence_hit", category: "evidence", name: "出处原文命中率",
    target: 95,
    numerator: "quote 能在原始解析 block 文本中定位到的字段数（241）",
    denominator: "★ 可核子集 241 条 —— 所在 10 份文档有原文快照；不是全量 863 条 provenance",
    value: 100,
    status: "measured",
    caliber: "强判据：必须 quote 落在 block.text 内才算命中。退化为「整篇全文包含」只记 weak，不计入分子",
    evidence_kind: "quote_in_block_text",
    evidence_ref: "demo/_evidence_quote_real.js（读魏分支 evaluation/D9/parses-blocks/ 10 份 D6 快照，432 blocks）",
    blocked_by: "★ 覆盖仅 10/41 份文档、241/863 条 provenance；全量仍不可核 —— 快照由魏文宇交付，未覆盖文档需补",
    note: "2026-10-08 更正：10-07 记为「未测·无原文快照」是错的——快照在魏分支 evaluation/D9/parses-blocks/，不在我的检索路径内。实测 241/241 = 100%，与宗侧「30 通过 0 反例」互证（分母口径不同：宗按文档侧计，我按 provenance 条数计）",
  },
  {
    key: "anchor_presence", category: "evidence", name: "锚点存在率（block_id/page/quote）",
    target: null,
    numerator: "带 block_id + page + quote 的字段数（460）",
    denominator: "已产出字段数（460）",
    status: "measured",
    caliber: "★ 这是「有出处」不是「出处对得上」，与命中率严格分开",
    blocked_by: null,
  },
  {
    key: "anchor_table_ref", category: "evidence", name: "表类锚点完备率（table_id/cell_ref）",
    target: null,
    numerator: "带 table_id + cell_ref 的字段数（235）",
    denominator: "已产出字段数（460）",
    status: "measured",
    caliber: "无框表解析时丢失列语义，当前能力边界",
    blocked_by: "张智博（无框表补 table_id/列语义）",
  },
  {
    key: "block_region_selfconsistency", category: "evidence", name: "block→region 映射自洽率",
    target: null,
    numerator: "region 唯一的 block_id 数（353）",
    denominator: "全部出现的 block_id 数（353）",
    status: "measured",
    caliber: "只验映射唯一性，不验是否指向正确 block",
    blocked_by: null,
  },

  // ---------- 格式合规 ----------
  {
    key: "standardized_rate", category: "compliance", name: "标准化率",
    target: 98,
    numerator: "standardized === true 的字段数（442）",
    denominator: "standardized 已标注 true/false 的字段数（446）",
    status: "measured",
    caliber: "★ 判定标准未统一，与首测数不可比。**上屏须带此警告**",
    blocked_by: "宗博文（统一 standardized 判据）",
  },

  // ---------- 未测项显式登记（防止漏项被当成达标） ----------
  {
    key: "cross_doc_match", category: "accuracy", name: "跨文档配对准确率",
    target: null,
    numerator: "配对正确的组数",
    denominator: "已知配对组数（宗侧 20 组 / D8 13 组）",
    status: "not_covered",
    caliber: "宗侧成绩未产出，无数据可算",
    blocked_by: "宗博文（D12～D13 出数）",
  },
  {
    key: "multi_doc_conflict", category: "accuracy", name: "数值矛盾判定准确率",
    target: null,
    numerator: "判定正确的条数",
    denominator: "规则开发用例 20 条",
    status: "not_covered",
    caliber: "D9 20 条规则用例未跑",
    blocked_by: "宗博文（D12～D13 出数）",
  },
  {
    key: "integration_pass", category: "coverage", name: "D10 集成通过率",
    target: null,
    numerator: "通过组数（当前 0/10）",
    denominator: "集成用例 10 组",
    status: "not_covered",
    caliber: "缺 run_id 与缓存三件证据；且 web_cli_same_result 判据本身须改名",
    blocked_by: "宗博文（判据）＋ 魏文宇（抽取入口/原始 PDF）",
  },
  {
    key: "scan_degrade", category: "coverage", name: "扫描件降级明确率",
    target: null,
    numerator: "明确标注降级原因的扫描件份数",
    denominator: "扫描件总份数",
    status: "not_covered",
    caliber: "扫描样例可失败，但必须明确降级并单独统计——当前无独立分母",
    blocked_by: "宗博文（建立扫描件分母）",
  },
  {
    key: "perf_20page", category: "coverage", name: "20 页公告处理耗时",
    target: 90, unit: "s",
    numerator: "实测耗时",
    denominator: "3 份 20 页文本公告",
    status: "not_covered",
    caliber: "D12 性能目标；扫描件与缓存路径另报，不混入",
    blocked_by: "待D12 实测",
  },
];

// ============================================================
// 组装
// ============================================================
function list() {
  const fp = fingerprint();
  return REGISTRY.map(r => {
    const m = MEASURED[r.key] || {};
    const value = m.value !== undefined ? m.value : null;
    return {
      ...r,
      unit: r.unit || m.unit || (r.key === "perf_20page" ? "s" : "%"),
      value,
      num: m.num === undefined ? null : m.num,
      den: m.den === undefined ? null : m.den,
      status: value === null && r.status === "measured" ? "not_covered" : r.status,
      status_label: (STATUS[(value === null && r.status === "measured" ? "not_covered" : r.status)] || {}).label,
      evidence_kind: m.evidence_kind || null,
      evidence_note: m.note || null,
      source_script: m.source_script || null,
      // ★ 每项指标自带数据指纹 —— 材料引用时连同指纹一起引，否则不可复现
      input_fingerprint: m.source_script === "demo/_retest_unified.js"
        ? { unified_batch_sha256: fp.inputs.unified_batch.sha256, unified_files: fp.inputs.unified_batch.files }
        : null,
      // 达标与否：有目标值且实测时才判；未测项一律 not_covered，不允许出现 pass
      meets_target: (r.target != null && value != null) ? value >= r.target : null,
    };
  });
}

function get(key) { return list().find(r => r.key === key) || null; }
function byCategory(cat) { return list().filter(r => r.category === cat); }

/** 未测项清单 —— 单独给领导看，避免「未测」在表格里被当成「达标」 */
function notCovered() { return list().filter(r => r.status === "not_covered"); }

/** 覆盖情况自述：材料脚注直接引用这段，不允许手写「已全部通过」 */
function coverageStatement() {
  const all = list();
  const byStatus = {};
  all.forEach(r => { byStatus[r.status] = (byStatus[r.status] || 0) + 1; });
  const fp = fingerprint();
  return {
    total: all.length,
    measured: byStatus.measured || 0,
    unverified: byStatus.unverified || 0,
    not_covered: byStatus.not_covered || 0,
    by_status: byStatus,
    input_sha256: fp.primary,
    combined_sha256: fp.combined_sha256,
    statement:
      `共登记 ${all.length} 项指标：已实测 ${byStatus.measured || 0}、实测但不可核 ${byStatus.unverified || 0}、` +
      `**未测 ${byStatus.not_covered || 0}**。输入数据指纹 page_data=${String(fp.primary).slice(0, 12)}… / ` +
      `unified=${String(fp.inputs.unified_batch.sha256).slice(0, 12)}…（${fp.inputs.unified_batch.files} 份）。` +
      `材料引用任何一项成绩时须同时引用该指纹与生成脚本，否则数字不可复现。`,
  };
}

module.exports = {
  CATEGORIES, STATUS, REGISTRY,
  list, get, byCategory, notCovered, coverageStatement, fingerprint, sha256File, dirFingerprint,
};
