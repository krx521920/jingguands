# 方轩诚｜质押口径与比例核验工具 D3

日期：2026-09-29。交付版本：0.3.0。承接 D1 口径字典与 D2 标准化函数，提供可离线运行、可由抽取插件直接调用的质押计算与核验工具。全部交付文件的扩展名前均带 `_D3`，原 D1/D2 文件未修改，未提交或推送 GitHub。

## 快速运行

在本文件所在目录打开终端。需要 Node.js 24 或更高版本，运行和测试均无第三方依赖、无需联网。

```powershell
node --test src_D3/pledge/__tests___D3/pledge.test_D3.ts
node src_D3/pledge/cli_D3.ts examples_D3/pledge_input_D3.json
```

第二条命令向标准输出返回 UTF-8 JSON，包含 12 条合成演示的原始输入、标准值、计算式、核验状态、文件哈希及运行记录。已运行的样例结果见 [pledge_results_D3.json](examples_D3/pledge_results_D3.json)。完整输入协议与联调方法见 [口径与接口说明](docs_D3/方轩诚_质押口径与比例核验_D3.md)。

**不要在归档目录直接执行 `npm test`**：`package_D3.json` 是按文件名要求保存的清单，npm 不会将它识别为 `package.json`。上面的两条 `node` 命令已在原样交付目录验证。若团队需要 npm 脚本，在独立集成目录将该清单复制为 `package.json` 后再使用；本交付不生成无后缀的同名文件。

## 本次能力

- 股、万股、亿股精确换算；股数与比例双向计算。
- 分开处理本次/累计质押、占指定股东持股/占公司总股本四种组合。
- 对同主体、同时点、同事件和同分母的股数及披露比例进行核验。
- 区分精确比例与按小数位四舍五入的披露比例。后者反推为可能整股区间。
- 原样保留未提及、明确零、无法读取及来源定位信息；计算值不回填为原文事实。

## 交付清单

| 文件 | 用途 |
| --- | --- |
| `src_D3/normalization/normalization_D3.ts` | 原样复用 D2 标准化函数，作为离线可运行的本地依赖 |
| `src_D3/pledge/pledge_D3.ts` | `verifyPledge()` 结构化工具入口与 `parsePledgeInput()` 输入校验 |
| `src_D3/pledge/cli_D3.ts` | 批量 JSON 输入、结构化输出与运行记录 |
| `src_D3/pledge/__tests___D3/pledge.test_D3.ts` | 53 个质押用例、20 个 D2 回归及 3 组边界/穷举/CLI 测试 |
| `tests_D3/fixtures/pledge_cases_D3.json` | 53 个独立标注预期结果的合成质押用例 |
| `tests_D3/fixtures/normalization_regression_D3.json` | D2 原 20 组用例，数据未改动 |
| `examples_D3/pledge_input_D3.json`、`pledge_results_D3.json` | 12 条合成输入与实际运行结果 |
| `package_D3.json`、`tsconfig_D3.json` | 依赖元数据及严格类型检查配置 |
| `docs_D3/方轩诚_质押口径与比例核验_D3.md` | 字段、公式、精度策略及集成示例 |
| `docs_D3/验收与联调记录_D3.md`、`测试记录_D3.txt` | 验证结论与原始测试日志 |
| `docs_D3/来源与依赖_D3.md` | 仓库检查基线、复用代码来源及依赖边界 |
| `交付清单_D3.json` | 文件 SHA-256 清单，清单本身不自包含 |

## 验证与边界

本地 76 项测试通过，严格 TypeScript 检查通过。测试和演示数据全部为合成数据，不是公告原文，不计入真实公告抽取准确率。

已完成方轩诚负责的数值工具及调用入口。尚未进行魏文宇抽取插件、宗博文 5 份真实公告和陈家浩网页的端到端联调：本次提供材料中没有这些案例和接口，检查的仓库基线也没有质押抽取模块。本工具不调用大模型、不解析 PDF、不验证公告来源；应接入团队已有抽取与来源定位链路，不能将独立算术测试表述为完整竞赛闭环。
