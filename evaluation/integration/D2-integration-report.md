# D2 对接实测报告

检查日期：2026-09-29。

## 结论

D2 的个人交付物和跨模块技术对接均已通过机检：

- 六份受控样例、Gold 信封和 20 条标准化/格式测试已对齐当前 v0.3 契约。
- Gold 中 67 条引文全部能在受控原文中命中，未发现悬空引文。
- 契约、方轩诚标准化、魏文宇校验器、陈家浩页面桥接、张智博 D2 结构检查均通过。
- 当前魏文宇分支的 3 类真实公告回放为 3/3 通过，`run_meta.errors=0`。
- 未发现 D2 技术阻断项。

注意：本报告只证明技术对接；没有记录第二人独立人工复核。如比赛流程要求复核签字，仍需补一条可追踪复核记录。

## 远端基线

| 成员 | 远端基线 |
|---|---|
| 魏文宇 | `origin/weiwenyu` `59c1d79` |
| 方轩诚 | `origin/feature/fang-rules` `24b7656` |
| 张智博 | `origin/zhangzhibo` `b108a85` |
| 陈家浩 | `origin/feature/chen-ui` `2e156fa` |
| 评测 | `origin/zongbowen` `7e6d0e7`（本次更新前） |

## 实测结果

| 检查 | 结果 | 证据 |
|---|---|---|
| 契约五方一致性 | 通过 | 3 类事件、36 个字段、6 种状态、schema v0.3 |
| 方轩诚标准化移植 | 通过 | D1 12 条 + D2 22 条，共 34/34 |
| D2 格式与原文支撑 | 通过 | 20/20；6 个信封、72 个字段、67 条引文、0 条不支持 |
| 魏文宇信封校验器 | 通过 | `runs/**/events.json` 共 77/77 |
| D2 Gold 共享契约校验 | 通过 | 使用 origin/weiwenyu 的实际 schema 与注册表，6/6 |
| 陈家浩页面桥接 | 通过 | 77 个文件、77 个事件、931 个字段、785 条证据、0 条悬空 |
| 张智博 D2 结构 | 通过 | 3/3；哈希、页数、块数、source_type 数量与 manifest 一致 |
| 当前解析→当前抽取回放 | 通过 | 3/3；质押、股权变动、中标均 0 个运行错误 |

## 本次修正

D2 Gold 原先保留了旧的 award `consortium` 单字段，且 `change_date` 与当前注册表不一致。现已完成：

- 拆分为 `consortium_members` 和 `consortium_shares`。
- 接入 `contract_signed`、`formal_award_notice_received`、`price_adjustment_status`、`recognized_revenue`。
- `change_date` 统一为 `date_range`。
- 测试 20 增加“所有 Gold 引文必须能在原文中命中”的检查。
- 重新计算受控 raw 文件哈希，并同步 manifest 与 Gold `source.file_sha256`。

## 版本边界

张智博的 D2 历史交付位于 `corpus/zhangzhibo/parse`，结构版本为 `evidence/0.3`；当前魏文宇分支已继续接入 `corpus/zhangzhibo/d3/parse` 的 `evidence/0.7`，块编号体系发生变化。

因此：

- 不把 `evidence/0.3` 的 D2 块 ID 直接送入当前 `evidence/0.7` 抽取回填链路；
- D2 历史产物按 D2 manifest 做结构和哈希核验；
- 当前端到端回放使用当前分支对应的 D3 解析输入。

这条边界属于版本切换，不是未修复的 D2 阻断项。

## 当前进度

- D2 个人交付：完成。
- D2 跨模块技术对接：完成并通过机检。
- D2 未记录的第二人独立人工复核：如流程要求，继续保留为待办。
