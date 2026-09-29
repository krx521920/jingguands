# 批量运行报告 20260929T022100

- 输入：6 份（成功 6）；契约校验问题合计 0 条
- 模式：真实模型调用

| 案例 | 类型 | run_id | 字段状态 | 校验问题 |
|---|---|---|---|---|
| D2-AWD-001 | award_contract | 20260929T022100-award_contract-3c16 | {"extracted":9,"not_applicable":2,"not_mentioned":3} | 0 |
| D2-AWD-002 | award_contract | 20260929T022103-award_contract-44a3 | {"extracted":9,"not_mentioned":5} | 0 |
| D2-EQC-001 | equity_change | 20260929T022106-equity_change-7456 | {"extracted":9} | 0 |
| D2-EQC-002 | equity_change | 20260929T022109-equity_change-6d8f | {"extracted":9} | 0 |
| D2-PLD-001 | pledge | 20260929T022112-pledge-e1c8 | {"extracted":12,"not_mentioned":1} | 0 |
| D2-PLD-002 | pledge | 20260929T022115-pledge-ad12 | {"extracted":10,"not_mentioned":2,"not_disclosed":1} | 0 |

## Gold 对照（开发期错误定位；正式成绩以评测脚本为准）

| 案例 | gold应提取 | 值命中 | 字段准确率 | 错误填充 | 状态一致率 | gold不可支撑 |
|---|---|---|---|---|---|---|
| D2-AWD-001 | 4 | 4 | 100.0% | 0 | 100.0% | 4 |
| D2-AWD-002 | 4 | 4 | 100.0% | 0 | 100.0% | 4 |
| D2-EQC-001 | 7 | 7 | 100.0% | 0 | 100.0% | 2 |
| D2-EQC-002 | 7 | 7 | 100.0% | 1 | 87.5% | 1 |
| D2-PLD-001 | 11 | 11 | 100.0% | 0 | 100.0% | 1 |
| D2-PLD-002 | 8 | 8 | 100.0% | 0 | 100.0% | 3 |

### 差异明细

**D2-AWD-001**

| 字段 | 判定 | 说明 |
|---|---|---|
| bidder | GOLD_UNSUPPORTED | gold="某某制造股份有限公司" 在原文中无支撑 |
| contract_signed | GOLD_UNREGISTERED | gold未注册（版本滞后），mine=extracted |
| currency | GOLD_UNSUPPORTED | gold="CNY" 在原文中无支撑 |
| project_name | GOLD_UNSUPPORTED | gold="某变电站设备采购项目" 在原文中无支撑 |
| tax_included | GOLD_UNSUPPORTED | gold="true" 在原文中无支撑 |

**D2-AWD-002**

| 字段 | 判定 | 说明 |
|---|---|---|
| bid_amount | GOLD_UNSUPPORTED | gold=80000000 在原文中无支撑 |
| bidder | GOLD_UNSUPPORTED | gold="某某制造股份有限公司" 在原文中无支撑 |
| consortium_members | GOLD_UNREGISTERED | gold未注册（版本滞后），mine=extracted |
| consortium_shares | GOLD_UNREGISTERED | gold未注册（版本滞后），mine=extracted |
| currency | GOLD_UNSUPPORTED | gold="CNY" 在原文中无支撑 |
| tenderer | GOLD_UNSUPPORTED | gold="某交通建设公司" 在原文中无支撑 |

**D2-EQC-001**

| 字段 | 判定 | 说明 |
|---|---|---|
| direction | GOLD_UNSUPPORTED | gold="decrease" 在原文中无支撑 |
| holder | GOLD_UNSUPPORTED | gold="某某制造股份有限公司" 在原文中无支撑 |

**D2-EQC-002**

| 字段 | 判定 | 说明 |
|---|---|---|
| change_date | WRONG_FILLED | gold=needs_review mine=extracted("2026-08-20/2026-08-31") |
| holder | GOLD_UNSUPPORTED | gold="某某制造股份有限公司" 在原文中无支撑 |

**D2-PLD-001**

| 字段 | 判定 | 说明 |
|---|---|---|
| pledged_shares_this_time | GOLD_UNSUPPORTED | gold=10000000 在原文中无支撑 |

**D2-PLD-002**

| 字段 | 判定 | 说明 |
|---|---|---|
| pledgor | GOLD_UNSUPPORTED | gold="某某制造股份有限公司" 在原文中无支撑 |
| purpose | GOLD_UNSUPPORTED | gold="补充流动资金" 在原文中无支撑 |
| start_date | GOLD_UNSUPPORTED | gold="2026-09-01" 在原文中无支撑 |
