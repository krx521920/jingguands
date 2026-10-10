# D6 中标/合同开发集

## 交付

- 10份真实中标/合同公告。
- 17个事件（含同一公告多项目事件）。
- 238个字段。
- 125条字段证据。
- 20个出处抽查点。
- 结构、单位、字段注册和出处校验：PASS。
- 统一30份开发集：质押10 + 股权变动10 + 中标10。

## Gold构建说明

- `D6-AWD-001..008`：基于已提交上游真实信封冻结，并逐字段核对原文块和契约。
- `D6-AWD-009..010`：直接按原文块手工标注。
- `D6-AWD-002 E03/E04`的`formal_award_notice_received`按原文未说明处理为`not_mentioned`。

## 解析/出处抽查\n\n- 张侧D6解析包与评测侧原始包：10/10源哈希一致、10/10为`evidence/0.9`。\n- 20个出处抽查点：20/20通过。\n\n## 最新上游对拍

- 最新批次：`runs/batch-20261002T051220`。
- 10/10文档、17/17事件、118/118有值字段、0校验问题、MATCH。
- `true/false`文本型布尔值按语义归一后比较。

## 验证

```powershell
node evaluation/D6/tests/validate-d6.mjs
node evaluation/D6/tests/compare-upstream-d6.mjs
```
