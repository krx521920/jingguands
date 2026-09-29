# D3 pledge development Gold

D3 scope: annotate five real public pledge announcements, keep page/cell evidence, run field comparison, and produce an error list.

## Delivered

- Five public disclosure sources in `dev/manifest.json`.
- Five raw text snapshots under `dev/raw/` (PDFs are not redistributed).
- Five v0.3 Gold envelopes under `dev/gold/`, containing seven pledge events:
  - `D3-PLD-001` 万集科技: three pledge transactions.
  - `D3-PLD-002` 兰石重装: one pledge transaction.
  - `D3-PLD-003` 联创电子: one supplementary pledge, non-specific end date.
  - `D3-PLD-004` 中国天楹: one pledge in 万股, non-specific end date.
  - `D3-PLD-005` 光线传媒: one pledge plus a separate release table.
- `tests/validate-d3.mjs`: validates units, statuses, denominators, evidence quotes, source hashes, and event counts.
- `compare/compare-fields.mjs`: compares Gold to a system batch report or a directory of system envelopes.
- `fetch_sources.py`: downloads public PDFs and verifies their SHA-256 before annotation.

## Commands

```powershell
# Validate Gold
node evaluation/D3/tests/validate-d3.mjs

# Download and verify source PDFs (optional; not committed)
python evaluation/D3/fetch_sources.py
```

## Current verification

- 5/5 documents, 7/7 events, 91/91 fields pass local structural and evidence checks.
- 84 evidence records; 0 unsupported quotes.
- 5/5 Gold envelopes pass Wei's v0.3 schema and registry validator.
- Upstream 11b110 fixes Wanji multi-event extraction; the remaining 万股 unit patch is validated at 5/5, 7/7 events, 0 errors, 0 field diffs.
- Gold replay through Wei's current runner: 5/5 documents, 7/7 events, 0 run errors, events equal to Gold.
- A real integration finding was recorded: 万股 table headers must propagate their unit into raw_value or the normalization context.
- Real model comparison: 3/5 documents match Gold exactly (`D3-PLD-002`, `D3-PLD-003`, `D3-PLD-005`).
- `D3-PLD-001`: system output matches `E01` but misses `E02` and `E03` (multi-event extraction defect).`n- `D3-PLD-004`: `pledged_shares_this_time` is 364 instead of 3,640,000 because the 万股 header unit is not propagated; cumulative shares also emit a normalization error.

## Source policy

The PDFs are public CNINFO disclosures, but the raw files are not redistributed in this repository. The manifest stores source URL and SHA-256 so the source can be fetched and checked offline.
