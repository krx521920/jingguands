# 批量运行报告 20261007T084852

- 输入：35 份（成功 31）；契约校验问题合计 1 条
- 模式：真实模型调用

| 案例 | 类型 | run_id | 字段状态 | 校验问题 |
|---|---|---|---|---|
| note-unknown | ? | — | 失败 | — |
| pledge-corrupt | pledge | — | 失败 | — |
| D4-PLD-001 | pledge | 20261007T084852-pledge-9867 | {"extracted":36,"not_mentioned":3,"needs_review":3} | 0 |
| D4-PLD-002 | pledge | 20261007T084852-pledge-27d0 | {"extracted":13,"not_mentioned":1} | 0 |
| D4-PLD-003 | pledge | 20261007T084852-pledge-c26c | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-004 | pledge | 20261007T084852-pledge-f691 | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-005 | pledge | 20261007T084852-pledge-90b3 | {"extracted":25,"not_mentioned":3} | 0 |
| D4-PLD-006 | pledge | 20261007T084852-pledge-b2f6 | {"extracted":13,"not_mentioned":1} | 0 |
| D4-PLD-007 | pledge | 20261007T084852-pledge-760b | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-008 | pledge | 20261007T084852-pledge-7d6c | {"extracted":11,"not_mentioned":2,"needs_review":1} | 0 |
| D4-PLD-009 | pledge | 20261007T084852-pledge-2bc9 | {"extracted":36,"not_mentioned":6} | 0 |
| D4-PLD-010 | pledge | 20261007T084852-pledge-092d | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D5-EQC-001 | equity_change | 20261007T084852-equity_change-5815 | {"extracted":45} | 0 |
| D5-EQC-002 | equity_change | 20261007T084852-equity_change-72c1 | {"extracted":27} | 0 |
| D5-EQC-003 | equity_change | 20261007T084852-equity_change-21ea | {"extracted":5,"not_mentioned":4} | 0 |
| D5-EQC-004 | equity_change | 20261007T084852-equity_change-7e2f | {"extracted":8,"needs_review":1} | 0 |
| D5-EQC-005 | equity_change | 20261007T084852-equity_change-3479 | {"extracted":8,"needs_review":1} | 0 |
| D5-EQC-006 | equity_change | 20261007T084852-equity_change-586a | {"extracted":9} | 0 |
| D5-EQC-007 | equity_change | 20261007T084852-equity_change-7d95 | {"extracted":9} | 0 |
| D5-EQC-008 | equity_change | 20261007T084852-equity_change-5d06 | {"extracted":9} | 0 |
| D5-EQC-009 | equity_change | 20261007T084852-equity_change-64c4 | {"extracted":9} | 0 |
| D5-EQC-010 | equity_change | 20261007T084853-equity_change-61eb | {"extracted":8,"needs_review":1} | 0 |
| D6-AWD-001 | award_contract | 20261007T084853-award_contract-5a63 | {"extracted":5,"not_mentioned":6,"not_applicable":2,"not_disclosed":1} | 0 |
| D6-AWD-002 | award_contract | 20261007T084853-award_contract-b521 | {"extracted":24,"not_mentioned":20,"not_applicable":8,"not_disclosed":4} | 0 |
| D6-AWD-003 | award_contract | 20261007T084853-award_contract-21c0 | {"extracted":21,"not_mentioned":15,"not_applicable":6} | 0 |
| D6-AWD-004 | award_contract | 20261007T084853-award_contract-a99b | {"extracted":9,"not_applicable":2,"not_mentioned":3} | 0 |
| D6-AWD-005 | award_contract | 20261007T084853-award_contract-a1c6 | {"extracted":11,"not_mentioned":3} | 0 |
| D6-AWD-006 | award_contract | 20261007T084853-award_contract-7c5a | {"extracted":9,"not_mentioned":5} | 0 |
| D6-AWD-007 | award_contract | 20261007T084853-award_contract-6763 | {"extracted":5,"not_mentioned":7,"not_applicable":2} | 0 |
| D6-AWD-008 | award_contract | 20261007T084853-award_contract-0e0e | {"extracted":8,"not_mentioned":4,"not_applicable":2} | 0 |
| D6-AWD-009 | award_contract | 20261007T084853-award_contract-01d4 | {"extracted":21,"not_mentioned":15,"not_applicable":6} | 0 |
| D6-AWD-010 | award_contract | 20261007T084853-award_contract-2597 | {"extracted":5,"not_disclosed":1,"not_mentioned":6,"not_applicable":2} | 0 |
| award-empty-text | award_contract | — | 失败 | — |
| pledge-empty | pledge | — | 失败 | — |
| pledge-scan-degrade | pledge | 20261007T084853-pledge-scan | {"unreadable":14} | 1 |

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
| D6-AWD-007 | 5 | 5 | 100.0% | 0 | 100.0% | 0 |
| D6-AWD-008 | 8 | 8 | 100.0% | 0 | 100.0% | 0 |
| D6-AWD-009 | 21 | 21 | 100.0% | 0 | 100.0% | 0 |
| D6-AWD-010 | 5 | 5 | 100.0% | 0 | 100.0% | 0 |
