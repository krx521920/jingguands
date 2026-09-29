# D3 integration report

## Status

D3 evaluation Gold is complete and independently validated. Full five-document system comparison is partially complete because only the existing Wanji real run is available.

## Verified

- 5 public pledge documents and 7 pledge events are annotated.
- 91 fields and 84 evidence records are present.
- Every evidence quote is supported by the raw text snapshot.
- 5/5 Gold envelopes pass Wei's current v0.3 schema and registry validator.
- The existing Wanji system output matches Gold `E01` field-by-field.
- The existing Wanji output is missing Gold events `E02` and `E03`.

## Pending

System outputs are still required for:

- `D3-PLD-002` 兰石重装
- `D3-PLD-003` 联创电子
- `D3-PLD-004` 中国天楹
- `D3-PLD-005` 光线传媒

After Wei provides a batch report or normalized system envelopes, run:

```powershell
node evaluation/D3/compare/compare-fields.mjs --batch-report runs/batch-YYYYMMDDHHMMSS/batch_report.json
```

## Evidence

- `evaluation/D3/evidence/validation-results.json`
- `evaluation/D3/evidence/field-comparison.json`
- `evaluation/D3/field-comparison.md`
- `evaluation/D3/handoffs/D3-evaluation.md`
