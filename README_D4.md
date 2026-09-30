# 方轩诚｜口径异常检查＋边界用例 D4

日期：2026-09-30。版本：0.4.0。今日交付在 D3 质押工具上增加比较依据检查：**先核对分母、主体、时点、单次/累计及来源引用，再核验数值关系。未知分母不反推，缺依据不计算。**

## 直接运行

在本文件所在目录打开终端，使用 Node.js 24 或更高版本：

```powershell
npm test
npm run demo
```

运行与测试均无第三方依赖，不需要先 `npm install`。`npm test` 运行 131 项测试；`npm run demo` 显式使用合成测试模式，返回 14 条示例的计算/复核结果。

真实输入使用默认严格模式：

```powershell
npm run check -- examples_D4/pledge_input_D4.json
```

这份示例是合成数据，因此上面的默认模式会返回待复核，不会产生关系计算值。替换为团队已定位来源的输入 JSON 后，才可进行真实字段的算术核验。默认模式和合成模式的已运行输出均在 [examples_D4](examples_D4/合成模式结果_D4.json)。

**`package.json` 和 `package-lock.json` 保留工具要求的标准文件名**，由独立 D4 文件夹避免与前几日混淆；其余交付文件均带 `_D4`。`tsconfig_D4.json` 已通过脚本显式指定，不需要改名。不要用本包的 package.json 覆盖团队仓库根清单。

可选开发类型检查需先安装清单中的开发依赖：

```powershell
npm ci
npm run typecheck
```

本次类型检查使用用户 D2 已安装的相同版本开发依赖完成；没有下载或携带 node_modules。常规测试、演示不需要这些开发依赖。

## 今日新增与兼容性

- 未知比例分母保留为 null，不借用其他股数猜测；缺分母时不通过“股数÷比例”补出分母。
- 不同公司、股东、时点、事件，以及单次/累计混用，返回明确异常原因；约数、上界不会冒充精确值。
- 修复 D3 在确认同口径之前就比较“质押股数大于分母”的误报顺序。
- 默认要求真实字段的来源引用完整，显式合成模式不接受 real 字段，避免测试模式误用。
- 保留 D3 六字段输入、十进制字符串、原始缺失状态和五种结果状态；新增 anomalies 与 audit。`verifyPledge` 函数名可继续使用，但执行 D4 的严格检查。

通过：50 个 D4 边界用例、53 个 D3 算术回归、20 个 D2 标准化回归、8 组接口/穷举/CLI 测试，共 131 项。详情见 [兼容性与验收记录](docs_D4/兼容性与验收记录_D4.md)。

## 文件入口

| 文件 | 内容 |
| --- | --- |
| [checks_D4.ts](src_D4/pledge/checks_D4.ts) | 公开 API：checkPledge、verifyPledge、类型与输入解析 |
| [cli_D4.ts](src_D4/pledge/cli_D4.ts) | 批量 JSON、模式选择、执行记录和哈希 |
| [pledge_arithmetic_D4.ts](src_D4/pledge/pledge_arithmetic_D4.ts) | 内部复用 D3 算术基线，不作为公开入口 |
| [normalization_D4.ts](src_D4/normalization/normalization_D4.ts) | D2 标准化及 D4 的未知分母数值保留选项 |
| [boundary_cases_D4.json](tests_D4/fixtures/boundary_cases_D4.json) | 50 个新增边界用例及固定预期 |
| [口径规则与接入说明](docs_D4/方轩诚_口径规则与接入说明_D4.md) | 输入/输出、执行顺序、状态、兼容变化 |
| [来源与依赖](docs_D4/来源与依赖_D4.md) | D3 基线、当前仓库提交与依赖说明 |

仅本地交付，未提交或推送 GitHub。当前范围仍为质押股数/比例，未扩展其他行业比例上限、变动前后余额或跨公告关联。本包没有解析 PDF、认证原文内容、注册 Cordis 插件或执行团队真实公告端到端联调；全部评测样例为合成数据。
