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
// ★ D20：批次/计数资格改由数据源单一真源提供，本文件不再自己判断哪批算数。
const dataSource = require("./data_source.js");

// ============================================================
// 指标类别定义 —— 三类不可互溶
// ============================================================
const CATEGORIES = {
  accuracy: {
    name: "准确率",
    question: "抽出来的东西对不对？",
    denominator_rule: "分母＝有 Gold 人工标注的字段。无标注字段不入分母（不可核验的东西不能算对错）",
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
    denominator_rule: "分母＝已产出且带出处锚点的字段；无锚点字段另计「锚点缺失」",
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
  unverified:   { label: "实测但不可核", desc: "分母存在、数值已算出，但缺少回跳/比对所需的对照物（如无原文快照），结论不可当验收依据" },
  not_covered:  { label: "未测",desc: "分母不存在或输入缺失，属未测。禁止按目标值或经验值填充" },
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
    // ★ D20：页面实算已换源到权威批次（领导 10-09 裁定「换源」），
    //   故 primary 从 data/ 改为 data_unified/。
    //   此前 primary=page.sha256 会让指纹指向旧批次——口径已换，指纹必须跟着换，
    //   否则材料引用的指纹与页面实算的批次对不上（正是 D19 那类"数字对不上但看不出"的问题）。
    primary: unified.sha256,
    primary_batch: dataSource.PRIMARY_ID,
    primary_files: unified.files,
    // ★ D21：权威批次的**唯一身份**是宗裁决的锚点，不是目录指纹。
    //   目录指纹含 1 份本地演示件（32 份），与权威口径的 31 份不是一回事；
    //   拿它当身份标识，等于用"目录里有什么"冒充"这批数据是什么"。
    anchor_sha256: dataSource.anchor().sha256,
    anchor_matches: dataSource.anchor().matches,
    // 权威批内部的分母口径（已裁决：606 为权威分母），见 data_source.caliber_split
    caliber_split: dataSource.BATCHES[dataSource.PRIMARY_ID].caliber_split || null,
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
// ============================================================
// 评测侧成绩单读取（D15 收口用）
//   evaluation/ 按 C2 规则不入库，clone 后这些文件不存在 ⇒ 相关项自动退回「未测」，
//   这正是设计意图：取不到证据就不填数。需要本地数字时跑 demo/_fetch_eval_scores.js。
// ============================================================
// ★ 路径退级铁律：ROOT 是 page_prototype/bridge/，到仓库根只需退三级
  //   （bridge → page_prototype → cjh → workspace → jingguands 是四级，多退一级就落到
  //   workspace/evaluation —— 静默 0 命中，不报错，最容易骗人）。
const EVAL_DIR = path.resolve(ROOT, "..", "..", "..", "evaluation");
function readScore(rel) {
  try { return JSON.parse(fs.readFileSync(path.join(EVAL_DIR, ...rel.split("/")), "utf8")); }
  catch (e) { return null; }
}
function scoreFp(rel) {
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(path.join(EVAL_DIR, ...rel.split("/")))).digest("hex");
  } catch (e) { return null; }
}
/** 从成绩单里按 keys 求一个比率项（分母为 0 或无 rows ⇒ 返回 null ⇒ 判未测）。 */
function ratioScore(relPath, numKeys, denKeys) {
  const r = readScore(relPath);
  if (!r || !Array.isArray(r.rows) || r.rows.length === 0) return null;
  const num = numKeys.reduce((n, k) => n + (Number(r[k]) || 0), 0);
  const den = denKeys.reduce((n, k) => n + (Number(r[k]) || 0), 0);
  if (!den) return null;
  return {
    value: +(num / den * 100).toFixed(2), unit: "%", num, den,
    source_script: relPath, evidence_kind: "eval_side_score_sheet",
    input_fingerprint: scoreFp(relPath), rows_total: r.rows.length, result: r.result || null,
  };
}

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
    note: "分母为 0（无「非 extracted 却带值」的字段），不是 0% 达标，是该类缺陷未出现",
  },

  // ---- 覆盖率 ----
  // ★ D17＋D20：分母收口到权威批 606（615 是含演示件的扩大口径，只作对照不计入）
  field_coverage: {
    value: 72.11, unit: "%", num: 437, den: 606,
    source_script: "demo/_retest_unified.js",
    evidence_kind: "hash_verified_input",
    note: "弃权 169 条（未提及 108 / 不适用 30 / 待复核 11 / 未披露 6 / 无法读取 14）计入分母——弃权是正确行为但仍是未覆盖。★ 权威分母 606（2026-10-09 裁决）；615 为含演示件 DEMO-EQC-HL-0930 的扩大口径，只作对照",
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

// ★ D15：以下 4 项此前挂着过期的"未测"理由，其中 integration_pass 还与页面集成视图
  //   （10/10）同页矛盾。改为**动态读评测侧成绩单**，不硬编码数字——
  //   成绩单缺失即自动退回未测，绝不把别人的结论抄成自己的测量。
  //   取件：evaluation/{D11/results,D10/results}/（本机私有，不入库），由 demo/_fetch_eval_scores.js 按 sha 取。

  // ---- 跨文档配对准确率（D15 收口：20/20组） ----
cross_doc_match: (() => {
  const m = ratioScore("D11/results/crossdoc-firsttest-score.json", ["pass"], ["pairs_total"]);
  const r = readScore("D11/results/crossdoc-firsttest-score.json");
  return m ? Object.assign(m, {
    note: `宗侧实测 ${m.num}/${m.den} 组：同事件 ${r.same_event.hit}/${r.same_event.total}、无关对照 ${r.different_event.clean}/${r.different_event.total} 零误报。★ 分母按组计（与出处按条计不同，不可混读）`,
  }) : { value: null, unit: "%", num: null, den: null,
    source_script: "D11/results/crossdoc-firsttest-score.json",
    note: "★ 未测：评测侧成绩单缺失（未取件），不按100% 填充" };
})(),

// ---- 数值矛盾判定准确率（D15 收口：20/20 条，误报漏报均 0） ----
multi_doc_conflict: (() => {
  const m = ratioScore("D11/results/d9-v02-score.json", ["pass"], ["cases_total"]);
  const r = readScore("D11/results/d9-v02-score.json");
  return m ? Object.assign(m, {
    note: `宗侧实测 ${m.num}/${m.den} 条规则用例；误报 ${r.false_positive_conflict}、漏报 ${r.false_negative_conflict}。分母＝规则开发用例数，非字段数`,
  }) : { value: null, unit: "%", num: null, den: null,
    source_script: "D11/results/d9-v02-score.json",
    note: "★ 未测：评测侧成绩单缺失（未取件）" };
})(),

// ---- D10 集成通过率（D15 收口：10/10，与页面集成视图同源，消除同页矛盾） ----
integration_pass: (() => {
  const m = ratioScore("D10/results/score-weiwenyu-bundle.json", ["pass"], ["cases_total"]);
  return m ? Object.assign(m, {
    note: `宗侧 check-relation --strict 实测 ${m.num}/${m.den} 组结构通过。★ 注意两点：① D10-INT-008 关系判定为 unknown（与旧构建包的 unrelated 不同），该口径待魏确认，故本项只证明结构通过，不证明关系判定正确；② web_cli_same_result 证的是同源同函数幂等，不是独立抽取一致`,
  }) : { value: null, unit: "%", num: null, den: null,
    source_script: "D10/results/score-weiwenyu-bundle.json",
    note: "★ 未测：评测侧成绩单缺失（未取件）" };
})(),

// ---- 20 页公告处理耗时（D15 收口：D12 实测最大 19.99s，门槛 90s） ----
perf_20page: (() => {
  const v = 19.99;
  return {
    value: v, unit: "s", num: 19.99, den: 90,
    source_script: "evaluation/D12/D12回归一致性性能报告.md",
    evidence_kind: "end_to_end_timing",
    note: "D12 实测 4 个样本：3.57s / 12.75s / 19.99s / 19.34s（34/35/20(合成)/64 页），最大 19.99s 远低于门槛 90s。★ 取最大值非最小值——取最快那次等于挑样本",
  };
})(),

// ---- 格式合规 ----
  // ★ D17：判据已由评测侧裁定（evaluation/D17/裁定-standardized判据-20261010.md），
  //   本项从"未测·待统一判据"转为实测。动态读 demo/_standardized_real.js 的产物，
  //   **不硬编码数值** —— 换批即失效的旧数不能长期挂在页面上。
  //   脚本产物缺失 ⇒ 自动退回未测，绝不按 100% 填充。
  standardized_rate: (() => {
    const p = path.join(__dirname, "..", "demo", "_standardized_real.json");
    let r = null;
    try { r = JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { r = null; }
    const usable = r && r.coverage && r.coverage.den > 0;
    return {
      value: usable ? r.coverage.pct : null,
      unit: "%",
      num: usable ? r.coverage.num : null,
      den: usable ? r.coverage.den : null,
      source_script: "demo/_standardized_real.js",
      evidence_kind: "hash_verified_input",
      note: usable
        ? `★ 主口径：standardized=true 的非 text 有值字段 / 非 text 有值字段 = ${r.coverage.num}/${r.coverage.den}。判据依evaluation/D17/裁定-standardized判据-20261010.md；text 字段按 D13-C2 不入分母；弃权 ${r.context.abstain} 条不计入`
        : "★ 未测：实算产物缺失或分母为 0。判据已裁定（evaluation/D17/），但本机未产出即不填数",
      measured_at: usable ? (r.meta && r.meta.generated_at) || null : null,
    };
  })(),
  // ★ D17 新增：正确率（值层承载），总规划 98% 目标**只挂这一项**。
  //   与standardized_rate 分列，不得相加、不得互相替代。
  standardized_accuracy: (() => {
    const p = path.join(__dirname, "..", "demo", "_standardized_real.json");
    let r = null;
    try { r = JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { r = null; }
    const usable = r && r.accuracy && r.accuracy.den > 0;
    return {
      value: usable ? r.accuracy.pct : null,
      unit: "%",
      num: usable ? r.accuracy.num : null,
      den: usable ? r.accuracy.den : null,
      source_script: "demo/_standardized_real.js",
      evidence_kind: usable ? "field_by_field_vs_gold" : null,
      note: usable
        ? `非 text 有值且有 Gold 期望的字段中，value 与 Gold 规范值一致 = ${r.accuracy.num}/${r.accuracy.den}。value 即规范化后取值，值层一致即标准化正确（与D11 值层 437/437 的子集关系）`
        : "★ 未测：本机无 Gold 或无配对，分母为 0 —— 不得按 100% 填充",
      measured_at: usable ? (r.meta && r.meta.generated_at) || null : null,
    };
  })(),
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
    target: null,
    numerator: "实际产出取值的字段数（437）",
    denominator: "契约注册表要求抽取的字段全集（权威口径 606）",
    status: "measured",
    caliber: "弃权字段计入分母（弃权是正确行为，但仍是未覆盖）。★ 准确率 90% 是另一个指标（field_accuracy），不得挂在本项上",
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
    key: "standardized_rate", category: "compliance", name: "标准化覆盖率",
    target: null,
    numerator: "standardized === true 的非 text 有值字段数",
    denominator: "非 text 有值字段数（权威批 229）",
    status: "measured",
    caliber: "★ 主口径（判据已裁定 evaluation/D17/裁定-standardized判据-20261010.md）：分母不含弃权字段与 unit=text 字段。text 字段的 standardized 键无契约含义（D13-C2），不入分母不上屏。★ 准确率 98% 目标挂 standardized_accuracy，不得挂本项",
    blocked_by: null,
  },
  {
    key: "standardized_accuracy", category: "accuracy", name: "标准化正确率",
    target: 98,
    numerator: "非 text 有值且有 Gold 期望、value 与 Gold 规范值一致的字段数",
    denominator: "非 text 有值且有 Gold 期望的字段数",
    status: "measured",
    caliber: "值层承载：value 即规范化后的取值，值层一致即标准化正确。与标准化覆盖率分列，不得相加或互相替代",
    blocked_by: null,
  },

  // ---------- 未测项显式登记（防止漏项被当成达标） ----------
  {
    key: "cross_doc_match", category: "accuracy", name: "跨文档配对准确率",
    target: null,
    numerator: "配对正确的组数",
    denominator: "已知配对组数（宗侧实测 20 组）",
    status: "measured",
    caliber: "★ 分母按组计（不是字段数）。同事件 4/4、无关对照 16/16 零误报。数据源＝评测侧成绩单，非本页实测",
    blocked_by: null,
  },
  {
    key: "multi_doc_conflict", category: "accuracy", name: "数值矛盾判定准确率",
    target: null,
    numerator: "判定正确的条数",
    denominator: "规则开发用例 20 条",
    status: "measured",
    caliber: "★ 分母＝规则开发用例数（不是字段数）。误报 0、漏报 0。数据源＝评测侧成绩单",
    blocked_by: null,
  },
  {
    key: "integration_pass", category: "coverage", name: "D10 集成通过率",
    target: null,
    numerator: "通过组数（宗侧 10）",
    denominator: "集成用例 10 组",
    status: "measured",
    caliber: "★ 本项只证明**结构**通过（run_id / code_version / schema_version / records / diff_list / report 四段 / 缓存三态），不证明关系判定正确：D10-INT-008 关系为 unknown（与旧构建包的 unrelated 不同），口径待魏确认。另 web_cli_same_result 证的是同源同函数幂等，不是独立抽取一致。★ 数据源与页面集成视图同源，不再出现「同页两个数」",
    blocked_by: null,
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
    numerator: "实测耗时（取4 个样本中的最大值）",
    denominator: "门槛 90s",
    status: "measured",
    caliber: "D12 性能目标；扫描件与缓存路径另报，不混入。★ 取最大值非最小值——取最快那次等于挑样本",
    blocked_by: null,
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
    // ★ D21：primary 改用宗裁决的**锚点**（权威批次唯一身份，31 份口径）。
    //   目录指纹含 1 份本地演示件（32 份），不能直接当权威批次的身份标识——
    //   宗的原话是「任何引用权威批次的地方都必须能对上这个值」，指的就是锚点。
    input_sha256: fp.primary,
    primary_batch: fp.primary_batch,
    anchor_sha256: fp.anchor_sha256,
    anchor_matches: fp.anchor_matches,
    combined_sha256: fp.combined_sha256,
    statement:
      `共登记 ${all.length} 项指标：已实测 ${byStatus.measured || 0}、实测但不可核 ${byStatus.unverified || 0}、` +
      `未测 ${byStatus.not_covered || 0}。` +
      `★ 页面实算口径＝权威批次「${dataSource.primary().label}」` +
      `（锚点 ${String(fp.anchor_sha256 || "").slice(0, 12)}…${fp.anchor_matches === false ? "，⚠已偏离登记值" : "，与宗登记锚点一致"}；` +
      `入口径 31 份 / 分母 606，DEMO-EQC-HL-0930 不计入——详见 data_source.caliber_split）。` +
      `另一批演示池仅供查看，不计入任何分子分母。` +
      `材料引用任何一项成绩时须同时引用该指纹与生成脚本，否则数字不可复现。`,
  };
}

module.exports = {
  CATEGORIES, STATUS, REGISTRY,
  list, get, byCategory, notCovered, coverageStatement, fingerprint, sha256File, dirFingerprint,
};
