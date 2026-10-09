# D1 冻结决策签署表

维护人：宗（评测侧）　最后更新：2026-10-09

## 一、六项决策（**以 `interface/event-envelope.schema.json` 为准，逐项核过行号**）

| # | 决策 | 权威定义 | 来源 |
|---|---|---|---|
| 1 | 事件类型 | **`award_contract`**（v0.3 由 `bid_won` 改名） | schema 描述行 |
| 2 | 字段状态枚举 | **6 值**：`extracted` / `not_disclosed` / `not_applicable` / `not_mentioned` / `unreadable` / `needs_review` | schema **line 77** |
| 3 | 内部英文单位 | **7 值**：`shares` / `cny` / `percent` / `date` / `date_range` / `text` / **`count`**（**保留位**：注册表 `scripts/jingguan/lib/registry.mjs` 目前 6 值、无字段使用 `count`） | schema **line 75** |
| 4 | 比例分母枚举 | **4 值 + null**：`holder_shares` / `total_share_capital` / `net_assets` / `other` / `null` | schema **line 79** |
| 5 | 证据结构 | 同时保留 `quote` 与结构化定位：`block_id` / `page` / `region` / `table_id` / `cell_ref` | schema `$defs` |
| 6 | 本次质押分项 | **显式字段**（`pledged_shares_this_time` / `_cumulative`），非数组 | schema properties |

**实践状态**：以上六项已在多轮真实运行中固定并被多方消费（A 信封 0.3、D7 统一轮 437/437、D8 16/16、D9 20/20、D10 10/10、D11 首测五段全绿）。

## 二、签署表

| 方 | 状态 | 证据 |
|---|---|---|
| 宗（评测侧） | **已签署** | 本文维护；2026-10-07 签署、2026-10-09 修订 |
| 魏 | **已确认（六条全部）** | 2026-10-09 书面回执：六条全部确认，第 4 项按勘误后 `holder_shares` 版本确认 |
| 张 | **已签署** | `reviews/D11-Z1Z2-D6入库与契约签字.md` |
| 方 | **逐项确认（第 4 项异议条件已满足）** | `契约v0.3逐项确认_D11.md`；其异议为 `held_shares` 写法，**我已勘误**，条件满足，待转"确认" |
| 陈 | **已签署** | `workspace/cjh/docs/C4_契约签字_陈家浩.md` |

## 三、勘误记录（维护人：宗）

### 勘误 1 · 比例分母写成 `held_shares`（2026-10-07）

- 原签署表第 4 项写 `held_shares` —— **错误**。实测 schema 用 **`holder_shares`**，`held_shares` 过不了校验。
- **责任：评测侧（宗）笔误。** 已更正。**方**在确认文件中保留第 4 项异议、未直接签"全部确认"——**正是这一保留抓出了错误**。

### 勘误 2 · 三处枚举写少（2026-10-09）

我按魏给出的来源路径（`interface/event-envelope.schema.json`）逐行核对，发现原表**三处不完整**：

| 项 | 我原写 | schema 实际 | 差 |
|---|---|---|---|
| 状态枚举 | 5 值 | **6 值**（含 `not_disclosed`） | 少 1 |
| 单位枚举 | 6 值 | **7 值**（含保留位 `count`） | 少 1 |
| 比例分母 | 2 值 | **4 值 + null**（含 `net_assets` / `other`） | 少 2 |

**均已按 schema 原文更正**，并标注 `count` 为保留位（注册表无字段使用）。

**责任**：仍为评测侧。两次勘误都不是业务问题，而是**签署表维护不严**。

## 四、说明

- "实践冻结"＝接口已在多轮真实运行中固定并被多方消费；**本表现已完成四方确认/签署**。
- 若任一成员要改动上述六项中的任一项，须回本表登记并触发评测侧重新验证（评测侧不追认未登记的改动）。
- **签字只保证"口径被确认"，不保证"实现正确"**——实现正确性由独立复核（评分器、封存集、留出变异集、逐条复算）证明。
