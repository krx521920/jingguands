# D3 字段对比报告

- Gold 文档：10
- 已有系统输出的文档：10
- 待系统输出的文档：0

| 文档 | Gold 事件 | 系统事件 | 结果 |
|---|---:|---:|---|
| D4-PLD-001 | 3 | 3 | MATCH |
| D4-PLD-002 | 1 | 1 | MATCH |
| D4-PLD-003 | 1 | 1 | MATCH |
| D4-PLD-004 | 1 | 1 | MATCH |
| D4-PLD-005 | 1 | 2 | DIFF |
| D4-PLD-006 | 1 | 1 | DIFF |
| D4-PLD-007 | 1 | 1 | DIFF |
| D4-PLD-008 | 1 | 1 | DIFF |
| D4-PLD-009 | 2 | 3 | DIFF |
| D4-PLD-010 | 1 | 1 | MATCH |

## 错误清单

| 文档 | 事件 | 字段 | 判定 | Gold | 系统 | 说明 |
|---|---|---|---|---|---|---|
| D4-PLD-005 | E02 | — | EXTRA_EVENT | "" | "" |  |
| D4-PLD-006 | E01 | announcement_date | VALUE_DIFF | "2026-09-25" | "2026-09-24" |  |
| D4-PLD-007 | E01 | announcement_date | VALUE_DIFF | "2026-09-25" | "2026-09-24" |  |
| D4-PLD-008 | E01 | start_date | VALUE_DIFF | "" | "2026-09-23" |  |
| D4-PLD-008 | E01 | announcement_date | STATUS_DIFF | "extracted" | "not_mentioned" |  |
| D4-PLD-009 | E03 | — | EXTRA_EVENT | "" | "" |  |
