# 批量运行报告 20261004T093750

- 输入：35 份（成功 31）；契约校验问题合计 1 条
- 模式：真实模型调用

| 案例 | 类型 | run_id | 字段状态 | 校验问题 |
|---|---|---|---|---|
| D4-PLD-001 | pledge | 20261004T093750-pledge-4ba4 | {"extracted":36,"not_mentioned":3,"needs_review":3} | 0 |
| D4-PLD-002 | pledge | 20261004T093800-pledge-751d | {"extracted":13,"not_mentioned":1} | 0 |
| D4-PLD-003 | pledge | 20261004T093804-pledge-bbbf | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-004 | pledge | 20261004T093809-pledge-96f1 | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-005 | pledge | 20261004T093813-pledge-4fc4 | {"extracted":25,"not_mentioned":3} | 0 |
| D4-PLD-006 | pledge | 20261004T093820-pledge-105e | {"extracted":13,"not_mentioned":1} | 0 |
| D4-PLD-007 | pledge | 20261004T093824-pledge-97a0 | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-008 | pledge | 20261004T093829-pledge-4373 | {"extracted":11,"not_mentioned":2,"needs_review":1} | 0 |
| D4-PLD-009 | pledge | 20261004T093833-pledge-b353 | {"extracted":36,"not_mentioned":6} | 0 |
| D4-PLD-010 | pledge | 20261004T093844-pledge-d594 | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D5-EQC-001 | equity_change | 20261004T093848-equity_change-eec5 | {"extracted":45} | 0 |
| D5-EQC-002 | equity_change | 20261004T093901-equity_change-8518 | {"extracted":27} | 0 |
| D5-EQC-003 | equity_change | 20261004T093920-equity_change-17aa | {"extracted":5,"not_mentioned":4} | 0 |
| D5-EQC-004 | equity_change | 20261004T093923-equity_change-4807 | {"extracted":8,"needs_review":1} | 0 |
| D5-EQC-005 | equity_change | 20261004T093927-equity_change-3261 | {"extracted":8,"needs_review":1} | 0 |
| D5-EQC-006 | equity_change | 20261004T093930-equity_change-28e5 | {"extracted":9} | 0 |
| D5-EQC-007 | equity_change | 20261004T093934-equity_change-99b5 | {"extracted":9} | 0 |
| D5-EQC-008 | equity_change | 20261004T093937-equity_change-9e65 | {"extracted":9} | 0 |
| D5-EQC-009 | equity_change | 20261004T093940-equity_change-b8c8 | {"extracted":9} | 0 |
| D5-EQC-010 | equity_change | 20261004T093944-equity_change-38cc | {"extracted":8,"needs_review":1} | 0 |
| D6-AWD-001 | award_contract | 20261004T093949-award_contract-23ab | {"extracted":5,"not_mentioned":6,"not_applicable":2,"not_disclosed":1} | 0 |
| D6-AWD-002 | award_contract | 20261004T093952-award_contract-09f8 | {"extracted":24,"not_mentioned":22,"not_applicable":8,"not_disclosed":2} | 0 |
| D6-AWD-003 | award_contract | 20261004T094004-award_contract-1482 | {"extracted":21,"not_mentioned":15,"not_applicable":6} | 0 |
| D6-AWD-004 | award_contract | 20261004T094013-award_contract-673f | {"extracted":9,"not_applicable":2,"not_mentioned":3} | 0 |
| D6-AWD-005 | award_contract | 20261004T094018-award_contract-8958 | {"extracted":11,"not_mentioned":3} | 0 |
| D6-AWD-006 | award_contract | 20261004T094022-award_contract-803d | {"extracted":9,"not_mentioned":5} | 0 |
| D6-AWD-007 | award_contract | 20261004T094026-award_contract-84f5 | {"extracted":5,"not_mentioned":7,"not_applicable":2} | 0 |
| D6-AWD-008 | award_contract | 20261004T094029-award_contract-80a9 | {"extracted":8,"not_mentioned":4,"not_applicable":2} | 0 |
| D6-AWD-009 | award_contract | 20261004T094034-award_contract-bb57 | {"extracted":21,"not_mentioned":15,"not_applicable":6} | 0 |
| D6-AWD-010 | award_contract | 20261004T094043-award_contract-1a94 | {"extracted":5,"not_disclosed":1,"not_mentioned":6,"not_applicable":2} | 0 |
| award-empty-text | award_contract | — | 失败 | — |
| note-unknown | ? | — | 失败 | — |
| pledge-corrupt | pledge | — | 失败 | — |
| pledge-empty | pledge | — | 失败 | — |
| pledge-scan-degrade | pledge | 20261004T094046-pledge-scan | {"unreadable":14} | 1 |

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
