# 批量运行报告 20260929T014913

- 输入：6 份（成功 6）；契约校验问题合计 0 条
- 模式：真实模型调用

| 案例 | 类型 | run_id | 字段状态 | 校验问题 |
|---|---|---|---|---|
| D2-AWD-001 | award_contract | 20260929T014913-award_contract-adbc | {"extracted":9,"not_applicable":2,"not_mentioned":3} | 0 |
| D2-AWD-002 | award_contract | 20260929T014916-award_contract-b265 | {"not_mentioned":7,"extracted":7} | 0 |
| D2-EQC-001 | equity_change | 20260929T014919-equity_change-6d4c | {"extracted":9} | 0 |
| D2-EQC-002 | equity_change | 20260929T014921-equity_change-0e46 | {"extracted":9} | 0 |
| D2-PLD-001 | pledge | 20260929T014924-pledge-6cf7 | {"extracted":12,"not_mentioned":1} | 0 |
| D2-PLD-002 | pledge | 20260929T014928-pledge-d448 | {"extracted":9,"not_mentioned":3,"needs_review":1} | 0 |

## Gold 对照（开发期错误定位；正式成绩以评测脚本为准）

| 案例 | gold应提取 | 值命中 | 字段准确率 | 错误填充 | 状态一致率 |
|---|---|---|---|---|---|
| D2-AWD-001 | 8 | 6 | 75.0% | 1 | 80.0% |
| D2-AWD-002 | 9 | 6 | 66.7% | 1 | 73.3% |
| D2-EQC-001 | 9 | 6 | 66.7% | 0 | 66.7% |
| D2-EQC-002 | 8 | 6 | 75.0% | 1 | 66.7% |
| D2-PLD-001 | 12 | 11 | 91.7% | 0 | 92.3% |
| D2-PLD-002 | 11 | 7 | 63.6% | 0 | 69.2% |

### 差异明细

**D2-AWD-001**

| 字段 | 判定 | 说明 |
|---|---|---|
| bidder | VALUE_DIFF | gold="某某制造股份有限公司" mine="某公司" |
| contract_signed | WRONG_FILLED | gold=(未注册) mine=extracted("true") |
| project_name | VALUE_DIFF | gold="某变电站设备采购项目" mine="设备项目" |

**D2-AWD-002**

| 字段 | 判定 | 说明 |
|---|---|---|
| bidder | STATUS_DIFF | gold=extracted("某某制造股份有限公司") mine=not_mentioned |
| consortium | MINE_MISSING | gold="公司60%，联合体成员40%" |
| consortium_shares | WRONG_FILLED | gold=(未注册) mine=extracted("6:4") |
| tenderer | STATUS_DIFF | gold=extracted("某交通建设公司") mine=not_mentioned |

**D2-EQC-001**

| 字段 | 判定 | 说明 |
|---|---|---|
| change_date | VALUE_DIFF | gold="2026-09-10" mine="2026-09-10/2026-09-10" |
| direction | VALUE_DIFF | gold="decrease" mine="减持" |
| holder | VALUE_DIFF | gold="某某制造股份有限公司" mine="某公司股东" |

**D2-EQC-002**

| 字段 | 判定 | 说明 |
|---|---|---|
| change_date | WRONG_FILLED | gold=needs_review mine=extracted("2026-08-20/2026-08-31") |
| direction | VALUE_DIFF | gold="increase" mine="增持" |
| holder | VALUE_DIFF | gold="某某制造股份有限公司" mine="某公司股东" |

**D2-PLD-001**

| 字段 | 判定 | 说明 |
|---|---|---|
| pledgor | VALUE_DIFF | gold="某某制造股份有限公司" mine="某某制造股份有限公司股东" |

**D2-PLD-002**

| 字段 | 判定 | 说明 |
|---|---|---|
| announcement_date | STATUS_DIFF | gold=extracted("2026-09-03") mine=not_mentioned |
| pledgor | VALUE_DIFF | gold="某某制造股份有限公司" mine="某公司股东" |
| purpose | STATUS_DIFF | gold=extracted("补充流动资金") mine=not_mentioned |
| start_date | VALUE_DIFF | gold="2026-09-01" mine="2026-09-03" |
