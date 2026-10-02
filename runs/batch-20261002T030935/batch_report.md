# 批量运行报告 20261002T030935

- 输入：10 份（成功 10）；契约校验问题合计 9 条
- 模式：真实模型调用

| 案例 | 类型 | run_id | 字段状态 | 校验问题 |
|---|---|---|---|---|
| D5-EQC-001 | equity_change | 20261002T030935-equity_change-b313 | {"extracted":36} | 0 |
| D5-EQC-002 | equity_change | 20261002T030945-equity_change-ab90 | {"extracted":23,"not_mentioned":4} | 8 |
| D5-EQC-003 | equity_change | 20261002T030956-equity_change-46c2 | {"extracted":5,"not_mentioned":4} | 1 |
| D5-EQC-004 | equity_change | 20261002T030959-equity_change-d454 | {"extracted":8,"not_mentioned":1} | 0 |
| D5-EQC-005 | equity_change | 20261002T031002-equity_change-c062 | {"extracted":8,"needs_review":1} | 0 |
| D5-EQC-006 | equity_change | 20261002T031005-equity_change-7e29 | {"extracted":9} | 0 |
| D5-EQC-007 | equity_change | 20261002T031009-equity_change-8385 | {"extracted":9} | 0 |
| D5-EQC-008 | equity_change | 20261002T031012-equity_change-b139 | {"extracted":9} | 0 |
| D5-EQC-009 | equity_change | 20261002T031015-equity_change-75ef | {"extracted":9} | 0 |
| D5-EQC-010 | equity_change | 20261002T031019-equity_change-c6b5 | {"extracted":8,"needs_review":1} | 0 |

## Gold 对照（开发期错误定位；正式成绩以评测脚本为准）

| 案例 | gold应提取 | 值命中 | 字段准确率 | 错误填充 | 状态一致率 | gold不可支撑 |
|---|---|---|---|---|---|---|
| D5-EQC-001 | 36 | 36 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-002 | 23 | 23 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-003 | 5 | 5 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-004 | 8 | 8 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-005 | 8 | 6 | 75.0% | 0 | 77.8% | 0 |
| D5-EQC-006 | 9 | 8 | 88.9% | 0 | 88.9% | 0 |
| D5-EQC-007 | 9 | 6 | 66.7% | 0 | 66.7% | 0 |
| D5-EQC-008 | 9 | 8 | 88.9% | 0 | 88.9% | 0 |
| D5-EQC-009 | 9 | 8 | 88.9% | 0 | 88.9% | 0 |
| D5-EQC-010 | 8 | 8 | 100.0% | 0 | 100.0% | 0 |

### 差异明细

**D5-EQC-001**

| 字段 | 判定 | 说明 |
|---|---|---|
| (E05 于春生) | MINE_MISSING_EVENT | gold 事件未在系统输出中找到（键：于春生\|\|increase\|4472000） |

**D5-EQC-005**

| 字段 | 判定 | 说明 |
|---|---|---|
| E01.holder | VALUE_DIFF | gold="浙江省国际贸易集团有限公司" mine="国贸集团" |
| E01.method | VALUE_DIFF | gold="公开征集协议转让" mine="协议转让" |

**D5-EQC-006**

| 字段 | 判定 | 说明 |
|---|---|---|
| E01.method | VALUE_DIFF | gold="因可转债转股使公司总股本增加，导致股东持股比例被动稀释。" mine="因可转债转股使公司总股本增加，导致股东持股比例被动稀释" |

**D5-EQC-007**

| 字段 | 判定 | 说明 |
|---|---|---|
| E01.change_date | VALUE_DIFF | gold="2026-09-29" mine="2026-09-20/2026-09-21" |
| E01.holder | VALUE_DIFF | gold="红豆集团、周海江、龚新度、红闳服饰、天人国际投资" mine="红豆集团有限公司、周海江、龚新度、无锡红闳服饰有限公司、无锡天人国际投资有限公司" |
| E01.method | VALUE_DIFF | gold="司法拍卖被动减持" mine="司法拍卖" |

**D5-EQC-008**

| 字段 | 判定 | 说明 |
|---|---|---|
| E01.method | VALUE_DIFF | gold="集中竞价交易" mine="联交所集中竞价交易方式增持" |

**D5-EQC-009**

| 字段 | 判定 | 说明 |
|---|---|---|
| E01.method | VALUE_DIFF | gold="集中竞价及大宗交易" mine="持股比例被动稀释及股份减少（集中竞价及大宗交易）" |
