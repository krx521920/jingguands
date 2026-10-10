# D17 · 交付索引（2026-10-10 夜）

补上我方最后一项待办：**`standardized` 判据裁定**（D15 审计 F12 / 注册表 `blocked_by` 点名宗）。

| 文件 | 用途 |
|---|---|
| `evaluation/D17/裁定-standardized判据-20261010.md` | 裁定全文：定义、适用范围、主/辅口径、正确率口径、三个历史数的定性、异常登记 |
| `evaluation/D17/check-standardized.mjs` | 检查器：算权威数字 + 自动单列两类违规（正反自检通过） |
| `evaluation/D17/standardized-check-canon-20261010.json` | 权威批实算留痕 |
| `evaluation/D17/给陈-standardized判据收口-20261010.md` | 给陈：卡片拆两项、注册表换主口径、text 不显示标准化状态 |

**权威数字（31 份 / 606 字段）**：有值 437（非 text 229 / text 208）；主口径覆盖率 **229/229 = 100%**；辅助口径 433/437 = 99.08%；标注完整率 100%；正确率 **229/229 = 100%**（D11 值层 437/437 的子集）。

**新登记（产出侧，已推送）**：`D4-PLD-008` E01 `announcement_date` —— 弃权字段（`not_mentioned`／`value:null`）却标 `standardized: true`，语义错误（全批唯一一处，影响 0 分母）。给魏的修复单：`evaluation/D17/给魏-弃权字段标true-20261010.md`。

**由此关闭**：D15 审计 F12（我方）；D15 F1 里"标准化"那一行的口径冲突（判据已定，剩页面实现）。