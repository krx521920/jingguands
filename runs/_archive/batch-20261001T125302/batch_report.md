# 批量运行报告 20261001T125302

- 输入：10 份（成功 10）；契约校验问题合计 10 条
- 模式：真实模型调用

| 案例 | 类型 | run_id | 字段状态 | 校验问题 |
|---|---|---|---|---|
| D5-EQC-001 | equity_change | 20261001T125302-equity_change-a95d | {"extracted":45} | 0 |
| D5-EQC-002 | equity_change | 20261001T125314-equity_change-9fc8 | {"extracted":45} | 5 |
| D5-EQC-003 | equity_change | 20261001T125333-equity_change-7903 | {"extracted":5,"not_mentioned":4} | 1 |
| D5-EQC-004 | equity_change | 20261001T125336-equity_change-4050 | {"extracted":8,"needs_review":1} | 0 |
| D5-EQC-005 | equity_change | 20261001T125339-equity_change-ad26 | {"extracted":8,"not_mentioned":1} | 0 |
| D5-EQC-006 | equity_change | 20261001T125342-equity_change-5b80 | {"extracted":9} | 0 |
| D5-EQC-007 | equity_change | 20261001T125346-equity_change-28bc | {"extracted":9} | 0 |
| D5-EQC-008 | equity_change | 20261001T125349-equity_change-8f04 | {"extracted":9} | 1 |
| D5-EQC-009 | equity_change | 20261001T125352-equity_change-e9fc | {"extracted":9} | 3 |
| D5-EQC-010 | equity_change | 20261001T125356-equity_change-b39d | {"extracted":16,"needs_review":2} | 0 |

## Gold 对照（开发期错误定位；正式成绩以评测脚本为准）

| 案例 | gold应提取 | 值命中 | 字段准确率 | 错误填充 | 状态一致率 | gold不可支撑 |
|---|---|---|---|---|---|---|
| D5-EQC-001 | 45 | 45 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-002 | 23 | 23 | 100.0% | 6 | 85.2% | 0 |
| D5-EQC-003 | 5 | 5 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-004 | 8 | 8 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-005 | 8 | 8 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-006 | 9 | 7 | 77.8% | 0 | 77.8% | 0 |
| D5-EQC-007 | 9 | 6 | 66.7% | 0 | 66.7% | 0 |
| D5-EQC-008 | 9 | 8 | 88.9% | 0 | 88.9% | 0 |
| D5-EQC-009 | 9 | 8 | 88.9% | 0 | 88.9% | 0 |
| D5-EQC-010 | 8 | 2 | 25.0% | 1 | 33.3% | 0 |

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

**D5-EQC-006**

| 字段 | 判定 | 说明 |
|---|---|---|
| E01.shares_after | VALUE_DIFF | gold=249519764 mine=324097124 |
| E01.shares_before | VALUE_DIFF | gold=249519764 mine=324097124 |

**D5-EQC-007**

| 字段 | 判定 | 说明 |
|---|---|---|
| E01.change_date | VALUE_DIFF | gold="2026-09-29" mine="2026-09-20/2026-09-21" |
| E01.holder | VALUE_DIFF | gold="红豆集团、周海江、龚新度、红闳服饰、天人国际投资" mine="红豆集团有限公司" |
| E01.method | VALUE_DIFF | gold="司法拍卖被动减持" mine="司法拍卖" |

**D5-EQC-008**

| 字段 | 判定 | 说明 |
|---|---|---|
| E01.method | VALUE_DIFF | gold="集中竞价交易" mine="集中竞价交易方式" |

**D5-EQC-009**

| 字段 | 判定 | 说明 |
|---|---|---|
| E01.method | VALUE_DIFF | gold="集中竞价及大宗交易" mine="集中竞价、大宗交易" |

**D5-EQC-010**

| 字段 | 判定 | 说明 |
|---|---|---|
| E01.change_shares | VALUE_DIFF | gold=9250000 mine=6475000 |
| E01.holder | VALUE_DIFF | gold="高福忠、高健" mine="高福忠" |
| E01.ratio_after | VALUE_DIFF | gold=32.45 mine=27.92 |
| E01.ratio_before | VALUE_DIFF | gold=37.45 mine=31.42 |
| E01.shares_after | VALUE_DIFF | gold=60001290 mine=51626343 |
| E01.shares_before | VALUE_DIFF | gold=69251290 mine=58101343 |
| (E02 高健) | MINE_EXTRA_EVENT | 系统多出的事件（键：高健\|\|decrease\|11149947） |
