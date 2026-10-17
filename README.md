# FinStruct announcement review

English | [中文](README.zh.md)

FinStruct extracts pledge, equity-change and award-contract events from public announcements, links fields to source evidence, and compares announcements with related / unrelated / unknown outcomes. The event interface is v0.3 with 37 registered fields across the three event types.

## Start the local demo

Install Node.js 24 and use a writable checkout or unpacked delivery folder. The standalone demo uses Node built-ins and does not require the Harness workspace dependencies.

```sh
node scripts/jingguan/start_demo.mjs --check
node scripts/jingguan/start_demo.mjs --offline
```

Open http://127.0.0.1:8762/ after the launcher reports readiness. Offline mode can view, import and export existing results. For new model extraction, configure a local key and follow the [startup guide](START-HERE.md). The page accepts parsed evidence JSON or announcement text; parse raw PDFs first.

## Evidence and results

Use the [delivery scorecard](evaluation/2026-10-17-delivery-metrics/metrics.md) for measured numerators, denominators and batches, and the [independent Web/CLI run receipt](evaluation/run-side/weiwenyu/2026-10-17-live-delivery/README.md) for the three-page / five-CLI verification. A historical cached batch is not a new extraction or evidence of accuracy on unseen documents. Do not combine different batches into a single accuracy claim.

The workbench imports event JSON, displays field evidence, and exports JSON / CSV. Source quotes and page/cell references depend on the supplied parser output. Missing readable text and insufficient evidence remain explicit failures or abstentions.

## Project references

- [Startup and troubleshooting](START-HERE.md)
- [Recording checklist](DEMO-CHECKLIST.md)
- [Event interface v0.3](interface/README.md)
- [Announcement plugin](packages/jingguan/core/README.md)
- [UI service](workspace/zhangzhibo/ui_redesign/README.md)
- [D13 historical reproduction record](docs/d13-reproduction.md)

The repository is a fork of DeepSeek Harness. Its [license](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md) cover inherited components. FinStruct business code lives in `scripts/jingguan/`, `packages/jingguan/`, `interface/` and `workspace/`; the upstream Harness documentation and checks remain available.
