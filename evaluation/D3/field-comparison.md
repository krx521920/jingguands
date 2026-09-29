# D3 字段对比报告

- Gold 文档：5
- 已有系统输出的文档：1
- 待系统输出的文档：4

| 文档 | Gold 事件 | 系统事件 | 结果 |
|---|---:|---:|---|
| D3-PLD-001 | 3 | 1 | DIFF |
| D3-PLD-002 | 1 | — | PENDING_SYSTEM_OUTPUT |
| D3-PLD-003 | 1 | — | PENDING_SYSTEM_OUTPUT |
| D3-PLD-004 | 1 | — | PENDING_SYSTEM_OUTPUT |
| D3-PLD-005 | 1 | — | PENDING_SYSTEM_OUTPUT |

## 错误清单

| 文档 | 事件 | 字段 | 判定 | Gold | 系统 |
|---|---|---|---|---|---|
| D3-PLD-001 | E02 | — | MISSING_EVENT | "" | "" |
| D3-PLD-001 | E03 | — | MISSING_EVENT | "" | "" |
| D3-PLD-002 | — | — | PENDING_SYSTEM_OUTPUT | "" | "" |
| D3-PLD-003 | — | — | PENDING_SYSTEM_OUTPUT | "" | "" |
| D3-PLD-004 | — | — | PENDING_SYSTEM_OUTPUT | "" | "" |
| D3-PLD-005 | — | — | PENDING_SYSTEM_OUTPUT | "" | "" |
