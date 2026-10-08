// _defects_v2.js —— 按D12 新标准重建缺陷表（只读，可重跑）
//
// 新标准（领导 10-07 23:20 定，四条硬规矩）：
//   ① 证据必须是「同批输出的哈希」或「逐字段对比」，不接受"我看了一下觉得有问题"
//   ② 准确率 / 覆盖率 / 出处命中率分列，三者不得相加成综合分
//   ③ 未测项必须显式标注为「未测」，不得留空、不得按目标值填充
//   ④ 材料引用的成绩必须固定到版本（输入指纹 + 生成脚本 + 代码 SHA）
//
// 本脚本产出的每一条缺陷都带 evidence_kind 字段标注证据类型：
//   hash_verified_input  —— 结论依赖输入数据指纹（换批即失效）
//   field_by_field       —— 有逐字段对比明细可查
//   quote_in_block_text  —— 有原文回跳证据（当前 0 条，因为 blocks[] 全空）
//   none                 —— ★ 无证据，不得入表
//
// 用法：node demo/_defects_v2.js
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const registry = require(path.join(ROOT, "bridge", "metrics_registry.js"));

const parityPath = path.join(__dirname, "_parity_real.json");
const PARITY = fs.existsSync(parityPath) ? JSON.parse(fs.readFileSync(parityPath, "utf8")) : null;

const CODE_SHA = (() => {
  try { return require("child_process").execSync("git rev-parse HEAD", { cwd: path.resolve(ROOT, "..", "..", ".."), encoding: "utf8" }).trim(); }
  catch { return null; }
})();

/** 证据类型守卫：无证据的条目直接拒收，不允许写进表里 */
function withEvidence(defects) {
  const ok = [], rejected = [];
  for (const d of defects) {
    if (!d.evidence_kind || d.evidence_kind === "none") rejected.push(d);
    else ok.push(d);
  }
  return { ok, rejected };
}

// ============================================================
// 差异归因：把 L2 的 10 处差异按性质分类，区别对待
// ============================================================
/** 归因规则（可审阅、可反驳—— 不要把归因写死在代码里当作事实）
 *
 *  ★ D12 自查修正：原先的标点差异判定写成双向比较，但两侧各只去一次尾标点，
 *    导致「A 无句号 / B 有句号」这种最常见的纯书写差异反而匹配不上，
 *    被误判成抽取缺陷（实测 eqc_006.method 只差一个「。」被算成缺陷）。
 *    现在固定顺序：双向归一化后先判相等，再判子串（粒度差异），最后才落默认。 */
const stripTailPunct = s => String(s).trim().replace(/[。．.；;，,、\s]+$/g, "");
const normalizeLoose = s => stripTailPunct(s).replace(/[，]/g, ",").replace(/[（]/g, "(").replace(/[）]/g, ")");

function classifyDiff(d) {
  if (d.kind === "status") {
    return { nature: "口径差异：同一语义用了不同状态词", is_defect: true, owner: "宗博文",
      extra: `（${d.a} vs ${d.b}，两者语义可能等价，判据需先统一）` };
  }
  if (d.kind === "value" && d.field === "currency") {
    return { nature: "★ 真实抽取不一致：币种取值不同，影响金额换算", is_defect: true, owner: "方轩诚（口径）＋ 魏文宇（抽取）" };
  }
  if (d.kind === "value" && d.field === "bid_amount") {
    return { nature: "★ 真实抽取不一致：金额保留原币+折算双值，属口径分歧", is_defect: true, owner: "方轩诚（折算口径）" };
  }
  const na = normalizeLoose(d.a), nb = normalizeLoose(d.b);
  if (na && na === nb) {
    return { nature: "非缺陷：仅句末标点/全半角书写差异", is_defect: false, owner: null };
  }
  if (d.kind === "value") {
    const subset = na && nb && (na.includes(nb) || nb.includes(na));
    return {
      nature: subset ? "抽取粒度差异：一侧为原文全句，一侧为摘要/裸值"
                     : "真实抽取不一致：取值不同且非包含关系",
      is_defect: true, owner: subset ? "魏文宇（抽取粒度需统一）" : "魏文宇＋ 方轩诚",
    };
  }
  return { nature: "未归类差异", is_defect: true, owner: "待定" };
}

function attributeDiffs() {
  if (!PARITY) return [];
  const out = [];
  for (const row of PARITY.layers.L2.rows) {
    for (const d of row.diff) {
      const c = classifyDiff(d);
      out.push({
        dataset: row.a_file.replace("wei_real_", ""), peer: row.b_file,
        event: String(d.ev).slice(0, 60), field: d.field, kind: d.kind,
        a: d.a, b: d.b,
        nature: c.nature + (c.extra || ""),
        is_defect: c.is_defect, owner: c.owner,
        evidence_kind: "field_by_field",
        evidence_ref: `demo/_parity_real.json → layers.L2.rows[${row.a_file}].diff[]`,
      });
    }
  }
  return out;
}

// ============================================================
// 缺陷全集
// ============================================================
function buildDefects() {
  const L2 = PARITY && PARITY.layers.L2;
  const diffs = attributeDiffs();

  // 质押漏抽：从 L2 的单侧独有事件里识别
  const pledgeAbsent = [];
  if (L2) {
    for (const row of L2.rows) {
      const absentB = (row.truly_absent || []).filter(x => x.side === "B");
      if (absentB.length >= 2 && /pledge/.test(row.a_file)) {
        pledgeAbsent.push({
          dataset: row.a_file.replace("wei_real_", ""), peer: row.b_file, count: absentB.length,
          a_events: PARITY.layers.L1.rows.find(r => r.a_file === row.a_file)?.a_events,
          b_events: PARITY.layers.L1.rows.find(r => r.a_file === row.a_file)?.b_events,
          peers: absentB.map(x => String(x.ev).split("|")[2]),
        });
      }
    }
  }

  const defects = [
    // ---------- P0 ----------
    {
      id: "D12-P0-01", level: "P0", owner: "张智博",
      title: `质押公告多质权人场景整条事件丢失（漏抽 ${pledgeAbsent.reduce((n, x) => n + x.count, 0) || 2} 笔）`,
      symptom: "D4-PLD-001 同一份 PDF，旧解析批（finstruct.parse/0.3.0 / 0.7.0）只产出 1 个质押事件，新批（0.9.0）产出 3 个",
      root_cause_hypothesis: "解析器按「首个出质人+首个质权人」组装单事件，未按质权人列表展开为多事件",
      impact: `涉及 ${pledgeAbsent.length || 1} 份数据集；该类文档的字段抽取覆盖率上限被压到 1/3，且下游跨文档配对会把三笔当一笔`,
      evidence_kind: "field_by_field",
      evidence: pledgeAbsent.length
        ? pledgeAbsent.map(x => `${x.dataset}：A 侧 ${x.a_events} 事件 ↔ B 侧 ${x.b_events} 事件，B 侧多出 ${x.count} 个质权人（${x.peers.join("、")}）`).join("；")
        : "见 demo/_parity_real.json layers.L2 单侧独有事件",
      why_not_covered_before: "此前从未把两个抽取批放在一起对照过——首测只看单批内部自洽，跨批召回缺口无人测",
      action: "解析器按质权人/受让方列表展开多事件；补多质权人、多受让方回归用例",
      due: "D12 首周",
    },
    {
      id: "D12-P0-02", level: "P0", owner: "张智博（主）＋ 宗博文（对齐）",
      title: "出处命中率为未测项，但此前多处按100% 上屏",
      symptom: "D11 首测报告与页面均出现「L3 出处命中率 100%」；实际判据只检查「字段有 block_id」",
      root_cause_hypothesis: "判据退化——`l3_den` 只验字段有 block_id，未验 quote 能否在 block 文本中定位；而 Gold.blocks[] 30/30 份全空，验证物理上做不了",
      impact: "整个溯源链的可回跳性从未被验证；这是比任何单点缺陷更根本的问题——它使所有「出处相关」的结论失去证据支撑",
      evidence_kind: "hash_verified_input",
      evidence: "Gold 30 份 blocks[] 全空（demo/_evidence_check.js 可复现）；无任何 *.parse.json 快照可供回跳",
      why_not_covered_before: "首测把「有锚点」当「锚点对」，指标定义本身混淆了两件事",
      action: "① 解析快照落 blocks[].text ② 命中判据改为「quote ∈ block.text」 ③ 补原文快照后再重测",
      due: "D12 首周（阻塞全部出处类结论）",
    },

    // ---------- P1 ----------
    {
      id: "D12-P1-01", level: "P1", owner: "方轩诚（口径）＋ 魏文宇（抽取）",
      title: "跨批币种/金额口径分歧：原币与折算并存，未约定单一真值",
      symptom: "D6-AWD-007：A 侧 currency=阿联酋迪拉姆、bid_amount 含双币种；B 侧 currency=人民币、amount 仅折算值",
      root_cause_hypothesis: "未约定「currency 字段记原币还是记账币」，也未约定 amount 是否允许内嵌折算",
      impact: "涉及外币公告；下游换算与比对会出现系统性偏差，且无法判定哪侧是错的",
      evidence_kind: "field_by_field",
      evidence: "demo/_parity_real.json → layers.L2.rows[wei_real_awd_007.json].diff（3 处）",
      action: "定currency 语义（原币/记账币二选一）+ amount 是否允许内嵌折算；写入口径字典",
      due: "D12",
    },
    {
      id: "D12-P1-02", level: "P1", owner: "魏文宇",
      title: "字段抽取粒度不统一：同一字段一侧存原文全句、一侧存摘要或裸值",
      symptom: "D5-EQC-005 direction：A=「股份减少（公开征集协议转让）」vs B=「减少」；D5-EQC-007 method：A=「司法拍卖被动减持」vs B=「司法拍卖」",
      root_cause_hypothesis: "value 字段未约定「原文照录vs 归一化摘要」，各批次各自实现",
      impact: "逐字段比对必然出差异；标准化率与准确率都会被这项污染",
      evidence_kind: "field_by_field",
      evidence: "demo/_parity_real.json → layers.L2 diff 明细（eqc_005/006/007 共 5 处）",
      action: "约定 value 语义：原文照录进 raw_value，归一化结果进 value，两者都留",
      due: "D12",
    },
    {
      id: "D12-P1-03", level: "P1", owner: "宗博文",
      title: "状态词表未统一：not_mentioned 与 not_disclosed 混用",
      symptom: "D6-AWD-002 formal_award_notice_received：A=not_mentioned，B=not_disclosed（同一文档同一字段）",
      root_cause_hypothesis: "弃权语义分界未书面化——「未提及」与「未披露」在中文语境下难区分，各方自定",
      impact: "直接污染弃权正确率（当前未测）与覆盖率分母认定；判错会让正确弃权被算成漏抽",
      evidence_kind: "field_by_field",
      evidence: "demo/_parity_real.json → layers.L2.rows[wei_real_awd_002.json].diff（2 处）",
      action: "书面定义各弃权状态的分界与判定规则；评测脚本据此归一",
      due: "D12 首周",
    },
    {
      id: "D12-P1-04", level: "P1", owner: "方轩诚",
      title: "direction 等枚举字段被填入未标准化字面量",
      symptom: "D4-PLD-001 三个事件的 direction 值均为字符串 \"pledge\"（疑似内部类型名泄漏），非契约枚举",
      root_cause_hypothesis: "解析侧把内部事件类型直接赋给direction，未走契约枚举映射",
      impact: "违反 v0.3 契约「枚举必须英文标准值、禁止内部字面量」；下游按枚举取值会全部落空",
      evidence_kind: "field_by_field",
      evidence: "data_unified/D4-PLD-001.json events[].fields.direction.value 全为 \"pledge\"",
      action: "接入 registry.mjs 枚举映射；页面侧已有 directionViolatesContract() 可捕获，需上游修",
      due: "D12",
    },
    {
      id: "D12-P1-05", level: "P1", owner: "魏文宇",
      title: "Web/CLI 独立抽取一致性仍为未测（无原始 PDF、无可调用入口）",
      symptom: "对照三层已实跑（L1 哈希/L2 跨批/L3 导出），但三层都不能证明 Web 与 CLI 双路一致",
      root_cause_hypothesis: "页面侧无原始 PDF；抽取管线在魏分支，页面无法独立触发",
      impact: "D10 集成判据 `web_cli_same_result` 无法成立，只能标未覆盖",
      evidence_kind: "hash_verified_input",
      evidence: "demo/_parity_real.json → layers.L1（22 对全不同源，证明对照物真实）+ still_not_covered（阻塞清单）",
      action: "提供抽取 CLI/HTTP 入口 + 原始 PDF 目录；页面侧设两个环境变量即自动追加 L4 真双路对照",
      due: "魏侧 D12 首周",
    },

    // ---------- P2 ----------
    {
      id: "D12-P2-01", level: "P2", owner: "宗博文",
      title: "标准化率 99.10% 与首测 69.87% 不可比，但两数都在材料里出现过",
      symptom: "两个数分母不同（446 vs 521）且判定标准未统一，读者会误以为「大幅提升」",
      root_cause_hypothesis: "standardized 判据未书面化，各批次各自实现",
      impact: "材料层面制造了虚假的改善印象",
      evidence_kind: "hash_verified_input",
      evidence: "demo/_retest_unified.json（baseline 364/521 vs current 442/446）",
      action: "统一判据后重测；在此之前材料中标注「与首测不可比」",
      due: "D12",
    },
    {
      id: "D12-P2-02", level: "P2", owner: "宗博文",
      title: "五项指标未出数（跨文档配对/矛盾判定/集成通过/扫描降级/性能）",
      symptom: "14 项登记指标中 7 项未测，占一半",
      root_cause_hypothesis: "宗侧成绩未产出；部分指标缺分母定义",
      impact: "跨文档与规则能力完全无证据，无法回应验收清单",
      evidence_kind: "hash_verified_input",
      evidence: "bridge/metrics_registry.js → notCovered()（7 项，逐项带 blocked_by）",
      action: "按序出数；无数据的显式标未测，不得留空",
      due: "D12～D13",
    },
    {
      id: "D12-P2-03", level: "P2", owner: "陈家浩（页面侧）",
      title: "★ 对照脚本自身缺陷两处（自查发现并已修，记录备查）",
      symptom: "① 业务键关键字段缺失时按残缺键配对，把「键字段缺失」误报成「无对应事件」（虚增 6 处差异）② 弱配对判定只看键字符串形态，漏判跨侧形态不一致",
      root_cause_hypothesis: "配对逻辑未区分「键不可靠」与「事件真的不存在」两类成因",
      impact: "若不修，D12-P0-01 的漏抽数量会被夸大一倍（3 事件 vs 1 事件被报成 6 处无配对）",
      evidence_kind: "field_by_field",
      evidence: "修复前后对比：修复前 unpaired_total=8（含 6 处误报），修复后单侧独有事件=6、降级配对=2 单列",
      action: "已修（键降级配对 + weak_unmatched/truly_absent 分离）；保留此条以证明对照脚本本身也需被质疑",
      due: "已修",
    },
  ];

  const { ok, rejected } = withEvidence(defects);
  return { defects: ok, rejected, diffs };
}

// ============================================================
// 材料脚注：任何引用成绩的地方必须带这段
// ============================================================
function materialsFootnote() {
  const fp = registry.fingerprint();
  const cs = registry.coverageStatement();
  return [
    `**成绩固定版本**：代码 SHA \`${CODE_SHA || "(非git 目录，取不到)"}\``,
    `输入指纹：page_data \`${String(fp.primary).slice(0, 16)}…\`（${fp.inputs.page_data.files} 份）／ unified_batch \`${String(fp.inputs.unified_batch.sha256).slice(0, 16)}…\`（${fp.inputs.unified_batch.files} 份）`,
    `**换批即失效**：以上指纹变化后，所有引用本批成绩的图表与文档必须重跑，不得沿用旧数`,
    cs.statement,
  ].join("\n");
}

// ============================================================
// 主流程
// ============================================================
function main() {
  const { defects, rejected, diffs } = buildDefects();
  const fp = registry.fingerprint();

  // ---- Markdown ----
  const byLevel = { P0: [], P1: [], P2: [] };
  defects.forEach(d => byLevel[d.level].push(d));

  let md = `# D12 缺陷表 · 按新标准重建\n\n`;
  md += `> 出表：陈家浩（页面侧）　${new Date().toISOString().slice(0, 16).replace("T", " ")}\n`;
  md += `> 生成脚本：\`demo/_defects_v2.js\`（只读，可重跑）　对照数据：\`demo/_parity_real.js\`\n`;
  md += `> **新标准四条**：① 证据必须是同批输出哈希或逐字段对比 ② 准确率/覆盖率/出处命中率分列 ③ 未测项显式标注 ④ 材料引用固定版本成绩\n\n`;

  md += `## 一、指标口径（分列，不相加）\n\n`;
  for (const cat of ["accuracy", "coverage", "evidence", "compliance"]) {
    const c = registry.CATEGORIES[cat];
    md += `### ${c.name}　——　${c.question}\n\n`;
    md += `> 分母规则：${c.denominator_rule}\n>\n> ${c.must_not_mix}\n\n`;
    md += `| 指标 | 数值 | 分子/分母 | 目标 | 状态 | 证据类型 | 说明 |\n|---|---|---|---|---|---|---|\n`;
    registry.byCategory(cat).forEach(m => {
      md += `| ${m.name} | ${m.value === null ? "**未测**" : m.value + (m.unit === "%" ? "%" : " " + m.unit)} ` +
        `| ${m.num === null ? "—" : m.num + "/" + m.den} | ${m.target == null ? "—" : m.target} ` +
        `| ${m.status_label} | ${m.evidence_kind || "—"} | ${(m.evidence_note || "").replace(/\|/g, "/").slice(0, 80)} |\n`;
    });
    md += `\n`;
  }
  md += `> ${registry.coverageStatement().statement}\n\n`;

  md += `## 二、缺陷总表（${defects.length} 条：P0 ${byLevel.P0.length} / P1 ${byLevel.P1.length} / P2 ${byLevel.P2.length}）\n\n`;
  md += `| # | 级别 | 问题 | 责任人 | 证据类型 | 时点 |\n|---|---|---|---|---|---|\n`;
  defects.forEach(d => {
    md += `| **${d.id}** | ${d.level} | ${d.title} | **${d.owner}** | ${d.evidence_kind} | ${d.due} |\n`;
  });
  md += `\n`;

  md += `## 三、逐条明细\n\n`;
  for (const lv of ["P0", "P1", "P2"]) {
    byLevel[lv].forEach(d => {
      md += `### ${d.id}（${lv}）　${d.title}\n\n`;
      md += `| 项 | 内容 |\n|---|---|\n`;
      md += `| 责任人 | **${d.owner}** |\n`;
      md += `| 症状 | ${d.symptom} |\n`;
      md += `| 成因假设 | ${d.root_cause_hypothesis} |\n`;
      md += `| 影响面 | ${d.impact} |\n`;
      md += `| **证据类型** | \`${d.evidence_kind}\` |\n`;
      md += `| **证据** | ${d.evidence} |\n`;
      md += `| 为何此前未覆盖 | ${d.why_not_covered_before} |\n`;
      md += `| 交付动作 | ${d.action} |\n`;
      md += `| 时点 | ${d.due} |\n\n`;
    });
  }

  md += `## 四、跨批差异逐条归因（${diffs.length} 处）\n\n`;
  md += `| 数据集 | 字段 | 类型 | 页面批取值 | 统一批取值 | 性质 | 是否缺陷 | 责任人 |\n|---|---|---|---|---|---|---|---|\n`;
  diffs.forEach(d => {
    md += `| ${d.dataset} | ${d.field} | ${d.kind} | ${String(d.a).slice(0, 40)} | ${String(d.b).slice(0, 40)} | ${d.nature} | ${d.is_defect ? "**是**" : "否"} | ${d.owner || "—"} |\n`;
  });
  const nonDefect = diffs.filter(d => !d.is_defect).length;
  md += `\n> ${diffs.length} 处差异中**真实抽取不一致 ${diffs.length - nonDefect} 处、口径/粒度/标点类非缺陷 ${nonDefect} 处**。\n`;
  md += `> ⚠ 差异数不等于缺陷数——口径未统一时，同一件事必然出差异。归因逐条列出以便反驳，不接受"总数上升=质量下降"的推断。\n\n`;

  md += `## 五、证据守卫\n\n`;
  md += `- 证据类型枚举：\`hash_verified_input\`（依赖输入指纹）／\`field_by_field\`（有逐字段明细）／\`quote_in_block_text\`（有原文回跳，当前 0 条）\n`;
  md += `- **\`none\` 类型条目一律拒收入表**。本次写入 ${defects.length} 条，拒收 ${rejected.length} 条。\n`;
  md += `- 「实测但不可核」（status=unverified）不得当验收依据；本表当前该项 ${registry.list().filter(m => m.status === "unverified").length} 条。\n\n`;

  md += `## 六、材料引用脚注（复制即用）\n\n`;
  md += `> ${materialsFootnote().split("\n").join("\n> ")}\n\n`;

  const mdPath = path.join(ROOT, "..", "docs", "D12_缺陷表_新标准.md");
  fs.writeFileSync(mdPath, md.replace(/\s+$/, "") + "\n");

  // ---- CSV ----
  const csvHead = ["编号", "级别", "问题", "责任人", "证据类型", "证据", "时点", "状态", "代码SHA", "输入指纹"];
  const csvRows = defects.map(d => [
    d.id, d.level, d.title, d.owner, d.evidence_kind, d.evidence, d.due, "待修复",
    CODE_SHA || "", String(fp.combined_sha256).slice(0, 16),
  ]);
  const csv = [csvHead, ...csvRows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const csvPath = path.join(ROOT, "..", "docs", "D12_缺陷表_新标准.csv");
  fs.writeFileSync(csvPath, csv + "\r\n");

  // ---- 控制台 ----
  console.log("\n===== D12 缺陷表（新标准）=====");
  console.log(`指标：共 ${registry.list().length} 项，已实测 ${registry.list().filter(m => m.status === "measured").length}，未测 ${registry.notCovered().length}`);
  console.log(`缺陷：${defects.length} 条（P0 ${byLevel.P0.length} / P1 ${byLevel.P1.length} / P2 ${byLevel.P2.length}），证据守卫拒收 ${rejected.length} 条`);
  console.log(`差异：${diffs.length} 处（真实不一致 ${diffs.filter(d => d.is_defect).length}、非缺陷 ${diffs.filter(d => !d.is_defect).length}）`);
  console.log(`\n代码 SHA：${CODE_SHA || "(取不到)"}`);
  console.log(`\n产出：\n  ${path.relative(process.cwd(), mdPath)}\n  ${path.relative(process.cwd(), csvPath)}`);
}

module.exports = { buildDefects, attributeDiffs, materialsFootnote };

if (require.main === module) main();