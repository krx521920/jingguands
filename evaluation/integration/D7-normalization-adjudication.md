# D7 标准化严格性差异 · 裁决（方案 C：分层）

评测侧（宗）｜2026-10-05｜状态：**已落签（框架）**

## 一、核证结论（先核后签）

对魏 `docs/adjudication/D7-标准化严格性差异-证据页.md` 与其 `runs/D7-normalization-audit-20261005.json` 逐项复核：

| 项 | 证据页 | 实测复核 | 一致 |
|---|---|---|---|
| 变更总数 | 181 | 181 | ✅ |
| 类型等价 | 103 | 103 | ✅ |
| 状态降级 | 76+2 | 78 | ✅ |
| 值语义变化 | 0 | **0**（每条 before.value === after.value） | ✅ |
| 影响面 | 降级 16/30 | 降级 16/30；含类型等价共 **28/30** 文档被触及 | 补充 |

**核心事实：181 处变更里，`value` 一处未变。争议只在"单位证据的强度表述"。**

## 二、判据（写死，不留自由裁量）

| 级别 | 判据（须同时满足） | status | 新字段 |
|---|---|---|---|
| **强锚** | `source_type=cell` ∧ `table_id/cell_ref` 匹配 ∧ `quote ∈ 该块文本` | `extracted` | `unit_basis=cell_header`、`evidence_strength=strong` |
| **中锚** | 块级 `header_path` 锚（现行抽取期口径，原文真实存在） | **`extracted`（不降级）** | `unit_basis=block_header`、`evidence_strength=medium` |
| **弱锚** | 仅表级/行级 hint 或跨页/跨列回退 | `extracted` | `unit_basis=table_hint`、`evidence_strength=weak` |
| **无锚** | 三种都不成立 | `needs_review` | `unit_basis=none`、`evidence_strength=none` |
| **冲突** | 两处锚互相矛盾（如 D4-PLD-009 E03） | `needs_review` | `unit_basis=conflict`、`evidence_strength=conflict` |

- 强锚 = 方的 `resolveUnitHints` 三重匹配口径，**原样采纳**。
- 中锚 = 魏指出的现存 `header_path` 锚，**认定为真实证据而非猜测**，故不降级。
- 仅"无锚/冲突"才降级——即方口径中真正无据的那部分。

## 三、字段规范（新增，不改 schema 0.3 既有键）

```jsonc
{ "value": 2100000, "status": "extracted", "standardized": true,
  "unit_basis": "block_header",          // cell_header | block_header | table_hint | none | conflict
  "evidence_strength": "medium" }        // strong | medium | weak | none | conflict
```

向后兼容：老消费端忽略新键不影响行为；新消费端按 `evidence_strength` 决定是否可比。

## 四、下游约束

1. **B/D9 归因**：`evidence_strength ∈ {weak, none, conflict}` 的字段**默认不参与跨文档数值矛盾比较**，除非另有强锚佐证；参与时必须标注强度。
2. **陈的页面**：显示证据强度徽章；`none/conflict` 走"证据不足/冲突"态，不得显示为矛盾。
3. **张的解析侧**：把块级 `header_path` 锚升到 cell 级可提升强度（工作量受益项，非阻塞）。
4. **魏**：`audit_fang_d7.mjs` 保留为审计层，输出强度分布，不回写信封。

## 五、实测影响面（本轮量化）

- **D9 直接受影响**：`RULE-010`（`pledged_shares_this_time` / `_cumulative`）与 `RULE-012`（`pledged_ratio_this_time_of_held` / `_of_total`）**正是被方判 downgrade 的那批字段**。
  - 若一刀切收紧：这 4 个字段 → `needs_review`，两案例**无法判定**，用例集返工。
  - 分层下：字段保持 `extracted`，仅标 `medium/weak`，两案例照常成立。
- **D8**：`related` 判定依赖的锚点若落在无锚/冲突级，需复核是否失去支撑（本轮 78 处降级均为 shares/percent 表格裸数字，与 D8 的实体/反向咬合信号不重叠，故预期无影响，仍待回归确认）。

## 六、明确不改

- **不改 30 份 gold 的 `value`**；不重写已推送信封；**封存集不动**（v0.3 有效，不触发 v0.4）。
- 437/437 等既有指标**不重算**。先前结论成立的前提是"值正确"，本轮裁决未否定任何值。

## 七、可修订条款（签署的一部分）

**默认确认规则**：四方未在合理期限内提出异议，由轮值主持人裁定视为**框架确认**；默认可确认框架，不替代细则回复（细则仍须回传后方可定 `none`/`conflict` 清单）。本次魏＝默认确认（2026-10-05）。


本裁决为**分层框架**：

- **锁定项**（改动需重新裁决）：不改 value / Gold / 封存集；无锚与冲突才降级；弱锚及以下不进跨文档数值矛盾比较。
- **可修订项**（由评测侧维护人在收到魏重跑分布后直接修订，无需重走五方）：锚强度分界细则；`none` / `conflict` 的具体清单。
- 任何修订**不得**触碰锁定项；不得借修订改变既有 `value`。

## 八、签署

| 方 | 角色 | 状态 |
|---|---|---|
| 宗（评测侧） | 判据制定 + Gold 守护 | **已签署（框架）2026-10-05** |
| 魏 | 审计层 + 强度字段落地 | **已确认（框架）**｜轮值主持人裁定默认确认 2026-10-05；3 项细则仍待回，按可修订条款处理 |
| 方 | 强锚判据提供方（已提供） | 框架知悉 |
| 张 | 锚强度提升（非阻塞） | 框架知悉 |
| 陈 | 强度徽章渲染 | 框架知悉 |
