---
description: "通过 Harness 工具抽取公告事件，并查看 v0.3 事件信封中的校验问题。"
kind: "package-reference"
---

# @jingguan/core

[English](README.md) | 中文

## 概述

使用 `jingguan_extract_events` 从公告文本中抽取质押、股权变动和中标合同事件。工具返回 v0.3 事件信封及校验问题。真实模式需要模型密钥和仓库中的抽取 CLI；模拟模式生成明确标注的空字段，用于接口检查。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## 使用本包

将插件挂载到提供 `tools` 的 Harness 组合中。配置项 `strict` 默认为 `true`，会报告不在事件注册表中的字段名。调用 `jingguan_extract_events` 时传入非空的 `document_text`，并将 `event_type` 设为 `pledge`、`equity_change` 或 `award_contract`；`run_id` 可省略。

默认的 `mode="real"` 委托仓库中的[抽取 CLI](../../../scripts/jingguan/run_extract.mjs)执行。在真实调用前，在本机设置 `JINGGUAN_LLM_API_KEY` 或 `DEEPSEEK_API_KEY`。密钥缺失、CLI 文件不可用、子进程出错或超过 300 秒都会导致调用失败。每次真实调用都可能产生模型使用费用。

使用 `mode="mock"` 进行无需密钥的接口检查。它返回一个事件，并标记 `is_mock=true`、`extraction_method="mock"`，注册字段均为 `not_mentioned`；这些不是已抽取事实。两种模式都返回 `{ envelope, issues }`，结构问题同时写入 `envelope.run_meta.errors`。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节</summary>

[插件源码](src/index.ts)负责注册工具、校验参数和检查返回信封。真实调用把输入写入独立临时目录，再通过子进程调用 CLI；模拟调用在进程内生成注册字段。调用结束后会移除临时目录。信封检查器校验版本、事件标识、严格模式下的已知字段、缺失值状态、非空出处引文及出处区域坐标。事件序列化结构由[事件 Schema](../../../interface/event-envelope.schema.json)定义。

</details>

<a id="further-exploration"></a>
## 进一步探索

- [机器 Schema](../../../interface/event-envelope.schema.json)：信封序列化结构。
- [交付指南](../../../DELIVERY-README.md)：独立应用与已记录的验收范围。

<a id="model-experience"></a>
## 模型体验

### 公告工具调用与结果

#### 模型看到什么

模型可以通过公告文本和事件类型调用 `jingguan_extract_events`。返回对象包含事件 `envelope` 和 `issues` 数组；文本展示会说明结果是模拟骨架还是真实抽取，并报告事件数与问题数。校验问题会保留可见，不会静默修改抽取值。

#### Token 影响

公告文本计入工具调用，保留的结果会按宿主的展示与压缩策略计入后续对话上下文。真实模式还会通过抽取 CLI 将输入发送给配置的模型供应商；模拟模式不会发起这次供应商调用。

#### KV Cache 影响

工具注册和描述不变时，工具定义保持稳定。每次调用会向对话追加参数和结果；本包不承诺供应商缓存命中，也不控制宿主保留的上下文。

## 已知限制与延期工作
<a id="known-limitations-and-deferred-work"></a>

- 插件需要包含抽取 CLI 的仓库检出；只复制本包不会获得真实抽取流程。
- 信封检查器要求非空引文，但不会独立证明每条引文都命中原文块。出处锚点检查由抽取与评测工具负责。
- 模拟结果不包含已抽取事实，不能用来展示准确率、OCR 或实时供应商可用性。
- 严格校验使用模块级配置；挂载严格设置不同的实例不会隔离各自的校验策略。

### 开发备注

无。
