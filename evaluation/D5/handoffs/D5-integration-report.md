# D5 integration handoff

## Verified

- Evaluation Gold: 10 documents, 16 events, 144 fields; contract validation PASS.
- Challenge suite: 10/10 expected; direction inversion and ratio-conflict behavior covered.
- Zhangzhibo `be86f4d9`: official D5 parse package verified 10/10 for source hash, doc_id, page count, schema `evidence/0.9`, and event count.
- Weiwenyu `3b08c49d`: ten-document real batches exist.

## Weiwenyu: blocking

Best observed batch is `runs/batch-20261001T134046`:

- 16/16 Gold events are paired, but only 15/16 match by exact event key; D5-EQC-007 falls back because holder=`红豆集团有限公司` versus the disclosed group list.
- 128/133 value hits = 96.24%; 2 extra events in D5-EQC-002.
- 11 contract-validation errors remain.
- D5-EQC-005 method wording differs.
- D5-EQC-006 method differs by trailing punctuation.
- D5-EQC-007 holder, method, and change_date differ.

The newer `runs/batch-20261001T135159` is not a replacement:

- 15/16 events aligned, one event missing.
- 116/124 aligned value hits = 93.55%.
- 19 contract-validation errors.
- It fixes the D5-EQC-007 holder string but regresses event coverage and introduces more provenance errors.

Required: repair the 11 errors in 134046, decide whether method punctuation/wording should normalize, fix D5-EQC-002 event boundaries, align D5-EQC-007 holder/method/change_date, then publish a clean ten-document batch.

## Zhangzhibo: accepted

The official D5 parse package passes all metadata checks against the evaluation manifest. No parser blocker remains for D5. Keep the official package as production input; evaluation Gold remains frozen against its own evidence snapshots for reproducibility.

## Fangxuancheng: missing

No D5-specific checker was observed at `5fe05e89`. Required: consume `evaluation/D5/challenges/direction-inversion-cases.json` and enforce before/after direction plus ratio-denominator conflict signals.

## Chenjiahui: partial

At `bac99d1e`, the branch contains the D5 agenda/demo and generic bridge support for `equity_change`, but:

- `share_change.json` still uses old `share_change`/`change_reason` fields.
- No real D5-EQC-001..010 envelope is loaded.
- `DIRECTION_TEXT` lacks increase/decrease.
- Before/after side-by-side conflict display and equity evidence expansion are not demonstrated.

Required: consume real envelopes, render increase/decrease, compare before/after and ratios, surface conflicts, and smoke-test D5-EQC-006/007.

## Second-person review

Pending. Recommended reviewers: Weiwenyu for extraction semantics and Zhangzhibo for evidence/parse semantics.
