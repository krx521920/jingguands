# 指标与分母 v0.1

## 字段抽取

统计单元为字段实例。分母为 Gold 中 `applicable=true` 的字段数。

```text
Precision = TP / (TP + FP)
Recall = TP / (TP + FN)
F1 = 2 * Precision * Recall / (Precision + Recall)
```

`not_applicable` 不计分；`unreadable` 单独统计解析失败；未裁决争议字段暂不计分。

## 错误填充率

分母为 Gold 中 `not_mentioned` 或 `unreadable` 的字段数；分子为系统错误输出非空值或 0 的数量。原文明确披露的 0 不算错误填充。

## 标准化准确率

分母为 Gold 中 `normalization_required=true` 且已正确抽取的字段数。覆盖单位、比例、日期、含税口径、单次/累计和变动前后值。

## 证据命中率

分母为 Gold 中 `evidence_required=true` 的字段数。文档和页码、段落、表格/区域分层统计；只按相同数字搜索不算命中。

## 输出格式合规率

分母为全部参与评测的输出文档数。要求 Schema 校验、枚举合法、字段类型正确、证据可回溯，且不得用自然语言替代结构化结果。

## 矛盾召回率与误报率

矛盾召回率分母为 `true_conflict` 事件组数；误报率分母为 `non_conflict` 事件组数。`unknown` 不能算作矛盾检出成功。两者均需报告分子和分母。

## 重复运行一致率

固定代码、Prompt、模型、输入和配置后，比较冻结业务字段。忽略时间戳和随机 ID。分母为比较字段实例数。

## 性能

分别报告清缓存实时运行、缓存重放、单文档、多文档、文本 PDF、扫描件及各阶段耗时，并记录硬件、模型、页数和网络模式。
