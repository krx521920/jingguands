# D3 integration report

## Current status

Upstream `origin/weiwenyu@a11b110` has been rechecked with real `deepseek-chat` calls on all five D3 documents.

## Upstream comparison

| Case | Result | Detail |
|---|---|---|
| D3-PLD-001 万集科技 | MATCH | 3/3 events, 33 extracted fields, 0 errors |
| D3-PLD-002 兰石重装 | MATCH | no differences |
| D3-PLD-003 联创电子 | MATCH | no differences |
| D3-PLD-004 中国天楹 | DIFF | 364.00 万股 becomes 364 shares; cumulative shares raises a normalization error |
| D3-PLD-005 光线传媒 | MATCH | no differences |

## Validated fix

The minimal patch `evaluation/D3/handoffs/wei-runner-fix.patch` applies to `a11b110` and was validated with real model calls:

- 5/5 documents
- 7/7 events
- 0 run errors
- 0 field differences

The patch only fixes the remaining issue: table header units (`万股`/`股`) are propagated into `raw_value` before normalization.

## Remaining action

- Wei: apply the validated patch to `run_extract.mjs`, rerun D3, and push.
- Fang: confirm the unit inheritance rule in the standardization path.
- Evaluation: no further Gold/data work remains.

## Evidence

- `evaluation/D3/evidence/fix-validation/`
- `evaluation/D3/evidence/fixed-comparison.json`
- `evaluation/D3/field-comparison.md`
