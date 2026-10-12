# D2 evaluation handoff

## Produced

- Six controlled fixtures and Gold envelope answers under `dev/`.
- A six-item manifest in `dev/manifest.json`.
- Twenty standardization and format tests.
- Machine-readable results in `evidence/standardization-format-results.json`.
- Contract gap notes in `contract-gaps.md`.

## Verification

Command:

```powershell
node evaluation/D2/tests/standardization-format.test.mjs
```

Result: 20/20 PASS.

## Integration state

- All fixtures conform to field registration, unit, status, denominator and provenance rules used by the evaluator.
- Public D1 fixtures remain the source-verified examples.
- D2 fixtures are controlled synthetic development data and are excluded from sealed tests.

## Pending

- Run the same conformance cases against actual Wei/Fang outputs during joint integration.
- Contract owner still needs to add award boundary fields and missing runner library files.
