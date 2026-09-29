# D3 evaluation handoff

## Completed

- Five public pledge announcements selected and downloaded for annotation.
- Coverage includes table/page variations such as: multi-event, 万股 units, supplementary pledge, non-specific end date, and slash dates.
- Five v0.3 Gold envelopes generated with document/page/cell evidence.
- 7 events, 91 fields, 84 evidence records; 0 unsupported quotes.
- Gold shared-schema validation against origin/weiwenyu is 5/5.
- Gold replay through Wei's current runner is 5/5 documents, 7/7 events, 0 run errors, and events equal to Gold.
- Real integration finding: 万股 table headers must propagate their unit into raw_value or normalization context; otherwise the runner misreads 364.00 万股 as 364 shares and rejects fractional share cells.

## Current field-comparison state

- `D3-PLD-001` E01 matches the existing system output.
- The existing system output misses E02 and E03 for `D3-PLD-001`.
- `D3-PLD-002` through `D3-PLD-005` are pending system model outputs.
- Run `evaluation/D3/compare/compare-fields.mjs` after Wei provides a D3 batch report or system envelope directory.

## Handoff

- **Zhang**: consume the five source URLs/hashes from `dev/manifest.json`; parser output should be `evidence/0.7`.
- **Wei**: run the five raw fixtures through the pledge extraction path and return `runs/batch-*/batch_report.json`.
- **Fang**: verify 万股→股、percentage points, denominator, and non-specific date handling.
- **Chen**: consume the resulting v0.3 envelopes and show page/cell evidence.

The evaluation side is complete for annotation and validation. Full five-document comparison remains dependent on the system outputs for four documents.
