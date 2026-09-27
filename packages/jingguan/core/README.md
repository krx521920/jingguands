# @jingguan/core

可信公告事件提取与跨文档核验——harness 核心插件（负责人：魏文宇，分支 `feature/wei-core`）。

## D1（2026-09-27）状态

- 事件 JSON 接口 v0.1 冻结：契约见 [`interface/README.md`](../../../interface/README.md)，JSON Schema 见 [`interface/event-envelope.schema.json`](../../../interface/event-envelope.schema.json)。
- 本包注册工具 `jingguan_extract_events`：输入公告文本＋事件类型，返回 v0.1 信封骨架（注册表全字段 not_mentioned）并做结构校验、统一错误返回。
- 可运行任务入口：`node scripts/jingguan/run_extract.mjs`（根目录 `pnpm jingguan:run` 等价），真实模型调用与日志见 `runs/`。

## 路线

- D2：接入解析块（张智博的 block_id/page/region → provenance）与标准化接口（方轩诚），工具内走 `ctx.llm`。
- D3：质押插件端到端（一条命令跑通 5 份 PDF）。
- D5/D6：股权变动、中标插件，复用本包共享接口，不复制底层解析代码。

## 结构校验规则（validateEnvelope）

- `schema_version` 必须为 `"0.1"`；`event_type` 必须在注册表内。
- `status=not_mentioned|unreadable` 时 `value` 必须为 `null`（缺失禁止填 0）。
- `status=extracted` 必须至少一条出处，且 `quote` 为原文子串。
- strict 模式下字段名必须在对应事件注册表中。
