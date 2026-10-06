# 批量运行报告 20261006T083905

- 输入：35 份（成功 31）；契约校验问题合计 1 条
- 模式：真实模型调用

| 案例 | 类型 | run_id | 字段状态 | 校验问题 |
|---|---|---|---|---|
| D4-PLD-001 | pledge | 20261006T083905-pledge-c4ed | {"extracted":36,"not_mentioned":3,"needs_review":3} | 0 |
| D4-PLD-002 | pledge | 20261006T083916-pledge-d43d | {"extracted":13,"not_mentioned":1} | 0 |
| D4-PLD-003 | pledge | 20261006T083920-pledge-7471 | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-004 | pledge | 20261006T083924-pledge-c99d | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-005 | pledge | 20261006T083928-pledge-42fb | {"extracted":25,"not_mentioned":3} | 0 |
| D4-PLD-006 | pledge | 20261006T083936-pledge-13b7 | {"extracted":13,"not_mentioned":1} | 0 |
| D4-PLD-007 | pledge | 20261006T083940-pledge-686f | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-008 | pledge | 20261006T083944-pledge-65c0 | {"extracted":11,"not_mentioned":2,"needs_review":1} | 0 |
| D4-PLD-009 | pledge | 20261006T083949-pledge-85cc | {"extracted":36,"not_mentioned":6} | 0 |
| D4-PLD-010 | pledge | 20261006T084000-pledge-5990 | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D5-EQC-001 | equity_change | 20261006T084004-equity_change-48f1 | {"extracted":45} | 0 |
| D5-EQC-002 | equity_change | 20261006T084017-equity_change-2467 | {"extracted":27} | 0 |
| D5-EQC-003 | equity_change | 20261006T084036-equity_change-6a70 | {"extracted":5,"not_mentioned":4} | 0 |
| D5-EQC-004 | equity_change | 20261006T084039-equity_change-abce | {"extracted":8,"needs_review":1} | 0 |
| D5-EQC-005 | equity_change | 20261006T084043-equity_change-930f | {"extracted":8,"needs_review":1} | 0 |
| D5-EQC-006 | equity_change | 20261006T084047-equity_change-fbee | {"extracted":9} | 0 |
| D5-EQC-007 | equity_change | 20261006T084050-equity_change-4872 | {"extracted":9} | 0 |
| D5-EQC-008 | equity_change | 20261006T084054-equity_change-de78 | {"extracted":9} | 0 |
| D5-EQC-009 | equity_change | 20261006T084057-equity_change-d9ce | {"extracted":9} | 0 |
| D5-EQC-010 | equity_change | 20261006T084100-equity_change-7374 | {"extracted":8,"needs_review":1} | 0 |
| D6-AWD-001 | award_contract | 20261006T084106-award_contract-05b9 | {"extracted":5,"not_mentioned":6,"not_applicable":2,"not_disclosed":1} | 0 |
| D6-AWD-002 | award_contract | 20261006T084109-award_contract-67cf | {"extracted":24,"not_mentioned":22,"not_applicable":8,"not_disclosed":2} | 0 |
| D6-AWD-003 | award_contract | 20261006T084121-award_contract-705d | {"extracted":21,"not_mentioned":15,"not_applicable":6} | 0 |
| D6-AWD-004 | award_contract | 20261006T084131-award_contract-1636 | {"extracted":9,"not_applicable":2,"not_mentioned":3} | 0 |
| D6-AWD-005 | award_contract | 20261006T084136-award_contract-f4dc | {"extracted":11,"not_mentioned":3} | 0 |
| D6-AWD-006 | award_contract | 20261006T084141-award_contract-5bb7 | {"extracted":9,"not_mentioned":5} | 0 |
| D6-AWD-007 | award_contract | 20261006T084144-award_contract-cd70 | {"extracted":5,"not_mentioned":7,"not_applicable":2} | 0 |
| D6-AWD-008 | award_contract | 20261006T084148-award_contract-a824 | {"extracted":8,"not_mentioned":4,"not_applicable":2} | 0 |
| D6-AWD-009 | award_contract | 20261006T084153-award_contract-cd3a | {"extracted":21,"not_mentioned":15,"not_applicable":6} | 0 |
| D6-AWD-010 | award_contract | 20261006T084202-award_contract-7481 | {"extracted":5,"not_disclosed":1,"not_mentioned":6,"not_applicable":2} | 0 |
| award-empty-text | award_contract | — | 失败 | — |
| note-unknown | ? | — | 失败 | — |
| pledge-corrupt | pledge | — | 失败 | — |
| pledge-empty | pledge | — | 失败 | — |
| pledge-scan-degrade | pledge | 20261006T084206-pledge-scan | {"unreadable":14} | 1 |

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
