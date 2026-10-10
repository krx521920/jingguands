# 统一正式规则入口说明（D14 收口）· 魏文宇 2026-10-10

回应：外部评估文档给魏的"统一正式规则入口"＋方 D12.1 README 点名
（"魏应在生产装配中传入交易必要来源，不能把 AGGREGATE_PARTIAL_COVERAGE 当数值已勾稽；
正式接入须显式启用方插件，补足上下文，插件异常时保留疑点"）。

## 一、正典入口＝方规则库（--rules 插件）

**依据（数据说话）**：同一 46 例公开回归，方 D9 库直调 **46/46**、魏 `--rules` 入口
（修复 computed 透传＋context 种子后）**46/46**（钉码例 28/28）；魏内置启发式链仅
25/46（误报 6/43、漏报 2/3）。**正典判定一律走插件；内置链仅作插件缺席时的冒烟与
W7 合计勾稽辅助（`group_sum_reconciliation` 计算记录），不得宣称与插件等效。**

## 二、两个正式入口与上下文要求

| 入口 | 用途 | 上下文（今天的收口状态） |
|---|---|---|
| `run_d9_rules.mjs --rules <方库> --envelopes <dir>` | D9 评测/回归 | ①用例自带 `context.documents/parses`（方的 46 例集内置，46/46 即此形态）②成员信封按 `--envelopes` 目录补缺 |
| `verify_crossdoc.mjs --d9-enrich`＋`attribute_b.mjs --rules` | B 流生产 | **D14 起提供批次全信封上下文**：`d9_context.documents/parses` 从"仅组成员"扩为整个批次目录（31/31 实测）——合计勾稽的交易第三方来源（如 RULE-004 的四人明细在 EQC-001）从此在上下文内。此形态＝方 46/46 验证用的完整上下文 |

**上下文纪律**：需要程序化合计的判定，上下文必须含全部交易相关信封；缺来源时输出
`AGGREGATE_PARTIAL_COVERAGE` 属"部分覆盖"如实结论，**不得当作数值已勾稽**（方 D12.1 意见，已采纳）。

## 三、失败语义（不得回落）

插件异常/缺席时：记录 fallback 原因，判定保留疑点（insufficient 族），**绝不回落到无证据
启发式后仍宣称全绿**（B2 精神在规则层的对应）。`--verify-blocks` 块级核验与
`requires_programmatic_sum` 计算记录断言（宗 W7 评分器）在两种入口下同样生效。

## 四、版本与追溯

- 方库版本：**D12.1**（`tools/fang-attribution/src_D9`，7 文件与 feature/fang-rules@af4348be 字节一致，
  归因模块仅换行差异双方登记）；版本号在库内 `VERSION` 导出。
- 本入口说明的三个实证锚点：46/46 回归（`evaluation/D12/wei-runs/fang46-bridge-check.json`）、
  生产全上下文（31/31 documents＋parses，13/13 组判定保持）、门禁 17 道全绿。
