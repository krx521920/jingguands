# D1 self-audit

## Findings corrected in v0.1.1

1. Award notice receipt was inferred from award and contract signing. It is now `not_disclosed`.
2. Pledge current amount mixed three components and a derived total. They are now separate fields.
3. Pledgee evidence was a synthesized sentence. It is now three table-row evidence entries.
4. Current pledge ratio field names were ambiguous. They now state the denominator explicitly.
5. The validator gained semantic checks for these cases.

## Remaining external checks

- Independent second-person review.
- Team confirmation of field and evidence interfaces.
