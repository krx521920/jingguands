# FinStruct demo startup guide

English | [中文](START-HERE.zh.md)

This delivery includes Zhang Zhibo's new UI, Chen Jiahao's data and export service, Wei Wenyu's real extraction entry point, and parsed samples for three announcement types. No npm dependencies are required. Install Node.js 24 LTS and fully unpack the archive into a writable local directory.

1. Open a terminal in the delivery folder and run `node scripts/jingguan/start_demo.mjs --check` to check Node and the sample files.
2. For real extraction, copy `.env.example` to `.env` and edit `JINGGUAN_LLM_API_KEY` locally. The key authenticates requests to the official DeepSeek API; do not commit it, capture it in screenshots, or send it to teammates. Existing `JINGGUAN_LLM_API_KEY` / `DEEPSEEK_API_KEY` environment variables also work. The delivery contains no key.
3. On Windows, double-click `START-DEMO.cmd`, or run `node scripts/jingguan/start_demo.mjs`. Keep the terminal open and visit http://127.0.0.1:8762/ . The local ports are UI 8762, data service 8642 and extraction service 8788. Press Ctrl+C to stop all three.
4. Click “进入 → 工作台”, choose a built-in pledge, equity-change or multi-project award sample, and click “开始真实抽取”. Each extraction invokes the model and incurs a charge; it does not read the local model-response cache. New results load automatically, and the independent run log is available for download.
5. Close the workbench and use “解析” to view fields, page numbers, table cells and source quotes. Reopen the workbench to export JSON / CSV; use “导入已有事件信封 JSON” to import the exported JSON unchanged.

The app also starts without a key: it can only view, import and export existing results, and the page explicitly reports that extraction is unavailable. Do not describe this viewing flow as a new extraction. Use `node scripts/jingguan/start_demo.mjs --offline` for explicit offline mode.

Custom input can be either announcement text or the parser's evidence JSON; choose one and manually select one of the three event types. The page does not extract directly from raw PDFs. Parse PDFs with Zhang's parser first, or use the bundled parsed samples; plain text has no PDF coordinates. An event envelope JSON is an existing output and belongs in the separate import area.

## Troubleshooting and acceptance

When a port is occupied, the launcher reports the error and cleans up its own child processes without closing other services. You can run `node scripts/jingguan/start_demo.mjs --ui-port 18762 --api-port 18642 --extract-port 18788` and open the corresponding UI port. Start all three services together.

For authentication failures, check the local key and account balance; for connection failures, inspect the startup terminal. Failed extractions display a reason and retain failure logs without falling back to static snapshots or mock output. Long announcements are chunked, so one extraction may involve several model requests.

Runs are stored in `runs/web-live/`; downloaded logs contain input, the original envelope and independent call records. Imported JSON is stored in `workspace/cjh/page_prototype/data/`. These local outputs do not overwrite frozen evaluation data. Confirm that your confidential material may be sent to the model service before uploading it.

See the [three-task acceptance receipt](evaluation/run-side/weiwenyu/2026-10-17-live-delivery/README.md) for this round's validation and recalculation entry points. The [recording handoff](DEMO-CHECKLIST.md) specifies recording order and video checks. In a packaged delivery, `DELIVERY-VERSION.json` and `MANIFEST.sha256` identify the actual published commit and file digests; packaging generates them, and the historical `v2.0-delivery` tag does not identify the new version.

The home page and charts use the [delivery scorecard](evaluation/2026-10-17-delivery-metrics/metrics.md), sharing numerators, denominators and batches with presentation materials. If the page reports changed inputs, run `node scripts/jingguan/build_delivery_metrics.mjs` offline and refresh; it does not call the model. The historical 31-envelope batch, this round's three announcements and the D9 development cases are reported separately and cannot be combined as “100% across the corpus”.
