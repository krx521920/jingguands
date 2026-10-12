# 批量运行报告 20260929T022331

- 输入：6 份（成功 6）；契约校验问题合计 0 条
- 模式：真实模型调用

| 案例 | 类型 | run_id | 字段状态 | 校验问题 |
|---|---|---|---|---|
| D2-AWD-001 | award_contract | 20260929T022331-award_contract-c37b | {"extracted":9,"not_applicable":2,"not_mentioned":3} | 0 |
| D2-AWD-002 | award_contract | 20260929T022335-award_contract-b859 | {"extracted":9,"not_mentioned":5} | 0 |
| D2-EQC-001 | equity_change | 20260929T022338-equity_change-fe1f | {"extracted":9} | 0 |
| D2-EQC-002 | equity_change | 20260929T022341-equity_change-334d | {"extracted":9} | 0 |
| D2-PLD-001 | pledge | 20260929T022343-pledge-445a | {"extracted":12,"not_mentioned":1} | 0 |
| D2-PLD-002 | pledge | 20260929T022347-pledge-3c69 | {"extracted":10,"not_mentioned":2,"not_disclosed":1} | 0 |

## Gold 对照（开发期错误定位；正式成绩以评测脚本为准）

| 案例 | gold应提取 | 值命中 | 字段准确率 | 错误填充 | 状态一致率 | gold不可支撑 |
|---|---|---|---|---|---|---|
| D2-AWD-001 | 6 | 6 | 100.0% | 0 | 100.0% | 2 |
| D2-AWD-002 | 6 | 6 | 100.0% | 0 | 100.0% | 2 |
| D2-EQC-001 | 8 | 8 | 100.0% | 0 | 100.0% | 1 |
| D2-EQC-002 | 7 | 7 | 100.0% | 1 | 87.5% | 1 |
| D2-PLD-001 | 12 | 12 | 100.0% | 0 | 100.0% | 0 |
| D2-PLD-002 | 8 | 8 | 100.0% | 0 | 100.0% | 3 |

### 差异明细

**D2-AWD-001**

| 字段 | 判定 | 说明 |
|---|---|---|
| bidder | GOLD_UNSUPPORTED | gold="某某制造股份有限公司" 在原文中无支撑 |
| contract_signed | GOLD_UNREGISTERED | gold未注册（版本滞后），mine=extracted |
| project_name | GOLD_UNSUPPORTED | gold="某变电站设备采购项目" 在原文中无支撑 |

**D2-AWD-002**

| 字段 | 判定 | 说明 |
|---|---|---|
| bidder | GOLD_UNSUPPORTED | gold="某某制造股份有限公司" 在原文中无支撑 |
| consortium_members | GOLD_UNREGISTERED | gold未注册（版本滞后），mine=extracted |
| consortium_shares | GOLD_UNREGISTERED | gold未注册（版本滞后），mine=extracted |
| tenderer | GOLD_UNSUPPORTED | gold="某交通建设公司" 在原文中无支撑 |

**D2-EQC-001**

| 字段 | 判定 | 说明 |
|---|---|---|
| holder | GOLD_UNSUPPORTED | gold="某某制造股份有限公司" 在原文中无支撑 |

**D2-EQC-002**

| 字段 | 判定 | 说明 |
|---|---|---|
| change_date | WRONG_FILLED | gold=needs_review mine=extracted("2026-08-20/2026-08-31") |
| holder | GOLD_UNSUPPORTED | gold="某某制造股份有限公司" 在原文中无支撑 |

**D2-PLD-002**

| 字段 | 判定 | 说明 |
|---|---|---|
| pledgor | GOLD_UNSUPPORTED | gold="某某制造股份有限公司" 在原文中无支撑 |
| purpose | GOLD_UNSUPPORTED | gold="补充流动资金" 在原文中无支撑 |
| start_date | GOLD_UNSUPPORTED | gold="2026-09-01" 在原文中无支撑 |
