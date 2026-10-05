# 批量运行报告 20260929T043809

- 输入：6 份（成功 6）；契约校验问题合计 0 条
- 模式：真实模型调用

| 案例 | 类型 | run_id | 字段状态 | 校验问题 |
|---|---|---|---|---|
| D2-AWD-001 | award_contract | 20260929T043809-award_contract-d618 | {"extracted":10,"not_applicable":2,"not_disclosed":2} | 0 |
| D2-AWD-002 | award_contract | 20260929T043813-award_contract-c5dc | {"extracted":10,"not_disclosed":4} | 0 |
| D2-EQC-001 | equity_change | 20260929T043816-equity_change-01cd | {"extracted":9} | 0 |
| D2-EQC-002 | equity_change | 20260929T043819-equity_change-f22d | {"extracted":9} | 0 |
| D2-PLD-001 | pledge | 20260929T043822-pledge-44ff | {"extracted":12,"not_mentioned":1} | 0 |
| D2-PLD-002 | pledge | 20260929T043825-pledge-bc00 | {"extracted":10,"not_mentioned":2,"needs_review":1} | 0 |

## Gold 对照（开发期错误定位；正式成绩以评测脚本为准）

| 案例 | gold应提取 | 值命中 | 字段准确率 | 错误填充 | 状态一致率 | gold不可支撑 |
|---|---|---|---|---|---|---|
| D2-AWD-001 | 10 | 10 | 100.0% | 0 | 100.0% | 0 |
| D2-AWD-002 | 10 | 10 | 100.0% | 0 | 100.0% | 0 |
| D2-EQC-001 | 9 | 8 | 88.9% | 0 | 88.9% | 0 |
| D2-EQC-002 | 8 | 8 | 100.0% | 1 | 88.9% | 0 |
| D2-PLD-001 | 12 | 12 | 100.0% | 0 | 100.0% | 0 |
| D2-PLD-002 | 10 | 10 | 100.0% | 0 | 100.0% | 0 |

### 差异明细

**D2-EQC-001**

| 字段 | 判定 | 说明 |
|---|---|---|
| change_date | VALUE_DIFF | gold="2026-09-10/2026-09-10" mine="2026-09-10" |

**D2-EQC-002**

| 字段 | 判定 | 说明 |
|---|---|---|
| change_date | WRONG_FILLED | gold=needs_review mine=extracted("2026-08-20/2026-08-31") |
