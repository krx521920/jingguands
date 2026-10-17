# 魏文宇：评分器整合与统一成绩单验证

日期：2026-10-17。用户要求完成前两项：整合宗的新评分器，以及统一页面、成绩单和讲解稿。使用独立 Node 测试入口，未调用付费模型。本地工作树由交付文件构建；以下本地检查点用于保留 TDD 证据，公开提交将以真实远端 dd04024ebb61 为父提交，不推送合成的本地历史。

## RED / GREEN 检查点

| 需求与复现 | RED 检查点 | GREEN 检查点 | 最终行为 |
|---|---|---|---|
| 伪造引文、错算、悬空出处仍被计通过，19/20 显示 100%，UI 缺分母 | 363f05f1 | 36247337 | 负例拒绝，19/20=95%，展示分母与状态 |
| 页面与讲解材料缺共用生成器和输入校验 | 3cfabfe7 | 0f54c560 | 生成共用 JSON/Markdown，源文件变化拒绝读取 |
| 分母 0 残留 100% | 246d7f72 | bf5ebdac | value=null，显示未测 |
| 注册表口径未同步，Windows 换行误判输入变化 | 5778ca6d | cf3eff5d | 注册表读统一值，CRLF/LF 等价 |

这些检查点均在本轮同一分支上依次创建，未重写或压缩。宗的 `evaluation/D9/score-rules.mjs` 直接取自 e4eed7dd；成绩单构建器额外接收 --d9-score，并修复分母 0。随后新增统一证据清单、产物哈希与批次文案，最终检验如下。

## 实际验证

| 命令或流程 | 结果 |
|---|---|
| node scripts/jingguan/test_delivery_metrics.mjs | 7/7 PASS：正常 D9、伪出处、错算、悬空块、19/20、UI 状态及零分母 |
| node scripts/jingguan/test_delivery_publication.mjs | PASS：17 项页面与材料一致；输入变化、错误百分比、缺失文件拒绝；CRLF/LF 可移植 |
| node scripts/jingguan/build_delivery_metrics.mjs | PASS：D9 20/20；严格 432/451；空白归一 451/451；页面/CLI 125/125 |
| node workspace/cjh/page_prototype/demo/_delivery_check.js | 40/40 PASS；首次沙箱内回环 EACCES，沙箱外同一命令通过 |
| node evaluation/integration/check-lock.mjs | PASS：53/53 锁定文件，没有改写冻结数据 |
| node evaluation/integration/check-docs.mjs | PASS：163 份文档、0 个引用问题 |
| 浏览器离线启动与页面检查 | 首页与图表页显示正确分母、批次、严格/归一分列；弃权与 OCR 显示未测；沿用张智博新版 UI |
| npm run doc-sync | 未通过：本机 tsx 不可用；未绕过钩子或声称全仓检查通过 |

## 覆盖率范围

对两个定向测试设置 NODE_V8_COVERAGE，合并 Node 子进程 V8 ranges，统计非空、非注释行首是否被执行。新生成器 82/82（100%），读取与注册表覆盖模块 36/36（100%），视图模块 36/37（97.30%）；宗的评分器 126/145（86.90%），基础成绩单构建器 106/116（91.38%）。这是这些文件的行首采样覆盖，不是分支、语句或整个仓库覆盖率。

## 限制

浏览器本轮只验证本地离线成绩单与现有数据；未新增真实模型调用。3 次页面与 5 次 CLI 的真实抽取来自已发布 dd04024ebb61 的独立日志，本次只离线复算。D9 受控样例及 terms 缺失限制保留，Gold 复核、弃权正确率与 MP4 重录仍待各负责人完成。旧 PDF 路径引用修正只补充来源说明，不修改历史测试结论。
