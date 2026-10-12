# D2 observed contract gaps

The six controlled D2 fixtures can be represented in contract v0.3 for registered fields.

The following award-specific financial boundaries remain outside the v0.3 field registry:

- `contract_signed`
- `formal_award_notice_received`
- `price_adjustment_status`
- `recognized_revenue`

The D2 fixtures record these boundaries in event-level notes, but notes are not machine-scored fields. Before final freeze, the contract owner should either add them to the registry or approve a documented projection-loss rule.

The evaluation suite does not silently drop these semantics.
