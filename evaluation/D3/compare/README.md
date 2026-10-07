# D3 field comparison

Run against a system batch report:

```powershell
node evaluation/D3/compare/compare-fields.mjs --batch-report runs/batch-YYYYMMDDHHMMSS/batch_report.json
```

Or against a directory containing files named `<case_id>.json`:

```powershell
node evaluation/D3/compare/compare-fields.mjs --system-dir path/to/normalized-runs
```

Outputs:

- `evaluation/D3/evidence/field-comparison.json`
- `evaluation/D3/field-comparison.md`

The comparer matches events by `event_id`, compares field status and value with numeric tolerance, and reports missing/extra events and fields.
