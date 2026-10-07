# 批量运行报告 20261007T084700

- 输入：35 份（成功 31）；契约校验问题合计 1 条
- 模式：真实模型调用

| 案例 | 类型 | run_id | 字段状态 | 校验问题 |
|---|---|---|---|---|
| note-unknown | ? | — | 失败 | — |
| pledge-corrupt | pledge | — | 失败 | — |
| D4-PLD-001 | pledge | 20261007T084700-pledge-c4bb | {"extracted":36,"not_mentioned":3,"needs_review":3} | 0 |
| D4-PLD-002 | pledge | 20261007T084700-pledge-b8bc | {"extracted":13,"not_mentioned":1} | 0 |
| D4-PLD-003 | pledge | 20261007T084700-pledge-d65c | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-004 | pledge | 20261007T084700-pledge-091f | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-005 | pledge | 20261007T084700-pledge-85fc | {"extracted":25,"not_mentioned":3} | 0 |
| D4-PLD-006 | pledge | 20261007T084700-pledge-fad6 | {"extracted":13,"not_mentioned":1} | 0 |
| D4-PLD-007 | pledge | 20261007T084700-pledge-16a0 | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-008 | pledge | 20261007T084700-pledge-ca13 | {"extracted":11,"not_mentioned":2,"needs_review":1} | 0 |
| D4-PLD-009 | pledge | 20261007T084700-pledge-0cd0 | {"extracted":36,"not_mentioned":6} | 0 |
| D4-PLD-010 | pledge | 20261007T084700-pledge-10a6 | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D5-EQC-001 | equity_change | 20261007T084700-equity_change-dfb3 | {"extracted":45} | 0 |
| D5-EQC-002 | equity_change | 20261007T084700-equity_change-80c3 | {"extracted":27} | 0 |
| D5-EQC-003 | equity_change | 20261007T084700-equity_change-a6f2 | {"extracted":5,"not_mentioned":4} | 0 |
| D5-EQC-004 | equity_change | 20261007T084700-equity_change-5365 | {"extracted":8,"needs_review":1} | 0 |
| D5-EQC-005 | equity_change | 20261007T084700-equity_change-5ae6 | {"extracted":8,"needs_review":1} | 0 |
| D5-EQC-006 | equity_change | 20261007T084700-equity_change-4f80 | {"extracted":9} | 0 |
| D5-EQC-007 | equity_change | 20261007T084701-equity_change-a334 | {"extracted":9} | 0 |
| D5-EQC-008 | equity_change | 20261007T084701-equity_change-64b8 | {"extracted":9} | 0 |
| D5-EQC-009 | equity_change | 20261007T084701-equity_change-e6dc | {"extracted":9} | 0 |
| D5-EQC-010 | equity_change | 20261007T084701-equity_change-b9c8 | {"extracted":8,"needs_review":1} | 0 |
| D6-AWD-001 | award_contract | 20261007T084701-award_contract-ae41 | {"extracted":5,"not_mentioned":6,"not_applicable":2,"not_disclosed":1} | 0 |
| D6-AWD-002 | award_contract | 20261007T084701-award_contract-0aa8 | {"extracted":24,"not_mentioned":20,"not_applicable":8,"not_disclosed":4} | 0 |
| D6-AWD-003 | award_contract | 20261007T084701-award_contract-8b0b | {"extracted":21,"not_mentioned":15,"not_applicable":6} | 0 |
| D6-AWD-004 | award_contract | 20261007T084701-award_contract-397c | {"extracted":9,"not_applicable":2,"not_mentioned":3} | 0 |
| D6-AWD-005 | award_contract | 20261007T084701-award_contract-1858 | {"extracted":11,"not_mentioned":3} | 0 |
| D6-AWD-006 | award_contract | 20261007T084701-award_contract-7a5e | {"extracted":9,"not_mentioned":5} | 0 |
| D6-AWD-007 | award_contract | 20261007T084701-award_contract-ebc7 | {"extracted":5,"not_mentioned":7,"not_applicable":2} | 0 |
| D6-AWD-008 | award_contract | 20261007T084701-award_contract-94b4 | {"extracted":8,"not_mentioned":4,"not_applicable":2} | 0 |
| D6-AWD-009 | award_contract | 20261007T084701-award_contract-4724 | {"extracted":21,"not_mentioned":15,"not_applicable":6} | 0 |
| D6-AWD-010 | award_contract | 20261007T084701-award_contract-9186 | {"extracted":5,"not_disclosed":1,"not_mentioned":6,"not_applicable":2} | 0 |
| award-empty-text | award_contract | — | 失败 | — |
| pledge-empty | pledge | — | 失败 | — |
| pledge-scan-degrade | pledge | 20261007T084701-pledge-scan | {"unreadable":14} | 1 |

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
| D4-PLD-010 | 12 | 11 | 91.7% | 0 | 92.9% | 0 |
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

**D4-PLD-010**

| 字段 | 判定 | 说明 |
|---|---|---|
| E01.pledgee | VALUE_DIFF | gold="中信银行宁波分行" mine="宁波分行" |
