# 批量运行报告 20260930T091256

- 输入：1 份（成功 1）；契约校验问题合计 0 条
- 模式：真实模型调用

| 案例 | 类型 | run_id | 字段状态 | 校验问题 |
|---|---|---|---|---|
| D4-PLD-009 | pledge | 20260930T091256-pledge-aa54 | {"extracted":34,"not_mentioned":8} | 0 |

## Gold 对照（开发期错误定位；正式成绩以评测脚本为准）

| 案例 | gold应提取 | 值命中 | 字段准确率 | 错误填充 | 状态一致率 | gold不可支撑 |
|---|---|---|---|---|---|---|
| D4-PLD-009 | 10 | 7 | 70.0% | 2 | 78.6% | 0 |

### 差异明细

**D4-PLD-009**

| 字段 | 判定 | 说明 |
|---|---|---|
| (E01 有格投资) | MINE_MISSING_EVENT | gold 事件未在系统输出中找到（键：有格投资\|中国银河证券股份有限公司\|pledge） |
| (E02 有格投资) | MINE_MISSING_EVENT | gold 事件未在系统输出中找到（键：有格投资\|光大证券股份有限公司\|pledge） |
| E03.pledged_ratio_this_time_of_held | STATUS_DIFF | gold=extracted(5.98) mine=not_mentioned |
| E03.pledged_ratio_this_time_of_total | STATUS_DIFF | gold=extracted(1.24) mine=not_mentioned |
| E03.pledged_shares_this_time | VALUE_DIFF | gold=19254000 mine=18564000 |
| (E01 有格创业投资有限公司) | MINE_EXTRA_EVENT | 系统多出的事件（键：有格创业投资有限公司\|中国银河证券股份有限公司\|pledge） |
| (E02 有格创业投资有限公司) | MINE_EXTRA_EVENT | 系统多出的事件（键：有格创业投资有限公司\|光大证券股份有限公司\|pledge） |
