# 魏文宇交付验收记录 · 2026-10-17

## 结论与范围

本轮完成陈家浩两项页面修复的交付合入，修正旧 L3 导出对照基准，并补测股权变动和中标合同的真实流程。此前质押流程已通过 10-16 本地验收；三类均已有指定样本的运行证据。本记录不表示整项目全部指标达标，不修改冻结评测数据或正式成绩单。

## 来源与版本

交付基础为 `b7f046fdf004155667c2ba601a62c9a5ffa4fbdf`。页面修复来自陈家浩 `3d65fff1`（JSON 回导）和 `cf0c2b4c`（畸形 URL），仅合入相关源码、接口文档和测试；没有整分支覆盖队友产物。运行侧 `scripts/jingguan/` 在本轮保持原样。

新抽取的 `code_version=89a09d4a` 是隔离验证副本的本地测试检查点，不是 GitHub 版本。抽取源码对应上述交付基础，文件 SHA256 见 [integration-checks.json](integration-checks.json)。解析器使用张智博 `6a64d16e` 的 finstruct 0.9.1；与张当前 `197612be` 比较，解析源码没有变化。两个 PDF 均重新解析，原文件哈希与语料清单一致；原 PDF 不随本回执再分发。

交付版本以包含本记录的 Git 提交为准。旧标签 `v2.0-delivery` 仍指向 `97a0dda0`，没有移动，也不包含本轮修复。下载交付分支后用 `git rev-parse HEAD` 记录实际版本。

## 实际结果

| 检查 | 结果 |
|---|---|
| 新增真实 HTTP 回归 | 40/40：32 份数据 JSON 回导完全一致、非法 view/缺字段拒绝、CSV 可用、畸形 URL 后服务存活、无数据集返回 404 |
| 数据范围 | 31 份权威数据＋1 份本地演示件；演示件不进入正式评分分母 |
| 两个独立测试进程同时运行 | 各 40/40；端口 0、独立临时目录，退出后清理 |
| 既有页面步骤 6 检查 | 7/7；`--prove` 过期指纹反证未执行 |
| L3 JSON/CSV 导出序列化 | 修前 8/16，修后 16/16；只是同源导出对照，不代表两路独立抽取 |
| 运行侧代码检查 | `gates.mjs` 列出的 16 项代码检查全部通过，含 437/437 冻结字段回归和 321 份契约校验 |
| 新样本流程核验 | 18/18：输入哈希、契约、真实模式、无缓存且无运行错误、原文出处、页面投影、JSON/CSV |
| 修改行执行证据 | V8 记录服务端修改的 32 个非注释行均被执行；不是全仓覆盖率或分支覆盖率 |

结果明细：[verification.json](verification.json)、[http-acceptance.json](http-acceptance.json)、[gates.json](gates.json)、[integration-checks.json](integration-checks.json)、[coverage-summary.json](coverage-summary.json)。TDD 失败证据与本地检查点见[合入回执](../../../../.github/tdd/wei-ui-integration-20261017.md)。

| 样本 | 页/块 | 真实输出 | 精确出处 | CLI 抽取耗时 |
|---|---|---|---|---|
| D5-EQC-002 | 64 页 / 1395 块 | 3 事件 / 27 字段，全部 extracted | 27/27 | 18.977 秒 |
| D6-AWD-001 | 2 页 / 27 块 | 1 事件 / 14 字段：5 extracted、7 not_mentioned、2 not_applicable | 5/5 | 3.130 秒 |

两次运行均为 DeepSeek `deepseek-chat`、`--no-cache`、`is_mock=false`。股权文档分 2 块调用后合并，日志的 HTTP 200 是聚合状态，`run_meta.errors=[]`；不把它描述成单个请求。每例目录保存 `events.json`、`call-summary.json`、对应原文块与 `export.csv`；调用摘要带原日志 SHA256。入库时补齐文件末尾换行，`verification.json` 同时记录原始和入库信封哈希。完整原日志及新解析文件留在本地验收目录。密钥未写入产物。

页面集成实际调用 `/api/upload` → `/api/result` → JSON/CSV 导出 → 再次导入；41 个字段的值、状态与出处保持一致。本轮这两例使用真实 HTTP 接口验收，没有把接口测试表述成浏览器点击录像。结果可在本地页面选择 `acceptance1017-D5-EQC-002` / `acceptance1017-D6-AWD-001` 查看。

## 复查入口

在仓库根目录运行以下离线检查，无需模型密钥：

```bash
node workspace/cjh/page_prototype/demo/_delivery_check.js
node scripts/jingguan/test_release_regressions.mjs
node scripts/jingguan/test_d11_defects.mjs
```

重新抽取需按语料清单取回对应 PDF、用张的解析器生成 `.parse.json`，配置本机密钥后调用 `scripts/jingguan/run_extract.mjs --parse <文件> --event-type equity_change|award_contract --out-dir <独立输出目录> --no-cache`。本轮只为每个新增样本运行一次，不能据此计算重复一致率。

## 未完成与责任

| 负责人 | 尚需关闭的验收项 |
|---|---|
| 宗博文 | `score-rules.mjs` 对伪 block/quote 和错误计算结果的反例仍能通过；加强实际出处及算式复核 |
| 宗博文 | 成绩单中关系、矛盾、集成、回归等写死 100 的项需接真实分子分母；补弃权正确率验收 |
| 陈家浩，魏文宇配合 | MP4 全片复核，并与最终源代码版本和指标口径对齐 |
| 魏文宇、陈家浩，宗博文验收 | 从原始输入分别运行的 Web/CLI 独立一致性；本轮 CLI 产物导入页面不能替代 |

`npm run doc-sync` 实际执行失败：本地未安装 monorepo 的 `tsx` / `node_modules`；没有声称文档全仓检查通过，也未完成全仓 TypeScript 检查。本轮涉及独立 JavaScript 页面和验收资料，局部语法、HTTP、抽取回归及出处验证单独记录。OCR、未见样本泛化、完整重复冷跑和 MP4 整片检查均未在本轮补测。
