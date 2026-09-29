# D3 字段对比报告

- Gold 文档：5
- 已有系统输出的文档：5
- 待系统输出的文档：0

| 文档 | Gold 事件 | 系统事件 | 结果 |
|---|---:|---:|---|
| D3-PLD-001 | 3 | 1 | DIFF |
| D3-PLD-002 | 1 | 1 | MATCH |
| D3-PLD-003 | 1 | 1 | MATCH |
| D3-PLD-004 | 1 | 1 | DIFF |
| D3-PLD-005 | 1 | 1 | MATCH |

## 错误清单

| 文档 | 事件 | 字段 | 判定 | Gold | 系统 | 说明 |
|---|---|---|---|---|---|---|
| D3-PLD-001 | E02 | — | MISSING_EVENT | "" | "" |  |
| D3-PLD-001 | E03 | — | MISSING_EVENT | "" | "" |  |
| D3-PLD-004 | — | — | RUN_META_ERROR | "" | "" | [标准化] pledged_shares_cumulative: Shares must be whole shares |
| D3-PLD-004 | E01 | pledged_shares_this_time | VALUE_DIFF | 3640000 | 364 |  |
