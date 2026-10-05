# 批量运行报告 20260929T043422

- 输入：6 份（成功 6）；契约校验问题合计 0 条
- 模式：真实模型调用

| 案例 | 类型 | run_id | 字段状态 | 校验问题 |
|---|---|---|---|---|
| D2-AWD-001 | award_contract | 20260929T043422-award_contract-9724 | {"extracted":10,"not_applicable":2,"not_disclosed":2} | 0 |
| D2-AWD-002 | award_contract | 20260929T043425-award_contract-e4d5 | {"extracted":10,"not_disclosed":4} | 0 |
| D2-EQC-001 | equity_change | 20260929T043429-equity_change-a849 | {"extracted":9} | 0 |
| D2-EQC-002 | equity_change | 20260929T043432-equity_change-af89 | {"extracted":9} | 0 |
| D2-PLD-001 | pledge | 20260929T043434-pledge-488d | {"extracted":12,"not_mentioned":1} | 0 |
| D2-PLD-002 | pledge | 20260929T043438-pledge-5ea3 | {"extracted":10,"not_mentioned":2,"needs_review":1} | 0 |

## Gold 对照（开发期错误定位；正式成绩以评测脚本为准）

| 案例 | gold应提取 | 值命中 | 字段准确率 | 错误填充 | 状态一致率 | gold不可支撑 |
|---|---|---|---|---|---|---|
| D2-AWD-001 | 10 | 6 | 60.0% | 0 | 71.4% | 0 |
| D2-AWD-002 | 10 | 8 | 80.0% | 0 | 85.7% | 0 |
| D2-EQC-001 | 9 | 8 | 88.9% | 0 | 88.9% | 0 |
| D2-EQC-002 | 8 | 8 | 100.0% | 1 | 88.9% | 0 |
| D2-PLD-001 | 12 | 12 | 100.0% | 0 | 100.0% | 0 |
| D2-PLD-002 | 10 | 10 | 100.0% | 0 | 100.0% | 0 |

### 差异明细

**D2-AWD-001**

| 字段 | 判定 | 说明 |
|---|---|---|
| contract_signed | VALUE_DIFF | gold="true" mine=true |
| currency | VALUE_DIFF | gold="CNY" mine="人民币" |
| formal_award_notice_received | VALUE_DIFF | gold="true" mine=true |
| tax_included | VALUE_DIFF | gold="true" mine="含税" |

**D2-AWD-002**

| 字段 | 判定 | 说明 |
|---|---|---|
| currency | VALUE_DIFF | gold="CNY" mine="人民币" |
| tax_included | VALUE_DIFF | gold="false" mine="不含税" |

**D2-EQC-001**

| 字段 | 判定 | 说明 |
|---|---|---|
| change_date | VALUE_DIFF | gold="2026-09-10/2026-09-10" mine="2026-09-10" |

**D2-EQC-002**

| 字段 | 判定 | 说明 |
|---|---|---|
| change_date | WRONG_FILLED | gold=needs_review mine=extracted("2026-08-20/2026-08-31") |
