# D3 integration report

## Status

Evaluation annotation and real-model comparison are complete. Two production defects remain to be fixed by the extraction/standardization owners.

## Completed

- 5 public pledge documents and 7 pledge events annotated.
- 91 fields and 84 evidence records.
- All Gold evidence quotes are supported by raw text.
- 5/5 Gold envelopes pass Wei's v0.3 schema/registry validator.
- Gold replay through the current runner: 5/5 documents, 7/7 events, 0 run errors.
- Real model outputs: 5/5 documents, using `deepseek-chat` and `evidence/0.7` parse inputs.

## Real comparison

| Case | Result | Detail |
|---|---|---|
| D3-PLD-001 万集科技 | DIFF | `E01` matches; `E02` and `E03` missing |
| D3-PLD-002 兰石重装 | MATCH | no field differences |
| D3-PLD-003 联创电子 | MATCH | no field differences |
| D3-PLD-004 中国天楹 | DIFF | `pledged_shares_this_time=364` instead of `3,640,000`; cumulative shares also raise a normalization error |
| D3-PLD-005 光线传媒 | MATCH | no field differences |

## Validated fix

The proposed runner patch in valuation/D3/handoffs/wei-runner-fix.patch was tested with real deepseek-chat calls:

- 5/5 documents; 7/7 events; 0 runner errors; 0 field differences.
- It fixes Wanji multi-event splitting and Tianying 万股 header-unit propagation.
- Production branches still need Wei/Fang to port the patch and re-run the upstream batch.

## Required fixes

1. **Wei/Fang**: propagate the table header unit (`万股`/`股`) into the normalization context. The model/runner must not treat the cell text `364.00` as 364 shares.
2. **Wei**: support or explicitly split multiple pledge events from one announcement. Wanji has three same-day pledge rows.
3. Re-run the same five documents after the fixes and compare against the frozen Gold.

## Evidence

- `evaluation/D3/field-comparison.md`
- `evaluation/D3/evidence/field-comparison.json`
- `evaluation/D3/evidence/real-runs/`
- `evaluation/D3/evidence/gold-replay-results.json`
