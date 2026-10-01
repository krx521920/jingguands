# D5 evaluation handoff

## Current status

- Evaluation branch: `zongbowen`
- Dataset: 10 real equity-change announcements, 16 events, 144 fields, 138 evidence records.
- Machine validation: PASS.
- Direction-inversion challenge: 10/10 expected.
- Upstream Weiwenyu comparison: 6/10 documents currently available; 12/12 matched events, 0 field differences after normalizing `change_shares` by absolute value.

## To Weiwenyu

Run the D5 plugin against `D5-EQC-007..010` and publish a batch covering all 10 dev documents. The four source URLs, hashes, and local parsed raw packages are in `evaluation/D5/dev/manifest.json`. Do not silently discard negative `change_shares` semantics: the D5 evaluation rule uses non-negative magnitude plus `direction`. Either normalize in production or explicitly freeze a different contract before comparing.

## To Zhangzhibo

The four new documents were parsed with `finstruct.parse` `evidence/0.9` from your `cace3e83` parser. Please confirm whether to copy these raw parse packages into the official D5 corpus area, or replace them with an official fresh parse. The original PDFs are not committed; source URLs and SHA-256 are recorded.

## To Fangxuancheng

Add a deterministic equity consistency checker that raises at least these signals:

1. `before > after` and `direction != decrease`.
2. `before < after` and `direction != increase`.
3. `before == after` with a ratio change: do not infer direction from shares; mark ratio/denominator context for review.
4. `shares_before < shares_after` while `ratio_before > ratio_after`, or the reverse: conflict/denominator-shift warning.
5. Before/after values present but date or ratio basis is incomplete: preserve the values with notes rather than dropping the event.

## To Chenjiahui

Render before/after shares and ratios side by side, add conflict badges for direction inversion and denominator shift, and let the evidence viewer open the exact page/table/cell block from each FieldValue provenance record.

## Open blockers

- Upstream real-run coverage is 6/10; four new documents have Gold but no production batch output.
- Second-person review is pending.
- Fang's D5 consistency checker and Chen's D5 comparison UI are not yet observed on their remote branches.
