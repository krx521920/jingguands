# 批量运行报告 20261006T085807

- 输入：35 份（成功 31）；契约校验问题合计 1 条
- 模式：真实模型调用

| 案例 | 类型 | run_id | 字段状态 | 校验问题 |
|---|---|---|---|---|
| D4-PLD-001 | pledge | 20261006T085807-pledge-aa0e | {"extracted":36,"not_mentioned":3,"needs_review":3} | 0 |
| D4-PLD-002 | pledge | 20261006T085807-pledge-1381 | {"extracted":13,"not_mentioned":1} | 0 |
| D4-PLD-003 | pledge | 20261006T085808-pledge-e078 | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-004 | pledge | 20261006T085808-pledge-99b9 | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-005 | pledge | 20261006T085808-pledge-4da9 | {"extracted":25,"not_mentioned":3} | 0 |
| D4-PLD-006 | pledge | 20261006T085808-pledge-3a36 | {"extracted":13,"not_mentioned":1} | 0 |
| D4-PLD-007 | pledge | 20261006T085808-pledge-9916 | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-008 | pledge | 20261006T085808-pledge-893e | {"extracted":11,"not_mentioned":2,"needs_review":1} | 0 |
| D4-PLD-009 | pledge | 20261006T085808-pledge-f3b5 | {"extracted":36,"not_mentioned":6} | 0 |
| D4-PLD-010 | pledge | 20261006T085808-pledge-8c35 | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D5-EQC-001 | equity_change | 20261006T085808-equity_change-5778 | {"extracted":45} | 0 |
| D5-EQC-002 | equity_change | 20261006T085808-equity_change-ae68 | {"extracted":27} | 0 |
| D5-EQC-003 | equity_change | 20261006T085809-equity_change-14e4 | {"extracted":5,"not_mentioned":4} | 0 |
| D5-EQC-004 | equity_change | 20261006T085809-equity_change-e235 | {"extracted":8,"needs_review":1} | 0 |
| D5-EQC-005 | equity_change | 20261006T085809-equity_change-b223 | {"extracted":8,"needs_review":1} | 0 |
| D5-EQC-006 | equity_change | 20261006T085809-equity_change-02d1 | {"extracted":9} | 0 |
| D5-EQC-007 | equity_change | 20261006T085809-equity_change-fa88 | {"extracted":9} | 0 |
| D5-EQC-008 | equity_change | 20261006T085809-equity_change-03b9 | {"extracted":9} | 0 |
| D5-EQC-009 | equity_change | 20261006T085809-equity_change-7d4e | {"extracted":9} | 0 |
| D5-EQC-010 | equity_change | 20261006T085809-equity_change-efc7 | {"extracted":8,"needs_review":1} | 0 |
| D6-AWD-001 | award_contract | 20261006T085809-award_contract-2da6 | {"extracted":5,"not_mentioned":6,"not_applicable":2,"not_disclosed":1} | 0 |
| D6-AWD-002 | award_contract | 20261006T085810-award_contract-3d86 | {"extracted":24,"not_mentioned":22,"not_applicable":8,"not_disclosed":2} | 0 |
| D6-AWD-003 | award_contract | 20261006T085810-award_contract-9fb2 | {"extracted":21,"not_mentioned":15,"not_applicable":6} | 0 |
| D6-AWD-004 | award_contract | 20261006T085810-award_contract-e1de | {"extracted":9,"not_applicable":2,"not_mentioned":3} | 0 |
| D6-AWD-005 | award_contract | 20261006T085810-award_contract-61fc | {"extracted":11,"not_mentioned":3} | 0 |
| D6-AWD-006 | award_contract | 20261006T085810-award_contract-3cfe | {"extracted":9,"not_mentioned":5} | 0 |
| D6-AWD-007 | award_contract | 20261006T085810-award_contract-af7b | {"extracted":5,"not_mentioned":7,"not_applicable":2} | 0 |
| D6-AWD-008 | award_contract | 20261006T085810-award_contract-4a53 | {"extracted":8,"not_mentioned":4,"not_applicable":2} | 0 |
| D6-AWD-009 | award_contract | 20261006T085810-award_contract-07ad | {"extracted":21,"not_mentioned":15,"not_applicable":6} | 0 |
| D6-AWD-010 | award_contract | 20261006T085810-award_contract-e3d9 | {"extracted":5,"not_disclosed":1,"not_mentioned":6,"not_applicable":2} | 0 |
| award-empty-text | award_contract | — | 失败 | — |
| note-unknown | ? | — | 失败 | — |
| pledge-corrupt | pledge | — | 失败 | — |
| pledge-empty | pledge | — | 失败 | — |
| pledge-scan-degrade | pledge | 20261006T085811-pledge-scan | {"unreadable":14} | 1 |

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
