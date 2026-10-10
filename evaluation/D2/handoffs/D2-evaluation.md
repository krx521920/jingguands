# D2 evaluation handoff

## Produced

- Six controlled fixtures and Gold envelope answers under `dev/`.
- A six-item manifest in `dev/manifest.json`.
- Twenty standardization, format, contract, and source-support tests.
- Machine-readable format results in `evidence/standardization-format-results.json`.
- Machine-readable Gold source-support counts in `evidence/gold-source-support.json`.

## Verification

Command:

```powershell
node evaluation/D2/tests/standardization-format.test.mjs
```

Result: 20/20 PASS.

## Integration state

- All six Gold envelopes align with the current v0.3 field registry, including award boundary fields and split consortium fields.
- Every Gold provenance quote is a substring of its controlled raw fixture.
- Fang D1+D2 normalization: 34/34 PASS.
- Wei envelope validator: 77/77 files PASS.
- Chen page bridge: 77/77 files, 931 fields, 785 evidence records, 0 dangling evidence.
- Zhang D2 historical structure: 3/3 cases match manifest hashes, page counts, block counts, and source-type counts.
- Current Wei replay: pledge, equity_change, and award_contract 3/3 with zero `run_meta.errors`.

## Version boundary

Zhang's historical D2 parse outputs are `evidence/0.3`; the current Wei tip consumes the later `corpus/zhangzhibo/d3/parse` `evidence/0.7` path. Block IDs must not be mixed across those versions.

## Remaining process item

No D2 technical blocker remains. If the competition workflow requires independent second-person review, record that review separately; it is not established by machine checks alone.
