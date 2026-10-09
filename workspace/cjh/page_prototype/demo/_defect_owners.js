// 生成 D11 缺陷责任表（人读 md + CSV + 机读 json）
// 数据源：demo/_defects.json（D11 首测）+ 本次封存集合流核对新发现
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const OUT_MD = path.join(ROOT, "docs", "D11_缺陷责任表.md");
const OUT_CSV = path.join(ROOT, "docs", "D11_缺陷责任表.csv");
const OUT_JSON = path.join(ROOT, "page_prototype", "demo", "_defect_owners.json");

// ---------- 责任矩阵（按张的四维框架 A症状/B成因/C影响面/D已知）----------
const OWNERS = {
  B2: { name: "张智博", role: "解析层", note: "有可用几何信息却没切对" },
  B1: { name: "张智博", role: "解析层", note: "源 PDF 版面问题，登记能力边界" },
  B3: { name: "张智博", role: "解析层", note: "跨版本漂移，需张提供修正后 block 映射（对方重锚定）" },
  B4: { name: "消费方（我方页面）", role: "展示层", note: "只差空白/换行，消费方做归一" },
  B5: { name: "魏文宇 / 方轩诚", role: "抽取 / 规则", note: "出处对、值错" },
  E: { name: "宗博文", role: "评测侧", note: "评测资产与自校验流程" },
  P: { name: "陈家浩", role: "页面/ 展示", note: "页面侧缺陷" },
};

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
    metric: "wei_real_pledge_ce37 命中 2/12 = 16.67%；同文档 0197（parser 0.7.0）为 12/12 = 100%",
    evidence:
      "① 两版 region 完全相同 [466.25,469.52,519.85,504.82] ⇒ 坐标对、映射错；" +
      "② ce37 指 b00016（表头「是否为限售股」）而 quote 实际在 b00031；" +
      "③ 0.3.0 的 cell_ref=null，0.7.0 有 cell_ref=\"r2c10\"；" +
      "④ 根因：解析快照 tables[].cells 为空数组，单元格文本是独立 block，旧版按 cell_ref 推算 block_id 算错",
    owner: OWNERS.B3,
    status: "未修复 · 已建框架待接",
    statusNote:
      "张 10-07 11:06 的《解析错误分类与最小复现》已建A5/B3 分类框架并明写「首测未出数，不预判」；" +
      "其文档早于我 19:42 的提交，未见我的实测证据（16.67% vs 100%、region 相同、cell_ref 差异）",
    action: "张提供修正后的 block 映射（重锚定），并按最小复现法固化回归用例",
    verify: "重跑 demo/_evidence_check.js，该数据集 L3 命中率应达 100%",
    due: "D12 首周",
  },
  {
    id: "D11-P0-02",
    sev: "P0",
    title: "溯源存在率 L1 = 73.18%（401/548），147 个字段无溯源无法回跳定位",
    symptom: "A4 出处缺失（provenance 为空或 null）",
    cause: "B5 抽取侧（主）+ B2 解析侧（次）",
    scope: "C2 高影响（覆盖全部 31 份数据集）",
    known: "D2 新发现（我方 D11 首测实算）",
    metric: "L1 = 73.18%（401/548）；注意此指标 ≠ 字段抽取率 71.53%（status=extracted）",
    evidence:
      "GET /api/metrics → summary.l1_pct = 73.18；" +
      "逐数据集 l1_rate 见 demo/_evidence_check.json → per_dataset[].l1_rate",
    owner: OWNERS.B5,
    status: "未修复 · 数据已换但无法复算",
    statusNote:
      "魏 10-07 19:42 交付「31 份修复后信封」，但该批信封未入库" +
      "（魏分支 runs/ 最新仍是 09-29 归档），我本地 data/ 仍是 D2 时期拷贝，**无法复算验证修复声明**",
    action: "魏将 31 份修复后信封入库 develop；我收到后重跑 _evidence_check.js 复算 L1",
    verify: "L1 ≥ 90%（总规划目标），并给出修复前后对比",
    due: "信封入库后 1 日内",
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
    title: "标准化率 69.87%（364/521），低于目标 98%",
    symptom: "值未标准化（standardized ≠ true）",
    cause: "待定（需宗侧首测成绩归因后才能定性）",
    scope: "C2 高影响",
    known: "D1 已知边界",
    metric: "364/521 = 69.87%，未标注 27 个不入分母",
    evidence: "GET /api/metrics → cards[标准化率]",
    owner: OWNERS.B5,
    status: "未修复 · 魏定位的两条均非本项",
    statusNote:
      "魏 10-07 的 d11-defect-localization.md 定位两条缺陷（PLD-009 E03 模型方差、AWD-002 跨块 quote），" +
      "**均属 B5 抽取侧但都不是标准化率本身**；本项根因尚无人认领",
    action: "待宗侧首测成绩下发后按链路归因；魏/方确认是否与已定位两条同源",
    verify: "标准化率 ≥ 98%",
    due: "首测成绩下发后 2 日内",
  },
  {
    id: "D11-P1-02",
    sev: "P1",
    title: "溯源带 block_id 仅 81.14%，约 19% 只有页级锚点",
    symptom: "A4 出处缺失（缺 block_id，region/table_id/cell_ref 更缺）",
    cause: "B1 源 PDF 版面（无框表tables=0、列语义丢）",
    scope: "C3 局部 + C4 边界",
    known: "D1 已在能力边界表登记",
    metric: "锚点完备性 n=403：page/quote 100%、block_id 81.14%、region 70.72%、table_id 30.77%、cell_ref 28.29%",
    evidence:
      "GET /api/metrics → anchors[]；张《解析能力边界表》登记无框表格 tables=0、内容不丢、列语义丢",
    owner: OWNERS.B1,
    status: "未修复 · 已登记为能力边界",
    statusNote: "张已如实登记为能力边界（对应症状 A6列语义丢失 / A7 表格未检出），但**未承诺修复时间**",
    action: "张给出边界升级计划（何种版面能支持 block_id / cell_ref）；或明确接受该边界并在页面标注",
    verify: "锚点完备性提升，或能力边界表给出明确时间表",
    due: "待张排期",
  },
  {
    id: "D11-P1-03",
    sev: "P1",
    title: "核验清单中 2 条 finding 的 provenance 为 null",
    symptom: "A4 出处缺失（核验视图侧）",
    cause: "B5 抽取侧 / 规则侧",
    scope: "C3 局部（2 条 finding）",
    known: "D2 新发现（我方 D11 首测巡检）",
    metric: "2/7 条 finding 的 provenance 为 null",
    evidence: "demo/_ui_survey.json → views[核验] 的 provenance_null 统计",
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
    title: "字段抽取率 71.53%（392/548），低于目标 90%",
    symptom: "status ≠ extracted",
    cause: "待定",
    scope: "C2 高影响",
    known: "D2 新发现（我方 D11 首测实算）",
    metric: "392/548 = 71.53%（口径：status=extracted 占已判定状态字段的比例）",
    evidence: "GET /api/metrics → cards[字段抽取率]；demo/_evidence_check.json → per_dataset",
    owner: OWNERS.B5,
    status: "未修复 · 需宗侧首测归因",
    statusNote:
      "此项与 P0-02 是**两个不同指标**（本项看 status=extracted，P0-02 看有无 provenance），" +
      "不可混用；我方已犯过一次混用错误并修正",
    action: "待宗侧首测成绩下发后归因",
    verify: "字段抽取率 ≥ 90%",
    due: "首测成绩下发后 2 日内",
  },
  {
    id: "D11-P2-01",
    sev: "P2",
    title: "矛盾召回率 / 误报率 / 重复一致率 / 20 页 ≤90 秒 四项指标未测",
    symptom: "无数据（缺输入）",
    cause: "非缺陷（缺封存集与引擎数据）",
    scope: "C1 阻断（验收所需但当前不可测）",
    known: "D1 已知",
    metric: "四项均无实算值",
    evidence: "docs/cjh_workspace_10_D11首测议程与验收.md §未测项",
    owner: OWNERS.E,
    status: "未测 · 缺输入",
    statusNote:
      "封存集已在宗/魏分支交付但**未合流 develop**（develop 仍停 477b4f42/ 09-24）；" +
      "引擎侧数据未到位。四项指标是验收必需项，当前**无法判定**",
    action: "封存集合流 develop + 引擎数据到位后重跑首测，四项指标补测",
    verify: "四项均有实算值与目标对比",
    due: "封存集合流后",
  },
];

// ---------- 输出 ----------
const bySev = { P0: [], P1: [], P2: [] };
defects.forEach((d) => bySev[d.sev].push(d));

let md = "";
md += "# D11 缺陷责任表\n\n";
md += "> 生成人：陈家浩（页面侧）　日期：2026-10-07 20:05\n";
md += "> 数据源：`demo/_defects.json`（首测）+ `demo/_sealed_diag*.js`（封存集合流核对）\n";
md += "> 分级口径：P0 阻断首测/验收 · P1 影响指标达标 · P2 待补测\n";
md += "> 责任归属按张智博《解析错误分类与最小复现》四维框架（A 症状 / B 成因 / C 影响面 / D 已知）判定\n\n";

md += "## 一、总览\n\n";
md += "| 级别 | 条数 | 已修复 | 未修复 | 未测 |\n|---|---|---|---|---|\n";
md += "| P0 | " + bySev.P0.length + " | 0 | " +
  bySev.P0.filter((d) => d.status.indexOf("未修") === 0).length + " | " +
  bySev.P0.filter((d) => d.status.indexOf("未测") === 0).length + " |\n";
md += "| P1 | " + bySev.P1.length + " | 0 | " +
  bySev.P1.filter((d) => d.status.indexOf("未修") === 0).length + " | " +
  bySev.P1.filter((d) => d.status.indexOf("未测") === 0).length + " |\n";
md += "| P2 | " + bySev.P2.length + " | 0 | " +
  bySev.P2.filter((d) => d.status.indexOf("未修") === 0).length + " | " +
  bySev.P2.filter((d) => d.status.indexOf("未测") === 0).length + " |\n";
md += "| **合计** | **" + defects.length + "** | **0** | **" +
  defects.filter((d) => d.status.indexOf("未修") === 0).length + "** | **" +
  defects.filter((d) => d.status.indexOf("未测") === 0).length + "** |\n\n";

md += "> 汇总口径：本次合流后新增 1 条 P0（D11-P0-03 封存集 hash-lock 过期），" +
  "由原「P0 2 / P1 3」变为「**P0 3 / P1 4 / P2 1**」。\n\n";

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
md += "1. **已修复 0 条是事实陈述**，不含催促评价；责任归属照张的四维框架（B2 张修 / B5 魏修 / B3 张给重锚定 / E 宗维护评测资产）。\n";
md += "2. **巡检「0 缺陷」≠ 验收通过**：接口层 31/31、页面层 console 错误 0，只说明页面实现无缺陷，不等于链路指标达标。\n";
md += "3. **封存集未合流 develop 前，任何成绩只能写「开发侧自测」**，不得写成独立首测成绩。\n";
md += "4. **「未核」绝不计入任何命中率分母**：本地仅 1 份解析快照 → L3 出处命中率只覆盖 2/31 份数据集。\n";
md += "5. **「字段抽取率」（status=extracted）与「溯源存在率 L1」（有无 provenance）是两个指标，不可混用**（P1-04 与 P0-02 分列）。\n";
md += "6. 本表由脚本生成，数据源可复现：`node demo/_defects.js` + `node demo/_evidence_check.js` + `node demo/_sealed_diag3.js`。\n";

fs.writeFileSync(OUT_MD, md, "utf8");

// CSV
const csvHead = "缺陷ID,级别,标题,症状A,成因B,影响面C,已知D,实测值,责任人,归属层,状态,修复动作,验收判据,时点\n";
const esc = (s) => '"' + String(s).replace(/"/g, '""') + '"';
const csv = csvHead + defects.map((d) =>
  [d.id, d.sev, d.title, d.symptom, d.cause, d.scope, d.known, d.metric,
   d.owner.name, d.owner.role, d.status, d.action, d.verify, d.due].map(esc).join(",")
).join("\n") + "\n";
fs.writeFileSync(OUT_CSV, csv, "utf8");

// JSON
fs.writeFileSync(OUT_JSON, JSON.stringify({
  generated_at: new Date().toISOString(),
  counts: {
    P0: bySev.P0.length, P1: bySev.P1.length, P2: bySev.P2.length,
    total: defects.length,
    fixed: 0,
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
  " = " + defects.length + " 条；已修复 0；未修 " +
  defects.filter((d) => d.status.indexOf("未修") === 0).length +
  "；未测 " + defects.filter((d) => d.status.indexOf("未测") === 0).length);
console.log("\n=== 责任矩阵 ===");
defects.forEach((d) => console.log("  " + d.sev + "  " + d.id.padEnd(12) + " → " + d.owner.name.padEnd(22) + " " + d.status));