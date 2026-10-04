# D6-AWD-007 币种裁决 · 跨组确认记录

日期：2026-10-04
背景：方侧（规则与判定依据负责人）就问题 3 发出分工确认，评测侧据此核对。

## 一、方侧确认内容（原文要点）

> 问题 3 主要需要魏方修改实际抽取入口和相关工作文件，并重新生成验证批次。
> 1. 接入新版标准化规则：调整 `run_extract.mjs`，使用 D7 实现并传入同事件上下文，替换旧适配逻辑。
> 2. 落实 007 判定：明确选取公告披露的人民币子串，金额为 `317915000`、币种为 `CNY`，保留完整原文出处。
> 3. 重跑回归与批次：确认修订实际进入输出，其他案例没有受损。
> 分工：方负责规则与判定依据，魏负责抽取链路接入，宗负责确认并更新 Gold。
> 另：魏方 B 流程需兼容 D7 输出的精确十进制字符串，否则可能漏掉有效数值。

## 二、与宗侧裁决的一致性核对

| 项 | 方侧口径 | 宗侧实际 | 一致 |
|---|---|---|---|
| 金额 | `317915000` | Gold `bid_amount.value = 317915000` | ✅ |
| 币种 | `CNY` | Gold `currency.value = "CNY"` | ✅ |
| 原文出处 | 保留完整 | Gold `raw_value` 保留「173,800,000阿联酋迪拉姆（折合人民币317,915,000元）」；`provenance[0].quote` 含完整原句 | ✅ |
| 责任 | 方规则 / 魏接入 / 宗 Gold | 宗已于 `efc09451` 完成 Gold 更新 | ✅ |

**结论：三方口径一致，无冲突。宗侧「确认并更新 Gold」已完成（选项 A）。**

## 三、宗侧对「B 流程需兼容精确十进制字符串」的实测

方提出的风险已由评测侧在魏当前 D7 统一轮输出上实测（`weiwenyu@954381da`，`runs/batch-20261003T155712/envelopes`）：

- 扫描 envelopes：31 份（该轮 31/35 完成，4 份失败无信封）。
- 数值字段**数字类型**计数：181。
- 数值字段中**形如数字的字符串**计数：**0**。
- 抽样：`D6-AWD-002.bid_amount = 31624628.62`（JSON number，非字符串）；`D6-AWD-006.bid_amount = 809714662`。

**判定：该风险在当前 D7 输出上未触发（B 的 `typeof v === 'number'` 过滤不会丢失现有数值）。属潜在风险，建议 B 侧加防御性归一：字符串 `^\d+(\.\d+)?$` 先 `Number()` 再进锚点；同时对超过 `Number.MAX_SAFE_INTEGER` 的整数保留字符串比较。**

## 四、待办归属（问题 3 收口）

| 项 | 责任 | 状态 |
|---|---|---|
| 规则与判定依据 | 方 | 已出（本记录一） |
| 抽取链路接入 + 重跑批次 | 魏 | 待办 |
| Gold 更新 | 宗 | 已完成（`efc09451`） |
| B 数值类型防御 | 魏 | 待办（当前未触发） |
| 重跑后重新确认 437/437 | 宗 | 待魏批次到位 |

## 五、Gold 与方 proposed_fields 对齐（2026-10-04 追加）

- 方 `字段修订建议_D6.json` 给出 `proposed_fields`（`bid_amount` + `currency` 两字段）。
- 宗已把 `evaluation/D6/dev/gold/D6-AWD-007.envelope.json` 的这两个字段**逐字对齐**到该 `proposed_fields`：`raw_value="人民币317,915,000元"`、`value=317915000`、`unit=cny`、`currency=CNY`、含 `note`。
- 封存集相应重冻结为 **v0.3**；`verify-sealed.mjs` = PASS。

## 六、魏侧 436/437 的真实根因（评测侧定位）

魏 `runs/batch-20261004T093750/batch_report.json` 显示 `D6-AWD-007` 唯一一处：

```
E01.bid_amount  VALUE_DIFF  gold=173800000 mine=317915000
```

- 说明魏的输出**已是正确值 317915000**，但**对照用的 Gold 仍是旧版 173800000**。
- 定位：`scripts/jingguan/run_batch.mjs` 的 `GOLD_MANIFEST = corpus/zongbowen/dev/manifest.json`，指向魏仓库内 **宗 Gold 的副本**；该副本未随 `evaluation/` 更新。
- 对照逻辑（`compareEventFields`）只比较 `status` 与 `value`（`valuesEqual`），**不比较 `raw_value`/`note`**；`goldFieldSupported` 对数值型 value 直接放行。
- 结论：**宗侧 Gold 无需再改**；魏把 `corpus/zongbowen/` 的 Gold 副本从 `evaluation/` 重新同步，该批次即回 437/437。
