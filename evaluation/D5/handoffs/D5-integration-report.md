# D5 integration handoff

## Verified

- Evaluation Gold: 10 documents, 16 events, 144 fields; contract validation PASS.
- Challenge suite: 10/10 expected; direction inversion and ratio-conflict behavior covered.
- Zhang `be86f4d9`: official D5 parse package verified 10/10 for source hash, doc_id, page count, schema `evidence/0.9`, and event count.
- Fang `24d067ab`: delivery hashes 12/12; CLI PASS; evaluation challenge cases 10/10; 10 Gold documents run without input mutation (4 verified, 6 needs_review, 0 mismatch/invalid).
- Wei `55fd805d`: ten-document real batches exist, but the clean ten-document baseline is still blocked.

## Wei: blocking

Best observed batch is `runs/batch-20261001T134046`:

- 16/16 Gold events are paired, but only 15/16 match by exact event key; D5-EQC-007 falls back because holder=`红豆集团有限公司` versus the disclosed group list.
- 128/133 value hits = 96.24%; 2 extra events in D5-EQC-002.
- 11 contract-validation errors remain.
- D5-EQC-005 method wording differs.
- D5-EQC-006 method differs by trailing punctuation.
- D5-EQC-007 holder, method, and change_date differ.

The newer `runs/batch-20261001T135902` is not a replacement: 15/16 events aligned, 115/124 aligned value hits = 92.74%, 17 contract-validation errors, one missing event, and one extra event. An earlier `135159` batch also regressed.

Required: repair the 11 errors in 134046, decide whether method punctuation/wording should normalize, fix D5-EQC-002 event boundaries, align D5-EQC-007 holder/method/change_date, then publish a clean ten-document batch.

## Zhang: accepted

The official D5 parse package passes all metadata checks against the evaluation manifest. No parser blocker remains for D5.

## Fang: accepted

Fang delivered `24d067ab`. The delivery manifest hashes pass 12/12; the CLI synthetic run passes; the 10 evaluation challenge cases pass 10/10; and 10 Gold documents run without input mutation. The sandbox cannot reproduce `node --test` because child-process spawn is blocked with EPERM, but the direct CLI and an independent in-process challenge harness were executed.

## Chen: partial

At `13e12c08`, the branch contains D5 demo material and generic bridge support for `equity_change`, but:

- `share_change.json` still uses old `share_change`/`change_reason` fields.
- No real D5-EQC-001..010 envelope is loaded.
- `DIRECTION_TEXT` lacks increase/decrease.
- Before/after side-by-side conflict display and equity evidence expansion are not demonstrated.

Required: consume real equity_change envelopes, render increase/decrease, compare before/after and ratios, surface conflicts, and smoke-test D5-EQC-006/007.

## Second-person review

Pending. Recommended reviewers: Wei for extraction semantics and Zhang for evidence/parse semantics.
