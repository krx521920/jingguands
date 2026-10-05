# 批量运行报告 20261001T094559

- 输入：10 份（成功 10）；契约校验问题合计 1 条
- 模式：真实模型调用

| 案例 | 类型 | run_id | 字段状态 | 校验问题 |
|---|---|---|---|---|
| D4-PLD-001 | pledge | 20261001T094559-pledge-083b | {"extracted":36,"not_mentioned":3,"needs_review":3} | 0 |
| D4-PLD-002 | pledge | 20261001T094610-pledge-7a75 | {"extracted":13,"not_mentioned":1} | 0 |
| D4-PLD-003 | pledge | 20261001T094614-pledge-cc5c | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-004 | pledge | 20261001T094618-pledge-86c3 | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-005 | pledge | 20261001T094622-pledge-4363 | {"extracted":25,"not_mentioned":3} | 0 |
| D4-PLD-006 | pledge | 20261001T094629-pledge-0a19 | {"extracted":13,"not_mentioned":1} | 0 |
| D4-PLD-007 | pledge | 20261001T094633-pledge-808f | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-008 | pledge | 20261001T094637-pledge-7b79 | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-009 | pledge | 20261001T094642-pledge-591b | {"extracted":37,"not_mentioned":5} | 1 |
| D4-PLD-010 | pledge | 20261001T094652-pledge-4548 | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |

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
| D4-PLD-008 | 11 | 11 | 100.0% | 1 | 92.9% | 0 |
| D4-PLD-009 | 36 | 36 | 100.0% | 1 | 97.6% | 0 |
| D4-PLD-010 | 12 | 12 | 100.0% | 0 | 100.0% | 0 |

### 差异明细

**D4-PLD-008**

| 字段 | 判定 | 说明 |
|---|---|---|
| E01.announcement_date | WRONG_FILLED | gold=not_mentioned mine=extracted("2026-09-25") |

**D4-PLD-009**

| 字段 | 判定 | 说明 |
|---|---|---|
| E03.start_date | WRONG_FILLED | gold=not_mentioned mine=extracted("2026-09-22/2026-09-23") |
