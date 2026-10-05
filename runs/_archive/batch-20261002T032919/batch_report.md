# 批量运行报告 20261002T032919

- 输入：10 份（成功 10）；契约校验问题合计 1 条
- 模式：真实模型调用

| 案例 | 类型 | run_id | 字段状态 | 校验问题 |
|---|---|---|---|---|
| D5-EQC-001 | equity_change | 20261002T032919-equity_change-9fd7 | {"extracted":36} | 0 |
| D5-EQC-002 | equity_change | 20261002T032930-equity_change-b8e6 | {"extracted":45} | 0 |
| D5-EQC-003 | equity_change | 20261002T032949-equity_change-207a | {"extracted":5,"not_mentioned":4} | 1 |
| D5-EQC-004 | equity_change | 20261002T032951-equity_change-f23b | {"extracted":8,"needs_review":1} | 0 |
| D5-EQC-005 | equity_change | 20261002T032954-equity_change-3ea8 | {"extracted":8,"needs_review":1} | 0 |
| D5-EQC-006 | equity_change | 20261002T032958-equity_change-2303 | {"extracted":7,"not_mentioned":2} | 0 |
| D5-EQC-007 | equity_change | 20261002T033001-equity_change-34ab | {"extracted":9} | 0 |
| D5-EQC-008 | equity_change | 20261002T033004-equity_change-e56f | {"extracted":9} | 0 |
| D5-EQC-009 | equity_change | 20261002T033007-equity_change-0e46 | {"extracted":9} | 0 |
| D5-EQC-010 | equity_change | 20261002T033010-equity_change-ec84 | {"extracted":8,"needs_review":1} | 0 |

## Gold 对照（开发期错误定位；正式成绩以评测脚本为准）

| 案例 | gold应提取 | 值命中 | 字段准确率 | 错误填充 | 状态一致率 | gold不可支撑 |
|---|---|---|---|---|---|---|
| D5-EQC-001 | 36 | 36 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-002 | 23 | 23 | 100.0% | 6 | 85.2% | 0 |
| D5-EQC-003 | 5 | 5 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-004 | 8 | 8 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-005 | 8 | 6 | 75.0% | 0 | 77.8% | 0 |
| D5-EQC-006 | 9 | 7 | 77.8% | 0 | 77.8% | 0 |
| D5-EQC-007 | 9 | 6 | 66.7% | 0 | 66.7% | 0 |
| D5-EQC-008 | 9 | 9 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-009 | 9 | 9 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-010 | 8 | 8 | 100.0% | 0 | 100.0% | 0 |

### 差异明细

**D5-EQC-001**

| 字段 | 判定 | 说明 |
|---|---|---|
| (E05 于春生) | MINE_MISSING_EVENT | gold 事件未在系统输出中找到（键：于春生\|\|increase\|4472000） |

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
| E01.holder | VALUE_DIFF | gold="浙江省国际贸易集团有限公司" mine="国贸集团" |
| E01.method | VALUE_DIFF | gold="公开征集协议转让" mine="协议转让" |

**D5-EQC-006**

| 字段 | 判定 | 说明 |
|---|---|---|
| E01.shares_after | STATUS_DIFF | gold=extracted(249519764) mine=not_mentioned |
| E01.shares_before | STATUS_DIFF | gold=extracted(249519764) mine=not_mentioned |

**D5-EQC-007**

| 字段 | 判定 | 说明 |
|---|---|---|
| E01.change_date | VALUE_DIFF | gold="2026-09-29" mine="2026-09-20/2026-09-21" |
| E01.holder | VALUE_DIFF | gold="红豆集团、周海江、龚新度、红闳服饰、天人国际投资" mine="红豆集团有限公司" |
| E01.method | VALUE_DIFF | gold="司法拍卖被动减持" mine="司法拍卖" |
