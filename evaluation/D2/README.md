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
- `D2-AWD-001`: tax-inclusive award and contract note.
- `D2-AWD-002`: tax-exclusive award with consortium split.

## Tests

Run:

```powershell
node evaluation/D2/tests/standardization-format.test.mjs
```

Coverage includes units, date formats, status mapping, null rules, denominator requirements, provenance requirements, table evidence, event type names, and envelope version checks.

Current result: 20/20 PASS.

## Boundary

These fixtures are controlled synthetic development data, not public evaluation data. They must not be used as sealed test data.
