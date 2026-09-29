# D3 evaluation handoff

## Completed

- Five public pledge announcements selected, fetched, hash-verified, and annotated.
- Five v0.3 Gold envelopes with web/page/cell evidence.
- 7 events, 91 fields, 84 evidence records; 0 unsupported quotes.
- Gold shared-schema validation against `origin/weiwenyu` is 5/5.
- Gold replay through Wei's current runner is 5/5 documents, 7/7 events, 0 run errors, and events equal to Gold.
- Real model batch: 5/5 documents have `deepseek-chat` outputs.

## Real field comparison

- `D3-PLD-002` 兰石重装: MATCH.
- `D3-PLD-003` 联创电子: MATCH.
- `D3-PLD-004` 中国天楹: DIFF. System returns `pledged_shares_this_time=364` instead of `3,640,000`; `pledged_shares_cumulative` also raises `Shares must be whole shares`.
- `D3-PLD-005` 光线传媒: MATCH.
- `D3-PLD-001` 万集科技: system produces `E01` only; Gold has `E01/E02/E03`. `E01` matches, two events are missing.

## Validated proposed fix

- valuation/D3/handoffs/wei-runner-fix.patch passed a real-model rerun: 5/5 documents, 7/7 events, 0 run errors, 0 field differences.
- The patch adds multi-event row splitting, cumulative-table linkage, and 万股 header-unit propagation.
- This is a local validation patch; the production branches still need the owner to apply it.

## Required production fixes

- **Wei**: support multi-event extraction for one announcement, or explicitly split the three Wanji pledge rows into three events.
- **Wei/Fang**: propagate table column units from `header_path` into normalization context or `raw_value`. The 万股 header must turn `364.00` into `3,640,000` shares and `27,495.8065` 万股 into `274,958,065` shares.
- Re-run the five real cases after fixes; the evaluation comparer is already ready.

## Evidence

- `evaluation/D3/evidence/real-runs/`
- `evaluation/D3/evidence/field-comparison.json`
- `evaluation/D3/field-comparison.md`
- `evaluation/D3/evidence/gold-replay-results.json`
