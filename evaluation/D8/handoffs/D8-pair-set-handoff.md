# D8 配对开发集交接单（评测侧 → B 流程）

日期：2026-10-04
交出人：宗（评测侧）
收件人：魏（B 入口/跨文档核验）、方（同事件对齐规则）、陈（多文件页面）

## 一、交接物

`evaluation/D8/pairs/pairs.dev30.json`：13 组配对清单，结构与封存清单一致，**可直接作为 B 流程 `--manifest` 输入**：

```powershell
node scripts/jingguan/verify_crossdoc.mjs --envelopes-dir <envelopes> `
  --manifest evaluation/D8/pairs/pairs.dev30.json --expect
```

- 同事件 4 组（`D8-PAIR-001..004`）：科创新材 3 组、海正药业 1 组。
- 不同事件 8 组（`D8-PAIR-005..012`）：同类型不同主体 5 组、跨类型不同主体 3 组。
- 证据不足 1 组（`D8-PAIR-013`）：`pledge-scan-degrade`（0 可用字段）× `D6-AWD-001`。

每组带 `member_meta`（证券代码、公告编号、主体名、raw/gold sha256），用于双侧版本可追踪。

## 二、请魏处理（B 侧，1 条接口要求）

1. **为 `D8-PAIR-013` 输出第三态**：一侧 0 可用字段时，`predicted_relation` 应为 `"unknown"`，或在 `reasons[]` 中含 `"INSUFFICIENT_SIGNALS"`；不得仅凭"无共享实体/无共享锚点"就断言 `unrelated`。
2. 请把该组纳入一次真实 B 运行（envelopes 需含 `pledge-scan-degrade.json`），评分脚本 `--strict` 才能全绿。
3. 其余 12 组已用你 `954381da` 的报告摘录离线验证：`12 pass / 0 fail`（`same_event 4/4`、`different_event 8/8 clean`）。

## 三、请方处理（对齐规则）

- 用本清单做 D08-4 对齐规则的**公开开发集**：`--matcher <module>` 接入后，评分脚本应按同一口径输出。
- 关键负例：`D8-PAIR-005..012` 必须 `unrelated` 且 0 conflict；`D8-PAIR-013` 必须信息不足。
- **提醒**：`D8-PAIR-010`/`011`/`012` 是跨类型负例；质押/中标无 increase/decrease 方向，反向咬合不应误触发。

## 四、请陈处理（页面）

- 双栏原文页需显示每组的 `member_meta.issuer_code` / `notice_number`，体现"双侧文件版本可追踪"。
- `D8-PAIR-013` 页面须显示"证据不足/无法判定"，不能渲染成"不同事件"。

## 五、诚实边界

公开 30 份开发集只含 4 组可核验同事件配对（科创新材 3 + 海正药业 1）。计划表建议的 6 组同事件需扩充公开语料才能达到；本清单据实交付 4 组，不虚构配对。
