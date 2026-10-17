---
description: "Extract announcement events through a Harness tool and inspect validation issues in a v0.3 event envelope."
kind: "package-reference"
---

# @jingguan/core

English | [中文](README.zh.md)

## Summary

Use `jingguan_extract_events` to extract pledge, equity-change, and award-contract events from announcement text. The tool returns a v0.3 event envelope with validation issues. Real mode requires a model key and the repository's extraction CLI; mock mode produces explicitly marked empty fields for interface checks.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## Use this package

Mount the plugin in a Harness composition that provides `tools`. Its `strict` configuration defaults to `true` and reports field names outside the event registry. Call `jingguan_extract_events` with nonempty `document_text` and an `event_type` of `pledge`, `equity_change`, or `award_contract`; `run_id` is optional.

The default `mode="real"` delegates to the repository's [extraction CLI](../../../scripts/jingguan/run_extract.mjs). Set `JINGGUAN_LLM_API_KEY` or `DEEPSEEK_API_KEY` locally before a real call. Missing keys, unavailable CLI files, subprocess errors, and the 300-second timeout fail the call. Each real call may incur model usage charges.

Use `mode="mock"` for a keyless interface check. It returns one event with `is_mock=true`, `extraction_method="mock"`, and registry fields marked `not_mentioned`; these are not extracted facts. Both modes return `{ envelope, issues }`, with structural findings also included in `envelope.run_meta.errors`.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals</summary>

The [plugin source](src/index.ts) registers the tool, validates arguments, and checks the returned envelope. Real calls write input into an owned temporary directory and invoke the CLI in a subprocess; mock calls build registry fields in process. The temporary directory is removed after the call. The envelope checker verifies schema version, event identifiers, known fields in strict mode, missing-value states, nonempty source quotations, and source-region coordinates. The serialized event structure is defined by the [event schema](../../../interface/event-envelope.schema.json).

</details>

<a id="further-exploration"></a>
## Further Exploration

- [Machine schema](../../../interface/event-envelope.schema.json): serialized envelope structure.
- [Delivery guide](../../../DELIVERY-README.md): the standalone application and recorded acceptance scope.

<a id="model-experience"></a>
## Model Experience

### Announcement tool calls and results

#### What the model sees

The model can call `jingguan_extract_events` with announcement text and an event type. The returned object contains the event `envelope` and an `issues` array; the text renderer states whether the result is a mock skeleton or a real extraction, together with event and issue counts. Validation findings remain visible rather than silently changing extracted values.

#### Token effect

Announcement text contributes to the tool call, and retained results contribute to later conversation context according to the host's rendering and compaction policy. Real mode also sends input through the extraction CLI to its configured model provider; mock mode does not make that provider call.

#### KV Cache effect

The tool definition is stable while its registration and description are unchanged. Each call appends arguments and a result to the conversation; this package does not promise provider cache hits or control the host's retained context.

## Known Limitations and Deferred Work
<a id="known-limitations-and-deferred-work"></a>

- The plugin requires a repository checkout containing the extraction CLI; copying only this package does not supply the real extraction pipeline.
- The envelope checker requires nonempty quotations but does not independently prove that every quotation matches a source block. Source-anchor checks belong to the extraction and evaluation tools.
- Mock results contain no extracted facts and cannot demonstrate accuracy, OCR, or live provider availability.
- Strict validation uses module-level configuration; mounting instances with different strict settings does not isolate their validation policy.

### Dev Note

None.
