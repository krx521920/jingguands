# 批量运行报告 20260929T151911

- 输入：5 份（成功 5）；契约校验问题合计 4 条
- 模式：真实模型调用

| 案例 | 类型 | run_id | 字段状态 | 校验问题 |
|---|---|---|---|---|
| D3-PLD-001 | pledge | 20260929T151911-pledge-bce0 | {"extracted":36,"not_mentioned":3,"needs_review":3} | 0 |
| D3-PLD-002 | pledge | 20260929T151925-pledge-a72b | {"extracted":13,"not_mentioned":1} | 1 |
| D3-PLD-003 | pledge | 20260929T151929-pledge-bca0 | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D3-PLD-004 | pledge | 20260929T151933-pledge-d049 | {"extracted":12,"not_mentioned":1,"needs_review":1} | 1 |
| D3-PLD-005 | pledge | 20260929T151937-pledge-1ac5 | {"extracted":25,"not_mentioned":3} | 2 |

## Gold 对照（开发期错误定位；正式成绩以评测脚本为准）

| 案例 | gold应提取 | 值命中 | 字段准确率 | 错误填充 | 状态一致率 | gold不可支撑 |
|---|---|---|---|---|---|---|
| D3-PLD-001 | 33 | 33 | 100.0% | 0 | 100.0% | 0 |
| D3-PLD-002 | 12 | 12 | 100.0% | 0 | 100.0% | 0 |
| D3-PLD-003 | 11 | 11 | 100.0% | 0 | 100.0% | 0 |
| D3-PLD-004 | 11 | 10 | 90.9% | 0 | 92.3% | 0 |
| D3-PLD-005 | 12 | 12 | 100.0% | 1 | 100.0% | 0 |

### 差异明细

**D3-PLD-001**

| 字段 | 判定 | 说明 |
|---|---|---|
| E01.direction | GOLD_UNREGISTERED | gold未注册（版本滞后），mine=extracted |
| E02.direction | GOLD_UNREGISTERED | gold未注册（版本滞后），mine=extracted |
| E03.direction | GOLD_UNREGISTERED | gold未注册（版本滞后），mine=extracted |

**D3-PLD-002**

| 字段 | 判定 | 说明 |
|---|---|---|
| E01.direction | GOLD_UNREGISTERED | gold未注册（版本滞后），mine=extracted |

**D3-PLD-003**

| 字段 | 判定 | 说明 |
|---|---|---|
| E01.direction | GOLD_UNREGISTERED | gold未注册（版本滞后），mine=extracted |

**D3-PLD-004**

| 字段 | 判定 | 说明 |
|---|---|---|
| E01.direction | GOLD_UNREGISTERED | gold未注册（版本滞后），mine=extracted |
| E01.pledged_shares_this_time | VALUE_DIFF | gold=3640000 mine=364 |

**D3-PLD-005**

| 字段 | 判定 | 说明 |
|---|---|---|
| E01.direction | GOLD_UNREGISTERED | gold未注册（版本滞后），mine=extracted |
| (E02 光线控股) | MINE_EXTRA_EVENT | 系统多出的事件（键：光线控股\|国泰海通证券股份有限公司\|release） |
