# D7 sealed test freeze

Date: 2026-10-02
Revised: 2026-10-04 (v0.3)

## Revision history

- **v0.2** — `D6-AWD-007` Gold `bid_amount` 值修正为 `317915000`（选项 A）。
- **v0.3** — `D6-AWD-007` 的 `bid_amount` / `currency` 两字段按方 `字段修订建议_D6.json` 的 `proposed_fields` 对齐（`raw_value` 取公告明示的人民币子串 `人民币317,915,000元`、`currency=CNY`、补 `note`）。
  - 仅 `D6-AWD-007` 的 Gold 哈希变化；**原始语料（raw）与跨文档分组/预期关系未改动**。
  - 因分组与预期关系不变，魏侧跨文档回放结论继续成立。

## Contents

- 30 single-document frozen cases.
- 20 cross-document groups:
  - 4 related groups;
  - 16 unrelated/control groups.
- `hash-lock.json` freezes manifest, raw, Gold, and member hashes.

## Important scope

This D7 seal is a **frozen replay set of the public 30-document corpus**. It does not claim that these documents are unseen. The purpose is to freeze exact inputs, Gold, and cross-document expectations before first full test and regression.

A later sealed/unseen corpus can be added without changing this lock.

## Files

- Single manifest: `single/manifest.json`
- Cross-document manifest: `cross-doc/manifest.json`
- Hash lock: `hash-lock.json`
- Verification: `verification.json`

Run:

```powershell
node evaluation/sealed/verify-sealed.mjs
```
