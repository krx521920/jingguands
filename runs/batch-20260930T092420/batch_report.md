# 批量运行报告 20260930T092420

- 输入：10 份（成功 10）；契约校验问题合计 0 条
- 模式：真实模型调用

| 案例 | 类型 | run_id | 字段状态 | 校验问题 |
|---|---|---|---|---|
| D4-PLD-001 | pledge | 20260930T092420-pledge-799c | {"extracted":36,"not_mentioned":3,"needs_review":3} | 0 |
| D4-PLD-002 | pledge | 20260930T092430-pledge-6575 | {"extracted":13,"not_mentioned":1} | 0 |
| D4-PLD-003 | pledge | 20260930T092435-pledge-da3c | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-004 | pledge | 20260930T092438-pledge-6983 | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-005 | pledge | 20260930T092442-pledge-5841 | {"extracted":24,"not_mentioned":4} | 0 |
| D4-PLD-006 | pledge | 20260930T092451-pledge-b927 | {"extracted":13,"not_mentioned":1} | 0 |
| D4-PLD-007 | pledge | 20260930T092457-pledge-8b72 | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-008 | pledge | 20260930T092500-pledge-9144 | {"extracted":11,"not_mentioned":2,"needs_review":1} | 0 |
| D4-PLD-009 | pledge | 20260930T092504-pledge-4b97 | {"extracted":36,"not_mentioned":6} | 0 |
| D4-PLD-010 | pledge | 20260930T092518-pledge-6f0a | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |

## Gold 对照（开发期错误定位；正式成绩以评测脚本为准）

| 案例 | gold应提取 | 值命中 | 字段准确率 | 错误填充 | 状态一致率 | gold不可支撑 |
|---|---|---|---|---|---|---|
| D4-PLD-001 | 36 | 36 | 100.0% | 0 | 100.0% | 0 |
| D4-PLD-002 | 13 | 13 | 100.0% | 0 | 100.0% | 0 |
| D4-PLD-003 | 12 | 12 | 100.0% | 0 | 100.0% | 0 |
| D4-PLD-004 | 12 | 12 | 100.0% | 0 | 100.0% | 0 |
| D4-PLD-005 | 25 | 24 | 96.0% | 0 | 96.4% | 0 |
| D4-PLD-006 | 13 | 13 | 100.0% | 0 | 100.0% | 0 |
| D4-PLD-007 | 12 | 12 | 100.0% | 0 | 100.0% | 0 |
| D4-PLD-008 | 11 | 11 | 100.0% | 0 | 100.0% | 0 |
| D4-PLD-009 | 26 | 26 | 100.0% | 1 | 100.0% | 0 |
| D4-PLD-010 | 12 | 12 | 100.0% | 0 | 100.0% | 0 |

### 差异明细

**D4-PLD-005**

| 字段 | 判定 | 说明 |
|---|---|---|
| E02.start_date | STATUS_DIFF | gold=extracted("2025-10-30") mine=not_mentioned |

**D4-PLD-009**

| 字段 | 判定 | 说明 |
|---|---|---|
| (E03 有格创业投资有限公司) | MINE_MISSING_EVENT | gold 事件未在系统输出中找到（键：有格创业投资有限公司\|中国银河证券股份有限公司\|release） |
| (E03 有格投资) | MINE_EXTRA_EVENT | 系统多出的事件（键：有格投资\|中国银河证券股份有限公司\|release） |
