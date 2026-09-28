# 金融数据口径字典 v0.1

负责人：方轩诚。适用范围：公告事件中已定位到原文的金额、股数、比例字段。本文定义数据记录与换算口径；不负责从 PDF/OCR 猜测数字。所有数值在 JSON 中存为十进制字符串，禁止用二进制浮点数保存或换算。配套实现见 `../src/normalization/index.ts`，10 组可复现的合成输入/输出见 [换算用例](D1_方轩诚_换算用例_v0.1.md)。

标准化对象包含 `kind`、`rawText`、`rawValue`、`sourceUnit`、`qualifier`、`scope`、`status`、`denominator`；输出原样保留这些输入字段，并新增 `value`、`unit`。下表的 `amount.rawValue` 等写法表示“`kind=amount` 对象的 `rawValue` 字段”，JSON 中没有 `amount` 嵌套层。`rawValue` 是从原文确认的数值字符串，不含千位分隔符；`value` 是换算后的数值字符串。换算只改变单位，不改变事实属性。

## 1. 金额字段

| 字段名 | 类型 | 单位 | 分母定义 | 单次/累计 | 缺失状态处理 |
| --- | --- | --- | --- | --- | --- |
| `amount.rawText` | `string \| null` | 原文 | 不适用 | 随 `scope` | `not_mentioned` 可为 `null`；`unreadable` 可保留可读片段；不得编造文本 |
| `amount.rawValue` | 十进制字符串 `\| null` | 随 `sourceUnit` | 不适用 | 随 `scope` | `not_mentioned`、`unreadable` 必须为 `null`；`explicit_zero` 必须为 `"0"` |
| `amount.sourceUnit` | `"元" \| "万元" \| "亿元" \| null` | 原文单位 | 不适用 | 随 `scope` | 无数值时为 `null`；有数值而单位不明时拒绝换算 |
| `amount.value` | 十进制字符串 `\| null` | 元 | 不适用 | 随 `scope` | 未提及或无法读取为 `null`；明确为零为 `"0"` |
| `amount.unit` | 常量字符串 | 元 | 不适用 | 随 `scope` | 始终为 `"元"`，包括 `value=null` |
| `amount.qualifier` | `exact \| approx \| at_most \| null` | 不适用 | 不适用 | 随 `scope` | 无数值时为 `null`；`explicit_zero` 为 `exact` |

换算：`1 万元 = 10,000 元`，`1 亿元 = 100,000,000 元`。`约`记为 `approx`，数值是原文给出的近似中心值，不宣称精确；`不超过`记为 `at_most`，数值是含上界，不能当作已发生的确切金额。没有这些修饰词且原文明确给出数值时记为 `exact`。不得把 `approx` 或 `at_most` 与 `exact` 混合求和后标作精确值。

## 2. 股数字段

| 字段名 | 类型 | 单位 | 分母定义 | 单次/累计 | 缺失状态处理 |
| --- | --- | --- | --- | --- | --- |
| `shares.rawText` | `string \| null` | 原文 | 不适用 | 随 `scope` | 同金额字段；保留单次/累计修饰语 |
| `shares.rawValue` | 十进制字符串 `\| null` | 随 `sourceUnit` | 不适用 | 随 `scope` | 未提及或无法读取为 `null`；明确为零为 `"0"` |
| `shares.sourceUnit` | `"股" \| "万股" \| "亿股" \| null` | 原文单位 | 不适用 | 随 `scope` | 无数值时为 `null`；有数值而单位不明时拒绝换算 |
| `shares.value` | 整数字符串 `\| null` | 股 | 不适用 | 随 `scope` | 缺失为 `null`；明确为零为 `"0"`；换算后出现不足一股的小数则报错 |
| `shares.unit` | 常量字符串 | 股 | 不适用 | 随 `scope` | 始终为 `"股"` |
| `shares.qualifier` | `exact \| approx \| at_most \| null` | 不适用 | 不适用 | 随 `scope` | 与金额相同；不抹去约数或上界标记 |

换算：`1 万股 = 10,000 股`，`1 亿股 = 100,000,000 股`。变动方向以数值正负号表示；负数表示减少，不把变动量与存量相加。`-0.00000001 亿股`精确换算为 `-1 股`。

## 3. 比例字段

| 字段名 | 类型 | 单位 | 分母定义 | 单次/累计 | 缺失状态处理 |
| --- | --- | --- | --- | --- | --- |
| `ratio.rawText` | `string \| null` | 原文 | 必须从原文或已核验的字段关联中取得 | 随 `scope` | 缺失或无法读取时可为 `null`；不能补造分母 |
| `ratio.rawValue` | 十进制字符串 `\| null` | % | 与 `denominator` 配套 | 随 `scope` | 未提及或无法读取为 `null`；明确为零为 `"0"` |
| `ratio.sourceUnit` | `"%" \| null` | % | 与 `denominator` 配套 | 随 `scope` | 无数值时为 `null`；有数值而单位不明时拒绝换算 |
| `ratio.value` | 十进制字符串 `\| null` | 百分点数，如 `"2.5"` 表示 `2.5%` | 不得省略分母 | 随 `scope` | 缺失为 `null`；明确为零为 `"0"` |
| `ratio.unit` | 常量字符串 | % | 不得省略分母 | 随 `scope` | 始终为 `"%"` |
| `ratio.denominator.kind` | 枚举 | 不适用 | `total_share_capital`=公司总股本；`holder_shares`=指定股东所持股份；`net_assets`=指定口径净资产；`other`=其他明确定义 | 随 `scope` | 有比例数值时必须有值；缺失或无法读取时为 `null` |
| `ratio.denominator.definition` | 非空字符串 | 原文口径 | 记录具体主体、时点及净资产等具体口径，如“截至2026-06-30公司总股本” | 随 `scope` | 有比例数值时必须有值；不能只填“持股”而不说明谁的持股 |
| `ratio.qualifier` | `exact \| approx \| at_most \| null` | 不适用 | 不改变分母 | 随 `scope` | 与金额相同 |

比例的 `value` 使用百分点数，不再乘以 100。例如原文 `2.5%` 对应 `"2.5"`。只有同一事件、同一时点、同一分母口径的比例才可比较；占总股本、占持股、占净资产不能互相替代。没有明确分母的有值比例应被拒绝并交人工核对，不能默认“占总股本”。本模块不根据股数反推比例，也不根据比例反推股数。

## 4. 通用字段与单次/累计

| 字段名 | 类型 | 单位 | 分母定义 | 单次/累计 | 缺失状态处理 |
| --- | --- | --- | --- | --- | --- |
| `kind` | `amount \| shares \| ratio` | 决定标准单位 | 比例时必须提供 `denominator` | 随 `scope` | 必填，不能缺失 |
| `scope` | `single \| cumulative \| unknown` | 不适用 | 比例的分母仍需单独定义 | `single`=本次事件发生量；`cumulative`=截至原文时点的累计量或余额；原文未说明为 `unknown` | 缺失数值也保留 `unknown`；不能根据字段名猜测 |
| `status` | 见第 5 节 | 不适用 | 不适用 | 随 `scope` | 必填；与数值一致性校验 |
| `denominator` | 对象 `\| null` | 不适用 | 比例有值时非空，非比例时为 `null` | 随 `scope` | 不可用 `0` 或空字符串代替未知分母 |

`single` 与 `cumulative` 由原文措辞和公告上下文确定：如“本次质押 100 万股”是单次，“累计质押 500 万股”是累计。同一公告可以同时有两条独立数值记录。累计值不是单次值的别名；缺少历史记录时不得通过两者相减推断本次值。`unknown` 需保留待核验，不能按单次或累计统计。

## 5. 缺失状态枚举表

| 状态码 | 含义 | `rawValue` / `value` | 处理规则 |
| --- | --- | --- | --- |
| `present` | 原文明确给出非零数值，或给出约数/上界等有值表述 | 十进制字符串 / 标准化字符串 | 参与同口径核验；模糊数值保留 `qualifier`，不可伪装为精确值 |
| `not_mentioned` | 已核验范围内原文未提及 | `null` / `null` | 不计算、不填充；需记录已核验的文件及页面范围 |
| `explicit_zero` | 原文明确写明零、无发生额等可核验零值 | `"0"` / `"0"` | 可参与计算；保留原文出处；不从空白、破折号或表格空单元格推断零 |
| `unreadable` | 来源存在，但扫描/OCR/表格区域无法可靠读取 | `null` / `null` | 标记降级并转人工复核；不得猜测或填零 |

`null` 是 JSON 空值；`"0"` 是数值零的十进制字符串，二者不可混用。`status=present` 且数值恰为精确零时应改用 `explicit_zero`。`unreadable` 不等于原文未提及。

## 6. 出处与离线核验

调用方应把每个真实公告字段与出处一起保存：文件 SHA-256、文件名、页码、区域或稳定 `block_id`/表格单元格、原文片段，以及 `status=not_mentioned` 的核验范围。离线核验时重新计算文件哈希，按页码和区域定位原文，再核对 `rawText`、`rawValue`、`sourceUnit`、`qualifier`、`scope`、`denominator`，最后按本字典的 10⁴/10⁸ 换算规则重算 `value`。换算模块本身只处理已确认字段，不替来源定位、模型抽取或人工核验背书。

本版本的 10 组用例均为**合成示例**，用于离线检验字段格式和换算，不是公告原文，也不计入真实抽取成绩。Node.js 24 自带测试运行器可直接执行 `npm test`，无第三方运行依赖。
