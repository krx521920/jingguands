# 批量运行报告 20260929T055336

- 输入：5 份（成功 5）；契约校验问题合计 1 条
- 模式：真实模型调用

| 案例 | 类型 | run_id | 字段状态 | 校验问题 |
|---|---|---|---|---|
| D3-PLD-001 | pledge | 20260929T055336-pledge-d5de | {"extracted":33,"not_mentioned":3,"needs_review":3} | 0 |
| D3-PLD-002 | pledge | 20260929T055345-pledge-088f | {"extracted":12,"not_mentioned":1} | 0 |
| D3-PLD-003 | pledge | 20260929T055349-pledge-8148 | {"extracted":11,"not_mentioned":1,"needs_review":1} | 0 |
| D3-PLD-004 | pledge | 20260929T055352-pledge-d973 | {"extracted":11,"not_mentioned":1,"needs_review":1} | 1 |
| D3-PLD-005 | pledge | 20260929T055356-pledge-07e5 | {"extracted":12,"not_mentioned":1} | 0 |

## Gold 对照（开发期错误定位；正式成绩以评测脚本为准）

| 案例 | gold应提取 | 值命中 | 字段准确率 | 错误填充 | 状态一致率 | gold不可支撑 |
|---|---|---|---|---|---|---|
| D3-PLD-001 | 33 | 33 | 100.0% | 0 | 100.0% | 0 |
| D3-PLD-002 | 12 | 12 | 100.0% | 0 | 100.0% | 0 |
| D3-PLD-003 | 11 | 11 | 100.0% | 0 | 100.0% | 0 |
| D3-PLD-004 | 11 | 10 | 90.9% | 0 | 92.3% | 0 |
| D3-PLD-005 | 12 | 12 | 100.0% | 0 | 100.0% | 0 |

### 差异明细

**D3-PLD-004**

| 字段 | 判定 | 说明 |
|---|---|---|
| E01.pledged_shares_this_time | VALUE_DIFF | gold=3640000 mine=364 |
