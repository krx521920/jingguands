# 批量运行报告 20260929T015038

- 输入：6 份（成功 5）；契约校验问题合计 0 条
- 模式：真实模型调用

| 案例 | 类型 | run_id | 字段状态 | 校验问题 |
|---|---|---|---|---|
| D2-AWD-001 | award_contract | 20260929T015038-award_contract-9833 | {"extracted":9,"not_applicable":2,"not_mentioned":3} | 0 |
| D2-AWD-002 | award_contract | 20260929T015041-award_contract-fa76 | {"not_mentioned":7,"extracted":7} | 0 |
| D2-EQC-001 | equity_change | 20260929T015044-equity_change-9382 | {"extracted":9} | 0 |
| D2-EQC-002 | equity_change | — | 失败 | — |
| D2-PLD-001 | pledge | 20260929T015049-pledge-dd7c | {"extracted":12,"not_mentioned":1} | 0 |
| D2-PLD-002 | pledge | 20260929T015053-pledge-cb2d | {"extracted":10,"not_mentioned":2,"needs_review":1} | 0 |

## Gold 对照（开发期错误定位；正式成绩以评测脚本为准）

| 案例 | gold应提取 | 值命中 | 字段准确率 | 错误填充 | 状态一致率 |
|---|---|---|---|---|---|
| D2-AWD-001 | 8 | 6 | 75.0% | 0 | 42.9% |
| D2-AWD-002 | 8 | 6 | 75.0% | 0 | 42.9% |
| D2-EQC-001 | 9 | 8 | 88.9% | 0 | 88.9% |
| D2-PLD-001 | 12 | 12 | 100.0% | 0 | 100.0% |
| D2-PLD-002 | 11 | 8 | 72.7% | 0 | 76.9% |

### 差异明细

**D2-AWD-001**

| 字段 | 判定 | 说明 |
|---|---|---|
| bidder | VALUE_DIFF | gold="某某制造股份有限公司" mine="某公司" |
| contract_signed | GOLD_UNREGISTERED | gold未注册（版本滞后），mine=extracted |
| project_name | VALUE_DIFF | gold="某变电站设备采购项目" mine="设备项目" |

**D2-AWD-002**

| 字段 | 判定 | 说明 |
|---|---|---|
| bidder | STATUS_DIFF | gold=extracted("某某制造股份有限公司") mine=not_mentioned |
| consortium_shares | GOLD_UNREGISTERED | gold未注册（版本滞后），mine=extracted |
| tenderer | STATUS_DIFF | gold=extracted("某交通建设公司") mine=not_mentioned |

**D2-EQC-001**

| 字段 | 判定 | 说明 |
|---|---|---|
| holder | VALUE_DIFF | gold="某某制造股份有限公司" mine="某公司股东" |

**D2-PLD-002**

| 字段 | 判定 | 说明 |
|---|---|---|
| pledgor | VALUE_DIFF | gold="某某制造股份有限公司" mine="某公司股东" |
| purpose | STATUS_DIFF | gold=extracted("补充流动资金") mine=not_mentioned |
| start_date | VALUE_DIFF | gold="2026-09-01" mine="2026-09-03" |
