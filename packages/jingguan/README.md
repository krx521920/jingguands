---
description: "Choose the announcement extraction tool and find its event interface and delivery guide."
kind: "package-group"
---

# jingguan/ — Announcement extraction

English | [中文](README.zh.md)

## Summary

Use this group to extract financial-announcement events through the Harness. The core package provides the tool entry and envelope validation. The standalone application, event schema, and evaluation records are maintained separately in this repository.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

<a id="packages"></a>
## Packages

Choose the core tool for calls from a Harness composition.

| Package | Purpose |
|---|---|
| [core](core/README.md) | Extract announcement events and report envelope validation issues. |

<a id="related-documentation"></a>
## Related documentation

- [Harness tools](../../docs/subsystems/tools.md): tool registration and execution services used by the plugin.
- [Event schema](../../interface/event-envelope.schema.json): announcement fields and evidence requirements.
- [Delivery guide](../../DELIVERY-README.md): standalone application setup and acceptance scope.

<a id="dev-note"></a>
## Dev Note

None.
