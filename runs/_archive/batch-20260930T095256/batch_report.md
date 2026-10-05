# 批量运行报告 20260930T095256

- 输入：10 份（成功 10）；契约校验问题合计 6 条
- 模式：真实模型调用

| 案例 | 类型 | run_id | 字段状态 | 校验问题 |
|---|---|---|---|---|
| D4-PLD-001 | pledge | 20260930T095256-pledge-e947 | {"extracted":36,"not_mentioned":3,"needs_review":3} | 0 |
| D4-PLD-002 | pledge | 20260930T095306-pledge-2ea3 | {"extracted":13,"not_mentioned":1} | 0 |
| D4-PLD-003 | pledge | 20260930T095311-pledge-4b72 | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-004 | pledge | 20260930T095314-pledge-0fd7 | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-005 | pledge | 20260930T095318-pledge-5bb2 | {"extracted":25,"not_mentioned":3} | 0 |
| D4-PLD-006 | pledge | 20260930T095325-pledge-a565 | {"extracted":13,"not_mentioned":1} | 0 |
| D4-PLD-007 | pledge | 20260930T095330-pledge-2949 | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-008 | pledge | 20260930T095334-pledge-f630 | {"extracted":11,"not_mentioned":2,"needs_review":1} | 0 |
| D4-PLD-009 | pledge | 20260930T095337-pledge-49c6 | {"extracted":37,"not_mentioned":5} | 6 |
| D4-PLD-010 | pledge | 20260930T095352-pledge-e24b | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |

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
| D4-PLD-009 | 26 | 26 | 100.0% | 1 | 100.0% | 0 |
| D4-PLD-010 | 12 | 12 | 100.0% | 0 | 100.0% | 0 |

### 差异明细

**D4-PLD-009**

| 字段 | 判定 | 说明 |
|---|---|---|
| (E03 有格创业投资有限公司) | MINE_MISSING_EVENT | gold 事件未在系统输出中找到（键：有格创业投资有限公司\|中国银河证券股份有限公司\|release） |
| (E03 有格投资) | MINE_EXTRA_EVENT | 系统多出的事件（键：有格投资\|中国银河证券股份有限公司\|release） |
