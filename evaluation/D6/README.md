# D6 中标/合同开发集

## 交付

- 10份真实中标/合同公告。
- 17个事件（含同一公告多项目事件）。
- 238个字段。
- 125条字段证据。
- 20个出处抽查点。
- 结构、单位、字段注册和出处校验：PASS。
- 统一30份开发集：质押10 + 股权变动10 + 中标10。

## 数据入口

- 本类型Manifest：`dev/manifest.json`
- 原始出处包：`dev/raw/D6-AWD-*.raw.json`
- Gold：`dev/gold/D6-AWD-*.envelope.json`
- 统一30份Manifest：`../dev-30/manifest.json`
- 分类型基线报告：`../dev-30/baseline-report.md`

## Gold construction note

- `D6-AWD-001..008`: Gold candidates frozen from the committed upstream real envelopes, then checked field-by-field against source blocks and the contract registry.
- `D6-AWD-009..010`: manually annotated from source blocks because no committed upstream real run exists yet.
- This distinction matters: 8/10 have model-output coverage; 10/10 have Gold/evidence coverage.
## 当前上游覆盖

- 已提交的上游真实输出覆盖`D6-AWD-001..008`。
- `D6-AWD-009`（大丰实业，3项目）和`D6-AWD-010`（飞南资源，单一中标）已完成Gold与证据校验，但仍待上游补跑真实模型批次。
- 已对拍的8份中标文档：13个事件、92个有值字段，当前全部MATCH。

## 验证

```powershell
node evaluation/D6/tests/validate-d6.mjs
node evaluation/D6/tests/compare-upstream-d6.mjs
```
