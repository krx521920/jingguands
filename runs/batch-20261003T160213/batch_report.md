# 批量运行报告 20261003T160213

- 输入：35 份（成功 31）；契约校验问题合计 1 条
- 模式：真实模型调用

| 案例 | 类型 | run_id | 字段状态 | 校验问题 |
|---|---|---|---|---|
| D4-PLD-001 | pledge | 20261003T160213-pledge-f715 | {"extracted":36,"not_mentioned":3,"needs_review":3} | 0 |
| D4-PLD-002 | pledge | 20261003T160224-pledge-94cf | {"extracted":13,"not_mentioned":1} | 0 |
| D4-PLD-003 | pledge | 20261003T160229-pledge-6317 | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-004 | pledge | 20261003T160234-pledge-b2d9 | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-005 | pledge | 20261003T160238-pledge-b56c | {"extracted":25,"not_mentioned":3} | 0 |
| D4-PLD-006 | pledge | 20261003T160246-pledge-568f | {"extracted":13,"not_mentioned":1} | 0 |
| D4-PLD-007 | pledge | 20261003T160251-pledge-8a61 | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-008 | pledge | 20261003T160255-pledge-33a6 | {"extracted":11,"not_mentioned":2,"needs_review":1} | 0 |
| D4-PLD-009 | pledge | 20261003T160300-pledge-0637 | {"extracted":36,"not_mentioned":5,"needs_review":1} | 0 |
| D4-PLD-010 | pledge | 20261003T160314-pledge-0e2a | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D5-EQC-001 | equity_change | 20261003T160318-equity_change-4d60 | {"extracted":45} | 0 |
| D5-EQC-002 | equity_change | 20261003T160331-equity_change-2b59 | {"extracted":27} | 0 |
| D5-EQC-003 | equity_change | 20261003T160350-equity_change-7ce5 | {"extracted":5,"not_mentioned":4} | 0 |
| D5-EQC-004 | equity_change | 20261003T160354-equity_change-caaa | {"extracted":8,"needs_review":1} | 0 |
| D5-EQC-005 | equity_change | 20261003T160357-equity_change-7836 | {"extracted":8,"needs_review":1} | 0 |
| D5-EQC-006 | equity_change | 20261003T160402-equity_change-e637 | {"extracted":9} | 0 |
| D5-EQC-007 | equity_change | 20261003T160405-equity_change-878d | {"extracted":9} | 0 |
| D5-EQC-008 | equity_change | 20261003T160409-equity_change-f43a | {"extracted":9} | 0 |
| D5-EQC-009 | equity_change | 20261003T160412-equity_change-1b2b | {"extracted":9} | 0 |
| D5-EQC-010 | equity_change | 20261003T160416-equity_change-6b42 | {"extracted":8,"needs_review":1} | 0 |
| D6-AWD-001 | award_contract | 20261003T160422-award_contract-30d6 | {"extracted":5,"not_mentioned":6,"not_applicable":2,"not_disclosed":1} | 0 |
| D6-AWD-002 | award_contract | 20261003T160425-award_contract-9d79 | {"extracted":24,"not_mentioned":22,"not_applicable":8,"not_disclosed":2} | 0 |
| D6-AWD-003 | award_contract | 20261003T160437-award_contract-d295 | {"extracted":21,"not_mentioned":15,"not_applicable":6} | 0 |
| D6-AWD-004 | award_contract | 20261003T160447-award_contract-b099 | {"extracted":9,"not_applicable":2,"not_mentioned":3} | 0 |
| D6-AWD-005 | award_contract | 20261003T160452-award_contract-acc3 | {"extracted":11,"not_mentioned":3} | 0 |
| D6-AWD-006 | award_contract | 20261003T160456-award_contract-e4c6 | {"extracted":9,"not_mentioned":5} | 0 |
| D6-AWD-007 | award_contract | 20261003T160501-award_contract-028a | {"extracted":5,"not_mentioned":7,"not_applicable":2} | 0 |
| D6-AWD-008 | award_contract | 20261003T160504-award_contract-9c73 | {"extracted":8,"not_mentioned":4,"not_applicable":2} | 0 |
| D6-AWD-009 | award_contract | 20261003T160508-award_contract-e2f8 | {"extracted":21,"not_mentioned":15,"not_applicable":6} | 0 |
| D6-AWD-010 | award_contract | 20261003T160517-award_contract-8eae | {"extracted":5,"not_disclosed":1,"not_mentioned":6,"not_applicable":2} | 0 |
| award-empty-text | award_contract | — | 失败 | — |
| note-unknown | ? | — | 失败 | — |
| pledge-corrupt | pledge | — | 失败 | — |
| pledge-empty | pledge | — | 失败 | — |
| pledge-scan-degrade | pledge | 20261003T160521-pledge-scan | {"unreadable":14} | 1 |

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
