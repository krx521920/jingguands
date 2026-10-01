# D5 股权变动开发集与方向反转挑战

## 交付

- 10 份真实股权变动公告开发集：6 份来自魏文宇 D5 上游语料，4 份为本次按 `evaluation/D5/dev/manifest.json` 补齐并解析。
- 16 个事件、144 个字段、138 条字段证据。
- 20 个出处抽查点。
- 10 个方向/前后值反转挑战用例，其中包含：普通增减持、静默反转、临近值、同股数比例被动稀释、前后列倒置、比率与股数冲突、日期/后值不足。
- 独立字段复核：`evidence/manual-review.json`，已人工逐字段复核 5 份文档、45 个字段。
- 上游真实输出对拍：`evidence/upstream-comparison.json`，当前已覆盖 6/10 份文档，12/12 个事件、所有字段 MATCH。

## 数据入口

- Manifest：`dev/manifest.json`
- 原始出处包：`dev/raw/D5-EQC-*.raw.json`
- Gold：`dev/gold/D5-EQC-*.envelope.json`
- 挑战：`challenges/direction-inversion-cases.json`

## D5 标注规则

1. `direction` 只能是 `increase` 或 `decrease`。
2. `shares_before` / `shares_after` 同时有值时，数值关系必须与方向一致；相等时不得仅凭股数自动推断方向。
3. `change_shares` 采用非负的变动股数绝对值；方向由 `direction` 承载。当前上游候选在部分事件中输出负数，比较器因此按绝对值对拍，并保留该语义边界。
4. 比例字段必须带 `denominator`；若披露的“变动前比例”和“变动后比例”使用了不同历史总股本口径，原文数值保留，但在 `note` 中标记口径差异。
5. 明确区间写入 `date_range`；只写“办理完成之日”而不给具体日期的，按 `needs_review` 处理。

## 验证

```powershell
node evaluation/D5/tests/validate-d5.mjs
node evaluation/D5/tests/compare-upstream-d5.mjs
```

当前结果：

- Gold 契约校验：PASS
- 10/10 文档、16/16 事件、144/144 字段通过结构检查
- 所有有值字段带出处，引文悬空 0
- 20/20 出处抽查点通过
- 10/10 方向反转挑战通过
- 上游 6 份真实输出对拍：MATCH，字段差异 0
- 4 份新增真实文档尚未进入上游生产批次，不能声称全队 10/10 端到端完成

## 合并前仍需队友完成

- 魏文宇：把 D5-EQC-007..010 接入真实批次，确认 `change_shares` 正负号是否采纳“绝对值”统一口径。
- 张智博：确认 4 份新增 `evidence/0.9` 解析包进入官方 D5 corpus/交付说明。
- 方轩诚：把前后股数、前后比例、方向冲突检查接入共享校验器；至少覆盖挑战文件中的 10 类情况。
- 陈佳辉：页面增加 before/after 并排展示、方向反转与口径冲突提示、证据展开。
- 第二人复核：从魏文宇/张智博中指定一人复核 4 份新增文档和绝对值口径。
