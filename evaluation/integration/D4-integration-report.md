# D4 integration report

## Latest upstream integration

Remote baselines:

- Wei: `weiwenyu@0afde98e`
- Zhang: `zhangzhibo@257646c6`
- Fang: `feature/fang-rules@5fe05e89`
- Chen: `feature/chen-ui@7d4706bb`
- Evaluation: `zongbowen@728d2334`

## Latest real batch

- Batch: `runs/batch-20260930T095256`
- Input: 10 documents, 10 successful
- Gold field accuracy: 100% for all 10 documents
- Value hit: all documents at 100%
- Wrong filled: 0 except the explicit PLD-009 text-mode archive note
- Event matching: all pledge/release events matched under upstream entity-name tolerance

## Integration notes

- Zhang supplied the official 10-document D4 parse package with `evidence/0.9`, `covers`, table/cell evidence, and text snapshots.
- Fang supplied D4 boundary and arithmetic checks.
- Chen supplied direction badges, anomaly summaries, and scan-degradation hints.
- Wei archived a PLD-009 text-mode run with 6 provenance errors; the parse-mode path is clean.
- D4-PLD-009 release event uses `有格投资` while the full legal name is `有格创业投资有限公司`; upstream name tolerance treats them as the same entity.

## D4 evaluation assets

- 10 documents
- 15 events
- 210 fields
- 191 evidence records
- 20 evidence spot checks
- scan degradation challenge
