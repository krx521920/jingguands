# D9 交接单：归因规则用例集（评测侧 → B 流程）

日期：2026-10-05
交出人：宗（评测侧）

## 一、交接物

`evaluation/D9/cases/rules-cases.dev.json`：20 条规则开发用例，每条带
- `expected_verdict`（corroborated / explainable_difference / restated / conflict / insufficient）
- `sides[]`：真实 `case_id` + 字段 + 值 + `block_id` + `quote`
- `attribution_basis`：归因依据
- `must_not_conclude` / `must_not_compute`：越界禁止项

评分：`node evaluation/D9/score-rules.mjs --report <your-report> --strict`

## 二、给魏

1. 按 `evaluation/D9/README.md §五` 输出归因报告（`cases[].verdict/attribution/sides/computed`）。
2. **模型可解释但不得覆盖确定性规则判定**：`computed[]` 里用了汇率/税率必须写 `used_source`，否则评测侧判"强行换算"。
3. 判 `conflict` 必须带 ≥2 侧 `block_id + quote`。

## 三、给方

用例覆盖 6 类归因：本次/累计、比例分母、含税口径、币种折算、合计↔明细、部分覆盖。请把这几类做进规则库，逐条对上 `cases[].attribution_basis`。

## 四、给陈

核验清单页需并排展示：原始值、标准值、差异归因、双侧出处、信息不足。`insufficient` 两类（扫描降级、无 `header_path`）必须显示"证据不足"，不得显示为矛盾。

## 五、给张

`D9-RULE-018` 依赖无框表格的列语义缺失标识；请确认 `D6-AWD-005` 类文档在双侧出处包中显式给出"无 header_path / 列序回退"标记。

## 六、诚实边界

公开语料**无更正公告、无真矛盾实例**（公开对照 `conflicts=0`）。因此 `D9-RULE-019`（更正）与 `D9-RULE-020`（真矛盾）为**受控构造**，已用 `synthetic_controlled: true` 标注，不计入公开分母。
