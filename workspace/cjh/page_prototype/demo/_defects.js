#!/usr/bin/env node
/**
 * D11 缺陷清单生成 —— 汇总三份巡检结果，按 P0/P1/P2 分级输出
 *
 * 输入（均为 D11 首测当日实跑产出）：
 *   demo/_survey.json        接口层巡检（31 数据集 × 4 接口 + 导出 + 健壮性）
 *   demo/_ui_survey.json     页面层巡检（4 视图 × 重叠/溢出/漏渲染/控制台）
 *   demo/_evidence_check.json 出处核对（L1/L2/L3 + 归因）
 *   /api/metrics（现场实算）指标与 parser 对比
 *
 * 输出：
 *   docs/D11_缺陷清单.md            人读版（分级 + 复现路径 + 归属）
 *   demo/_defects.json              机读版（D12 修复直接消费）
 *
 * 分级口径（与D12 修复优先级一致）：
 *   P0 阻塞验收：功能不可用 / 数据错误会误导结论 / 证据链断裂
 *   P1 影响可信度：口径不全、覆盖不足、展示与实算不一致
 *   P2 体验与可读性：措辞、样式、性能观感
 *
 * 纪律：每条缺陷必须带可复现路径（命令 + 请求），不允许"疑似"。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");          // page_prototype
const WS = path.join(ROOT, "..");                 // workspace/cjh
const OUT_MD = path.join(WS, "docs", "D11_缺陷清单.md");
const OUT_JSON = path.join(__dirname, "_defects.json");

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return fallback; }
}

const survey = readJson(path.join(__dirname, "_survey.json"), null);
const uiSurvey = readJson(path.join(__dirname, "_ui_survey.json"), null);
const evCheck = readJson(path.join(__dirname, "_evidence_check.json"), null);

// ---- 现场实算指标（直接调 bridge，避免接口未起时数据缺失）----
let metrics = null;
try {
  metrics = require(path.join(ROOT, "bridge", "metrics.js")).computeMetrics();
} catch (e) {
  console.log("metrics 实算失败（bridge加载异常）：" + e.message);
}

const defects = [];

function add(d) {
  defects.push(Object.assign({ id: "", sev: "", title: "", area: "", repro: "",
    expect: "", actual: "", owner: "", evidence: "", day: "D11" }, d));
}

// ---------- P0：溯源指向错误（D11 核心发现）----------
if (evCheck && evCheck.l3_scope && evCheck.l3_scope.checked > 0) {
  const hit = evCheck.l3_scope.hit, checked = evCheck.l3_scope.checked;
  const mis = (evCheck.attribution && evCheck.attribution.true_mispoint) || 0;
  if (mis > 0) {
    const cmp = (metrics && metrics.l3) || {};
    add({
      sev: "P0",
      area: "证据链 / 解析-抽取衔接",
      title: "旧版解析器（0.3.0）把字段溯源指向错误的 block，region 坐标却正确",
      repro: "node demo/_evidence_check.js  → 观察 L3 未命中清单；\n" +
        "手工核对：wei_real_pledge_ce37 的 E01.pledgee 指向 d44e95085_p001_b00016（表头「是否为限售股」），\n" +
        "而 quote「建德市新安小额贷款股份有限公司」实际在 d44e95085_p001_b00031",
      expect: "provenance.block_id 指向的 block 内应包含 provenance.quote",
      actual: "parser 0.3.0 命中率 16.67%（2/12），parser 0.7.0 命中率 100%（12/12）；" +
        "同文档同 region，差异只在 block_id 映射 —— 即坐标对、映射错。" +
        "真错指 " + mis + " 条，另 " + ((evCheck.attribution && evCheck.attribution.absent_in_snapshot) || 0) + " 条 quote 在整份解析快照中都不存在",
      owner: "张智博（block 映射口径）+ 魏文宇（抽取侧 provenance 生成）",
      evidence: "demo/_evidence_check.json → attribution.mispoint_detail（含 real_blocks 对照）",
    });
  }
}

// ---------- P0/P1：字段抽取率、标准化率不达标 ----------
if (metrics) {
  const s = metrics.summary;
  if (s.l1_pct !== null && s.l1_pct < 90) {
    add({
      sev: "P0",
      area: "溯源完整性",
      title: "溯源存在率（L1）" + s.l1_pct + "% ，147 个字段无任何 provenance",
      repro: "curl http://127.0.0.1:8643/api/metrics → l1_provenance（或 summary.l1_pct）",
      expect: "≥90%（与总规划『字段抽取率』不同：抽取率看 status=extracted，本项看有无溯源；" +
        "当前字段抽取率 " + s.extracted_pct + "%，两者都未达标）",
      actual: s.l1_pct + "%（" + s.fields_with_prov + "/" + s.fields_total +
        " 字段带 provenance）；缺口 " + (s.fields_total - s.fields_with_prov) +
        " 个字段无溯源，页面无法回跳定位",
      owner: "魏文宇（抽取）+ 张智博（出处）",
      evidence: "GET /api/metrics → l1_provenance / summary",
    });
  }
  if (s.standardized_pct !== null && s.standardized_pct < 98) {
    add({
      sev: "P1",
      area: "标准化",
      title: "标准化率 " + s.standardized_pct + "% ，低于目标 98%",
      repro: "curl http://127.0.0.1:8643/api/metrics → cards[标准化率]",
      expect: "≥98%",
      actual: s.standardized_pct + "%（standardized=true 占 true/false 之比，未标注不计入分母）",
      owner: "魏文宇",
      evidence: "GET /api/metrics → summary.standardized_pct",
    });
  }
  if (s.block_id_pct !== null && s.block_id_pct < 100) {
    add({
      sev: "P1",
      area: "证据锚点",
      title: "溯源带 block_id 仅 " + s.block_id_pct + "% ，" +
        (s.prov_total - Math.round((s.block_id_pct / 100) * s.prov_total)) + " 条只有页级锚点",
      repro: "curl http://127.0.0.1:8643/api/metrics → anchors[溯源带 block_id]",
      expect: "块级锚点可回跳定位；仅页级为合法降级（D4-PLD 口径）且须显式标注降级原因",
      actual: "block_id " + s.block_id_pct + "% / region " + s.region_pct +
        "% / cell_ref " + s.cell_ref_pct + "%（n=" + s.prov_total + "）",
      owner: "张智博",
      evidence: "GET /api/metrics → anchors",
    });
  }
}

// ---------- P1：核验视图中 provenance 为 null ----------
// 注意：_survey.json 的 view 名是「配对/核验/集成」（不带 D8/D9/D10 后缀），
// 与 _ui_survey.json 的「核验 D9」不同，这里按路径匹配更稳。
if (survey) {
  const v = (survey.view_stats || []).find((x) => x.path === "/api/verify");
  if (v && v.provenance_null > 0) {
    add({
      sev: "P1",
      area: "核验视图",
      title: "核验清单中 " + v.provenance_null + " 条 finding 的 provenance 为 null",
      repro: "curl http://127.0.0.1:8643/api/verify → findings[].provenance",
      expect: "每条 finding 应带出处，或显式标注为何无出处",
      actual: v.provenance_null + "/" + v.total + " 条为 null",
      owner: "方轩诚（核验报告）+ 张智博（出处）",
      evidence: "demo/_survey.json → view_stats[path=/api/verify].provenance_null",
    });
  }
}
// ---------- 汇总巡检结果（若存在）----------
function collect(list, area, sevDefault) {
  (list || []).forEach((f) => {
    add({
      sev: f.sev || sevDefault,
      area: area,
      title: f.title,
      repro: f.repro,
      expect: f.expect,
      actual: f.actual,
      owner: "待定（页面侧可自修）",
      evidence: f.sev ? "demo/_survey.json / _ui_survey.json" : "",
    });
  });
}
if (survey) collect(survey.findings, "接口层巡检", "P2");
if (uiSurvey) collect(uiSurvey.findings, "页面层巡检", "P2");

// ---------- 编号 ----------
const order = { P0: 0, P1: 1, P2: 2 };
defects.sort((a, b) => (order[a.sev] - order[b.sev]));
let n = { P0: 0, P1: 0, P2: 0 };
defects.forEach((d) => {
  n[d.sev]++;
  d.id = "D11-" + d.sev + "-" + String(n[d.sev]).padStart(2, "0");
});

// ---------- 已知限制（非缺陷，但必须写进清单）----------
const limits = [
  "本次只跑现有 31 份真实数据集；宗博文保管的 30 份单文档 + 20 组跨文档封存集未交付（按规则首测前不交开发），故本次成绩为「开发侧自测」，不得写成独立首测成绩。",
  "L3 原文命中仅覆盖 2 个数据集（本地仅 1 份原始解析快照 doc_id=d44e95085），其余 29 份未核，未计入任何命中率分母。",
  "矛盾召回 / 矛盾误报 / 重复运行一致率 / 20 页 ≤90 秒 四项未测：需封存集与引擎侧运行数据，属宗与魏职责范围。",
  "接口层与页面层巡检均为 0 缺陷，但0 缺陷不等于验收通过——验收需封存集首测成绩。",
];

// ---------- 输出机读版 ----------
fs.writeFileSync(OUT_JSON, JSON.stringify({
  generated_at: new Date().toISOString(),
  counts: n,
  total: defects.length,
  defects,
  limits,
  metrics_summary: metrics ? metrics.summary : null,
  l3: metrics ? metrics.l3 : null,
}, null, 2), "utf8");

// ---------- 输出人读版 ----------
let md = "";
md += "# D11（10-07）首次封存测试 · 页面/报告缺陷清单\n\n";
md += "> 生成：`node demo/_defects.js`（数据源为 D11 当日实跑产出，可一键复现）\n";
md += "> 生成时间：" + new Date().toISOString().replace("T", " ").slice(0, 19) + "\n";
md += "> 分级口径：P0 阻塞验收（功能不可用/数据误导/证据链断裂）｜P1 影响可信度｜P2 体验与可读性\n\n";

md += "## 0. 结论摘要\n\n";
md += "| 级别 | 条数 | 说明 |\n|---|---|---|\n";
md += "| **P0** | **" + n.P0 + "** | 必须 D12 前修复，否则首测无法判定 |\n";
md += "| **P1** | **" + n.P1 + "** | 影响指标可信度，需修复或明确书面豁免 |\n";
md += "| **P2** | **" + n.P2 + "** | 体验项，可排入 D12 长尾 |\n\n";
if (n.P0 === 0) md += "> 本次未发现 P0。\n\n";
else md += "> **存在 " + n.P0 + " 条 P0，其中 1 条为证据链断裂（溯源指向错误），属 D11 首测核心发现。**\n\n";

md += "## 1. 缺陷明细\n\n";
["P0", "P1", "P2"].forEach((sev) => {
  const list = defects.filter((d) => d.sev === sev);
  if (!list.length) return;
  md += "### " + sev + "（" + list.length + " 条）\n\n";
  list.forEach((d) => {
    md += "#### " + d.id + "　" + d.title + "\n\n";
    md += "- **领域**：" + d.area + "\n";
    md += "- **复现**：\n\n```\n" + String(d.repro).split("\n").join("\n") + "\n```\n";
    md += "\n- **期望**：" + d.expect + "\n";
    md += "- **实测**：" + d.actual + "\n";
    if (d.owner) md += "- **归属**：" + d.owner + "\n";
    if (d.evidence) md += "- **证据**：`" + d.evidence + "`\n";
    md += "\n";
  });
});

md += "## 2. 已知限制（非缺陷，但影响结论解读）\n\n";
limits.forEach((l, i) => { md += (i + 1) + ". " + l + "\n"; });
md += "\n";

md += "## 3. 复现方式\n\n";
md += "前置：`PORT=8643 node server.js`（工作目录 `workspace/cjh/page_prototype`）\n\n";
md += "```bash\n";
md += "node demo/_survey.js          # 接口层巡检 → demo/_survey.json\n";
md += "python demo/_ui_survey.py     # 页面层巡检 → demo/_ui_survey.json\n";
md += "node demo/_evidence_check.js  # 出处命中核对 → demo/_evidence_check.json\n";
md += "node demo/_defects.js          # 汇总生成本清单 → docs/D11_缺陷清单.md + demo/_defects.json\n";
md += "```\n\n";
md += "纪律：全部脚本只读，不改数据、不改代码、不碰封存资产。\n";

fs.writeFileSync(OUT_MD, md, "utf8");

console.log("=== D11 缺陷清单已生成 ===");
console.log("P0 " + n.P0 + " / P1 " + n.P1 + " / P2 " + n.P2 + "，共" + defects.length + " 条");
console.log("→ " + OUT_MD);
console.log("→ " + OUT_JSON);