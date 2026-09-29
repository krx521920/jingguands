# 事件 JSON 接口 v0.3

- 发布：魏文宇，2026-09-28（D2，依据评测方对接报告的两项裁决：中标事件改名、分母枚举统一）
- 状态：**v0.3 候选冻结稿**，待全队签署（签署表见宗博文 evaluation/integration/D1-freeze-decision.md）；v0.2/v0.1 已废弃（变更记录见第八节）
- 本目录是全队公共契约：解析（张智博）、口径（方轩诚）、页面（陈家浩）、评测（宗博文）都以本文件＋`event-envelope.schema.json`（机器可校验）为准。**任何模块的输出，提交前必须通过共同校验器**（见第三节）。

## 一、目标数据流（各就各位）

```
原始公告
→ 张智博：DocumentIR（document_id / page / block_id / region / table / cell，quote 必须来自原文）
→ 魏文宇：EventEnvelope（本契约；事件是什么）
→ 方轩诚：标准化 FieldValue（数值怎么标准化：统一单位、状态、分母）
→ 陈家浩：页面展示与导出（怎么展示）
→ 评测（宗博文）：独立 Gold 评分（是否与 Gold 一致，经投影适配器进入本契约）
```

## 二、快速开始（运行入口）

```bash
# 模拟运行（不调模型，输出全程标注 MOCK，仅联调）
node scripts/jingguan/run_extract.mjs --input interface/samples/pledge_sample_01.txt --mock

# 真实调用
export JINGGUAN_LLM_API_KEY=sk-xxxx          # 或 DEEPSEEK_API_KEY
node scripts/jingguan/run_extract.mjs --input interface/samples/pledge_sample_01.txt

# D2 解析块模式：消费张智博 evidence/0.2 解析 JSON（块级出处＋方轩诚标准化自动接入）
node scripts/jingguan/run_extract.mjs --parse interface/samples/pledge_sample_01.parse.json

# 标准化验收（方轩诚 10 用例，移植一致性测试）
npm run jingguan:test-normalize
```

每次运行产生 `runs/<run_id>/`：`events.json`（v0.2 信封）＋ `call_log.json`（请求、耗时、token 用量、原始返回；不含密钥）。

`--event-type pledge|equity_change|award_contract` 可显式指定；缺省从文件名推断。

## 三、共同契约校验器（全队必跑）

```bash
# 校验指定文件
node scripts/jingguan/validate_envelope.mjs runs/<run_id>/events.json

# 不带参数＝校验 runs/ 下全部输出
node scripts/jingguan/validate_envelope.mjs
```

校验 `interface/event-envelope.schema.json` 的全部结构约束（类型、枚举、必填、字段白名单、event_id 模式等），**并强制字段注册表**（`scripts/jingguan/lib/registry.mjs` 为 JS 单一真源）：字段名必须在对应事件注册表内、unit 必须与注册表一致、比例字段 denominator 必须满足 fixed/requires 约定。**张/方/陈/宗 各自模块产出事件 JSON 时，提交前必须通过本命令**；评测的 Gold 投影适配器输出同样要过。语义级校验（quote 是否命中原文、状态-取值规则）由 runner 在抽取时执行并如实记入 `run_meta.errors`。`packages/jingguan/core/src/index.ts` 是注册表的 TS 镜像，与 `lib/registry.mjs` 必须同步修改。

## 四、信封结构（event envelope）

```
{
  "schema_version": "0.2",
  "run_id": "20260927T151234-pledge-a1b2",
  "is_mock": false,
  "source": {
    "file_id": "sha256:…",          // 文件唯一标识
    "file_name": "pledge_sample_01.txt",
    "file_sha256": "…",
    "parse_meta": { "parser_version": null, "page_count": 1 }   // 张智博的解析侧填充
  },
  "events": [ /* Event */ ],
  "run_meta": { "entry": "cli|web|tool", "model": "…", "started_at": "…", "duration_ms": 0, "errors": [] }
}
```

Event：

```
{
  "event_id": "E01",
  "event_type": "pledge",           // pledge | equity_change | award_contract
  "fields": { "<字段名>": { …FieldValue… } },
  "extraction_method": "model",     // model | rule | hybrid | mock
  "notes": null
}
```

FieldValue（**核心结构，四个人都要消费**）：

```
{
  "raw_value": "20,000,000股",      // 原文原样字符串；无则 null
  "value": 20000000,                // 标准化数值；除 extracted/needs_review 外必须为 null
  "unit": "shares",                 // shares|cny|percent|date|date_range|text|count（统一枚举）
  "standardized": true,
  "status": "extracted",            // 六状态，见下表
  "provenance": [                   // 出处；status=extracted 时至少 1 条
    { "block_id": null, "page": 1, "region": null, "table_id": null, "cell_ref": null, "quote": "质押股数：20,000,000股" }
  ],
  "denominator": null,              // holder_shares|total_share_capital|net_assets|other|null（比例类字段必填）
  "note": null
}
```

### 状态语义（6 个，页面显示文案同步约定）

| status | 判定 | value | 页面显示 |
|---|---|---|---|
| `extracted` | 原文有值且已抽取；**原文显式写 0 也是 extracted（value=0）** | 有值 | 正常显示 |
| `not_disclosed` | 原**明**说"未披露/不适用/无法提供"，不推断 | 必须 null | "原文未披露，不推断" |
| `not_applicable` | 该字段结构性不适用于本事件 | 必须 null | "不适用于该事件" |
| `not_mentioned` | 原文压根没提到 | 必须 null | "原文未提及" |
| `unreadable` | 扫描件/图片/模糊无法读取 | 必须 null | "无法读取" |
| `needs_review` | 疑似有值但不确定（如扫描模糊、口径依据不足） | 可有候选值 | "待复核" |

**缺失不能填 0**：`value=0` 只允许出现在 extracted 且原文确有"0"。错误填充率指标以此判定。评测注意：`not_disclosed` 不得被误写成 `not_mentioned`，两者计分口径不同。

### 标准化数值口径（待方轩诚口径字典细化）

- `shares`：股（万股×10⁴，亿股×10⁸）；`cny`：元（万元×10⁴，亿元×10⁸）
- `percent`：百分数数值（"16.67%"→16.67）；`date`：ISO `YYYY-MM-DD`
- `date_range`：ISO 8601 区间字符串 `"起始日/结束日"`（原文明确给出区间时用，status=extracted；不参与数值标准化）
- 换算依据不足（币种/单位不明）→ `standardized:false` ＋ `needs_review`
- 方轩诚侧状态映射：`present→extracted`，`explicit_zero→extracted(value=0)`；不引入 present/confirmed 等私有状态

## 五、字段注册表（按事件类型）

### pledge 质押（13 字段；本次/累计、占持股/占总股本全部拆分为独立字段，denominator 由字段名固定）

| 字段名 | 含义 | unit | denominator |
|---|---|---|---|
| pledgor | 质押人 | text | — |
| pledgee | 质权人 | text | — |
| pledged_shares_this_time | 本次质押股数 | shares | — |
| pledged_shares_cumulative | 累计质押股数 | shares | — |
| pledged_ratio_this_time_of_held | 本次质押占其所持股份比例 | percent | holder_shares |
| pledged_ratio_this_time_of_total | 本次质押占公司总股本比例 | percent | total_share_capital |
| pledged_ratio_cumulative_of_held | 累计质押占其所持股份比例 | percent | holder_shares |
| pledged_ratio_cumulative_of_total | 累计质押占公司总股本比例 | percent | total_share_capital |
| pledge_amount | 质押金额 | cny | — |
| start_date | 质押起始日 | date | — |
| end_date | 质押到期日 | date | — |
| purpose | 资金用途 | text | — |
| announcement_date | 公告日期 | date | — |

### equity_change 股权变动（9 字段）

| 字段名 | 含义 | unit | 备注 |
|---|---|---|---|
| holder | 变动股东 | text | |
| direction | 变动方向 | text | increase / decrease |
| shares_before | 变动前持股 | shares | |
| shares_after | 变动后持股 | shares | |
| ratio_before | 变动前比例 | percent | `denominator` 必填（四值枚举），按原文判定 |
| ratio_after | 变动后比例 | percent | `denominator` 必填（四值枚举），按原文判定 |
| change_shares | 变动股数 | shares | |
| method | 变动方式 | text | |
| change_date | 变动期间 | date_range | value 为 ISO 区间 "start/end"（如 "2026-09-20/2026-09-24"） |

### award_contract 中标/合同签署（14 字段：10 必选＋4 专业边界可选，D3 依宗博文复核增补）

专业边界语义（赛题要求）：区分中标候选/正式中标（收到中标通知书）/合同签署三个阶段；调价条款 not_disclosed ≠ 固定价格；bid_amount（合同金额）≠ recognized_revenue（当期收入）。

| 字段名 | 含义 | unit | 备注 |
|---|---|---|---|
| bidder | 中标人 | text | |
| tenderer | 招标人 | text | |
| project_name | 项目名称 | text | |
| bid_amount | 中标金额 | cny | |
| currency | 币种 | text | 默认 CNY |
| tax_included | 是否含税 | text | true/false/unknown |
| duration | 工期 | text | 保留原文表述 |
| consortium_members | 联合体成员名单 | text | 无联合体→not_applicable；有联合体→extracted |
| consortium_shares | 联合体份额 | text | 份额未写→not_mentioned；无联合体→not_applicable |
| bid_date | 中标/公告日期 | date | |
| contract_signed | 是否已签署合同 | text | true/false/not_disclosed（可选，缺省 not_mentioned） |
| formal_award_notice_received | 是否收到正式中标通知书 | text | true/false/not_disclosed（可选） |
| price_adjustment_status | 调价条款状态 | text | fixed/adjustable/not_disclosed（可选） |
| recognized_revenue | 当期确认收入 | cny | 可选；合同金额 ≠ 当期收入 |

## 六、出处结构（provenance）

```
{ "block_id": "p3-b12", "page": 3, "region": [x1,y1,x2,y2], "table_id": "p3-t2", "cell_ref": "B3", "quote": "……" }
```

- **张智博（DocumentIR）**：供给 `document_id`（→source.file_id）、`page`、`block_id`、`region`、表格类出处补 `table_id`/`cell_ref`；**quote 必须来自原文，禁止事后按数字反搜**。表格证据不许丢失：来自表格的字段必须带 table_id/cell_ref（纯文本出处保持 null）。`source.parse_meta` 可填 `parser_version`、`page_count`、`blocks`（块摘要数组，允许 null；块全量数据在解析 JSON 的 `pages[].blocks[]`，抽取层经 `handoff.provenance_from_block` 映射消费）。
- **region 坐标语义（D2 冻结）**：`[left, top, right, bottom]`，单位 PDF 点（1pt=1/72 英寸），原点页面左上角、y 轴向下；屏幕坐标 = region ÷ [page.width, page.height] × 显示尺寸。禁止按 x/y/宽/高解读。
- D1 纯文本阶段允许 `page:1 + quote`；表格证据自 D2 解析接入起补齐。
- 评测抽查出处命中时，区域与单元格分开统计。

## 七、各成员对接点

- **张智博**：解析输出映射到 `source.parse_meta`（parser_version/page_count）与 provenance；文件唯一标识 → `source.file_id`。
- **方轩诚**：产出标准化 FieldValue（value/unit/standardized/denominator）；状态映射见第四节；你的 10 个换算用例直接以 FieldValue 结构书写并通过共同校验器。
- **陈家浩**：页面读取 `runs/**/events.json`，按第四节状态表渲染全部 6 种状态与双语案文案；`is_mock=true` 的 runs 文件只作联调数据源，不得展示为真实成绩。
- **宗博文**：Gold 经投影适配器转成本契约格式（适配器输出也要过共同校验器）；计分分母＝注册表中"原文有值应提取"的字段；`not_disclosed` 与 `not_mentioned` 分开计分；错误填充率＝非 extracted-应缺失却 extracted 的比例。

## 八、v0.1 → v0.2 变更记录、降级规则与字段丢失清单

**D2 复核修订（2026-09-28，宗博文 v0.3 复核三问题，schema 保持 v0.3 增量）**

1. 新增 `unit: date_range`：日期区间是原文明确给出的值，不再标 needs_review；value 用 ISO 区间字符串 `"start/end"`（复核问题 1，方案 b）。
2. `consortium` 拆分为 `consortium_members`＋`consortium_shares`，判定边界冻结：无联合体→两者 not_applicable；有名单无份额→members=extracted、shares=not_mentioned（复核问题 2）。
3. 出处基线断言：region 必须 left<right、top<bottom、非负（lib/checks.mjs，runner 与校验器共用）；解析块模式加页面越界检查（按解析 JSON 每页 width/height，纯文本模式跳过）（复核问题 3，页面尺寸校验提前落地）。

**v0.3 变更（2026-09-28，评测方对接报告裁决，破坏性）**

1. 事件类型 `bid_won` 改名 **`award_contract`**（覆盖中标到合同签署；宗博文建议，全队拍板采纳）。
2. `denominator` 枚举由 `shares_held/total_shares` 扩为 **`holder_shares/total_share_capital/net_assets/other`**（与方轩诚、宗博文的口径枚举统一；net_assets 支持"占净资产"场景）。
3. schema_version 升为 **"0.3"**；v0.2 及更早的 runs 输出归档至 `runs/_archive/`。
4. 影响面：lib/registry.mjs、fang_normalize 适配层、runner prompt/mock、@jingguan/core TS 镜像、样例文件改名 award_contract_sample_01.txt；**陈家浩的页面消费与宗博文的 Gold 投影适配器请按 v0.3 更新**。

**v0.2 变更（依据评测方反馈全量采纳）**

D2 补丁（2026-09-28，依据张智博《契约对齐报告_D1》三处反馈，schema 保持 v0.2 向后兼容）：
1. `parse_meta` 增补可选 `blocks` 字段（原 README 与 schema 矛盾，按 schema 收敛并放行块摘要）。
2. `region` 坐标语义写进契约：PDF 点、左上原点、y 向下、`[left, top, right, bottom]` 顺序＋屏幕换算公式。
3. 消费张智博解析 JSON 的 `handoff.source`（可原样拷入 source）与 `handoff.provenance_from_block` 映射（quote 取 `block.text_raw`，不是 `text`——后者跨行处会补空格，不是严格原文子串）。

1. 状态枚举 4→6：新增 `not_disclosed`（原文明示未披露，不推断）、`not_applicable`（结构性不适用）。
2. 质押比例由 1 个字段（＋cumulative 标记）拆为 4 个独立字段（本次/累计 × 占持股/占总股本），股数同样拆本次/累计；**删除 FieldValue 的 `cumulative` 属性**（口径进入字段名，杜绝混用）。
3. provenance 新增 `table_id`/`cell_ref`，表格证据不丢失。
4. 新增共同契约校验器 `scripts/jingguan/validate_envelope.mjs`，全模块提交前必跑。
5. runner 输出先过 Schema 机器校验再做语义校验，问题如实记入 `run_meta.errors`。

**降级规则与已知边界（如实登记，不冒充完整金融语义）**

- 扫描件：能读则带出处，不能读→`unreadable` ＋明确降级，扫描类单独统计，不并入文本指标。
- 日期区间：已由 `date_range` 单位承载（extracted＋ISO 区间字符串），不再降级为 needs_review（D2 复核修订）。
- `consortium` 已拆分为 `consortium_members`／`consortium_shares`（D2 复核修订；判定规则见注册表）。
- `tax_included` 的值可能是字符串 "true"/"false"/"unknown" 或布尔（模型两种都输出过），消费方按真值语义处理，"unknown" 表示依据不足；未做强制归一（依据不足不猜测）。
- 股权变动 `ratio_before/after` 为单字段＋denominator；若原文同时给两种分母口径，v0.3 参照质押拆分方式处理（当前如实标注于 note）。
- 币种/含税/单位依据不足→`standardized:false` ＋ `needs_review`，不强行换算。
- v0.1 的 6 份 runs 输出与 3 份 v0.2 中间失败输出（unit 枚举违规，机器校验器抓出后已修 prompt）均存于 `runs/_archive/` 作历史证据，默认不被校验器扫描。

## 九、目录

```
interface/
  README.md                      ← 本文件（接口 v0.2 候选冻结稿）
  event-envelope.schema.json     ← JSON Schema v0.2（机器可校验）
  samples/                       ← D1 冻结样例（合成文本，仅联调用）
scripts/jingguan/
  run_extract.mjs                ← 运行入口（抽取＋调用日志）
  validate_envelope.mjs          ← 共同契约校验器（全队必跑）
  lib/schema_validator.mjs       ← 零依赖 JSON Schema 子集校验器
  lib/registry.mjs               ← 字段注册表 JS 单一真源（校验器与 runner 共用）
packages/jingguan/core/          ← dsh 插件（工具注册＋结构校验，v0.2 同步）
runs/<run_id>/                   ← 每次运行的输出＋调用日志（证据）
```
