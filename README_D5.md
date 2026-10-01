# 方轩诚 D5：前后值与变动方向核验工具

日期：2026-10-01。交付范围对应 `team_plan_14days.xlsx` 的「14天并行分工」第 11 行 G 列。本工具消费已抽取的股权变动事件，核验前后股数、变动绝对量、披露方向及比例变化关系。文件均以 `_D5` 结尾，只增加 D5 文件，D4 标准化函数及类型已内联到 equity_check_D5.ts，不再依赖 D4 目录。

## 运行

在本包解压目录或 `feature/fang-rules` 仓库根目录，使用 Node.js 24 或更高版本，无需安装运行依赖：

```powershell
node --test tests_D5/equity.test_D5.mjs
node src_D5/cli_D5.ts --synthetic-test examples_D5/equity_input_D5.json
node src_D5/cli_D5.ts path/to/events.json
```

最后一条用于真实来源模式。CLI 输出 JSON 到标准输出，错误写入标准错误；退出码为 0（适用检查通过）、1（数值冲突或无效输入）、2（执行/文件/JSON 错误）、3（需要复核或无适用事件）。重定向时使用新的输出文件，不能覆盖输入。

API 入口：[checkEquityEnvelope](src_D5/equity_check_D5.ts)。调用形式为 `checkEquityEnvelope(envelope)`，合成测试使用第二参数 `{ evidenceMode: "synthetic_test" }`。输入是魏文宇 v0.3 EventEnvelope；旧页面的模拟 `share_change` 格式须由原有转换链路处理，不能冒充上游信封。

## 核验规则

| 检查 | 处理 |
| --- | --- |
| 股数方向 | `后－前 > 0` 对应 increase，`后－前 < 0` 对应 decrease；反向输出 DIRECTION_MISMATCH，绝不交换前后值 |
| 变动股数 | 对照 `change_shares == abs(后－前)`；按宗博文 D5 标注采用非负绝对量，输入负值明确返回待适配 |
| 股数相等 | 不能独立推出方向；比例变化提示被动稀释/分母复核 |
| 比例变化 | 同一股份分母种类下计算披露比例的百分点差；股数与比例反向提示 RATIO_DIRECTION_CONFLICT，不直接判法律或数值错误 |
| 前后值接近 | 整股差用 BigInt 精确判断；比例用十进制字符串计算，不使用浮点减法或任意容差 |
| 缺失与证据 | 保留共享六状态，明确零可以计算；候选值、约数、上界、缺主体/日期、缺定位或降级证据不进入依赖它们的计算 |
| 多主体 | 逐事件输出，不按同名股东或相同数字合并，不跨事件拼接；重复事件 ID 报错 |
| 阈值 | 当前共享股权九字段没有阈值字段；未注册字段保留在 observed 并提示复核，不新增 5% 等阈值或法律判断 |

输出是独立报告，不能替换公共信封。`events[].observed` 保存输入字段及全部出处，`calculations` 保存推导差额和比较结果，`findings` 保存原因码。核验状态与 FieldValue 的六状态分开，不向原信封添加属性，陈家浩的已有页面转换可以继续使用原信封。新增核验提示的页面展示仍需页面方接入报告。

`verified` 只表示本工具适用的字段关系检查通过。当前九字段不提供前后分母数值、分母生效时点和舍入策略，因此报告明确标记 `ratio_arithmetic=not_checked_no_denominator_values`，不声称完成“股数÷总股本”的比例重算，也不反推分母。具备同主体、同口径、同时点且定位完整的分子/分母时，可另行使用已有 [D4 比例核验](src_D4/pledge/checks_D4.ts)。同分母种类不等于分母数值不变，比例百分点差是披露值差，不是相对涨跌幅。

真实模式检查来源引用完整性；原文真实性、原字段属于同一股东/同一期间的定位判断和公共信封完整 Schema 校验仍属于上游及人工复核职责。报告中的 `sourceContentsVerified` 和 `fullEnvelopeSchemaValidated` 均为 false。`is_mock` 和事件 `extraction_method=mock` 必须一致才能使用合成模式。

## 验收与交接

测试证据、固定分支版本、已有接口差异和未验证范围见 [兼容性与验收记录](docs_D5/验收记录_D5.md)。[文件清单](交付清单_D5.json) 记录交付文件与内联 D4 模块来源哈希。equity_check_D5.ts 可单独复制调试，并导出 normalize 及其类型；CLI、D5 单元测试和类型检查配置也已解除 D4 文件依赖。团队兼容性回放脚本仍需已有仓库的固定 Git 对象。本包不包含 D4 独立目录、原始公告或第三方依赖。
