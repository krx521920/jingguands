# D5 股权变动开发集与方向反转挑战

## 交付

- 10 份真实股权变动公告开发集，16 个事件、144 个字段、138 条字段证据、20 个出处抽查点。
- 10 个方向/前后值反转挑战用例，覆盖普通增减持、静默反转、临近值、同股数比例被动稀释、前后列倒置、比率与股数冲突、缺失后值等边界。
- 独立人工复核 5 份文档、45 个字段。
- 张智博官方解析包已核验：10/10 文档的 source hash、doc_id、page_count、schema、event_count 全部一致。
- 魏文宇已完成十份真实运行，但当前最佳批次 `134046` 仍为 `DIFF`：96.24% 字段命中、11 条契约校验问题、2 个额外事件、1 个事件仅靠单事件回退对齐。
- 最新批次 `135159` 出现回退：15/16 事件对齐、93.55%（对齐字段）字段命中、19 条契约问题，不能作为最终基线。
- 陈佳辉分支已有 D5 轮值议程、演示脚本和 mock 占位，但真实 equity_change 页面链路未闭环。
- 方轩诚分支未观察到 D5 股权变动一致性检查器。

## 数据入口

- Manifest：`dev/manifest.json`
- 原始出处包：`dev/raw/D5-EQC-*.raw.json`
- Gold：`dev/gold/D5-EQC-*.envelope.json`
- 挑战：`challenges/direction-inversion-cases.json`
- 上游最佳批次证据：`evidence/upstream/`
- 最新批次回退记录：`evidence/upstream-latest/`
- 张智博解析核验：`evidence/zhang-parse-verification.json`

## D5 标注规则

1. `direction` 只能是 `increase` 或 `decrease`。
2. `shares_before` / `shares_after` 同时有值时，数值关系必须与方向一致；相等时不得仅凭股数自动推断方向。
3. `change_shares` 采用非负的变动股数绝对值；方向由 `direction` 承载。
4. 比例字段必须带 `denominator`；披露使用不同历史总股本口径时保留原文值并写 `note`。
5. 明确区间写入 `date_range`；只写“办理完成之日”而不给具体日期的，按 `needs_review` 处理。

## 验证

```powershell
node evaluation/D5/tests/validate-d5.mjs
node evaluation/D5/tests/compare-upstream-d5.mjs
```

## 当前集成状态

- Gold 本体：PASS。
- 张智博官方解析：10/10 PASS。
- 魏文宇最佳批次：`runs/batch-20261001T134046`，`DIFF`，不可对外宣称十份100%。
- 魏文宇最新批次：`runs/batch-20261001T135159`，相比最佳批次回退，禁止直接作为最终基线。
- 陈佳辉：D5 展示链路部分准备，尚未完成真实 equity_change 对比页。
- 方轩诚：D5 一致性检查器未交付。
- 第二人复核：pending。
