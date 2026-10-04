# D7 工作流A收口报告

日期：2026-10-02
当前批次：`runs/batch-20261002T120859`
上游提交：`2eb871394dd946b1c23225b24c4d00e2bf4bd7e1`
评测提交：`3e1db5de`

## 开发集A结果

- 文档：30/30
- 事件：48/48
- 零校验错误文档：30/30
- 字段提取：437/437
- 标准化：437/437（条件分母）
- 证据抽查：60/60
- D5全字段出处：137/137
- 错误填充：0/109
- 输出格式合规：30/30

分类型：

| 类型 | 文档 | 事件 | 字段 |
|---|---:|---:|---:|
| 质押 | 10 | 15 | 182/182 |
| 股权变动 | 10 | 16 | 137/137 |
| 中标 | 10 | 17 | 118/118 |

## 完整批次边界

- 正常30份：全部通过，正常文件零污染。
- 对抗5份：4份失败仍保留在35份分母；1份扫描降级返回`unreadable`和1条告警。
- 完整批次汇总：31/35成功，4/35失败。
- 失败没有从分母删除，单文件失败没有中断整批。

## 范围决定

- Workflow A正式范围：三类各10份公开开发集的文本PDF与解析块输入。
- 扫描输入只接受明确降级，不计入正常字段准确率。
- 对抗输入单独统计，不并入30份正确率。
- 核心30份当前达到100%是同一代码态、同一冻结Gold下的结果，不是跨模型或未见过语料承诺。

## 关联

- 五项指标：`evaluation/dev-30/five-metric-report.json`
- 批量机械核验：`evaluation/dev-30/evidence/combined-batch-verification.json`
- 封存单文档：`evaluation/sealed/single/manifest.json`
- 封存跨文档：`evaluation/sealed/cross-doc/manifest.json`

## 第二人复核补充

- Zhang解析/出处复核为条件通过（复核提交 `58a562f6`）。
- D4-PLD 182条为文本模式弱锚定；D5/D6 257条为块级强锚定，两类不得混入同一证据分母。
- 45条quote在缺少 `block_id` 时存在多块歧义，证据页必须使用 `block_id` 定位。
- 提取语义复核由Wei完成记录前，第二人复核状态仍为 partial。
- 跨组对接明细见 `evaluation/D7/handoffs/D7-cross-team-handoff.md`。

## D7 阻塞收口（2026-10-04）

- 魏 `00e75b6c` 完成 D4 强块级重跑（`corpus/zhangzhibo/d4/parse-official`，`file_sha256` 与宗 gold 一致），统一轮 437/437，F1 消除。
- 提取语义第二人复核由魏补录（`docs/reviews/D7-提取语义第二人复核.md`）。
- `D6-AWD-007` 币种冲突：宗裁决采用选项 A（`bid_amount=317,915,000`、`currency=CNY`），已修 Gold；待魏对齐重跑后重新确认 437/437。
- `D6-AWD-005` 无 `header_path` 维持已记录边界（张/方/魏三处互证）。
- 明细见 `evaluation/D7/handoffs/D7-blocker-closure.md`。
