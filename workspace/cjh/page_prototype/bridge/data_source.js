/**
 * data_source.js —— 页面数据源单一真源（D20，取代D19 的"两套数据源并存"）
 *
 * 背景（D19 查出的结构性问题）：
 *   `data/`（30 份 09-28~10-02 旧抽取）与 `data_unified/`（32 份 10-04~10-07权威冻结批次）
 *   **文件名零重叠**，而页面的数据集下拉与 `/api/metrics` 只读 `data/`——
 *   于是页面上的 548 字段 / 71.53% 与材料里的 615 字段 / 72.52% 出自不同样本，
 *   却常被并列引用。两者本身都不是假数，但读者无法从页面上分辨。
 *
 * 领导 10-09 裁定（三条）：
 *   ① **换源**——页面的权威口径指标改跑 `data_unified/`；
 *   ② `data/wei_real_pledge_0197`、`wei_real_pledge_ce37` **保留 + 标注**（P0-01 唯一物证，删证据是反造假铁律的反面）；
 *   ③ **页面质量报告可以暴露信息源**（领导原话"可以暴露信息源"）——
 *      即页面要明说每个数字跑在哪批数据上，`/api/metrics` 带数据源段与指纹。
 *
 * ★ 本文件只做「有哪些数据集、各自属于哪批、各批什么性质」的登记，
 *   **不做任何指标计算**。指标仍由 metrics.js 实算，这里只提供口径真源与解析。
 *   绝不在此硬编码任何指标值（动态真源铁律）。
 *
 * 用法：
 *   const ds = require("./data_source.js");
 *   ds.BATCHES                     // 两批的定义（供页面上屏）
 *   ds.list()                      // 全部数据集 + 批次 + 标注
 *   ds.names()                     // 纯名字数组（向后兼容）
 *   ds.resolve(name)               // {name, batch, dir, file, role, label, note}
 *   ds.rolesInBatch(batch)         // 该批参与口径统计的 role 白名单
 *   ds.primary()                   // 权威口径批（metrics 默认只跑它）
 *   ds.compare()                   // 两批实算对照（metrics 附加段，不参与主口径）
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
// ★ D25 步骤5：条目级契约状态。**走转接口拿contract_validation，不自己重判**——
//   上传闸门、datasets 清单、/api/contract 三处必须是同一个结论，
//   两处各判一次迟早漂移（那是"同一指标两处对不上"的同款漏洞）。
//   经toContract 而非直调校验器：旧版 v0.1 件要经 fromLegacyEnvelope 兼容后才谈得上合规，
//   直调会把"兼容后 0 违规"的旧件误报成违规。
const { toContract } = require("./upstream_bridge.js");

const ROOT = path.resolve(__dirname, "..");

// ============================================================
// 批次定义
// ============================================================
// primary=true 的批次是**权威口径批次**：页面指标只跑它。
// 另一批是对照批次（演示件 + 旧抽取），仍可在下拉里选中查看，
// 但**绝不混入权威口径的分子分母**——混了就等于把两个样本的数除到一起。
const BATCHES = {
  authoritative: {
    id: "authoritative",
    dir: "data_unified",
    primary: true,
    name: "权威冻结批次",
    label: "权威批次（D11 首测冻结）",
    owner: "魏文宇（抽取）／宗博文（Gold 评测）",
    date_range: "2026-10-04 ~ 2026-10-07",
    roles: ["frozen"],
    desc:
      "★ 页面上屏指标只跑这一批。与魏分支 evaluation/D11/firsttest-envelopes/ 逐字节一致" +
      "（guard `_data_source_check.js --wei <sha>` 可复验）。",
    // ★ 分母口径已由宗博文 2026-10-09 裁决（`zongbowen@74f9505b`
    //   evaluation/integration/指标单一真源裁决-20261009.md + 权威批次锚点.json），
    //   D20 时这里还是"待领导裁定"，现已定案：
    //   **权威批次 = 31 份（30 核心 + 1 扫描降级），DEMO-EQC-HL-0930 不计入。**
    //   锚点算法与值见下方 ANCHOR，实算已验证 31/31 逐份一致。
    //   ⇒ 权威口径分母是 **606 字段**；材料里的 615 实际含了那份本地演示件，
    //     按裁决应表述为 606（含 DEMO 的 615 是扩大口径，不作权威数引用）。
    caliber_split: {
      resolved: true,
      resolved_by: "宗博文（评测侧）2026-10-09 指标单一真源裁决",
      resolved_at: "zongbowen@74f9505b",
      frozen_files: 31,
      local_demo_files: 1,
      local_demo_names: ["DEMO-EQC-HL-0930"],
      fields_frozen_only: 606,
      fields_incl_demo: 615,
      extracted_frozen_only: 437,
      extracted_incl_demo: 446,
      coverage_frozen_only_pct: 72.11,
      coverage_incl_demo_pct: 72.52,
      authoritative_denominator: 606,
      note:
        "权威分母＝606 字段 / 31 份（已裁决）。" +
        "材料旧文里的 615 是把本地演示件 DEMO-EQC-HL-0930 的 9 个字段算进去的结果，" +
        "按裁决该件不计入权威批次，引用 615 时必须写成「含演示件的扩大口径」而非权威分母。" +
        "本页面默认展示与计算一律用 606 口径；615 仅在此处留档说明差异来源。",
      owner: "宗博文（已裁决，如需变更须走裁决登记）",
    },
  },
  legacy: {
    id: "legacy",
    dir: "data",
    primary: false,
    name: "演示与旧抽取池",
    label: "演示/旧抽取池",
    owner: "陈家浩（页面侧演示件）",
    date_range: "2026-09-27 ~ 2026-10-02",
    roles: ["demo", "legacy_extract", "p001_witness"],
    desc:
      "本批不参与页面上屏指标计算，保留原因有三：① mock /旧版 v0.1 /不可兼容事件类型" +
      "（guarantee）需要页面来演示「契约违规怎么显示」；② 旧抽取是 P0-01（漏抽质权人事件）的物证；" +
      "③ 上传功能落在此目录。",
  },
};

const PRIMARY_ID = "authoritative";

// ============================================================
// ★ 权威批次锚点（宗博文 2026-10-09 裁决给的唯一定义，R2 的依据）
// ============================================================
// 来源：zongbowen@74f9505b
//   evaluation/integration/权威批次锚点.json
//   evaluation/integration/指标单一真源裁决-20261009.md
//
// 宗原文：「任何引用"权威批次"的地方都必须能对上这个值。」
// ⇒ 本地必须能**自己算出**同一个值，而不是抄他的数字。抄数字＝无法发现漂移。
const ANCHOR = {
  // 宗登记的权威锚点值
  expected_sha256: "381c760fa07b2dc3a8256282e23009bce4b79445fdc7f4f4280168af6c90cef0",
  docs: 31,
  // 明确不计入的演示补料（宗为补 D10 集成用例自己加的）
  excluded_demo: ["DEMO-EQC-HL-0930.json"],
  // 算法（宗原文）：31 个 json 按文件名升序，逐份 sha256，
  //   拼成 "文件名:哈希" 行、以 \n 连接，再取 sha256。
  algorithm:
    "按文件名升序排列该批 json → 逐份 sha256 → 拼成「文件名:哈希」行 → 以 \\n 连接 → 整体再取 sha256",
  owner: "宗博文（评测侧）",
  source_ref: "zongbowen@74f9505b:evaluation/integration/权威批次锚点.json",
};

/**
 * 实算权威批次锚点（不是抄宗的值，是按他的算法自己算一遍）。
 * @returns {{sha256:string|null, docs:number, expected:string, matches:boolean|null,
 *            excluded:string[], drift:boolean, note:string}}
 */
function anchor() {
  const b = BATCHES[PRIMARY_ID];
  const dir = path.join(ROOT, b.dir);
  const allFiles = listFilesIn(b.dir);
  const kept = allFiles.filter(f => !ANCHOR.excluded_demo.includes(f));
  const excludedPresent = allFiles.filter(f => ANCHOR.excluded_demo.includes(f));

  if (!kept.length) {
    return {
      sha256: null, docs: 0, expected: ANCHOR.expected_sha256, matches: null,
      excluded: excludedPresent, drift: false,
      note: `目录 ${b.dir}/ 不存在或为空，无法计算锚点`,
    };
  }
  const lines = kept.map(f => `${f}:${sha256File(path.join(dir, f))}`);
  const got = crypto.createHash("sha256").update(lines.join("\n")).digest("hex");
  const matches = got === ANCHOR.expected_sha256;

  return {
    sha256: got,
    docs: kept.length,
    expected: ANCHOR.expected_sha256,
    // 份数与哈希都要对上：只对哈希不看份数，可能因少算一份而哈希碰巧不同却被忽略
    docs_match: kept.length === ANCHOR.docs,
    matches,
    excluded: excludedPresent,
    // drift = 本地批次已偏离宗登记的冻结状态。这是**必须让人看见**的信号，
    // 不是可以自动修的东西——偏离了要查是谁改的、要不要重新冻结。
    drift: !matches,
    algorithm: ANCHOR.algorithm,
    owner: ANCHOR.owner,
    source_ref: ANCHOR.source_ref,
    note: matches
      ? `本地 ${b.dir}/（排除 ${excludedPresent.join("、") || "无"} 后共 ${kept.length} 份）实算锚点与宗登记值一致。`
      : `★ 本地锚点与宗登记值不一致（本地 ${got.slice(0, 12)}… vs 登记 ${ANCHOR.expected_sha256.slice(0, 12)}…）。` +
        `批次已偏离冻结状态，须查明改动来源后重新走裁决登记，不得就地改锚点。`,
  };
}

// ============================================================
// role 判定：不靠文件名硬猜，逐条显式登记（新增数据集必须在此登记，否则显式落unknown）
// ============================================================

/** 权威批次的 role。 */
function roleInAuthoritative(name, json) {
  // ★ 唯一不进权威口径的判据 = DEMO- 前缀。
  //   曾把 `pledge-scan-degrade` 也判成 demo，那是错的——它确实在魏分支
  //   evaluation/D11/firsttest-envelopes/ 里（已 git ls-tree 核对，31 份之一），
  //   判错会让分母少 14 个字段。判据必须与魏的实际清单一致，不能凭名字像不像。
  if (name.startsWith("DEMO-")) return "demo";
  return "frozen";
}

/** 演示池的 role：显式表优先，其余按信封自认属性判定。 */
const LEGACY_ROLE_TABLE = {
  // ---- 契约/兼容性演示件（页面要能演示"不合规怎么显示"）----
  "bank_guarantee": "demo",              // guarantee 事件类型不在 v0.3 三类内，演示 notes 告知
  "pledge": "demo",                      // v0.1 旧版信封，由 fromLegacyEnvelope() 兼容
  "wei_multi_event_test": "demo",        // mock 样本（D16 已脱钩为独立测试件）
  "wei_run_pledge": "demo",              // 上游链路跑批产物
  "wei_real_D4_scan": "demo",            // 扫描件降级演示
  // ---- P0-01 物证：同一 sha256，1 事件 vs 3 事件，漏抽 2 个质权人整条事件 ----
  "wei_real_pledge_0197": "p001_witness",
  "wei_real_pledge_ce37": "p001_witness",
};

function roleInLegacy(name, json) {
  if (LEGACY_ROLE_TABLE[name]) return LEGACY_ROLE_TABLE[name];
  const isMock = json && ((json.run_meta && json.run_meta.is_mock === true) || json.is_mock === true);
  if (isMock) return "demo";
  if (/^wei_real_/.test(name)) return "legacy_extract";
  return "unknown";     // 未登记：页面会显式标"未登记 role"，不静默归类
}

const ROLE_LABEL = {
  frozen: "冻结批次",
  demo: "演示件",
  legacy_extract: "旧抽取",
  p001_witness: "P0-01 物证",
  unknown: "未登记",
};

/** 演示件/mock 样本：绝不参与真实抽取一致性对照（与 extractor.mockDatasetSet 同判据）。 */
function isMockEnvelope(json) {
  if (!json) return false;
  return Boolean((json.run_meta && json.run_meta.is_mock !== undefined) ? json.run_meta.is_mock : json.is_mock === true);
}

// ============================================================
// P0-01 标注（领导 10-09 裁定②：保留 + 标注）
// ============================================================
const P001_NOTE =
  "P0-01 物证：本文件与权威批次 D4-PLD-001 的 file_sha256 完全相同（44e95085…），" +
  "是同一份 pledge.pdf 的两次抽取。旧抽取仅 1 个事件，权威批次 3 个 —— 漏抽 2 个质权人整条事件。" +
  "质权人字段值相同 ⇒ 不是识别错，是事件拆分粒度问题。★ 本文件是该缺陷的唯一物证，不得删除。";

/** 逐个数据集的补充标注（页面下拉与结果页据此显示提示）。 */
const DATASET_NOTE = {
  "wei_real_pledge_0197": P001_NOTE,
  "wei_real_pledge_ce37": P001_NOTE,
  "D4-PLD-001":
    "P0-01 对照侧：本文件是权威批次的正确形态（3 事件 / 3 个质权人）。" +
    "与演示池 wei_real_pledge_0197 / wei_real_pledge_ce37 同sha256，可并排对照。",
  "bank_guarantee":
    "不可兼容事件类型演示：events[].event_type=guarantee 不在 v0.3 的三类之内" +
    "（pledge/equity_change/award_contract）。转接口不硬塞成 pledge，而是在 view.bridge.notes 逐条告知。",
  "pledge": "v0.1 旧版信封：由 bridge/upstream_bridge.js 的 fromLegacyEnvelope() 兼容（19 违规→0），用于演示旧版数据的显示。",
  "wei_multi_event_test": "mock 测试样本（D16 已脱钩为独立测试件），自认 is_mock=true ⇒ 不参与真实抽取一致性对照。",
  "wei_real_D4_scan": "扫描件降级演示件：用于展示扫描质量不足时的降级标注路径。",
  "DEMO-EQC-HL-0930": "本地演示件，不在魏的 D11 冻结批次内（守卫已显式区分，权威份数统计不计入它）。",
  "pledge-scan-degrade": "魏 D11 冻结批次 31 份之一（已 git ls-tree 核对），扫描件降级用例，用于 D13 scan_degrade 建立独立分母。",
};

// ============================================================
// 枚举与解析
// ============================================================

/** 单个目录下可作为「数据集」的信封文件（排除 sidecar 与 upstream_case）。 */
function listFilesIn(dirName) {
  const dir = path.join(ROOT, dirName);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(f => f.endsWith(".json") && !f.endsWith(".check.json") && f !== "upstream_case.json")
    .sort();
}

/**
 * ★ D25 步骤5：单个信封的契约状态（宗审计 P1-2）。
 *
 * 背景：上传闸门原先只查「有没有 events 数组」，于是
 *   `{"schema_version":"0.3","events":[]}` 这种空壳件判ok:true 并落盘，
 *   而同一份数据在 `/api/contract` 的机检是 ok:false（缺 run_id/is_mock/source/run_meta）
 *   —— **同一个东西两处结论相反**，页面与入库各信一处，合规率就成了假数字。
 *
 * 这里刻意**只做如实上报，不静默修好**：
 *   -旧版 v0.1 件经 fromLegacyEnvelope 兼容后合规 ⇒ 报 ok，不误报；
 *   - `bank_guarantee` 的 guarantee 事件类型不在 v0.3 三类内 ⇒ 报 fail 并带上原因，
 *     **不硬塞成 pledge**（硬塞会让合规率变假）。
 */
function contractStatusOf(json) {
  if (!json) return { checked: false, ok: null, error_count: 0, errors: [], reason: "文件不可读/JSON 损坏" };
  let bridged;
  try {
    bridged = toContract(json);
  } catch (e) {
    return { checked: true, ok: false, error_count: 1, errors: ["转接口失败：" + String(e.message || e).slice(0, 160)], reason: "转接口失败" };
  }
  const cv = (bridged && bridged.contract_validation) || {};
  return {
    checked: true,
    ok: cv.ok === true,
    error_count: cv.error_count || 0,
    errors: (cv.errors || []).slice(0, 5),
    //★ 旧版数据不算"违规"（D1 骨架期 v0.1/v0.2 本来就不合 v0.3），
    //   混进违规会淹没真正的新错误 —— 与 contract_validate 的 is_stale_version 同义。
    schema_version: cv.schema_version || null,
    is_stale_version: !!cv.is_stale_version,
  };
}

function readJsonSafe(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return null; }
}

/** 列出某批的条目；读文件只为判 role，不做任何指标计算。 */
function entriesOf(batchId) {
  const b = BATCHES[batchId];
  if (!b) return [];
  return listFilesIn(b.dir).map(f => {
    const name = path.basename(f, ".json");
    const file = path.join(ROOT, b.dir, f);
    const json = readJsonSafe(file);
    const role = batchId === PRIMARY_ID ? roleInAuthoritative(name, json) : roleInLegacy(name, json);
    return {
      name,
      batch: batchId,
      batch_label: b.label,
      dir: b.dir,
      file,
      rel_path: `${b.dir}/${f}`,
      role,
      role_label: ROLE_LABEL[role] || role,
      counts_for_primary: batchId === PRIMARY_ID && b.roles.includes(role),
      is_mock: isMockEnvelope(json),
      schema_version: (json && json.schema_version) || null,
      event_count: (json && Array.isArray(json.events)) ? json.events.length : null,
      file_sha256: (json && json.source && json.source.file_sha256) || null,
      note: DATASET_NOTE[name] || null,
      readable: json !== null,
      // ★ D25 步骤5：契约状态随条目走，下拉与清单都能读到"这份数据合不合契约"。
      //   只报不修（不合规的件照样列出来，只是不被说成合规）。
      contract: contractStatusOf(json),
    };
  });
}

let _cache = null;
/** 全部条目（带缓存：文件集不变时同一进程内只扫一次；新增上传后调 resetCache()）。 */
function all() {
  if (_cache) return _cache;
  const out = [];
  for (const id of Object.keys(BATCHES)) out.push(...entriesOf(id));
  _cache = annotateVariants(out);
  return _cache;
}

function resetCache() { _cache = null; }

/**
 * 把同源变体标记回写到每个条目上（R4）。
 * 单独一步而不是在 entriesOf 里就地算——因为"哪些文件同源"要看**两批合起来**，
 * 在单批内算只能看到半个关系（P0-01 那组正是跨批的）。
 */
function annotateVariants(list) {
  const bySha = new Map();
  for (const e of list) {
    if (!e.file_sha256) continue;
    if (!bySha.has(e.file_sha256)) bySha.set(e.file_sha256, []);
    bySha.get(e.file_sha256).push(e);
  }
  for (const [sha, es] of bySha) {
    if (es.length < 2) continue;
    const evs = es.map(e => e.event_count);
    const mismatch = new Set(evs.map(String)).size > 1;
    for (const e of es) {
      e.variant_group = {
        file_sha256: sha,
        sha_short: sha.slice(0, 12),
        // 同组全部成员（含自己），前端据此显示"同源变体·共N 份"
        members: es.map(x => ({ name: x.name, batch: x.batch, batch_label: x.batch_label, event_count: x.event_count })),
        size: es.length,
        cross_batch: new Set(es.map(x => x.batch)).size > 1,
        event_count_mismatch: mismatch,
        event_counts: evs,
        known_issue: es.some(x => x.role === "p001_witness") ? "P0-01" : null,
      };
      // 一行短标签，直接贴到下拉选项上
      e.variant_label =
        `同源变体·${es.length}份·${mismatch ? "事件数 " + evs.join("/") + " 不一致" : "事件数一致"}`;
    }
  }
  return list;
}

/** 数据集名 → 完整解析信息。权威批次优先（换源后权威才是主源）。
 *
 * ★ D25 步骤6-②：名字**大小写不敏感**。
 *   原实现用 `e.name === name` 精确匹配，于是 `d4-pld-001` 查不到 `D4-PLD-001`，
 *   只回一句"本地无此信封" —— 调用方（材料复核脚本/评委手敲 URL）无法判断是打错还是不存在。
 *   现在：精确优先 → 大小写不敏感命中（返回**真实原名**并在 meta 里标明是归一化命中）
 *   →全不中则给**候选提示**（大小写/前缀/子串相近的前若干个）。
 *
 *   ★ 只在**读取**侧归一化，不去改磁盘上的文件名 —— 数据归魏/宗所有，
 *     页面侧改名＝单方面改动共享资产。
 */
function resolve(name) {
  const list = all();
  const order = [PRIMARY_ID, ...Object.keys(BATCHES).filter(x => x !== PRIMARY_ID)];
  const pick = (pred) => {
    for (const b of order) {
      const hit = list.find(e => e.batch === b && pred(e));
      if (hit) return hit;
    }
    return null;
  };
  // 1) 精确
  const exact = pick(e => e.name === name);
  if (exact) return exact;
  // 2) 大小写不敏感（不猜、不挑第一个歧义项之外的东西：多命中时如实报歧义）
  const target = String(name).toLowerCase();
  const ci = list.filter(e => e.name.toLowerCase() === target);
  if (ci.length === 1) return ci[0];
  if (ci.length > 1) {
    const hit = order.map(b => ci.find(e => e.batch === b)).find(Boolean);
    return Object.assign({}, hit, { name_resolution: { mode: "case_insensitive_ambiguous", candidates: ci.map(e => e.rel_path) } });
  }
  return null;
}

/**
 * ★ D25 步骤6-②：未命中时给候选提示 —— 让"打错字"与"真不存在"可区分。
 *   判据只做字面相似（大小写归一 + 前缀 + 子串），**不做模糊猜测**：
 *   猜一个名字返回数据＝伪造"你查的就是这份"，比报错更坏。
 */
function suggest(name) {
  const list = all();
  const t = String(name || "").toLowerCase();
  if (!t) return [];
  const scored = [];
  for (const e of list) {
    const n = e.name.toLowerCase();
    let score = 0;
    if (n === t) score = 100;
    else if (n.startsWith(t) || t.startsWith(n)) score = 60;
    else if (n.includes(t) || t.includes(n)) score = 40;
    else {
      // 词元重合（把 - / _ 当分隔）：pledge_scan 与 pledge-scan 才算相近
      const a = new Set(n.split(/[-_]/)), b = new Set(t.split(/[-_]/));
      const inter = [...b].filter(x => a.has(x)).length;
      if (inter > 0) score = 20 + inter;
    }
    if (score > 0) scored.push({ name: e.name, score, batch: e.batch });
  }
  scored.sort((x, y) => y.score - x.score || x.name.localeCompare(y.name));
  return scored.slice(0, 5);
}

/** 名字数组（向后兼容：`/api/datasets` 旧字段 datasets 仍是纯字符串数组）。 */
function names() { return all().map(e => e.name); }

/** 仅权威批（metrics 默认口径）。 */
function primaryEntries() { return all().filter(e => e.batch === PRIMARY_ID); }

function primary() { return BATCHES[PRIMARY_ID]; }

/** 参与权威口径统计的 role（白名单：口径必须显式，不是"除了 demo 都算"）。 */
function rolesInBatch(batchId) {
  const b = BATCHES[batchId];
  return b ? b.roles.slice() : [];
}

// ============================================================
// 指纹与批次元信息（材料脚注/页面上屏必须带这个）
// ============================================================
function sha256File(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

/** 目录指纹：文件名排序后逐个取 sha256，再对清单整体取一次。不用 mtime——只认内容。 */
function dirFingerprint(dirName) {
  const dir = path.join(ROOT, dirName);
  if (!fs.existsSync(dir)) return { dir: dirName, exists: false, files: 0, sha256: null, per_file: null };
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort();
  const lines = files.map(f => `${f}:${sha256File(path.join(dir, f))}`);
  return {
    dir: dirName,
    exists: true,
    files: files.length,
    sha256: crypto.createHash("sha256").update(lines.join("\n")).digest("hex"),
    per_file: Object.fromEntries(lines.map(l => { const i = l.indexOf(":"); return [l.slice(0, i), l.slice(i + 1).slice(0, 12)]; })),
  };
}

/**
 * 数据源披露对象 —— `/api/metrics` 与 `/api/datasets` 顶层下发（领导 10-09 裁定③：页面可以暴露信息源）。
 * 字段刻意做得很"啰嗦"：读者在页面上必须能一眼看出「这个数字跑在哪批数据上、有几份、指纹是多少」。
 */
function disclose() {
  resetCache();
  const list = all();
  const fp = {};
  for (const id of Object.keys(BATCHES)) fp[id] = dirFingerprint(BATCHES[id].dir);

  const byBatch = {};
  for (const id of Object.keys(BATCHES)) {
    const es = list.filter(e => e.batch === id);
    byBatch[id] = {
      ...BATCHES[id],
      count: es.length,
      roles: BATCHES[id].roles,
      counts_for_primary: es.filter(e => e.counts_for_primary).length,
      demo_count: es.filter(e => e.role === "demo").length,
      p001_witness_count: es.filter(e => e.role === "p001_witness").length,
      mock_count: es.filter(e => e.is_mock).length,
      files: fp[id].files,
      sha256: fp[id].sha256,
      dataset_names: es.map(e => e.name),
    };
  }

  const overlap = (() => {
    const a = new Set(byBatch[PRIMARY_ID].dataset_names);
    const b = new Set(byBatch.legacy.dataset_names);
    const inter = [...a].filter(x => b.has(x));
    return { count: inter.length, names: inter };
  })();

  // ★ 锚点：权威批次的唯一身份标识（R2 要求页面上可读到）
  const anc = anchor();

  // R2 批次标识：id + 日期 + 锚点前12 位 —— 三样齐全才算"标了"
  const primaryTag = {
    batch_id: PRIMARY_ID,
    batch_date: BATCHES[PRIMARY_ID].date_range,
    anchor_sha256: anc.sha256,
    anchor_short: anc.sha256 ? anc.sha256.slice(0, 12) : null,
    anchor_expected: ANCHOR.expected_sha256,
    anchor_matches: anc.matches,
    anchor_drift: anc.drift,
    // 一行式标识，直接贴到页面/材料脚注
    line: `${PRIMARY_ID}｜${BATCHES[PRIMARY_ID].date_range}｜anchor ${anc.sha256 ? anc.sha256.slice(0, 12) : "(缺)"}`,
  };

  return {
    primary_batch: PRIMARY_ID,
    generated_at: new Date().toISOString(),
    // ★ R2：批次标识（页面任何指标旁都要能引用它）
    primary_tag: primaryTag,
    anchor: anc,
    statement:
      `页面上屏指标只跑「${BATCHES[PRIMARY_ID].label}」（${byBatch[PRIMARY_ID].counts_for_primary} 份入口径，` +
      `目录 ${BATCHES[PRIMARY_ID].dir}/，锚点 ${anc.sha256 ? anc.sha256.slice(0, 12) + "…" : "(无法计算)"}）。` +
      `另一批「${BATCHES.legacy.label}」${byBatch.legacy.count} 份仅供查看与演示，不计入任何分子分母。`,
    batches: byBatch,
    fingerprints: fp,
    overlap,
    // ★ R4：同源变体组（同一 file_sha256 的多份输出）
    variants: variantGroups(),
    discipline: [
      "★ 页面指标只跑权威批次 primary_batch，另一批仅供查看——两批分母不同，混算即无意义",
      "★ R2：任何指标上屏必须同时可读到批次标识＝批次 id + 日期 + 锚点前 12 位（见 primary_tag）",
      "★ R3：不同批次的数字禁止同屏并列引用；历史对照只能显式命名后再展示",
      "★ R4：同一 file_sha256 的多次抽取必须标为同源变体，不得显示为两个独立 case",
      "演示件/mock 样本不参与真实抽取一致性对照，也不计入权威口径",
      "P0-01 物证（wei_real_pledge_0197 / wei_real_pledge_ce37）保留且带标注，不得删除",
      `锚点算法与值由宗博文裁决给定（${ANCHOR.source_ref}）；本地实算而非抄录，偏离即报警`],
  };
}

/**
 * 两批的字段规模对照 —— D19铁律⑧的落地：
 * "指标必须带跑在哪批数据上才可引用"。此函数只数规模，不算任何比率口径
 * （比率口径仍由 metrics.js 实算，避免两处算法漂移）。
 *
 * ★ 权威批内部再分两种口径（frozen_only / incl_demo）并列给出——
 *   分母 615 与 606 的分歧见 BATCHES.authoritative.caliber_split。
 *   只给一个数就是把分歧藏起来，那正是 D19 这次发现的问题本身。
 */
function compare() {
  resetCache();
  const out = {};
  for (const id of Object.keys(BATCHES)) {
    let fields = 0, events = 0, files = 0, unreadable = 0;
    for (const e of all().filter(x => x.batch === id)) {
      if (!e.readable) { unreadable++; continue; }
      files++;
      const json = readJsonSafe(e.file);
      for (const ev of (json.events || [])) {
        events++;
        const f = ev && (ev.fields || ev);
        if (!f || typeof f !== "object") continue;
        for (const fv of Object.values(f)) {
          if (!fv || typeof fv !== "object" || Array.isArray(fv)) continue;
          if (fv.status !== undefined || fv.raw_value !== undefined || fv.provenance !== undefined) fields++;
        }
      }
    }
    const entry = { dir: BATCHES[id].dir, files, unreadable, events, fields, counts_for_primary: id === PRIMARY_ID };
    if (id === PRIMARY_ID) {
      // 按 role 拆开：frozen（入权威口径）与 demo（本地演示件，不入）
      let fFields = 0, fEvents = 0, fFiles = 0;
      for (const e of all().filter(x => x.batch === id && x.role === "frozen")) {
        fFiles++;
        const json = readJsonSafe(e.file);
        for (const ev of (json.events || [])) {
          fEvents++;
          const f = ev && (ev.fields || ev);
          if (!f || typeof f !== "object") continue;
          for (const fv of Object.values(f)) {
            if (!fv || typeof fv !== "object" || Array.isArray(fv)) continue;
            if (fv.status !== undefined || fv.raw_value !== undefined || fv.provenance !== undefined) fFields++;
          }
        }
      }
      entry.frozen_only = { files: fFiles, events: fEvents, fields: fFields };
      entry.caliber_split = BATCHES[id].caliber_split;
    }
    out[id] = entry;
  }
  out.note =
    "★ 引用任何字段规模/比率必须带所属批次。权威批次与材料成绩（437/437、分母 615）同源；" +
    "演示池的数字出自不同样本，两者不可比。★ 权威批内部还有 615 / 606 两种分母口径，见 authoritative.caliber_split。";
  return out;
}

// ============================================================
// ★ R4：同源变体检测（同一 file_sha256 的多次抽取）
// ============================================================
// 宗博文 R4 原文：「同一 file_sha256 的多次抽取必须在页面标注为同源变体
//   （如 P0-01：旧 1 事件 vs 新 3 事件），不得显示为两个独立 case」
//
// 为什么必须机器检测而不是只登记 P0-01：
//   P0-01 是**已知的**那一处。若只登记它，将来出现第二个同 sha 的抽取
//   就会静默显示成两个独立 case —— 那正是 R4 要禁止的"看起来像两份数据"。
//   ⇒ 按 sha256 聚类，**发现新同源组就报警**，不依赖人工记得。
function variantGroups() {
  const bySha = new Map();
  for (const e of all()) {
    if (!e.file_sha256) continue;          // 没有 sha 无法判定同源，跳过（不猜）
    const k = e.file_sha256;
    if (!bySha.has(k)) bySha.set(k, []);
    bySha.get(k).push(e);
  }
  const groups = [];
  for (const [sha, es] of bySha) {
    if (es.length < 2) continue;           // 只有一份就不是"变体"
    // 事件数差异是这个缺陷的核心表征，必须逐个列出来
    const items = es.map(e => ({
      name: e.name, batch: e.batch, batch_label: e.batch_label,
      role: e.role, role_label: e.role_label,
      event_count: e.event_count,
      counts_for_primary: e.counts_for_primary,
    })).sort((a, b) => (a.name < b.name ? -1 : 1));
    const evs = items.map(i => i.event_count);
    groups.push({
      file_sha256: sha,
      sha_short: sha.slice(0, 12),
      variants: items,
      event_counts: evs,
      // 事件数不一致 = 抽取口径差异已在数据里显形（P0-01 的签名）
      event_count_mismatch: new Set(evs.map(String)).size > 1,
      cross_batch: new Set(items.map(i => i.batch)).size > 1,
      known_issue: items.some(i => i.role === "p001_witness") ? "P0-01" : null,
      note:
        `同一 file_sha256（${sha.slice(0, 12)}…）下有 ${items.length} 份输出` +
        `（${items.map(i => i.name).join(" / ")}），事件数 ${evs.join(" vs ")}。` +
        `按 R4 必须作为同源变体呈现，不得显示为两个独立 case。` +
        (new Set(evs.map(String)).size > 1
          ? ` ★ 事件数不一致，说明抽取粒度有差异——${items[0].name} 是 P0-01 物证（漏抽质权人整条事件）。`
          : " 事件数一致，属同源重复抽取。"),
    });
  }
  return groups;
}

module.exports = {
  BATCHES, PRIMARY_ID, ROLE_LABEL, ANCHOR,
  list: all, names, resolve, suggest, resetCache,
  primaryEntries, primary, rolesInBatch,
  disclose, compare, dirFingerprint, sha256File, isMockEnvelope,
  anchor, variantGroups,
  P001_NOTE, DATASET_NOTE, ROOT,
};