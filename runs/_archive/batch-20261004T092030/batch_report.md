# 批量运行报告 20261004T092030

- 输入：35 份（成功 31）；契约校验问题合计 1 条
- 模式：真实模型调用

| 案例 | 类型 | run_id | 字段状态 | 校验问题 |
|---|---|---|---|---|
| D4-PLD-001 | pledge | 20261004T092030-pledge-e8d1 | {"extracted":36,"not_mentioned":3,"needs_review":3} | 0 |
| D4-PLD-002 | pledge | 20261004T092041-pledge-273b | {"extracted":13,"not_mentioned":1} | 0 |
| D4-PLD-003 | pledge | 20261004T092045-pledge-514c | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-004 | pledge | 20261004T092049-pledge-712b | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-005 | pledge | 20261004T092053-pledge-4c8d | {"extracted":25,"not_mentioned":3} | 0 |
| D4-PLD-006 | pledge | 20261004T092101-pledge-0ed4 | {"extracted":13,"not_mentioned":1} | 0 |
| D4-PLD-007 | pledge | 20261004T092105-pledge-893b | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-008 | pledge | 20261004T092109-pledge-f71d | {"extracted":11,"not_mentioned":2,"needs_review":1} | 0 |
| D4-PLD-009 | pledge | 20261004T092113-pledge-5b20 | {"extracted":36,"not_mentioned":5,"needs_review":1} | 0 |
| D4-PLD-010 | pledge | 20261004T092127-pledge-7f26 | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D5-EQC-001 | equity_change | 20261004T092131-equity_change-8e47 | {"extracted":45} | 0 |
| D5-EQC-002 | equity_change | 20261004T092144-equity_change-0a86 | {"extracted":27} | 0 |
| D5-EQC-003 | equity_change | 20261004T092202-equity_change-4914 | {"extracted":5,"not_mentioned":4} | 0 |
| D5-EQC-004 | equity_change | 20261004T092206-equity_change-9938 | {"extracted":8,"needs_review":1} | 0 |
| D5-EQC-005 | equity_change | 20261004T092209-equity_change-8601 | {"extracted":8,"needs_review":1} | 0 |
| D5-EQC-006 | equity_change | 20261004T092212-equity_change-20d5 | {"extracted":9} | 0 |
| D5-EQC-007 | equity_change | 20261004T092216-equity_change-3cac | {"extracted":9} | 0 |
| D5-EQC-008 | equity_change | 20261004T092220-equity_change-a62c | {"extracted":9} | 0 |
| D5-EQC-009 | equity_change | 20261004T092223-equity_change-ca9e | {"extracted":9} | 0 |
| D5-EQC-010 | equity_change | 20261004T092226-equity_change-3225 | {"extracted":8,"needs_review":1} | 0 |
| D6-AWD-001 | award_contract | 20261004T092232-award_contract-4eaf | {"extracted":5,"not_mentioned":6,"not_applicable":2,"not_disclosed":1} | 0 |
| D6-AWD-002 | award_contract | 20261004T092235-award_contract-32bc | {"extracted":24,"not_mentioned":22,"not_applicable":8,"not_disclosed":2} | 0 |
| D6-AWD-003 | award_contract | 20261004T092246-award_contract-3b4d | {"extracted":21,"not_mentioned":15,"not_applicable":6} | 0 |
| D6-AWD-004 | award_contract | 20261004T092256-award_contract-09cb | {"extracted":9,"not_applicable":2,"not_mentioned":3} | 0 |
| D6-AWD-005 | award_contract | 20261004T092300-award_contract-417a | {"extracted":11,"not_mentioned":3} | 0 |
| D6-AWD-006 | award_contract | 20261004T092305-award_contract-b417 | {"extracted":9,"not_mentioned":5} | 0 |
| D6-AWD-007 | award_contract | 20261004T092309-award_contract-6fb8 | {"extracted":5,"not_mentioned":7,"not_applicable":2} | 0 |
| D6-AWD-008 | award_contract | 20261004T092312-award_contract-cb4b | {"extracted":8,"not_mentioned":4,"not_applicable":2} | 0 |
| D6-AWD-009 | award_contract | 20261004T092316-award_contract-c27e | {"extracted":21,"not_mentioned":15,"not_applicable":6} | 0 |
| D6-AWD-010 | award_contract | 20261004T092325-award_contract-d288 | {"extracted":5,"not_disclosed":1,"not_mentioned":6,"not_applicable":2} | 0 |
| award-empty-text | award_contract | — | 失败 | — |
| note-unknown | ? | — | 失败 | — |
| pledge-corrupt | pledge | — | 失败 | — |
| pledge-empty | pledge | — | 失败 | — |
| pledge-scan-degrade | pledge | 20261004T092329-pledge-scan | {"unreadable":14} | 1 |

## Gold 对照（开发期错误定位；正式成绩以评测脚本为准）

| 案例 | gold应提取 | 值命中 | 字段准确率 | 错误填充 | 状态一致率 | gold不可支撑 |
|---|---|---|---|---|---|---|
| D4-PLD-001 | 36 | 36 | 100.0% | 0 | 100.0% | 0 |
| D4-PLD-002 | 13 | 13 | 100.0% | 0 | 100.0% | 0 |
| D4-PLD-003 | 12 | 12 | 100.0% | 0 | 100.0% | 0 |
| D4-PLD-004 | 12 | 12 | 100.0% | 0 | 100.0% | 0 |
| D4-PLD-005 | 25 | 25 | 100.0% | 0 | 100.0% | 0 |
| D4-PLD-006 | 13 | 13 | 100.0% | 0 | 100.0% | 0 |
| D4-PLD-007 | 12 | 12 | 100.0% | 0 | 100.0% | 0 |
| D4-PLD-008 | 11 | 11 | 100.0% | 0 | 100.0% | 0 |
| D4-PLD-009 | 36 | 36 | 100.0% | 0 | 100.0% | 0 |
| D4-PLD-010 | 12 | 12 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-001 | 45 | 45 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-002 | 27 | 27 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-003 | 5 | 5 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-004 | 8 | 8 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-005 | 8 | 8 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-006 | 9 | 9 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-007 | 9 | 9 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-008 | 9 | 9 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-009 | 9 | 9 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-010 | 8 | 8 | 100.0% | 0 | 100.0% | 0 |
| D6-AWD-001 | 5 | 5 | 100.0% | 0 | 100.0% | 0 |
| D6-AWD-002 | 24 | 24 | 100.0% | 0 | 100.0% | 0 |
| D6-AWD-003 | 21 | 21 | 100.0% | 0 | 100.0% | 0 |
| D6-AWD-004 | 9 | 9 | 100.0% | 0 | 100.0% | 0 |
| D6-AWD-005 | 11 | 11 | 100.0% | 0 | 100.0% | 0 |
| D6-AWD-006 | 9 | 9 | 100.0% | 0 | 100.0% | 0 |
| D6-AWD-007 | 5 | 4 | 80.0% | 0 | 92.9% | 0 |
| D6-AWD-008 | 8 | 8 | 100.0% | 0 | 100.0% | 0 |
| D6-AWD-009 | 21 | 21 | 100.0% | 0 | 100.0% | 0 |
| D6-AWD-010 | 5 | 5 | 100.0% | 0 | 100.0% | 0 |

### 差异明细

**D6-AWD-007**

| 字段 | 判定 | 说明 |
|---|---|---|
| E01.bid_amount | VALUE_DIFF | gold=173800000 mine=317915000 |
