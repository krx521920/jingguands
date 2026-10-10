# D11 首次封存测试 · 启动与输入清单（评测侧）

日期：2026-10-07｜交付人：宗（评测侧）
**本文同时用于说明：宗侧产出全部在 `zongbowen` 分支，不在 develop/master。**

## 一、冻结版本（已确认存在）

```
tag   v0.6-d11-firsttest
commit 4a8d0c33
```

另有基线 `v0.5-d7-baseline@e7ee9dfe`。

## 二、宗侧已有资产（可立即评测，均已推送 `zongbowen`）

| 资产 | 位置 | 状态 |
|---|---|---|
| 封存单文档 30 例（hash-lock） | `evaluation/sealed/single/manifest.json` | v0.3，`verify-sealed` PASS |
| 封存跨文档 20 组（4 相关＋16 对照） | `evaluation/sealed/cross-doc/manifest.json` | 同上 |
| 五项指标（单文档） | `evaluation/dev-30/five-metric-report.json` | 已出 |
| 跨文档评分 | `evaluation/D8/score-pairs.mjs` | 已在真数据上验证 13/13、16/16 |
| 归因评分 | `evaluation/D9/score-rules.mjs` | 20 用例，自检 PASS |
| 集成与缓存校验 | `evaluation/D10/check-integration.mjs` | 10 组，自检 PASS |
| 分层框架校验 | `evaluation/integration/check-strength-tier.mjs` | 已上线 |

## 三、首测所需输入（请魏在 `4a8d0c33` 冻结态产出）

1. `envelopes/`：30 份单文档 + 20 组跨文档成员（单文件 JSON，含 `source.file_sha256`、`block_id`、`quote`）。
2. 批次报告：每份的 `run_id` / `code_version` / `schema_version` / `is_mock`。
3. 缓存与重跑日志：`replay_business_fields_identical`、`cold_cache_new_call_log`、`web_cli_same_result` 三项证据。
4. 失败清单：4 份对抗样本的失败原因（保留在分母，不删除）。

## 四、首测执行顺序（计划要求：先冻结独立跑，开发不干预）

1. 魏以 `4a8d0c33` 跑全量 → 推 `envelopes/` 与批次报告；
2. 宗用封存集 **独立打分**（不读开发侧结论），锁存原始输出与成绩；
3. 出首测报告 + 原始日志 + 失败清单，按「事件/真实合成/文本扫描」分层；
4. 结果发布后，五人再按抽取/解析/评测/规则/展示各自定位。

## 五、当前阻塞（如实登记）

**宗侧无法自行执行抽取管线**（需模型调用与魏的运行环境），故首测的步骤 1 必须由魏产出后我方才能跑步骤 2-3。
在此之前，宗侧的 D10「10 组集成结果」与 D11「首测结果」**均处于等输入状态**——这不是未开工，而是输出依赖上游批次。

## 六、提示（避免重复误判）

- 宗侧产出**只在 `zongbowen` 分支**；`develop` 停在 2026-09-24、`master` 停在 2026-10-03，两处都看不到近期任何人的评测产出。
- 建议查看路径：`https://github.com/krx521920/jingguands/commits/zongbowen`
