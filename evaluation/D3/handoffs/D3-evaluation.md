# D3 evaluation handoff

## Rechecked upstream baseline

- `origin/weiwenyu` is now `a11b110`.
- Wei has already fixed Wanji multi-event extraction: real model returns 3 events and all 33 extracted fields match Gold.
- The remaining upstream defect is China Tianying `D3-PLD-004`: `364.00` 万股 is normalized as 364 shares, and the cumulative shares field raises `Shares must be whole shares`.

## Validated minimal patch

- Patch: `evaluation/D3/handoffs/wei-runner-fix.patch`
- Applies cleanly to `origin/weiwenyu@a11b110`.
- It only propagates the table header unit (`万股`/`股`) into `raw_value` before normalization.
- Real-model validation on `a11b110 + patch`: 5/5 documents, 7/7 events, 0 run errors, 0 field differences.

## Handoff

- Wei should apply the patch to `run_extract.mjs`, run the five D3 documents, and push.
- Fang should confirm that header-unit inheritance before normalization matches the normalization contract.
- The evaluation comparer and Gold are frozen and ready.

## Evidence

- `evaluation/D3/evidence/fix-validation/`
- `evaluation/D3/evidence/fixed-comparison.json`
- `evaluation/D3/field-comparison.md`
