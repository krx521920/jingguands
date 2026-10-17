# FinStruct 演示启动教程

[English](START-HERE.md) | 中文

这份运行包包含张智博新版 UI、陈家浩的数据与导出服务、魏文宇的真实抽取入口，以及三类公告的解析样例。无需安装 npm 依赖。请先安装 Node.js 24 LTS，并把压缩包完整解压到本地可写目录。

1. 打开包内终端，运行 `node scripts/jingguan/start_demo.mjs --check`，确认 Node 与样例文件齐备。
2. 需要真实抽取时，将 `.env.example` 复制为 `.env`，在本机编辑其中的 `JINGGUAN_LLM_API_KEY`。密钥用于 DeepSeek 官方接口；不要提交、截图或发给队友。已有 `JINGGUAN_LLM_API_KEY` / `DEEPSEEK_API_KEY` 环境变量也可使用。包内不含密钥。
3. Windows 双击 `START-DEMO.cmd`，或运行 `node scripts/jingguan/start_demo.mjs`。保持终端打开，在浏览器访问 http://127.0.0.1:8762/ 。三个本机端口分别是 UI 8762、数据服务 8642、抽取服务 8788。全部停止用 Ctrl+C。
4. 点击“进入 → 工作台”，选择内置质押、股权变动或多项目中标样例，点击“开始真实抽取”。每次会调用模型并产生费用；不读本地模型响应缓存。完成后自动加载新结果，可下载本次独立日志。
5. 关闭工作台，在“解析”查看字段、页码、表格单元格及原文引文。重新打开工作台导出 JSON / CSV；JSON 可从“导入已有事件信封 JSON”原样回导。

没有密钥也能启动：此时只能查看、导入和导出已有结果，页面明确显示抽取服务未就绪。不要把这种查看过程写成“重新抽取”。显式离线启动使用 `node scripts/jingguan/start_demo.mjs --offline`。

自己的输入可以是公告全文或解析器的 evidence JSON，二者择一；三种事件类型需手动选择。页面不接受原始 PDF 直接抽取。PDF 须先由张的解析器处理，或使用包内解析样例；纯文本输入没有 PDF 坐标。事件信封 JSON 是已有输出，使用单独的导入区。

## 故障与验收

端口被占用时，启动器会报错并清理本次创建的子进程，不会关闭别人的服务。可改为 `node scripts/jingguan/start_demo.mjs --ui-port 18762 --api-port 18642 --extract-port 18788`，然后打开相应 UI 端口。不要只启动新 UI 而漏掉另两个服务。

鉴权失败先检查本机密钥及账户余额；服务不可达先看启动终端。真实抽取失败会明确显示原因并保留失败日志，不会回落到静态快照或模拟输出。较长公告会分块请求，因此“一次抽取”可能包含多个模型请求。

运行记录在 `runs/web-live/`，页面下载日志包含输入、原始信封和独立调用记录；JSON 入库在 `workspace/cjh/page_prototype/data/`。这些是本地运行数据，不用于覆盖冻结评测数据。上传自己的保密材料前请确认允许发送至模型服务。

本轮验收与复算入口见 [三项任务回执](evaluation/run-side/weiwenyu/2026-10-17-live-delivery/README.md)。录制顺序与视频核对项见 [录屏交接表](DEMO-CHECKLIST.md)。运行包中的 `DELIVERY-VERSION.json` 和 `MANIFEST.sha256` 给出实际发布提交与文件校验值；它们由打包过程生成，不把历史 `v2.0-delivery` 标签当作新版提交。

首页和图表采用[交付成绩单](evaluation/2026-10-17-delivery-metrics/metrics.md)，与答辩材料共用分子、分母和批次。若提示“输入已变化”，运行 `node scripts/jingguan/build_delivery_metrics.mjs` 离线重建后刷新；此命令不调用模型。历史 31 份冻结批、本轮三份公告、D9 开发用例分别统计，不能合并成“全库 100%”。
