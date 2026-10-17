# Agent Note: FinStruct document compatibility

Status: implemented

English | [中文](2026-10-17-finstruct-document-compatibility.zh.md)

## Problem

FinStruct's published v0.3 event interface, parser outputs and evaluation records share fixed field identifiers. Renaming those identifiers for an upstream prose rule breaks compatibility or falsifies captured evidence. The five-person team's Chinese handoffs and signed interface notes also have a different audience from the public bilingual startup guide. Audit receipts need the exact version that ran, including local test checkpoints that have no release tag.

## Decision

The [review inventory](../../../../scripts/finstruct-doc-exceptions.json) binds each exception to an exact FinStruct-owned path and a SHA256 of its text with CRLF normalized to LF. It contains no globs and has three separate classes: `protocol` preserves reviewed existing identifiers and captured data; `records` preserves measured version references; `teamDocuments` preserves original-language team materials. These are explicit review decisions, not an allowance for every file in a directory. The [implementation](../../../../scripts/finstruct-doc-exceptions.ts) rejects malformed entries, unowned paths, missing files and changed contents. No repository command refreshes the inventory automatically.

The terminology check still rejects new uses outside an exact reviewed file. The reference check still rejects disallowed organization URLs even inside a reviewed receipt. Local UI event JSON has a separate syntax-aware exception only for the hexadecimal string at `run_meta.code_version` in a v0.3 envelope under the UI data directory; prose, other keys and malformed JSON remain checked. A version field records the code that ran, not a promise that its object is available in every clone.

Team-document entries match exact exclusions in the translation manifest and are checked against the selected worktree or staged contents. Changes require either completing the bilingual pair and removing the exception or reviewing the revised original-language team document. The root README, public startup guide, new UI README and package references remain bilingual. New documents receive no inherited exemption. Markdown wrapping and link validation still apply to team documents; formatting changes preserve Markdown semantics. Raw machine evidence is not rewritten to satisfy documentation checks.

This partially supersedes the [terminology ban](2026-08-26-ban-ambiguous-origin-label.md), [maintained-reference policy](2026-09-12-maintained-repository-references.md) and [pairing policy](2026-07-02-bilingual-docs-and-pairing-gate.md) only for the registered FinStruct contents. All three remain active for their general rules; none qualifies for archival.

## Alternatives considered

**Rename the released field or erase version receipts.** This changes the team's shared protocol or removes reproducibility evidence without improving the product.

**Exclude entire business directories.** This silently exempts new prose and unrelated fields. Exact content digests instead make changes visible and preserve all other checks.

**Translate every team handoff as public documentation.** The Chinese team maintains signed decisions, dated receipts and local work notes in their original language. A reviewed, enumerated exception preserves that audience while public usage instructions have matching English and Chinese versions.

## Consequences

The inventory adds maintenance cost: even an unrelated edit to a reviewed file requires removing or reviewing its exception. A matching digest establishes identity, not semantic correctness or a valid evaluation score. Reviewers must verify the reason for each changed inventory entry; a green documentation check does not prove all competition requirements are met. Commit detection remains limited to available local Git objects.

The focused tests cover exact path/content matches, changed and missing records, malformed manifests, scope neighbors, runtime JSON keys, and continued rejection of prose and URLs. The normal `doc-sync` leaves remain enabled; inventory validation runs within them.
