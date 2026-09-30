# D4 integration report

## Status

D4 is complete.

## Delivered

- 10 pledge documents
- 15 events
- 210 fields
- 191 evidence records
- 20 evidence spot checks
- scan degradation challenge

## Verification

- Local D4 validator: PASS
- Shared v0.3 validator on D4 Gold: 10/10 PASS
- Current real-model comparison: 10/10 documents MATCH
- Field differences: 0
- Event differences: 0
- Unsupported quotes: 0
- Scan challenge: explicit `SCANNED + scan_region + degraded + NOT_PARSED`

## Coverage

D4 includes complex table variants, missing/undisclosed fields, same-value multiple locations, `direction=pledge/release`, and an explicit scan degradation challenge.

## Evidence

- `evaluation/D4/evidence/validation-results.json`
- `evaluation/D4/evidence/spot-checks.json`
- `evaluation/D4/evidence/field-comparison.json`
- `evaluation/D4/evidence/scan-results.json`
