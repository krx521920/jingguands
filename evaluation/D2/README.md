# D2 deliverables

D2 scope:

- Add six controlled development fixtures and Gold answers.
- Add twenty standardization and format conformance tests.
- Target the shared event-envelope v0.3 contract.

## Fixtures

- `D2-PLD-001`: single pledge with current and cumulative values.
- `D2-PLD-002`: pledge with unresolved end date requiring `needs_review`.
- `D2-EQC-001`: decrease with before/after shares and ratios.
- `D2-EQC-002`: increase with a date range requiring `needs_review`.
- `D2-AWD-001`: tax-inclusive award with signed contract and formal notice.
- `D2-AWD-002`: tax-exclusive award with consortium split and undisclosed boundaries.

## Tests

Run:

```powershell
node evaluation/D2/tests/standardization-format.test.mjs
```

Coverage includes units, date formats, status mapping, null rules, denominator requirements, provenance requirements, table evidence, event type names, v0.3 envelope checks, and source support for every Gold quote.

Current result: 20/20 PASS.

Current Gold set: 6 envelopes, 72 fields, 67 evidence records, 0 unsupported quotes.

## Integration

The D2 technical integration passed on 2026-09-29 against the current team branches. Details are in `evaluation/integration/D2-integration-report.md` and `evaluation/integration/D2-status.json`.

The original D2 parse artifacts use `evidence/0.3`; the current Wei branch has moved on to `evidence/0.7` for the D3 parse path. Do not mix block identifiers across those versions.

## Boundary

These fixtures are controlled synthetic development data, not public evaluation data. They must not be used as sealed test data.
