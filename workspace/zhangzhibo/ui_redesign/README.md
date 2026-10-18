# FinStruct new UI

English | [中文](README.zh.md)

The interface is based on Zhang Zhibo's delivered `workspace/zhangzhibo/ui_redesign`. The delivery integration adds real cold extraction and log downloads, while the data service continues to use Chen Jiahao's `page_prototype`.

Run `node scripts/jingguan/start_demo.mjs` at the repository root; see the [startup guide](../../../START-HERE.md) for full instructions. For standalone debugging, run `node server.js`; the UI defaults to 8762, `UPSTREAM` to `http://127.0.0.1:8642`, and `EXTRACT_SERVICE_URL` to `http://127.0.0.1:8788`. The server listens only on 127.0.0.1.

The workbench accepts three built-in parsed samples, custom parsed JSON or full text. Real extraction automatically stores and displays new results. Parse raw PDFs first. Existing event envelopes use the separate import area without another model call. The API's is_mock metadata determines whether a dataset is simulated.

Imports receive unique names across all registered batches, ignoring letter case. A colliding name receives a numeric suffix; the returned dataset selects the imported run in the page and JSON / CSV exports. Existing frozen files remain intact. The real HTTP regression is `node --test workspace/cjh/page_prototype/test_upload_collisions.cjs`.

`GET /api/live/health` returns extraction-service status; `GET /api/live/samples` returns built-in samples; `POST /api/live/extract` accepts `{sample}` or `{event_type,parse}` / `{event_type,text}`, forces the local response cache off, and returns dataset, run_id and log_url; `GET /api/live/log?id=…` downloads the original input, envelope and call log. Logs are stored in repository `runs/web-live/` without keys.

During HTTP operation, every API failure is reported explicitly without silently showing a snapshot. Snapshot replay is available only when opening static files directly. snapshot.js is historical demonstration material, not a current cold-run result. The default light theme uses paper white, purple and gold; the dark theme uses warm charcoal and plum.

API regression: `node workspace/zhangzhibo/ui_redesign/test_live.cjs`. Real-run evidence is in the [delivery receipt](../../../evaluation/run-side/weiwenyu/2026-10-17-live-delivery/README.md).

The home page and charts read `delivery_metrics` from `/api/metrics`, sharing the [delivery scorecard](../../../evaluation/2026-10-17-delivery-metrics/metrics.md). Each metric shows its numerator, denominator and batch; strict source matching and auxiliary whitespace-normalized results are separate, missing targets receive no pass verdict, and missing data is marked untested. Run `node scripts/jingguan/build_delivery_metrics.mjs` to rebuild JSON and Markdown offline; the page refuses to show stale scores after an input or acceptance-artifact digest changes.

Value agreement and Gold-expected recall use separate denominators. Reviewed abstentions show decided, pending and unreviewed counts; a partial review does not establish whole-batch correctness. Timing comes from saved call logs and describes the recorded extraction stage. Required Gold files and their corrections must validate before a score is published; their content participates in the stale-result check.

## Review sources and controlled cases

The pairing and verification pages replay saved public development results. They do not automatically rerun matching when evidence changes. The 13 pair groups retain their original denominator; the controlled conflict is displayed separately.

Aggregate cards display each addend and the total with its entity, field, quote, page and parsed block. A successful verdict requires complete source bindings, matching units and a complete integer sum. Missing, ambiguous or mismatched sources are marked for review. Original negative quotes remain visible while the calculation uses the stored positive magnitudes.

Use **View parsed source** to open the exact parsed block and highlighted quote, then **Locate field** to open the matching dataset, event and field. The page validates the block, quote and page again before selecting the field. This is parsed text inspection, not a PDF image viewer. Member identity sources are labelled as context and do not by themselves prove that two announcements describe one event.

D9-RULE-019 and D9-RULE-020 read the existing controlled fixtures and saved rule report after checking their scorecard digests. The correction shows the original and replacement values; the conflict shows 5,000,000 versus 5,200,000 shares, a difference of 200,000. Both carry a controlled label. The same-event premise is supplied by the fixture; automatic pairing is untested and there are no real PDF page numbers. Changed inputs or reports produce an unavailable warning instead of a stale result.

Run the offline regression below. It uses temporary loopback ports, does not call a model, and is also included in `jingguan:gates`. The owner-local rendering expectation is in `tests/expected/review.txt`.

```sh
node --test workspace/zhangzhibo/ui_redesign/test_review.cjs workspace/zhangzhibo/ui_redesign/test_review_guards.cjs
```
