# D5 股权变动开发集与方向反转挑战

## 交付

- 10 份真实股权变动公告，16 个事件、144 个字段、138 条字段证据、20 个出处抽查点。
- 10 个方向/前后值反转挑战用例，覆盖静态反转、临近值、同股数比例稀释、前后列倒置、比率冲突和缺失后值。
- 独立人工复核 5 份文档、45 个字段。
- 张官方解析包：10/10 文档的 source hash、doc_id、page_count、`evidence/0.9`、event_count 全部一致。
- 方D5检查器：交付清单12/12哈希一致，CLI可运行，宗侧10个挑战用例10/10通过，10份Gold输入未被修改。
- 魏最佳批次`134046`：字段命中`128/133 = 96.24%`，但仍有11条契约问题、2个额外事件、1个事件仅靠单事件回退对齐。
- 魏最新批次`135902`继续回退：`115/124 = 92.74%`，17条契约问题，漏1个事件、多1个事件，不能作为最终基线。
- 陈分支已有D5演示和mock占位，但真实`equity_change`页面链路未闭环。

## 数据入口

- Manifest：`dev/manifest.json`
- Gold：`dev/gold/D5-EQC-*.envelope.json`
- 挑战：`challenges/direction-inversion-cases.json`
- 最佳批次证据：`evidence/upstream/`
- 最新批次回归：`evidence/upstream-latest/`
- 张解析核验：`evidence/zhang-parse-verification.json`
- 方检查器核验：`evidence/fang-d5-verification.json`

## 验证

```powershell
node evaluation/D5/tests/validate-d5.mjs
node evaluation/D5/tests/compare-upstream-d5.mjs
```

## 当前集成状态

- 宗侧Gold：PASS。
- 张：10/10 PASS。
- 方：D5检查器已通过独立复核，不再阻塞。
- 魏：最佳批次仍为`DIFF`；最新批次回退，需继续修复。
- 陈：真实D5页面未完成，仍阻塞。
- 第二人复核：pending。
