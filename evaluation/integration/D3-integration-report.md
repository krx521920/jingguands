# D3 integration report

## Status

D3 is complete on upstream `origin/weiwenyu@8c637a7`.

## Final upstream verification

Source batch:

```text
runs/batch-20260929T152309
```

Results:

- documents: 5/5
- contract validation errors: 0
- D3 Gold field value accuracy: 100% for all five documents
- D3 Gold field differences: 0
- D3 Gold status consistency: 100% for all five documents
- multi-event Wanji extraction: 3/3 events
- 万股 unit handling: fixed upstream

## Out of scope

The latest upstream output also adds:

- `direction` fields for pledge events;
- a separate release event for D3-PLD-005.

These are D4-direction extensions and are not part of D3 Gold, so they do not count as D3 differences.

## PR disposition

PR #1 was closed as superseded because the same fix is already present in upstream `8c637a7`.

## Evidence

- `evaluation/D3/evidence/upstream-8c637a7-batch.md`
- `evaluation/D3/evidence/upstream-8c637a7-batch.json`
- `evaluation/D3/field-comparison.md`
- `evaluation/D3/evidence/field-comparison.json`
