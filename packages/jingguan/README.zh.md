---
description: "选择公告抽取工具，并查找其事件接口与交付指南。"
kind: "package-group"
---

# jingguan/ — 公告抽取

[English](README.md) | 中文

## 概述

通过本组在 Harness 中抽取金融公告事件。core 包提供工具入口与信封校验。独立应用、事件 Schema 和评测记录在本仓库中分别维护。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

<a id="packages"></a>
## 包

从 Harness 组合中发起调用时选择 core 工具。

| 包 | 用途 |
|---|---|
| [core](core/README.zh.md) | 抽取公告事件并报告信封校验问题。 |

<a id="related-documentation"></a>
## 相关文档

- [Harness 工具](../../docs/subsystems/tools.zh.md)：插件使用的工具注册与执行服务。
- [事件 Schema](../../interface/event-envelope.schema.json)：公告字段与证据要求。
- [交付指南](../../DELIVERY-README.md)：独立应用启动与验收范围。

<a id="dev-note"></a>
## 开发备注

无。
