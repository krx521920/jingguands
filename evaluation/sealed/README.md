# D7 sealed test freeze

Date: 2026-10-02

## Contents

- 30 single-document frozen cases.
- 20 cross-document groups:
  - 4 related groups;
  - 16 unrelated/control groups.
- `hash-lock.json` freezes manifest, raw, Gold, and member hashes.

## Important scope

This D7 seal is a **frozen replay set of the public 30-document corpus**. It does not claim that these documents are unseen. The purpose is to freeze exact inputs, Gold, and cross-document expectations before first full test and regression.

A later sealed/unseen corpus can be added without changing this v0.1 lock.

## Files

- Single manifest: `single/manifest.json`
- Cross-document manifest: `cross-doc/manifest.json`
- Hash lock: `hash-lock.json`
- Verification: `verification.json`

Run:

```powershell
node evaluation/sealed/verify-sealed.mjs
```
