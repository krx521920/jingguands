# FinStruct 信证公告审阅台

[English](README.md) | 中文

FinStruct 从公开公告提取质押、股权变动和中标合同事件，为字段关联原文证据，并以 related / unrelated / unknown 三态比较多份公告。事件接口为 v0.3，三类事件共注册 37 个字段。

## 本地启动演示

安装 Node.js 24，使用可写的仓库目录或完整解压的交付目录。独立演示使用 Node 内置模块，无需安装 Harness 工作区依赖。

```sh
node scripts/jingguan/start_demo.mjs --check
node scripts/jingguan/start_demo.mjs --offline
```

启动器报告就绪后，打开 http://127.0.0.1:8762/ 。离线模式可查看、导入和导出已有结果。需要新的模型抽取时，在本机配置密钥并按[启动教程](START-HERE.zh.md)操作。页面接收解析后的 evidence JSON 或公告全文；原始 PDF 须先解析。

## 证据与成绩

实测分子、分母和批次以[交付成绩单](evaluation/2026-10-17-delivery-metrics/metrics.md)为准，三次页面、五次 CLI 验证见[历史运行回执](evaluation/run-side/weiwenyu/2026-10-17-live-delivery/README.md)。不同运行编号对照的是同一抽取实现的两个入口。历史缓存批次不等于新的抽取，也不能证明陌生文档的准确率。不同批次不能合并成一个准确率结论。

工作台支持导入事件 JSON、查看字段证据，以及导出 JSON / CSV。原文引文和页码、单元格引用依赖输入的解析结果。缺少可读文本和证据不足会明确保留为失败或弃权。

## 项目文档

- [启动与故障排查](START-HERE.zh.md)
- [录屏核对清单](DEMO-CHECKLIST.md)
- [事件接口 v0.3](interface/README.md)
- [公告抽取插件](packages/jingguan/core/README.zh.md)
- [UI 服务](workspace/zhangzhibo/ui_redesign/README.zh.md)
- [D13 历史复现记录](docs/d13-reproduction.md)

本仓库 fork 自 DeepSeek Harness，[许可证](LICENSE)和[第三方声明](THIRD_PARTY_NOTICES.md)适用于继承组件。FinStruct 业务代码位于 `scripts/jingguan/`、`packages/jingguan/`、`interface/` 和 `workspace/`；上游 Harness 文档与检查仍保留。
