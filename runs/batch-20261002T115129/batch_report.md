# 批量运行报告 20261002T115129

- 输入：10 份（成功 10）；契约校验问题合计 0 条
- 模式：真实模型调用

| 案例 | 类型 | run_id | 字段状态 | 校验问题 |
|---|---|---|---|---|
| D5-EQC-001 | equity_change | 20261002T115129-equity_change-ccf1 | {"extracted":45} | 0 |
| D5-EQC-002 | equity_change | 20261002T115142-equity_change-c9f2 | {"extracted":27} | 0 |
| D5-EQC-003 | equity_change | 20261002T115200-equity_change-b768 | {"extracted":5,"not_mentioned":4} | 0 |
| D5-EQC-004 | equity_change | 20261002T115204-equity_change-5352 | {"extracted":8,"needs_review":1} | 0 |
| D5-EQC-005 | equity_change | 20261002T115207-equity_change-221b | {"extracted":8,"needs_review":1} | 0 |
| D5-EQC-006 | equity_change | 20261002T115210-equity_change-ed2b | {"extracted":9} | 0 |
| D5-EQC-007 | equity_change | 20261002T115215-equity_change-abed | {"extracted":9} | 0 |
| D5-EQC-008 | equity_change | 20261002T115218-equity_change-0a61 | {"extracted":9} | 0 |
| D5-EQC-009 | equity_change | 20261002T115222-equity_change-3e86 | {"extracted":9} | 0 |
| D5-EQC-010 | equity_change | 20261002T115225-equity_change-2d27 | {"extracted":8,"needs_review":1} | 0 |

## Gold 对照（开发期错误定位；正式成绩以评测脚本为准）

| 案例 | gold应提取 | 值命中 | 字段准确率 | 错误填充 | 状态一致率 | gold不可支撑 |
|---|---|---|---|---|---|---|
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
