# 三项交付任务的 TDD 证据

需求来自用户截图中的三个任务：页面发起真实抽取并与独立 CLI 对照，修复 D6-AWD-002 状态抖动，提供队友可启动和录制的演示包。代码验证在本地归档检出树进行；本地检查点不冒充 GitHub 远端提交。

| 保证 | RED | GREEN |
|---|---|---|
| 新版 UI 提供真实冷跑、入库、独立日志及明确失败 | test_live.cjs 对 /api/live/health 实际 HTTP 404；首次受沙箱 EACCES 阻挡后原命令提权重跑，确认功能缺失 | 三类输入、入库与日志、错误输入、失败响应、跨源拒绝均通过；随后实际浏览器 + DeepSeek 3 次抽取 |
| 通知书状态按项目归属且不依赖事件编号 | 新测试引用尚未实现的 notice_status 模块，缺失实现失败；检查点 872cf7df | 3 组变体共 12 个项目字段及缺失/明确提及/不可读等对照通过；2b4621c5 |
| 同一块内另一项目的肯定句不被清空 | 2038532b：期望 true 实际 null | ca17cfd2：保留肯定句，行覆盖 100%、分支 94.59% |
| 启动服务拥有自己的端口与就绪信号，停止后端口释放 | test_start_demo.mjs 端口 0 隔离运行失败；56cee7d2 | f6b7d763：子进程 IPC 就绪，离线和配置模式通过；随机端口独立进程运行，停止等待退出 |
| 解压路径含空格仍可读取抽取输出 | 0f247f00：本地替身抽取输出完整，但服务解析路径截断，返回 HTTP 500 | e7233382：按整行读取输出路径，HTTP 200；测试不调用模型 |

验证命令：`node --test --experimental-test-coverage scripts/jingguan/test_notice_status.mjs`，`node workspace/zhangzhibo/ui_redesign/test_live.cjs`，`node scripts/jingguan/test_start_demo.mjs`，配置健康检查加 `--configured`，`node workspace/cjh/page_prototype/demo/_delivery_check.js`（40/40）。另运行抽取行为 5 场景、契约同步、出处断言和标准化 34 条，全部通过。真实模型验证遵循用户单独授权的 3 次页面 + 5 次 CLI 范围，未超出 8 次抽取。

真实输出及范围见 [验收回执](../../evaluation/run-side/weiwenyu/2026-10-17-live-delivery/README.md)。模型调用日志内 code_version 为当时本地代码检查点；manifest 的源文件 SHA256 与离线复算补足发布后的代码映射。历史冻结评测结果与旧 MP4 保留，不将它们视为本次冷跑证据。

限制：`npm run doc-sync` 缺少 tsx，未通过；未运行宿主全量测试。视频仅做全片解码和画面抽样，最终音频字幕人工复核归录制者。Web/CLI 125/125 是三个样例的字段一致性，不能外推准确率、全库稳定性或陌生文档表现。
