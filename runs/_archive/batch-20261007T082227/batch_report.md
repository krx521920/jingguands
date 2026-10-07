# 批量运行报告 20261007T082227

- 输入：35 份（成功 31）；契约校验问题合计 1 条
- 模式：真实模型调用

| 案例 | 类型 | run_id | 字段状态 | 校验问题 |
|---|---|---|---|---|
| note-unknown | ? | — | 失败 | — |
| pledge-corrupt | pledge | — | 失败 | — |
| D4-PLD-001 | pledge | 20261007T082227-pledge-c6d8 | {"extracted":36,"not_mentioned":3,"needs_review":3} | 0 |
| D4-PLD-002 | pledge | 20261007T082238-pledge-5fac | {"extracted":13,"not_mentioned":1} | 0 |
| D4-PLD-003 | pledge | 20261007T082242-pledge-32a9 | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-004 | pledge | 20261007T082246-pledge-d888 | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-005 | pledge | 20261007T082251-pledge-64ab | {"extracted":25,"not_mentioned":3} | 0 |
| D4-PLD-006 | pledge | 20261007T082258-pledge-9aa3 | {"extracted":13,"not_mentioned":1} | 0 |
| D4-PLD-007 | pledge | 20261007T082303-pledge-a919 | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-008 | pledge | 20261007T082307-pledge-c460 | {"extracted":11,"not_mentioned":2,"needs_review":1} | 0 |
| D4-PLD-009 | pledge | 20261007T082311-pledge-96e3 | {"extracted":44,"not_mentioned":12} | 0 |
| D4-PLD-010 | pledge | 20261007T082325-pledge-8740 | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D5-EQC-001 | equity_change | 20261007T082329-equity_change-6b83 | {"extracted":45} | 0 |
| D5-EQC-002 | equity_change | 20261007T082342-equity_change-f23e | {"extracted":27} | 0 |
| D5-EQC-003 | equity_change | 20261007T082402-equity_change-14f7 | {"extracted":5,"not_mentioned":4} | 0 |
| D5-EQC-004 | equity_change | 20261007T082406-equity_change-6f63 | {"extracted":8,"needs_review":1} | 0 |
| D5-EQC-005 | equity_change | 20261007T082409-equity_change-3f2a | {"extracted":8,"needs_review":1} | 0 |
| D5-EQC-006 | equity_change | 20261007T082413-equity_change-290d | {"extracted":9} | 0 |
| D5-EQC-007 | equity_change | 20261007T082416-equity_change-2dff | {"extracted":9} | 0 |
| D5-EQC-008 | equity_change | 20261007T082420-equity_change-fab1 | {"extracted":9} | 0 |
| D5-EQC-009 | equity_change | 20261007T082423-equity_change-af7d | {"extracted":9} | 0 |
| D5-EQC-010 | equity_change | 20261007T082426-equity_change-8d4d | {"extracted":8,"needs_review":1} | 0 |
| D6-AWD-001 | award_contract | 20261007T082432-award_contract-477a | {"extracted":5,"not_mentioned":6,"not_applicable":2,"not_disclosed":1} | 0 |
| D6-AWD-002 | award_contract | 20261007T082436-award_contract-cc45 | {"extracted":24,"not_mentioned":22,"not_applicable":8,"not_disclosed":2} | 0 |
| D6-AWD-003 | award_contract | 20261007T082447-award_contract-c4f0 | {"extracted":21,"not_mentioned":15,"not_applicable":6} | 0 |
| D6-AWD-004 | award_contract | 20261007T082457-award_contract-a88f | {"extracted":9,"not_applicable":2,"not_mentioned":3} | 0 |
| D6-AWD-005 | award_contract | 20261007T082502-award_contract-a9c6 | {"extracted":11,"not_mentioned":3} | 0 |
| D6-AWD-006 | award_contract | 20261007T082507-award_contract-fa48 | {"extracted":9,"not_mentioned":5} | 0 |
| D6-AWD-007 | award_contract | 20261007T082510-award_contract-90b2 | {"extracted":5,"not_mentioned":7,"not_applicable":2} | 0 |
| D6-AWD-008 | award_contract | 20261007T082514-award_contract-c2e5 | {"extracted":8,"not_mentioned":4,"not_applicable":2} | 0 |
| D6-AWD-009 | award_contract | 20261007T082518-award_contract-980e | {"extracted":21,"not_mentioned":15,"not_applicable":6} | 0 |
| D6-AWD-010 | award_contract | 20261007T082527-award_contract-3f09 | {"extracted":5,"not_disclosed":1,"not_mentioned":6,"not_applicable":2} | 0 |
| award-empty-text | award_contract | — | 失败 | — |
| pledge-empty | pledge | — | 失败 | — |
| pledge-scan-degrade | pledge | 20261007T082531-pledge-scan | {"unreadable":14} | 1 |

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
| D4-PLD-009 | 36 | 32 | 88.9% | 2 | 88.1% | 0 |
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

### 差异明细

**D4-PLD-009**

| 字段 | 判定 | 说明 |
|---|---|---|
| E03.end_date | WRONG_FILLED | gold=needs_review mine=extracted("2026-09-23") |
| E03.pledged_ratio_this_time_of_held | STATUS_DIFF | gold=extracted(5.98) mine=not_mentioned |
| E03.pledged_ratio_this_time_of_total | STATUS_DIFF | gold=extracted(1.24) mine=not_mentioned |
| E03.pledged_shares_this_time | VALUE_DIFF | gold=19254000 mine=18564000 |
| E03.pledgor | VALUE_DIFF | gold="有格创业投资有限公司" mine="有格投资" |
| (E04 有格创业投资有限公司) | MINE_EXTRA_EVENT | 系统多出的事件（键：有格创业投资有限公司\|\|release\|） |
