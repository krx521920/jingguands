# 批量运行报告 20261001T135159

- 输入：10 份（成功 10）；契约校验问题合计 19 条
- 模式：真实模型调用

| 案例 | 类型 | run_id | 字段状态 | 校验问题 |
|---|---|---|---|---|
| D5-EQC-001 | equity_change | 20261001T135159-equity_change-387a | {"extracted":36} | 0 |
| D5-EQC-002 | equity_change | 20261001T135209-equity_change-ae0a | {"extracted":23,"not_mentioned":4} | 15 |
| D5-EQC-003 | equity_change | 20261001T135220-equity_change-3855 | {"extracted":5,"not_mentioned":4} | 2 |
| D5-EQC-004 | equity_change | 20261001T135223-equity_change-eca5 | {"extracted":8,"needs_review":1} | 0 |
| D5-EQC-005 | equity_change | 20261001T135227-equity_change-209c | {"extracted":8,"needs_review":1} | 0 |
| D5-EQC-006 | equity_change | 20261001T135230-equity_change-bb66 | {"extracted":7,"not_mentioned":2} | 0 |
| D5-EQC-007 | equity_change | 20261001T135233-equity_change-117d | {"extracted":9} | 0 |
| D5-EQC-008 | equity_change | 20261001T135237-equity_change-3043 | {"extracted":9} | 1 |
| D5-EQC-009 | equity_change | 20261001T135240-equity_change-fea6 | {"extracted":9} | 1 |
| D5-EQC-010 | equity_change | 20261001T135243-equity_change-fdb6 | {"extracted":8,"needs_review":1} | 0 |

## Gold 对照（开发期错误定位；正式成绩以评测脚本为准）

| 案例 | gold应提取 | 值命中 | 字段准确率 | 错误填充 | 状态一致率 | gold不可支撑 |
|---|---|---|---|---|---|---|
| D5-EQC-001 | 36 | 36 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-002 | 23 | 23 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-003 | 5 | 5 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-004 | 8 | 8 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-005 | 8 | 6 | 75.0% | 0 | 77.8% | 0 |
| D5-EQC-006 | 9 | 7 | 77.8% | 0 | 77.8% | 0 |
| D5-EQC-007 | 9 | 8 | 88.9% | 0 | 88.9% | 0 |
| D5-EQC-008 | 9 | 8 | 88.9% | 0 | 88.9% | 0 |
| D5-EQC-009 | 9 | 8 | 88.9% | 0 | 88.9% | 0 |
| D5-EQC-010 | 8 | 7 | 87.5% | 0 | 88.9% | 0 |

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
| E01.shares_after | STATUS_DIFF | gold=extracted(249519764) mine=not_mentioned |
| E01.shares_before | STATUS_DIFF | gold=extracted(249519764) mine=not_mentioned |

**D5-EQC-007**

| 字段 | 判定 | 说明 |
|---|---|---|
| E01.method | VALUE_DIFF | gold="司法拍卖被动减持" mine="红豆集团被动减持" |

**D5-EQC-008**

| 字段 | 判定 | 说明 |
|---|---|---|
| E01.method | VALUE_DIFF | gold="集中竞价交易" mine="集中竞价交易方式增持" |

**D5-EQC-009**

| 字段 | 判定 | 说明 |
|---|---|---|
| E01.method | VALUE_DIFF | gold="集中竞价及大宗交易" mine="持股比例被动稀释及股份减少（集中竞价及大宗交易）" |

**D5-EQC-010**

| 字段 | 判定 | 说明 |
|---|---|---|
| E01.method | VALUE_DIFF | gold="协议转让" mine="协议转让。" |
