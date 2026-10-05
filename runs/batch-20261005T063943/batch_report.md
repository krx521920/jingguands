# 批量运行报告 20261005T063943

- 输入：35 份（成功 31）；契约校验问题合计 1 条
- 模式：真实模型调用

| 案例 | 类型 | run_id | 字段状态 | 校验问题 |
|---|---|---|---|---|
| D4-PLD-001 | pledge | 20261005T063943-pledge-3118 | {"extracted":36,"not_mentioned":3,"needs_review":3} | 0 |
| D4-PLD-002 | pledge | 20261005T063954-pledge-f807 | {"extracted":13,"not_mentioned":1} | 0 |
| D4-PLD-003 | pledge | 20261005T063958-pledge-1eeb | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-004 | pledge | 20261005T064002-pledge-0541 | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-005 | pledge | 20261005T064007-pledge-f789 | {"extracted":25,"not_mentioned":3} | 0 |
| D4-PLD-006 | pledge | 20261005T064014-pledge-4d94 | {"extracted":13,"not_mentioned":1} | 0 |
| D4-PLD-007 | pledge | 20261005T064018-pledge-f07e | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-008 | pledge | 20261005T064022-pledge-bf11 | {"extracted":11,"not_mentioned":2,"needs_review":1} | 0 |
| D4-PLD-009 | pledge | 20261005T064026-pledge-17cf | {"extracted":36,"not_mentioned":5,"needs_review":1} | 0 |
| D4-PLD-010 | pledge | 20261005T064039-pledge-33fe | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D5-EQC-001 | equity_change | 20261005T064044-equity_change-0236 | {"extracted":45} | 0 |
| D5-EQC-002 | equity_change | 20261005T064056-equity_change-18f6 | {"extracted":27} | 0 |
| D5-EQC-003 | equity_change | 20261005T064114-equity_change-64fd | {"extracted":5,"not_mentioned":4} | 0 |
| D5-EQC-004 | equity_change | 20261005T064118-equity_change-6960 | {"extracted":8,"needs_review":1} | 0 |
| D5-EQC-005 | equity_change | 20261005T064122-equity_change-7058 | {"extracted":8,"needs_review":1} | 0 |
| D5-EQC-006 | equity_change | 20261005T064125-equity_change-9696 | {"extracted":9} | 0 |
| D5-EQC-007 | equity_change | 20261005T064129-equity_change-6038 | {"extracted":9} | 0 |
| D5-EQC-008 | equity_change | 20261005T064132-equity_change-8227 | {"extracted":9} | 0 |
| D5-EQC-009 | equity_change | 20261005T064136-equity_change-b71d | {"extracted":9} | 0 |
| D5-EQC-010 | equity_change | 20261005T064139-equity_change-8e57 | {"extracted":8,"needs_review":1} | 0 |
| D6-AWD-001 | award_contract | 20261005T064144-award_contract-ba9f | {"extracted":5,"not_mentioned":6,"not_applicable":2,"not_disclosed":1} | 0 |
| D6-AWD-002 | award_contract | 20261005T064148-award_contract-a2e1 | {"extracted":24,"not_mentioned":20,"not_applicable":8,"not_disclosed":4} | 0 |
| D6-AWD-003 | award_contract | 20261005T064159-award_contract-4874 | {"extracted":21,"not_mentioned":12,"not_applicable":6,"not_disclosed":3} | 0 |
| D6-AWD-004 | award_contract | 20261005T064209-award_contract-b64a | {"extracted":9,"not_applicable":2,"not_mentioned":3} | 0 |
| D6-AWD-005 | award_contract | 20261005T064213-award_contract-94e2 | {"extracted":11,"not_mentioned":3} | 0 |
| D6-AWD-006 | award_contract | 20261005T064219-award_contract-9fb0 | {"extracted":9,"not_mentioned":5} | 0 |
| D6-AWD-007 | award_contract | 20261005T064223-award_contract-3237 | {"extracted":5,"not_mentioned":7,"not_applicable":2} | 0 |
| D6-AWD-008 | award_contract | 20261005T064226-award_contract-0f59 | {"extracted":8,"not_mentioned":4,"not_applicable":2} | 0 |
| D6-AWD-009 | award_contract | 20261005T064230-award_contract-b0d1 | {"extracted":21,"not_mentioned":15,"not_applicable":6} | 0 |
| D6-AWD-010 | award_contract | 20261005T064239-award_contract-f26a | {"extracted":5,"not_disclosed":1,"not_mentioned":6,"not_applicable":2} | 0 |
| award-empty-text | award_contract | — | 失败 | — |
| note-unknown | ? | — | 失败 | — |
| pledge-corrupt | pledge | — | 失败 | — |
| pledge-empty | pledge | — | 失败 | — |
| pledge-scan-degrade | pledge | 20261005T064242-pledge-scan | {"unreadable":14} | 1 |

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
