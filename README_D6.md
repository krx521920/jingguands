# 方轩诚 D6：中标口径工具与边界测试

整合日期：2026-10-03；工具版本仍为 0.6.0，交付包版本为 D6-integrated-1。任务来自 `team_plan_14days.xlsx`「14天并行分工」G12：规范币种、含税状态、联合体份额；缺少依据不拆分金额。交付文件的扩展名前均以 `_D6` 结尾，可直接复制到 `feature/fang-rules` 根目录，独立解压也可运行。无需第三方运行依赖，不覆盖前五天文件或根 package.json。

## 本次完整交付

本包已整合原 D6 工具、边界测试、D6-AWD-007 判定依据与专项回放。任务表“14天并行分工”G12已只读核对。工具源码未改动，专项回放统一调用 `src_D6/award_check_D6.ts`，没有第二份核心实现。原始两个交付文件夹未改动。

| 任务要求 | 实现与交付 |
|---|---|
| 规范币种 | 明确别名归一；未知／冲突阻断；外币不强塞 cny |
| 规范含税状态 | 明确含税／未税归一；未知保留 null，不倒算税额 |
| 规范联合体份额 | 逐成员金额份额、名称对应、总和100%和同事件依据检查 |
| 缺少依据不拆分 | 缺金额／税状态／金额份额等依据时不分配；原文和原因码保留 |
| 中标口径工具＋边界测试 | `src_D6/`、`tests_D6/`、`examples_D6/` |
| 币种汇率判定与依据 | [币种汇率判定与依据_D6.md](币种汇率判定与依据_D6.md)、字段建议、冻结证据及13项专项回放 |

007明确采用公告披露的 **317,915,000 CNY**；**173,800,000 AED** 作为原币记录保留，不另行换汇。候选修订仍待评测方确认，未回写 Gold；含税未知仍为复核状态。

`依据_D6/` 中的队友标准化代码和校验器只是固定版本测试依据，其中旧标准化代码用于复现错误，**不要作为生产修复代码接入**。原工具曾有的个人 `.vscode` 调试配置不纳入交付。

## 运行

要求 Node.js 24 或更高版本。在解压目录运行：

```powershell
node --test tests_D6/boundary.test_D6.mjs
node 专项回放_D6.mjs
node src_D6/cli_D6.ts --synthetic-test examples_D6/award_input_D6.json
node src_D6/cli_D6.ts path/to/events.json
```

CLI 接受单个 v0.3 信封或信封数组。输出 JSON 至标准输出，错误至标准错误。退出码：0=适用检查通过；1=存在无效信封/字段；2=参数、文件或 JSON 读取错误；3=需要复核或没有适用事件。单项无效仍保留在批次数量中，后续项继续处理。CLI 记录输入文件与实现文件 SHA-256；重定向请使用新的输出文件，勿覆盖输入。

## 接口与组合

```typescript
import { checkAwardEnvelope } from './src_D6/award_check_D6.ts';

const awardReport = checkAwardEnvelope(envelope); // 真实来源模式
// 原始 envelope 继续传给既有页面 bridge.toContract(envelope)。
// D5 的 checkEquityEnvelope(envelope) 可并列调用，前后顺序不影响结果。
```

函数还导出 `normalizeCurrency`、`normalizeTaxIncluded`。`checkAwardEnvelope(input, { evidenceMode: 'synthetic_test' })` 只允许 `is_mock=true` 且事件 `extraction_method=mock` 的显式模拟输入。

报告的 `observed` 是原字段深拷贝，保留六状态、原始金额和全部出处；`normalized` 保存已确认的规范值，`calculations.allocations` 保存有依据的推导分配，`findings` 给出字段级原因码。报告是旁路结果，不能当成公共 EventEnvelope 送入现有页面转换器。新增提示展示可读取报告，原始信封接口保持不变。报告中 `verified` 仅表示本工具范围内检查通过，不代表公告核真、正式中标、合同生效或收入确认。

## 规则

| 输入情形 | 处理 |
|---|---|
| 明确币种别名 | CNY/RMB/人民币、USD/美元/美金、HKD/港元/港币、EUR/欧元、JPY/日元、GBP/英镑、AED/迪拉姆统一为代码；未知为 null |
| 缺币种或仅模糊货币符号 | 不默认人民币；即使 amount.unit=cny 也不能补币种 |
| 上游明确 CNY，currency.raw_value 为元/万元/亿元 | 沿用团队已确认 CNY 字段；“元”本身不会由 normalizeCurrency 推断为 CNY |
| 字符串/布尔型含税值 | true/false 及含税/不含税等白名单归一为 boolean；unknown、缺失为 null，不将字符串 false 当真 |
| 税口径不清或互相矛盾 | 待复核，不计算税额，不补税率；拆分要求税口径已确认 |
| 单一人民币元/万元/亿元表达 | 用十进制字符串和 BigInt 精确换算，再与上游标准值核对；不对已经标准化的值重复乘万/亿 |
| 多币种、多金额、折算表达、数量级不清 | 不选第一个数字，不自动换汇或修写原值，规范金额为 null |
| 约数、上界、暂定金额 | 保留原文及候选标准金额，给出 NONEXACT_AMOUNT，不能作为精确拆分总额 |
| 未披露联合体份额 | 空分配数组，不均分、不按牵头身份或利润/工程量比例拆金额，不用剩余比例补齐 |
| 具备明确金额分配依据 | 逐成员名称严格匹配，份额非负且精确合计100%，同事件总额和税口径可用，才计算“总额×份额÷100” |
| 0、0%、100%和超大金额 | 零不等于缺失；超安全范围数值须用十进制字符串；0/100%可计算 |
| 分配结果不足一分 | 保留精确结果并提示 SUBCENT_ALLOCATION，不自行舍入、不决定尾差归属 |
| 非中标事件或重复事件ID | 质押/股权事件 skipped；重复ID的所有事件 invalid，不合并、不跨事件借字段 |

当前公共份额字段是 text。可计算文本须为 `中标金额分配比例：甲公司60%；乙公司40%`，或 `合同金额分配比例：甲公司60%；乙公司40%`；原值、规范值均须明确金额分配口径。名单支持顿号或分号，逐成员百分比支持顿号或分号分隔，不解析自然语言分工、简称映射或出资比例。只有 `甲公司60%；乙公司40%` 时可保留规范比例，但不足以授权金额拆分。所有推导金额保留与总额一致的税口径，不转换成收入。

## 验收与交接

- [兼容性与验收记录](docs_D6/验收记录_D6.md)：实测范围、固定提交、已发现的问题与未验证范围。
- [离线联调结果](docs_D6/compatibility_results_D6.json)：40份输入、65事件、125条出处检查的逐项结果。
- [示例输入](examples_D6/award_input_D6.json) / [期望报告](examples_D6/award_output_D6.json)：合成数据，支持快照回归。
- [交付清单](交付清单_D6.json)：文件哈希、版本及复现命令。

团队联调脚本需本地仓库保留固定提交对象；独立包无需仓库即可运行边界测试和 CLI：

```powershell
node tests_D6/compatibility_D6.mjs C:/path/to/jingguands
# 仓库已有 TypeScript 与 @types/node 时：
npx --no-install tsc --noEmit -p tsconfig_D6.json --module esnext --moduleResolution bundler
```

真实模式检查来源引用完整性，核心工具不读取 PDF 或完整解析块，因此 `sourceContentsVerified=false`；完整公共 Schema 仍由魏方校验器处理，报告 `fullEnvelopeSchemaValidated=false`。本次离线联调另外回查了固定解析块。输入中的上游标注语义仍需抽取方负责，本工具不把文字引用存在视作原文真实性或份额法律效力的认证。

整合包的最新验收结论见 `docs_D6/验收记录_D6.md`。`docs_D6/历史验收记录_D6.md` 与 `regression_log_D6.txt` 保留原交付历史，不代表本次再次执行了 D1–D5 全量测试。两份来源包不需要再单独提交。
