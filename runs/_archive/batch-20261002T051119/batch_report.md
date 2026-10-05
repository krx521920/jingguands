# 批量运行报告 20261002T051119

- 输入：10 份（成功 10）；契约校验问题合计 0 条
- 模式：真实模型调用

| 案例 | 类型 | run_id | 字段状态 | 校验问题 |
|---|---|---|---|---|
| D5-EQC-001 | equity_change | 20261002T051119-equity_change-6783 | {"extracted":45} | 0 |
| D5-EQC-002 | equity_change | 20261002T051132-equity_change-83b5 | {"extracted":27} | 0 |
| D5-EQC-003 | equity_change | 20261002T051150-equity_change-486d | {"extracted":5,"not_mentioned":4} | 0 |
| D5-EQC-004 | equity_change | 20261002T051153-equity_change-8c06 | {"extracted":8,"needs_review":1} | 0 |
| D5-EQC-005 | equity_change | 20261002T051157-equity_change-e279 | {"extracted":8,"needs_review":1} | 0 |
| D5-EQC-006 | equity_change | 20261002T051200-equity_change-ae05 | {"extracted":9} | 0 |
| D5-EQC-007 | equity_change | 20261002T051204-equity_change-b7cf | {"extracted":9} | 0 |
| D5-EQC-008 | equity_change | 20261002T051208-equity_change-69de | {"extracted":9} | 0 |
| D5-EQC-009 | equity_change | 20261002T051211-equity_change-9e41 | {"extracted":9} | 0 |
| D5-EQC-010 | equity_change | 20261002T051214-equity_change-72a2 | {"extracted":8,"needs_review":1} | 0 |

## Gold 对照（开发期错误定位；正式成绩以评测脚本为准）

| 案例 | gold应提取 | 值命中 | 字段准确率 | 错误填充 | 状态一致率 | gold不可支撑 |
|---|---|---|---|---|---|---|
| D5-EQC-001 | 45 | 45 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-002 | 23 | 23 | 100.0% | 4 | 85.2% | 0 |
| D5-EQC-003 | 5 | 5 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-004 | 8 | 8 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-005 | 8 | 8 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-006 | 9 | 9 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-007 | 9 | 9 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-008 | 9 | 9 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-009 | 9 | 9 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-010 | 8 | 8 | 100.0% | 0 | 100.0% | 0 |

### 差异明细

**D5-EQC-002**

| 字段 | 判定 | 说明 |
|---|---|---|
| E02.ratio_after | WRONG_FILLED | gold=not_mentioned mine=extracted(12.84) |
| E02.shares_after | WRONG_FILLED | gold=not_mentioned mine=extracted(11042217) |
| E03.ratio_after | WRONG_FILLED | gold=not_mentioned mine=extracted(2.15) |
| E03.shares_after | WRONG_FILLED | gold=not_mentioned mine=extracted(1848404) |
