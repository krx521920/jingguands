# Evaluation assets

This directory owns independent evaluation inputs, gold labels, score definitions, validation scripts, and evidence for the financial-event competition project.

Rules:

- The evaluator does not modify production extraction, parsing, normalization, or UI code.
- Development, sealed, and challenge data are separate.
- First-test results are immutable after execution; fixes produce a separate regression result.
- Every field value requires a document, page, and source excerpt unless its status is explicitly `not_mentioned`, `unreadable`, or `not_applicable`.
- Every public fixture retains its source URL, source hash, publication date, and page-level extracted text. Synthetic fixtures may be used only for tooling development and must be labelled separately.

Current scope: D1 only.
