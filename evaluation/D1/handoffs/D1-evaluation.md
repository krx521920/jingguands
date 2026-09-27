# D1 evaluation handoff

## Planned

- Freeze annotation rules and scoring denominators.
- Create one development fixture and Gold answer for pledge, equity change, and award/contract.

## Produced

- Annotation specification v0.1.
- Metric and denominator definitions v0.1.
- Evidence and answer JSON Schemas.
- Three raw fixtures and three Gold answers.
- Field scoring CSV template.
- Local D1 validator and validation summary.
- This handoff record.

## Verification

Run: `node evaluation/D1/tests/validate-d1.mjs`

Expected: validation status PASS, three samples, explicit boundary checks for award status, contract signature, revenue recognition, and undisclosed price adjustment.

## Open items

- Complete second-person review of the three public Gold answers.
- Assign a second reviewer for every Gold answer.
- Confirm the event-answer schema with魏, the document/evidence schema with张, and normalization/conflict fields with方.
- Keep seeded test data out of the sealed test set.

## Independence

No production source, prompt, parser, normalization rule, or UI code is modified by this deliverable.
