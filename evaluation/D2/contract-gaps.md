# D2 observed contract gaps

Status: no open projection gap remains for the six D2 controlled fixtures after the 2026-09-29 integration pass.

Resolved from the shared v0.3 contract:

- `award_contract` now includes `contract_signed`, `formal_award_notice_received`, `price_adjustment_status`, and `recognized_revenue`.
- The former single `consortium` field is represented by `consortium_members` and `consortium_shares`.
- `change_date` is aligned to `unit=date_range`.
- Gold provenance quotes are checked against controlled raw text; unsupported quotes are zero.

The D2 suite therefore no longer hides award-boundary or evidence-loss semantics in event notes. Any future registry change must update both the test registry and the Gold envelopes in the same change.
