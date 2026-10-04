# D7 sealed test freeze

Date: 2026-10-02
Revised: 2026-10-04 (v0.2)

## Revision v0.2

- Trigger: 宗侧裁决 `D6-AWD-007` 币种口径为选项 A（`bid_amount 173800000 -> 317915000`, `currency=CNY`）。
- Scope: **仅** `D6-AWD-007` 的 Gold 哈希重冻结；原始语料（raw）与跨文档分组/预期关系**未改动**。
- Effect: `single`/`cross-doc` manifest 与 `hash-lock` 的版本号升为 `v0.2`，相关 sha256 改变；20 组跨文档的成员与 `expected_relation` 不变，故魏侧 20/20 回放结论仍成立。

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
