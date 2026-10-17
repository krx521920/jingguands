# 评分器修复与指标口径统一验收

2026-10-17，魏文宇整合宗博文 `zongbowen@e4eed7dd48eef29637c2e4704716c214f0a6fc2f` 的两项修复，随后基于交付分支 `2606dc67ce867ffa41521341d4af8f70366dac11` 补齐输入完整性校验与通知书肯否冲突处理。没有再调用模型，没有修改冻结信封、Gold 或八份原始抽取记录。本目录为当前共用成绩单，历史版本由 Git 保留。

## 已完成

| 工作 | 验收结果 |
|---|---|
| D9 引文与算式校验 | 宗的评分器基础上补齐必需证据侧、非空引文、有限数值、明细及合计出处校验；正常报告 20/20；缺失/伪造证据和不完整/错误计算均拒绝 |
| 百分比计算 | 根据分子、分母计算；19/20 为 95%，分母为 0 时为未测，不能残留 100% |
| 统一成绩单 | 页面首页、图表页与旧指标注册表读取 metrics.json；metrics.md 同次生成，讲解稿与录屏清单指向本批 |
| 防止过期指标 | 55 个输入文件与 3 个 D9 产物校验 SHA256；文本 CRLF 归一为 LF，兼容 Windows 克隆；变化后显示成绩单不可用，不沿用旧百分比 |
| 口径标注 | 每项注明批次、分子/分母、目标及范围；无目标显示实测值，无分母显示未测；耗时目标按越低越好判断 |

## 交付读数

完整 17 项见 [共用成绩单](metrics.md)，数据源为 [metrics.json](metrics.json)。冻结批严格原文命中 432/451（95.79%），空白归一辅助 451/451（100%）；本轮三份公告页面与 CLI 独立抽取 125/125 字段一致，8 次日志内严格出处 240/240。两批分母不能混算，字段一致率也不能代替独立 Gold 准确率。

D9 的 20/20 包含 18 条真实、2 条受控开发用例；要求程序求和的用例必须提供非空 terms、有限数值、合计侧及可回查出处，否则判失败。严格模式遇到漏跑判整批失败，但漏跑与执行失败分别计数。受控侧缺少信封会告警，不能将 anchors_checked 全部宣称为严格原文已验证。原负例拒绝记录见 [d9-negative-controls.json](d9-negative-controls.json)，新增边界验证见 `.github/tdd/wei-code-gap-fixes-20261017.md`。

## 复算与验证

在仓库根目录执行，使用 Node 24，无需安装宿主 monorepo 依赖，不产生模型费用：

```powershell
node scripts/jingguan/build_delivery_metrics.mjs
node scripts/jingguan/test_delivery_metrics.mjs
node scripts/jingguan/test_delivery_publication.mjs
node scripts/jingguan/test_review_gaps.mjs
node scripts/jingguan/test_live_receipt_history.mjs
node workspace/cjh/page_prototype/demo/_delivery_check.js
node evaluation/integration/check-lock.mjs
node evaluation/integration/check-docs.mjs
```

前两项定向测试验证正常、负例、零分母、百分比篡改、源文件变化、换行差异和页面展示。详细先失败后通过的记录及覆盖范围见 `.github/tdd/wei-metrics-integration-20261017.md`。成绩单追踪输入文件哈希；本机无可信 Git HEAD 时 D9 报告的 code_version 可能为空，以共享成绩单的源文件哈希与最终交付提交号定位实现。

## 未包含的后续事项

宗博文仍须独立复核 D6-AWD-002 通知书证据的跨项目归属，并补足弃权正确率金标；陈家浩仍须按新版页面与当前成绩单重录、完整播放核对 MP4。OCR、全库泛化及新公告准确率没有因本次两项修复而完成。`npm run doc-sync` 因本机缺少 tsx 未能运行，不能列为通过。
