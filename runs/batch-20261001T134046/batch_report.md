# 批量运行报告 20261001T134046

- 输入：10 份（成功 10）；契约校验问题合计 11 条
- 模式：真实模型调用

| 案例 | 类型 | run_id | 字段状态 | 校验问题 |
|---|---|---|---|---|
| D5-EQC-001 | equity_change | 20261001T134046-equity_change-70c8 | {"extracted":45} | 0 |
| D5-EQC-002 | equity_change | 20261001T134058-equity_change-6595 | {"extracted":45} | 5 |
| D5-EQC-003 | equity_change | 20261001T134117-equity_change-4ae9 | {"extracted":5,"not_mentioned":4} | 2 |
| D5-EQC-004 | equity_change | 20261001T134120-equity_change-dfa1 | {"extracted":8,"needs_review":1} | 0 |
| D5-EQC-005 | equity_change | 20261001T134123-equity_change-6cc1 | {"extracted":8,"needs_review":1} | 0 |
| D5-EQC-006 | equity_change | 20261001T134126-equity_change-a06c | {"extracted":9} | 0 |
| D5-EQC-007 | equity_change | 20261001T134129-equity_change-d503 | {"extracted":9} | 0 |
| D5-EQC-008 | equity_change | 20261001T134134-equity_change-8f8a | {"extracted":9} | 2 |
| D5-EQC-009 | equity_change | 20261001T134137-equity_change-ca04 | {"extracted":9} | 2 |
| D5-EQC-010 | equity_change | 20261001T134140-equity_change-e3ff | {"extracted":8,"needs_review":1} | 0 |

## Gold 对照（开发期错误定位；正式成绩以评测脚本为准）

| 案例 | gold应提取 | 值命中 | 字段准确率 | 错误填充 | 状态一致率 | gold不可支撑 |
|---|---|---|---|---|---|---|
| D5-EQC-001 | 45 | 45 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-002 | 23 | 23 | 100.0% | 6 | 85.2% | 0 |
| D5-EQC-003 | 5 | 5 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-004 | 8 | 8 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-005 | 8 | 7 | 87.5% | 0 | 88.9% | 0 |
| D5-EQC-006 | 9 | 8 | 88.9% | 0 | 88.9% | 0 |
| D5-EQC-007 | 9 | 6 | 66.7% | 0 | 66.7% | 0 |
| D5-EQC-008 | 9 | 9 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-009 | 9 | 9 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-010 | 8 | 8 | 100.0% | 0 | 100.0% | 0 |

### 差异明细

**D5-EQC-002**

| 字段 | 判定 | 说明 |
|---|---|---|
| E02.ratio_after | WRONG_FILLED | gold=not_mentioned mine=extracted(12.84) |
| E02.shares_after | WRONG_FILLED | gold=not_mentioned mine=extracted(11042217) |
| E03.ratio_after | WRONG_FILLED | gold=not_mentioned mine=extracted(2.15) |
| E03.shares_after | WRONG_FILLED | gold=not_mentioned mine=extracted(1848404) |
| (E02 马军强) | MINE_EXTRA_EVENT | 系统多出的事件（键：马军强\|\|decrease\|14410068） |
| (E04 杨占坡) | MINE_EXTRA_EVENT | 系统多出的事件（键：杨占坡\|\|decrease\|3684053） |

**D5-EQC-005**

| 字段 | 判定 | 说明 |
|---|---|---|
| E01.method | VALUE_DIFF | gold="公开征集协议转让" mine="公开征集转让方式协议转让" |

**D5-EQC-006**

| 字段 | 判定 | 说明 |
|---|---|---|
| E01.method | VALUE_DIFF | gold="因可转债转股使公司总股本增加，导致股东持股比例被动稀释。" mine="因可转债转股使公司总股本增加，导致股东持股比例被动稀释" |

**D5-EQC-007**

| 字段 | 判定 | 说明 |
|---|---|---|
| E01.change_date | VALUE_DIFF | gold="2026-09-29" mine="2026-09-20/2026-09-21" |
| E01.holder | VALUE_DIFF | gold="红豆集团、周海江、龚新度、红闳服饰、天人国际投资" mine="红豆集团有限公司" |
| E01.method | VALUE_DIFF | gold="司法拍卖被动减持" mine="司法拍卖" |
