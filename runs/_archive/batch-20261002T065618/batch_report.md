# 批量运行报告 20261002T065618

- 输入：10 份（成功 10）；契约校验问题合计 0 条
- 模式：真实模型调用

| 案例 | 类型 | run_id | 字段状态 | 校验问题 |
|---|---|---|---|---|
| D5-EQC-001 | equity_change | 20261002T065618-equity_change-7a2a | {"extracted":45} | 0 |
| D5-EQC-002 | equity_change | 20261002T065630-equity_change-3764 | {"extracted":27} | 0 |
| D5-EQC-003 | equity_change | 20261002T065649-equity_change-a211 | {"extracted":5,"not_mentioned":4} | 0 |
| D5-EQC-004 | equity_change | 20261002T065652-equity_change-e7ea | {"extracted":8,"needs_review":1} | 0 |
| D5-EQC-005 | equity_change | 20261002T065655-equity_change-4a43 | {"extracted":8,"needs_review":1} | 0 |
| D5-EQC-006 | equity_change | 20261002T065659-equity_change-d241 | {"extracted":9} | 0 |
| D5-EQC-007 | equity_change | 20261002T065703-equity_change-bf1e | {"extracted":9} | 0 |
| D5-EQC-008 | equity_change | 20261002T065707-equity_change-20a9 | {"extracted":9} | 0 |
| D5-EQC-009 | equity_change | 20261002T065710-equity_change-3ee3 | {"extracted":9} | 0 |
| D5-EQC-010 | equity_change | 20261002T065713-equity_change-e4d5 | {"extracted":8,"needs_review":1} | 0 |

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
