# D1 deliverables

Source task: freeze the annotation specification and scoring denominators, then provide one development fixture and Gold answer for each initial event type.

Deliverables:

- `specs/annotation-standard-v0.1.md`
- `specs/metric-definitions-v0.1.md`
- `schemas/evidence.schema.json`
- `schemas/event-answer.schema.json`
- `dev/manifest.json`
- three raw development fixtures and three Gold answers
- `scorecards/field-score-template.csv`
- `tests/validate-d1.mjs`
- `handoffs/D1-evaluation.md`

The three fixtures are extracted from public disclosures published on 巨潮资讯. Raw fixtures retain the source URL, source hash, extracted page text, and event metadata; Gold answers reference the same source hash.
