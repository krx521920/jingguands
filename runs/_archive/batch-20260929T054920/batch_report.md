# 批量运行报告 20260929T054920

- 输入：5 份（成功 5）；契约校验问题合计 1 条
- 模式：真实模型调用

| 案例 | 类型 | run_id | 字段状态 | 校验问题 |
|---|---|---|---|---|
| D3-PLD-001 | pledge | 20260929T054920-pledge-1e94 | {"extracted":11,"not_mentioned":1,"needs_review":1} | 0 |
| D3-PLD-002 | pledge | 20260929T054924-pledge-25d5 | {"extracted":12,"not_mentioned":1} | 0 |
| D3-PLD-003 | pledge | 20260929T054928-pledge-ccfd | {"extracted":11,"not_mentioned":1,"needs_review":1} | 0 |
| D3-PLD-004 | pledge | 20260929T054932-pledge-bd48 | {"extracted":11,"not_mentioned":1,"needs_review":1} | 1 |
| D3-PLD-005 | pledge | 20260929T054936-pledge-5d69 | {"extracted":12,"not_mentioned":1} | 0 |

## Gold 对照（开发期错误定位；正式成绩以评测脚本为准）

| 案例 | gold应提取 | 值命中 | 字段准确率 | 错误填充 | 状态一致率 | gold不可支撑 |
|---|---|---|---|---|---|---|
| D3-PLD-001 | 11 | 11 | 100.0% | 0 | 100.0% | 0 |
| D3-PLD-002 | 12 | 12 | 100.0% | 0 | 100.0% | 0 |
| D3-PLD-003 | 11 | 11 | 100.0% | 0 | 100.0% | 0 |
| D3-PLD-004 | 11 | 10 | 90.9% | 0 | 92.3% | 0 |
| D3-PLD-005 | 12 | 12 | 100.0% | 0 | 100.0% | 0 |

### 差异明细

**D3-PLD-001**

| 字段 | 判定 | 说明 |
|---|---|---|
| (事件数) | EVENTS_DIFF | gold 3 个事件，系统输出 1 个（多事件抽取缺失——D4 议题） |

**D3-PLD-004**

| 字段 | 判定 | 说明 |
|---|---|---|
| pledged_shares_this_time | VALUE_DIFF | gold=3640000 mine=364 |
