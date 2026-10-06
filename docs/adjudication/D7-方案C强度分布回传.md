# 方案 C 强度分布回传（宗校验器已可裁决，2026-10-06）

> 回传人：魏文宇　对象：宗 check-strength-tier.mjs（等待项清偿：181 unknown→0）
> 审计：runs/D7-normalization-audit-20261005.json（逐变更 evidence_strength＋unit_basis）

## 终判数据（宗校验器输出 runs/strength-tier-check.json）

| 指标 | 值 |
|---|---|
| 强度分布（181） | **strong 174**（quote_internal 103＋cell_header 71）· none 5 · conflict 2 · medium/weak/unknown 0 |
| value_changes | **0**（锁定项①守住） |
| **illegal_downgrades** | **71** —— 方 D7 严格化会把 71 个**强锚（cell 三重匹配）**字段降 needs_review，违反框架"仅 none/conflict 可降级" |
| 合法降级 | 5（EQC-010 段落裸数字，真 none）＋ 2（PLD-009，conflict） |

## 三个结论

1. **方案 C 的正确性被实证**：方的 76 处 UNIT_MISSING 降级中 71 处实际是 cell 级强锚——
   他判"无锚"是因为消费了我信封内的**精简块**（仅 7 键，无 source_type/table_ref）；
   用原始解析分类后这些字段本应 strong。维持现行 gold＋D7 审计层的 D8 建议被数据确认。
2. **信封内嵌块精简是根因之一**：建议后续 run_extract 的 parse_meta.blocks 保留
   source_type/table_ref/header_path（体积换保真），或下游一律走 parses-map 原始文件。
3. **真需要降级的只有 7 个字段**：EQC-010 的 5 个（段落裸数字无任何锚→none）＋
   PLD-009 的 2 个（conflict）——**gold 是否对这 7 个字段改 needs_review 请宗定**；
   若改，我半小时内出对照批次。

## 复现

```bash
node scripts/jingguan/audit_fang_d7.mjs --src tools/fang-d7 --envelopes runs/batch-20261005T063943/envelopes --out runs/D7-normalization-audit-20261005.json
node evaluation/integration/check-strength-tier.mjs --audit runs/D7-normalization-audit-20261005.json --json runs/strength-tier-check.json
```
