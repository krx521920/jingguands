# D4 integration report

## Delivered

- 10 pledge documents
- 13 pledge events
- 182 fields
- 169 evidence records
- 20 evidence spot checks
- scan degradation challenge

## Verification

- Local D4 validator: PASS
- Shared v0.3 validator on D4 Gold: 10/10 PASS
- Unsupported quotes: 0
- Scan challenge: explicit `SCANNED + scan_region + degraded + NOT_PARSED`

## Current model differences

- `D4-PLD-005`: upstream adds a release event.
- `D4-PLD-006`: announcement date inferred as 2026-09-24 instead of Gold 2026-09-25.
- `D4-PLD-007`: announcement date inferred as 2026-09-24 instead of Gold 2026-09-25.
- `D4-PLD-008`: start date missing in Gold; upstream has 2026-09-23.
- `D4-PLD-009`: upstream adds a release event.

The D4 annotation deliverable is complete. Release-event direction and date normalization remain the joint adjudication items for D4 closure.

## Evidence

- `evaluation/D4/evidence/validation-results.json`
- `evaluation/D4/evidence/spot-checks.json`
- `evaluation/D4/evidence/field-comparison.json`
- `evaluation/D4/evidence/scan-results.json`
