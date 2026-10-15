// 生成 D11 缺陷责任表（人读 md + CSV + 机读 json）
// 数据源（2026-10-15 起，全部现读不手抄）：
//   bridge/metrics.js computeMetrics()   —— 页面同款实算（权威批 data_unified）
//   demo/_standardized_real.json        —— 标准化两项实算产物（与指标卡同源）
//   evaluation/2026-10-12-scorecard/    —— 宗侧成绩单（缺档即退「未测」）
//   demo/_evidence_check.json           —— 出处核对（含 P0-01 物证段）
//   demo/_survey.json                   —— 接口层巡检
// ★ 领导 2026-10-15 裁定「不走首测了，真删」：旧池 data/ 的首测自测值
//   （548 分母、71.53%/69.87%/73.18%/58.33% 等）全部作废，本表只引权威批实算值。
const fs = require("fs");
const path = require("path");

const __dirname_fixed = __dirname;
const PP = path.join(__dirname_fixed, "..");            // page_prototype
const WS = path.join(__dirname_fixed, "..", "..");      // workspace/cjh
const OUT_MD = path.join(WS, "docs", "D11_缺陷责任表.md");
const OUT_CSV = path.join(WS, "docs", "D11_缺陷责任表.csv");
const OUT_JSON = path.join(__dirname_fixed, "_defect_owners.json");

// ---------- 责任矩阵（按张的四维框架 A症状/B成因/C影响面/D已知）----------
const OWNERS = {
  B2: { name: "张智博", role: "解析层", note: "有可用几何信息却没切对" },
  B1: { name: "张智博", role: "解析层", note: "源 PDF 版面问题，登记能力边界" },
  B3: { name: "张智博", role: "解析层", note: "跨版本漂移，需张提供修正后 block 映射（对方重锚定）" },
  B4: { name: "消费方（我方页面）", role: "展示层", note: "只差空白/换行，消费方做归一" },
  B5: { name: "魏文宇 / 方轩诚", role: "抽取 / 规则", note: "出处对、值错" },
  E: { name: "宗博文", role: "评测侧", note: "评测资产与自校验流程" },
  P: { name: "陈家浩", role: "页面 / 展示", note: "页面侧缺陷" },
};

// ---------- 实算真源（缺档即退「未测」，绝不按目标值或经验值填充） ----------
function readJsonSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return null; }
}

let metrics = null;
try { metrics = require(path.join(PP, "bridge", "metrics.js")).computeMetrics(); }
catch (e) { console.log("⚠ metrics 实算失败（bridge 加载异常）：" + e.message); }

const stdReal = readJsonSafe(path.join(__dirname_fixed, "_standardized_real.json"));
const scorecard = readJsonSafe(path.join(WS, "..", "..", "evaluation", "2026-10-12-scorecard", "评分成绩单-20261012.json"));
const evCheck = readJsonSafe(path.join(__dirname_fixed, "_evidence_check.json"));
const survey = readJsonSafe(path.join(__dirname_fixed, "_survey.json"));

const sc = (key) => {
  const s = scorecard && Array.isArray(scorecard.scores) ? scorecard.scores.find((x) => x.key === key) : null;
  return s || null;
};
const scStr = (key) => {
  const s = sc(key);
  return s ? s.num + "/" + s.den + " = " + s.value + (s.unit || "") : "未测（成绩单缺档）";
};
const notCovered = scorecard && Array.isArray(scorecard.not_covered) ? scorecard.not_covered.map((x) => x.key) : [];

const S = metrics ? metrics.summary : null;
const A = metrics ? metrics.agg : null;
const l1Num = S ? S.fields_with_prov : null;
const l1Den = S ? S.fields_total : null;
const l1Pct = S ? S.l1_pct : null;
const covNum = A ? A.status_extracted : null;
const covDen = S ? S.fields_total : null;
const covPct = S ? S.extracted_pct : null;
const acc = sc("field_accuracy");
const stdAcc = stdReal && stdReal.accuracy ? stdReal.accuracy : null;
const stdCov = stdReal && stdReal.coverage ? stdReal.coverage : null;
const l3 = metrics ? metrics.l3 : null;
const verifyView = survey && Array.isArray(survey.view_stats)
  ? survey.view_stats.find((x) => x.path === "/api/verify") : null;
const witness = evCheck && evCheck.p001_witness ? evCheck.p001_witness : null;
const wCe = witness && witness.datasets ? witness.datasets.wei_real_pledge_ce37 : null;

// ---------- 缺陷全集 ----------
const defects = [
  {
    id: "D11-P0-01",
    sev: "P0",
    title: "旧版解析器 0.3.0 字段溯源指向错误 block，命中仅 16.67%（2/12）",
    symptom: "A5 出处指错（quote 不在其 block_id 所指的块里）",
    cause: "B3 跨版本漂移",
    scope: "C2 高影响（该文档 12 个溯源字段 10 个指向错误块）",
    known: "D2 新发现（我方 D11 首测实测）",
    metric: "wei_real_pledge_ce37 命中 " + (wCe ? wCe.l3_hit + "/" + wCe.l3_checked + " = " +
      ((wCe.l3_hit / wCe.l3_checked) * 100).toFixed(2) + "%" : "2/12 = 16.67%") +
      "；同文档 0197（parser 0.7.0）为 12/12 = 100%",
    evidence:
      "① 两版 region 完全相同 [466.25,469.52,519.85,504.82] ⇒ 坐标对、映射错；" +
      "② ce37 指 b00016（表头「是否为限售股」）而 quote 实际在 b00031；" +
      "③ 0.3.0 的 cell_ref=null，0.7.0 有 cell_ref=\"r2c10\"；" +
      "④ 根因：解析快照 tables[].cells 为空数组，单元格文本是独立 block，旧版按 cell_ref 推算 block_id 算错",
    owner: OWNERS.B3,
    status: "未修复 · 已建框架待接",
    statusNote:
      "张 10-07 11:06 的《解析错误分类与最小复现》已建A5/B3 分类框架并明写「首测未出数，不预判」；" +
      "其文档早于我 19:42 的提交，未见我的实测证据（16.67% vs 100%、region 相同、cell_ref 差异）。" +
      "★ 2026-10-15 注：16.67% 是首测对 0.3.0 解析器的历史发现；wei_real_pledge_ce37 不在权威批 31 份内，" +
      "按领导 10-09 裁定②该数据集连同 0197 留在旧池 data/ 并标注（首测不走，物证不删），" +
      "复现路径：node demo/_evidence_check.js → p001_witness 段",
    action: "张提供修正后的 block 映射（重锚定），并按最小复现法固化回归用例",
    verify: "重跑 demo/_evidence_check.js，p001_witness 段该数据集 L3 命中率应达 100%",
    due: "D12 首周",
  },
  {
    id: "D11-P0-03",
    sev: "P0",
    title: "封存集 hash-lock 过期：verify-sealed 报 FAIL（19/60 raw+gold 不符）",
    symptom: "评测资产自校验失效（manifest 记录 hash ≠ 实体文件实际 hash）",
    cause: "流程缺陷（Gold 实体变更后未重跑 build-sealed-manifests.mjs）",
    scope: "C1 阻断（首测基线的可复现性无法自证）",
    known: "D2 新发现（我方 D11 合流核对实测，10-07 20:00）",
    metric: "verify-sealed.mjs → result=FAIL；19 处不符（raw 9 + gold 10）",
    evidence:
      "① 三方比对：本地文件 hash == 宗分支 blob hash ⇒ 检出无损，非传输损坏；" +
      "② manifest / hash-lock / verification.json 三者内部完全一致（都记 44a2d8fa…）⇒ 非记录错乱；" +
      "③ 重跑宗自己的 build-sealed-manifests.mjs 后 **raw 实测 30/30 全命中** ⇒ 数据完好、manifest 过期；" +
      "④ 差异明细：raw 变 9 例（SEALED-006~010, 017~020）、gold 变 10 例（SEALED-001~010）；" +
      "⑤ 宗 10-04 修订 v0.3 后又改动实体文件但未重新生成 hash-lock",
    owner: OWNERS.E,
    status: "未修复 · 本次合流新发现",
    statusNote:
      "宗侧 verification.json 里 result=PASS 是 v0.3 生成时的旧结论，与当前实体文件不符；" +
      "**这不是数据被篡改，是 Gold 变更未同步 hash-lock**。首测若在此状态下开跑，基线可复现性无法自证",
    action: "宗重跑 build-sealed-manifests.mjs 重新生成 manifest + hash-lock + verification.json 并入库",
    verify: "node evaluation/sealed/verify-sealed.mjs → result=PASS，issues 为空",
    due: "首测开跑前（阻断项）",
  },
  {
    id: "D11-P1-01",
    sev: "P1",
    title: "标准化正确率 " + (stdAcc ? stdAcc.pct : "未测") + "%（" +
      (stdAcc ? stdAcc.num + "/" + stdAcc.den : "无实算产物") + "），目标 98%",
    symptom: "值未标准化（standardized ≠ true）",
    cause: "已定位：旧口径把 unit:text 208 条与弃权 169 条混入分母（434/606＝71.62%），产出假缺陷",
    scope: "C2 高影响",
    known: "D1 已知边界 → D13-C2 / D17 裁定后闭环",
    metric: (stdAcc ? stdAcc.num + "/" + stdAcc.den + " = " + stdAcc.pct + "%" : "未测") +
      "（判据 D17 / D13-C2：分母＝非 text 有值字段；364/521 为不可核历史数，禁引）。" +
      "同批标准化覆盖率 " + (stdCov ? stdCov.pct + "%（" + stdCov.num + "/" + stdCov.den + "）" : "未测") + "（不挂目标，仅披露）",
    evidence: "demo/_standardized_real.json → accuracy；GET /api/metrics → cards[标准化正确率]；" +
      "宗 2026-10-12 成绩单 standardized_rate " + scStr("standardized_rate"),
    owner: OWNERS.B5,
    status: "已修复 · 口径已正",
    statusNote:
      "魏 10-07 交付的新信封 standardized 字段已被正确填写；2026-10-13 bridge/metrics.js 旧写法" +
      "（434/606=71.62%）修为与指标卡同源的 229/229，消除同屏两套数；宗成绩单同数互相印证。" +
      "旧标题「标准化率 69.87%（364/521）低于目标 98%」是挂错口径的假缺陷，已按 D17 裁定作废。",
    action: "无需进一步动作",
    verify: "标准化正确率 ≥ 98%（现 " + (stdAcc ? stdAcc.pct : "?") + "%）",
    due: "已闭环",
  },
  {
    id: "D11-P1-02",
    sev: "P1",
    title: "溯源带 block_id " + (S ? S.block_id_pct : "?") + "%（权威批实测）；无框表格列语义丢失仍是已登记能力边界",
    symptom: "A4 出处缺失（缺 block_id，region/table_id/cell_ref 更缺）",
    cause: "B1 源 PDF 版面（无框表tables=0、列语义丢）",
    scope: "C3 局部 + C4 边界",
    known: "D1 已在能力边界表登记",
    metric: "锚点完备性 n=" + (S ? S.prov_total : "?") + "：page " + (S ? S.page_pct : "?") +
      "%｜quote " + (S ? S.quote_pct : "?") + "%｜block_id " + (S ? S.block_id_pct : "?") +
      "%｜region " + (S ? S.region_pct : "?") + "%｜table_id " + (S ? S.table_id_pct : "?") +
      "%｜cell_ref " + (S ? S.cell_ref_pct : "?") + "%",
    evidence: "GET /api/metrics → anchors[]；张《解析能力边界表》登记无框表格 tables=0、内容不丢、列语义丢",
    owner: OWNERS.B1,
    status: "已修复 · 能力边界仍登记",
    statusNote:
      "2026-10-15 权威批实算 block_id 100%（旧池首测值 81.14% 已随首测作废）；" +
      "张已如实登记无框表格 tables=0、列语义丢失为能力边界——table_id/cell_ref 现 " +
      (S ? S.table_id_pct : "?") + "% 即该边界现状，**未承诺修复时间**，维持登记不催。",
    action: "张给出边界升级计划（何种版面能支持 block_id / cell_ref）；或明确接受该边界并在页面标注",
    verify: "锚点完备性提升，或能力边界表给出明确时间表",
    due: "待张排期",
  },
  {
    id: "D11-P1-03",
    sev: "P1",
    title: "核验清单中 " + (verifyView ? verifyView.provenance_null : 2) + " 条 finding 的 provenance 为 null",
    symptom: "A4 出处缺失（核验视图侧）",
    cause: "B5 抽取侧 / 规则侧",
    scope: "C3 局部（finding 级）",
    known: "D2 新发现（我方 D11 首测巡检）",
    metric: (verifyView ? verifyView.provenance_null + "/" + verifyView.total : "2/7") +
      " 条 finding 的 provenance 为 null",
    evidence: "demo/_survey.json → view_stats[核验] 的 provenance_null 统计",
    owner: { name: "方轩诚（核验报告）+ 张智博（出处）", role: "规则 / 解析", note: "核验报告未更新 + 出处侧未给锚点" },
    status: "未修复 · 缺 sidecar 无法复现",
    statusNote:
      "方 feature/fang-rules 最新提交为 ef8738e3「Add files via upload」，无提交信息、**无 *.check.json**；" +
      "核验侧 sidecar 未更新，本条**连复现依据都不足**",
    action: "方更新核验 sidecar（data/*.check.json）并写明每条 finding 的出处或无出处原因",
    verify: "finding 的 provenance 全部非 null，或显式标注「为何无出处」",
    due: "D12 首周",
  },
  {
    id: "D11-P1-04",
    sev: "P1",
    title: "字段抽取覆盖率 " + covPct + "%（" + covNum + "/" + covDen + "）；准确率 " +
      (acc ? acc.value + "%（" + acc.num + "/" + acc.den + "）达标" : "未测") + "（目标 90）",
    symptom: "status ≠ extracted",
    cause: "覆盖率含弃权 " + (covDen - covNum) + " 条（未提及/不适用/待复核/未披露/无法读取）——弃权是正确行为但仍是未覆盖",
    scope: "C2 高影响",
    known: "D2 新发现（我方 D11 首测实算）→ 2026-10-15 按权威批复算",
    metric: "覆盖率 " + covNum + "/" + covDen + " = " + covPct + "%（无对标目标，D17：覆盖率类不挂目标）；" +
      "准确率 " + (acc ? acc.num + "/" + acc.den + " = " + acc.value + "%（目标 90 达标）" : "未测（成绩单缺档）"),
    evidence: "GET /api/metrics → cards[字段抽取覆盖率] 及 coverage_note；" +
      "宗 2026-10-12 成绩单 field_coverage " + scStr("field_coverage") + "、field_accuracy " + scStr("field_accuracy"),
    owner: OWNERS.B5,
    status: "已复算 · 准确率达标",
    statusNote:
      "两个指标分列：覆盖率看全部产出字段（含弃权），准确率只看 Gold 期望字段（宗口径，与我方页面互证）。" +
      "旧池首测值 392/548=71.53% 已作废；总规划 90% 目标按 D17 挂准确率、不挂覆盖率。" +
      "★ 2026-10-15 新口径（demo 显示层，只看抽取效果）：排除原文缺陷 pledge-scan-degrade（14 字段全 unreadable、无解析产物）" +
      "与来源不清 DEMO-EQC-HL-0930（演示件，警告「未知来源」）后 437/592 = 73.82%，见 demo/_evidence_check.json → extraction_coverage。",
    action: "无需修复动作；覆盖率维持事实披露",
    verify: "字段抽取准确率 ≥ 90%（现 " + (acc ? acc.value : "?") + "%）",
    due: "已闭环",
  },
  {
    id: "D11-P1-05",
    sev: "P1",
    title: "溯源存在率 L1 = " + l1Pct + "%（" + l1Num + "/" + l1Den + "），" + (l1Den - l1Num) + " 个字段无溯源无法回跳定位",
    symptom: "A4 出处缺失（provenance 为空或 null）",
    cause: "B5 抽取侧（主）+ B2 解析侧（次）",
    scope: "C2 高影响（覆盖全部 31 份数据集）",
    known: "D2 新发现（我方 D11 首测实算）→ 2026-10-15 复算并降级",
    metric: "L1 = " + l1Pct + "%（" + l1Num + "/" + l1Den + "）；注意此指标 ≠ 字段抽取覆盖率 " + covPct +
      "%（" + covNum + "/" + covDen + "）≠ 字段抽取准确率 " + (acc ? acc.num + "/" + acc.den : "?") + "，三个指标分列不可混用",
    evidence: "GET /api/metrics → summary.l1_pct = " + l1Pct +
      "；逐数据集 l1_rate 见 demo/_evidence_check.json → per_dataset[].l1_rate",
    owner: OWNERS.B5,
    status: "已复算 · 降级为口径披露（原 D11-P0-02）",
    statusNote:
      "2026-10-15 按权威批 data_unified 实算 L1 " + l1Num + "/" + l1Den + "。按《D11_旧问题清单_新标准复核裁定》" +
      "既有裁定由 P0 降级为 P1：Gold 期望的 " + (acc ? acc.den : "?") + " 个字段 100% 有溯源，缺的 " + (l1Den - l1Num) +
      " 条全是 Gold 未标注字段——性质是分母定义，不是抽取侧漏产出。总规划 §5 无 L1 目标，D17 裁定出处类不挂目标，" +
      "故不作未达标项。魏 10-07 19:42 交付的 31 份修复信封已入库为 data_unified（D11 冻结批），复算验证完成。",
    action: "无需修复动作；维持口径披露（缺口字段见 demo/_evidence_check.json → per_dataset）",
    verify: "L1 维持事实披露；宗若补 Gold「原文是否提及」维度（abstain_correct），按新分母复算",
    due: "已闭环（口径问题）",
  },
  {
    id: "D11-P2-01",
    sev: "P2",
    title: "评测成绩单未覆盖 " + notCovered.length + " 项：" + (notCovered.join(" / ") || "（成绩单缺档，无法列名）"),
    symptom: "无数据（缺输入）",
    cause: "非缺陷（缺 Gold 维度 / 缺扫描件独立分母 / 缺 Web-CLI 独立入口）",
    scope: "C1 阻断（验收所需但当前不可测）",
    known: "D1 已知 → 2026-10-12 成绩单明确列出",
    metric: "10-12 成绩单 scores 已覆盖 10 项（含跨文档矛盾 " + scStr("multi_doc_conflict") +
      "、重放一致 " + scStr("replay_byte_identical") + "、20 页耗时 " + scStr("perf_20page") +
      "）；not_covered " + notCovered.length + " 项",
    evidence: "evaluation/2026-10-12-scorecard/评分成绩单-20261012.json → scores / not_covered",
    owner: OWNERS.E,
    status: "未测 · 余 " + notCovered.length + " 项未覆盖（非我方职责）",
    statusNote:
      "原「矛盾召回 / 误报 / 重复一致 / 20 页 ≤90 秒 四项未测」已由 10-12 成绩单覆盖并全部达标；" +
      "剩余未覆盖项分属：abstain_correct（宗，需补 Gold 维度）、web_cli_independent（魏提供入口＋宗给判据）、" +
      "scan_degenerate（需扫描件独立分母）。按「不揽活」只登记不代答。",
    action: "宗补 Gold「原文是否提及」维度；魏提供 Web/CLI 独立入口；扫描件分母由全员议定",
    verify: "三项均有实算值与目标对比，或书面明确豁免",
    due: "待评测侧排期",
  },
];

// ---------- 输出 ----------
const bySev = { P0: [], P1: [], P2: [] };
defects.forEach((d) => bySev[d.sev].push(d));

let md = "";
md += "# D11 缺陷责任表\n\n";
md += "> 生成人：陈家浩（页面侧）　日期：2026-10-15（按权威批实算重写；首测值已作废）\n";
md += "> 数据源：`bridge/metrics.js` 实算（权威批 data_unified）+ `demo/_standardized_real.json` + " +
  "`evaluation/2026-10-12-scorecard` 成绩单 + `demo/_evidence_check.json`\n";
md += "> 分级口径：P0 阻断首测/验收 · P1 影响指标达标 · P2 待补测\n";
md += "> 责任归属按张智博《解析错误分类与最小复现》四维框架（A 症状 / B 成因 / C 影响面 / D 已知）判定\n\n";

md += "## 一、总览\n\n";
md += "| 级别 | 条数 | 已修复 | 未修复 | 未测 |\n|---|---|---|---|---|\n";
md += "| P0 | " + bySev.P0.length + " | 0 | " +
  bySev.P0.filter((d) => d.status.indexOf("未修") === 0).length + " | " +
  bySev.P0.filter((d) => d.status.indexOf("未测") === 0).length + " |\n";
md += "| P1 | " + bySev.P1.length + " | " +
  bySev.P1.filter((d) => d.status.indexOf("未修") !== 0 && d.status.indexOf("未测") !== 0).length + " | " +
  bySev.P1.filter((d) => d.status.indexOf("未修") === 0).length + " | " +
  bySev.P1.filter((d) => d.status.indexOf("未测") === 0).length + " |\n";
md += "| P2 | " + bySev.P2.length + " | " +
  bySev.P2.filter((d) => d.status.indexOf("未修") !== 0 && d.status.indexOf("未测") !== 0).length + " | " +
  bySev.P2.filter((d) => d.status.indexOf("未修") === 0).length + " | " +
  bySev.P2.filter((d) => d.status.indexOf("未测") === 0).length + " |\n";
md += "| **合计** | **" + defects.length + "** | **" +
  defects.filter((d) => d.status.indexOf("未修") !== 0 && d.status.indexOf("未测") !== 0).length + "** | **" +
  defects.filter((d) => d.status.indexOf("未修") === 0).length + "** | **" +
  defects.filter((d) => d.status.indexOf("未测") === 0).length + "** |\n\n";

md += "> 汇总口径：2026-10-07 合流后为「P0 3 / P1 4 / P2 1」；" +
  "2026-10-15 按权威批实算重写——D11-P0-02 按《D11_旧问题清单_新标准复核裁定》既有裁定降级为 D11-P1-05，" +
  "P1-01 / P1-02 / P1-04 复算闭环 ⇒ 现「**P0 2 / P1 5 / P2 1**」。\n\n";

md += "## 二、责任矩阵（一屏看清谁改什么）\n\n";
md += "| 缺陷 | 级别 | 症状(A) | 成因(B) | **责任人** | 归属层 | 状态 |\n|---|---|---|---|---|---|---|\n";
defects.forEach((d) => {
  md += "| **" + d.id + "** | " + d.sev + " | " + d.symptom + " | " + d.cause +
    " | **" + d.owner.name + "** | " + d.owner.role + " | " + d.status + " |\n";
});

md += "\n### 按人汇总\n\n";
const byOwner = {};
defects.forEach((d) => {
  const k = d.owner.name;
  (byOwner[k] = byOwner[k] || []).push(d);
});
md += "| 责任人 | 归属层 | 待处理缺陷 | 最早交付时点 |\n|---|---|---|---|\n";
Object.entries(byOwner).forEach(([k, arr]) => {
  const due = arr.map((d) => d.due).filter((x) => /首测开跑前|首周|1 日内/.test(x));
  md += "| **" + k + "** | " + arr[0].owner.role + " | " +
    arr.map((d) => d.id).join("、") + "（" + arr.length + " 条） | " +
    (due.length ? due[0] : arr[0].due) + " |\n";
});

md += "\n## 三、逐条明细\n\n";
["P0", "P1", "P2"].forEach((sev) => {
  md += "### " + sev + " 级（" + bySev[sev].length + " 条）\n\n";
  bySev[sev].forEach((d) => {
    md += "#### " + d.id + "　" + d.title + "\n\n";
    md += "| 项 | 内容 |\n|---|---|\n";
    md += "| **责任人** | **" + d.owner.name + "**（" + d.owner.role + "）—— " + d.owner.note + " |\n";
    md += "| 症状 / 成因 / 影响面 / 已知 | " + d.symptom + " ｜ " + d.cause + " ｜ " + d.scope + " ｜ " + d.known + " |\n";
    md += "| 实测值 | " + d.metric + " |\n";
    md += "| 证据 | " + d.evidence + " |\n";
    md += "| **当前状态** | **" + d.status + "**——" + d.statusNote + " |\n";
    md += "| **修复动作** | " + d.action + " |\n";
    md += "| 验收判据 | " + d.verify + " |\n";
    md += "| 时点 | " + d.due + " |\n\n";
  });
});

md += "## 四、口径纪律\n\n";
md += "1. **已修复 / 已闭环条目是事实陈述**，不含催促评价；责任归属照张的四维框架（B2 张修 / B5 魏修 / B3 张给重锚定 / E 宗维护评测资产）。\n";
md += "2. **巡检「0 缺陷」≠ 验收通过**：接口层 31/31、页面层 console 错误 0，只说明页面实现无缺陷，不等于链路指标达标。\n";
md += "3. **首测已不走（2026-10-15 领导裁定「真删」）**：旧池 data/ 的首测自测值（548 分母、71.53% / 69.87% / 73.18% / 58.33%）全部作废；本表只引权威批 data_unified 实算值与宗 2026-10-12 成绩单，任何数字可回到上述数据源复现。\n";
md += "4. **「未核」绝不计入任何命中率分母**：无解析产物或 block_id 缺失的 provenance 不入 L3 分母（权威批 30/31 份信封自带 blocks；pledge-scan-degrade 无解析产物，已按 2026-10-15 新口径作「原文缺陷」排除，仅警告不计入）。\n";
md += "5. **三个指标分列，不可混用**：字段抽取覆盖率（437/606，全部产出字段，含弃权）｜字段抽取准确率（437/437，Gold 期望字段，宗口径）｜溯源存在率 L1（449/606，有无 provenance）。\n";
md += "6. **评测侧数字一律动态读成绩单**（evaluation/2026-10-12-scorecard），缺档即退「未测」，绝不按目标值填充。\n";
md += "7. 本表由脚本生成，数据源可复现：`node demo/_evidence_check.js` + `node demo/_defects.js` + `node demo/_defect_owners.js` + `node demo/_sealed_diag3.js`。\n";

fs.writeFileSync(OUT_MD, md, "utf8");

// CSV
const csvHead = "缺陷ID,级别,标题,症状A,成因B,影响面C,已知D,实测值,责任人,归属层,状态,修复动作,验收判据,时点\n";
const esc = (s) => '"' + String(s).replace(/"/g, '""').replace(/\r?\n/g, " ").replace(/,/g, "，") + '"';
const csv = csvHead + defects.map((d) =>
  [d.id, d.sev, d.title, d.symptom, d.cause, d.scope, d.known, d.metric,
   d.owner.name, d.owner.role, d.status, d.action, d.verify, d.due].map(esc).join(",")
).join("\n") + "\n";
fs.writeFileSync(OUT_CSV, csv, "utf8");

// JSON
fs.writeFileSync(OUT_JSON, JSON.stringify({
  generated_at: new Date().toISOString(),
  data_sources: {
    metrics: "bridge/metrics.js computeMetrics()（权威批 data_unified）",
    standardized: "demo/_standardized_real.json",
    scorecard: "evaluation/2026-10-12-scorecard/评分成绩单-20261012.json",
    evidence_check: "demo/_evidence_check.json",
  },
  counts: {
    P0: bySev.P0.length, P1: bySev.P1.length, P2: bySev.P2.length,
    total: defects.length,
    fixed: defects.filter((d) => d.status.indexOf("未修") !== 0 && d.status.indexOf("未测") !== 0).length,
    unfixed: defects.filter((d) => d.status.indexOf("未修") === 0).length,
    untested: defects.filter((d) => d.status.indexOf("未测") === 0).length,
  },
  owners: Object.fromEntries(
    Object.entries(byOwner).map(([k, arr]) => [k, arr.map((d) => d.id)])
  ),
  defects,
}, null, 2), "utf8");

console.log("=== 已生成 ===");
console.log("md   " + OUT_MD);
console.log("csv  " + OUT_CSV);
console.log("json " + OUT_JSON);
console.log("\n计数: P0 " + bySev.P0.length + " / P1 " + bySev.P1.length + " / P2 " + bySev.P2.length +
  " = " + defects.length + " 条；已修复/闭环 " +
  defects.filter((d) => d.status.indexOf("未修") !== 0 && d.status.indexOf("未测") !== 0).length +
  "；未修 " + defects.filter((d) => d.status.indexOf("未修") === 0).length +
  "；未测 " + defects.filter((d) => d.status.indexOf("未测") === 0).length);
console.log("\n=== 责任矩阵 ===");
defects.forEach((d) => console.log("  " + d.sev + "  " + d.id.padEnd(12) + " → " + d.owner.name.padEnd(22) + " " + d.status));
