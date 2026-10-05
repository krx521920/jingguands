# 批量运行报告 20260929T152309

- 输入：5 份（成功 5）；契约校验问题合计 0 条
- 模式：真实模型调用

| 案例 | 类型 | run_id | 字段状态 | 校验问题 |
|---|---|---|---|---|
| D3-PLD-001 | pledge | 20260929T152309-pledge-b12e | {"extracted":36,"not_mentioned":3,"needs_review":3} | 0 |
| D3-PLD-002 | pledge | 20260929T152323-pledge-2ba9 | {"extracted":13,"not_mentioned":1} | 0 |
| D3-PLD-003 | pledge | 20260929T152327-pledge-84ab | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D3-PLD-004 | pledge | 20260929T152331-pledge-62a8 | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D3-PLD-005 | pledge | 20260929T152335-pledge-d337 | {"extracted":25,"not_mentioned":3} | 0 |

## Gold 对照（开发期错误定位；正式成绩以评测脚本为准）

| 案例 | gold应提取 | 值命中 | 字段准确率 | 错误填充 | 状态一致率 | gold不可支撑 |
|---|---|---|---|---|---|---|
| D3-PLD-001 | 33 | 33 | 100.0% | 0 | 100.0% | 0 |
| D3-PLD-002 | 12 | 12 | 100.0% | 0 | 100.0% | 0 |
| D3-PLD-003 | 11 | 11 | 100.0% | 0 | 100.0% | 0 |
| D3-PLD-004 | 11 | 11 | 100.0% | 0 | 100.0% | 0 |
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

**D3-PLD-005**

| 字段 | 判定 | 说明 |
|---|---|---|
| E01.direction | GOLD_UNREGISTERED | gold未注册（版本滞后），mine=extracted |
| (E02 光线控股) | MINE_EXTRA_EVENT | 系统多出的事件（键：光线控股\|国泰海通证券股份有限公司\|release） |
