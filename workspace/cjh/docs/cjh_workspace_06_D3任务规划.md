# 陈家浩 · D3 任务规划与执行记录（09-29）

> D3 共同目标：**质押真实闭环 ⭐里程碑**。我的交付物：质押网页真实链路 + JSON/CSV 导出；与魏/张修断链和错位。
> 本文 = 新规范拉取记录 + 当日改动 + 自测证据。上游规范快照在 `docs/_ref_*`（只读，勿改）。

## 1. 新规范拉取（git show 分支读取，未切分支）

| 来源 | 分支@提交 | 拉取文件（快照） | 关键增量 |
|---|---|---|---|
| 魏文宇 | `weiwenyu@59c1d79` | `_ref_wei_interface_README_v0.3b.md`、`_ref_wei_event-envelope.schema_v0.3b.json`、`_ref_wei_run_pledge_latest.json`、`_ref_wei_batch_report.md` | ① `provenance.source_type` 枚举落契约：`paragraph/cell/table/scan_region/document/null`（张指缺口后当日补全）；② `unit` 新增 `date_range`（ISO 区间 `"start/end"`）；③ `award_contract` 9→14 字段（consortium 拆 2 + 4 个专业边界可选）；④ `equity_change.change_date` date→date_range；⑤ D3 批量入口 + 真实 PDF 端到端 + Gold 对照 |
| 张智博 | `zhangzhibo@b108a85` | `_ref_zhang_evidence_v0.7.json`、`_ref_zhang_D3_README.md`、`_ref_zhang_D3_给群里的回复.md`、`_ref_zhang_D3_pledge.parse.json` | **evidence/0.7**：`doc_id=sha256 前 8 位派生`（防同名串证据）、`coord_system` 显式声明（PDF 点/左上原点/y 向下）、`table_ref.header_path` 多层表头拼接、`cell_ref` 全文档唯一（修掉合并单元格撞车）、`continues` 跨页续表标注、`columns` 分栏 x 范围；D3 交付 `sample/D3/`（3 份真实公告 parse + 页面渲染 PNG）；区域重建一致率 127/127、61/61、75/75 全 100% |
| 宗博文 | `zongbowen@7e6d0e7` | `_ref_zong_D2-evaluation.md`、`_ref_zong_contract-gaps.md`、`_ref_zong_gold_PLD-001.json` | evaluation/D2：6 份 gold 信封（PLD/AWD/EQC × 2）、contract-gaps、标准化格式 22 用例；`eval/baseline` 分支建立评测基线 |
| 方轩诚 | `fang-rules@24b7656` | （目录清单核对，未拉文件） | D2 标准化函数与测试 v0.1（normalization 模块 + fixtures），魏已接入（22 条用例双重验证） |

**我的两个真实数据集来源**：`data/wei_real_pledge_0197.json` = 魏 `runs/20260929T025658-pledge-0197`（pledge.pdf 真实 PDF、deepseek-chat、3587ms、非 mock）；`data/wei_real_pledge_ce37.json` = `runs/20260929T014901-pledge-ce37`（同源对照）。已核 `is_mock:false` 才入 data/；魏 09-29 最新一批 `033353-*` 是 mock 门禁测试输出，**不得**当真实数据展示。

## 2. D3 页面改动

### 2.1 转接口升级（bridge/upstream_bridge.js）
- evidences 增 `source_type`（v0.3b D3 增补字段，透传不丢）；字段增 `status_raw`（信封原始 6 态，溯源用）；
- `WEI_UNIT_TEXT` 补 `date_range`；`SOURCE_TYPE_TEXT` 中文映射表；
- **完整性断链检查 `checkIntegrity()`**（见 2.3）。

### 2.2 JSON/CSV 导出（D3 核心交付）
- server 新端点 `GET /api/export?dataset=<name>&format=json|csv`：与 `/api/result` **同一 `readDataset` 路径**（同读同桥，页面所见 = 导出所得）；JSON 原样下载；CSV 每字段一行（18 列：run_id…quote），RFC 4180 转义 + BOM（Excel 中文不乱码）+ `Content-Disposition: attachment`；一字段多证据时各补一行（evidence_ids 展开，不错位）；目录逃逸防护沿用。
- 前端：上传栏新增"导出 CSV / 导出 JSON"按钮（`app.js` `exportDataset()`）。

### 2.3 断链/错位修复（与魏/张协作约定的页面侧落地）
1. **完整性检查**（桥内 `checkIntegrity`，结果挂 `contract.integrity={ok,issues[]}`，页面结果栏顶部红/黄警告条）：
   - 有值字段无出处 → error"断链"；
   - 引用不存在的 evidence_id → error；
   - `source_type=cell` 缺 table_id/cell_ref → error（契约红线：表格证据不许丢失）；
   - `source_type=table` 兜底块 → warn 降权（张 D3 约定：必带 degraded:true，消费方降权）。
2. **状态错位修复**：此前字段徽章/CSV 状态回退事件级状态，导致事件待复核时 extracted 字段（如 pledgor）被错标"待复核"。改为**字段级状态**：`status_override || success`（页面与 CSV 一致），信封原始 6 态保留在 `status_raw` 列。
3. 证据锚点升级：`证据 ev-0001 · 表格#r2c1`（出处类型 + 单元格号一眼可见）；证据栏每条显示出处类型中文。

## 3. 自测证据（node 脚本，全部通过）

- 桥：真实 run 过桥（12 证据、integrity ok、r2c1=cell+d44e95085_p001_t001）、方路径回归（12500 ✓）、mock 透传恒等 ✓、**故意破坏 cell 出处 → 检查器报 error** ✓；
- server 冒烟：6 数据集 CSV 全 200；CSV 13 行（12 证据 + 表头）且 pledgor 行状态=success/extracted、end_date=pending_review/needs_review、pledge_amount=not_mentioned（缺失≠零）；JSON 导出与 /api/result 逐字节一致；`../etc` 注入 → 400；
- 前端三个改动模块 `node --check` 全过。

## 5. 领导反馈两问的页面就绪验证（09-29 晚，实证）

针对"同一公告 3 笔质押只出 1 个事件"（魏）与"表格列头万股单位继承换算错"（魏/方）两个上游问题，页面侧核验结论：**零改动，已就绪**。实证数据集 `data/wei_multi_event_test.json`（合成、显式标 simulated）：

- **多事件**：契约 `events[]` 数组原生支持——页面 3 张事件卡片自动渲染（3 events / 15 evidences）、CSV 每事件每字段一行（16 行）。魏按明细行拆 E01/E02/E03 修好模型后，页面与导出**无需任何改动**即可验证。
- **列头单位继承**：页面展示"原文口径 + 标准化值"并列（fmtMarks），忠实透传不做二次复算（避免页面成为第二真相源）——正确换算 `364.00万股→3,640,000 股`、小数万股 `27,495.8065万股→274,958,065 股`（×10⁴ 后为整数，校验应通过）均正确显示；**故意错值字段**（E03：原文 1,200.00万股 / 标准化 1200 股）在页面与 CSV 中并列可见，错值一眼即见——页面是"错误放大镜"，不是"错误掩体"。
- 给魏/方的验证路径：修复后把真实 run 的 events.json 丢进 `data/`（或 remote 模式直连），页面下拉即见；E03 式错值可直接当页面对照用例。

## 6. 待办与协作事项

- [ ] **给魏**：CSV 状态列口径已改字段级（`status_raw` 保留 6 态），如他侧统计口径需对齐请告知；
- [ ] **给张**：evidence/0.7 的 `continues`（跨页续表）页面暂只展示、不自动拼接——拼接属消费方职责，D4 做（"只取下半截当股东名称就是错值"已知情）；页面渲染 PNG 可作 D4 原文回跳的底图素材；
- [ ] **给宗**：gold 信封（D2-PLD 等 6 份）页面暂未接入为数据集，D11 首测时按"gold vs 抽取"双栏对照需求再接；
- [ ] award_contract 14 字段注册表（v0.3b 新增 5 字段）→ D6 中标批量页面前补齐 FIELD_TEXT 中文；
- [ ] D5（10-01）我主持：提前备合流议程。
