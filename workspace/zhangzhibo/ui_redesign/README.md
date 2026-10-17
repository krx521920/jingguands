# FinStruct 新版 UI

界面基础取自张智博 `197612be76515bf94f9886d29542171b5a3b2209` 的 `workspace/zhangzhibo/ui_redesign`，交付侧接入真实冷跑和日志下载；数据服务继续复用陈家浩的 `page_prototype`。

推荐在仓库根目录运行 `node scripts/jingguan/start_demo.mjs`，完整使用步骤见 [启动教程](../../../START-HERE.md)。独立调试可运行 `node server.js`；默认 UI 8762，`UPSTREAM` 指向 `http://127.0.0.1:8642`，`EXTRACT_SERVICE_URL` 指向 `http://127.0.0.1:8788`。服务只监听 127.0.0.1。

工作台支持三类内置解析样例、自己提供的解析 JSON 或全文，发起真实抽取后自动入库并显示新结果。原始 PDF 需先解析。已有事件信封使用独立导入区，不会再次调用模型。数据集是否模拟以 API 的 is_mock 元数据为准。

`GET /api/live/health` 返回真实抽取服务状态；`GET /api/live/samples` 返回内置样例；`POST /api/live/extract` 接受 `{sample}` 或 `{event_type,parse}` / `{event_type,text}`，强制禁用本地响应缓存，返回 dataset、run_id 和 log_url；`GET /api/live/log?id=…` 下载原始输入、信封与调用日志。日志保存在仓库 `runs/web-live/`，不包含密钥。

HTTP 运行时任何 API 失败都明确报错，不偷偷展示快照；仅直接打开静态文件时允许快照回放。snapshot.js 为历史演示资料，不代表当前冷跑结果。浅色默认为白纸、紫金；深色采用暖炭灰与梅紫。

接口回归：`node workspace/zhangzhibo/ui_redesign/test_live.cjs`。真实运行证据见 [交付回执](../../../evaluation/run-side/weiwenyu/2026-10-17-live-delivery/README.md)。

首页和图表读取 `/api/metrics` 的 `delivery_metrics`，与[交付成绩单](../../../evaluation/2026-10-17-delivery-metrics/metrics.md)同源。每项显示分子、分母和批次；严格原文与空白归一辅助口径分列，无目标值不判达标，缺失数据标未测。运行 `node scripts/jingguan/build_delivery_metrics.mjs` 离线重建 JSON 与 Markdown；输入或验收产物哈希变化后，页面拒绝继续展示旧成绩。
