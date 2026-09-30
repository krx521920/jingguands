# D4 evaluation handoff

## Delivered

- 10-document pledge development set.
- 13 pledge events and 182 fields.
- 169 field evidence records.
- 20 evidence spot checks.
- Scan degradation challenge.

## Integration findings

- Current real outputs match all D3 projected cases except Guangxian, where the system adds a release event.
- New D4 cases expose announcement-date differences for `D4-PLD-006` and `D4-PLD-007`, one missing start date in `D4-PLD-008`, and release-event extensions for `D4-PLD-005` and `D4-PLD-009`.
- Field accuracy remains above the D4 target of 80%; evidence spot checks are 20/20.

## Owners

- Wei/Fang: adjudicate release-event direction and date normalization.
- Zhang: keep `covers`, table/cell and scan-region fields stable.
- Chen: render `direction=pledge/release`, `needs_review`, and scan degradation.
