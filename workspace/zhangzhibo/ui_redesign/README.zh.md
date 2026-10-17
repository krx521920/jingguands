# FinStruct 新版 UI

[English](README.md) | 中文

界面基础取自张智博交付的 `workspace/zhangzhibo/ui_redesign`，交付侧接入真实冷跑和日志下载；数据服务继续复用陈家浩的 `page_prototype`。

推荐在仓库根目录运行 `node scripts/jingguan/start_demo.mjs`，完整使用步骤见 [启动教程](../../../START-HERE.zh.md)。独立调试可运行 `node server.js`；默认 UI 8762，`UPSTREAM` 指向 `http://127.0.0.1:8642`，`EXTRACT_SERVICE_URL` 指向 `http://127.0.0.1:8788`。服务只监听 127.0.0.1。

工作台支持三类内置解析样例、自己提供的解析 JSON 或全文，发起真实抽取后自动入库并显示新结果。原始 PDF 需先解析。已有事件信封使用独立导入区，不会再次调用模型。数据集是否模拟以 API 的 is_mock 元数据为准。

`GET /api/live/health` 返回真实抽取服务状态；`GET /api/live/samples` 返回内置样例；`POST /api/live/extract` 接受 `{sample}` 或 `{event_type,parse}` / `{event_type,text}`，强制禁用本地响应缓存，返回 dataset、run_id 和 log_url；`GET /api/live/log?id=…` 下载原始输入、信封与调用日志。日志保存在仓库 `runs/web-live/`，不包含密钥。

HTTP 运行时任何 API 失败都明确报错，不偷偷展示快照；仅直接打开静态文件时允许快照回放。snapshot.js 为历史演示资料，不代表当前冷跑结果。浅色默认为白纸、紫金；深色采用暖炭灰与梅紫。

接口回归：`node workspace/zhangzhibo/ui_redesign/test_live.cjs`。真实运行证据见 [交付回执](../../../evaluation/run-side/weiwenyu/2026-10-17-live-delivery/README.md)。

首页和图表读取 `/api/metrics` 的 `delivery_metrics`，与[交付成绩单](../../../evaluation/2026-10-17-delivery-metrics/metrics.md)同源。每项显示分子、分母和批次；严格原文与空白归一辅助口径分列，无目标值不判达标，缺失数据标未测。运行 `node scripts/jingguan/build_delivery_metrics.mjs` 离线重建 JSON 与 Markdown；输入或验收产物哈希变化后，页面拒绝继续展示旧成绩。

## 核验出处与受控案例

配对与核验页回放公开开发用例的保存结果。证据变化后不会自动重跑配对。13 组配对保留原有分母，受控矛盾独立展示。

合计卡片分别展示每个加数与合计的主体、字段、引文、页码和解析块。只有来源完整匹配、单位一致且整数求和完整时才显示通过。缺失、歧义或错配来源标为待复核。计算使用已保存的正数量级，原文中的负号仍完整展示。

点击“查看解析原文”打开指定解析块与高亮引文，再点击“定位该字段”进入对应数据集、事件及字段。选中字段前再次核对块号、引文和页码。这是解析文本查看，不是 PDF 图像预览。成员主体出处明确标为上下文，不单独证明两份公告属于同一次事件。

D9-RULE-020 在核对成绩单摘要后读取既有受控夹具和保存的规则报告，展示 5,000,000 与 5,200,000 股、差 200,000 股，并明确标记受控构造。同事件前提由夹具给定，自动配对未测，没有真实 PDF 页码。输入或报告变化时提示不可用，不继续展示过期结果。

使用下列命令运行离线回归。测试使用临时本机端口，不调用模型，也已接入 `jingguan:gates`。页面文案预期保存在本组件的 `tests/expected/review.txt`。

```sh
node --test workspace/zhangzhibo/ui_redesign/test_review.cjs workspace/zhangzhibo/ui_redesign/test_review_guards.cjs
```
