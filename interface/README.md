# 事件 JSON 接口 v0.1（D1 冻结稿）

- 发布：魏文宇，2026-09-27（D1）
- 状态：**v0.1 已冻结**。D2 起如需修改字段名/状态枚举，请在群里提出并全员确认后再改，禁止静默变更。
- 本目录是全队公共契约：解析（张智博）、口径（方轩诚）、页面（陈家浩）、评测（宗博文）都以本文件为准。

## 一、快速开始（运行入口）

```bash
# 模拟运行（不调模型，输出明确标注 MOCK，用于页面/接口联调）
node scripts/jingguan/run_extract.mjs --input interface/samples/pledge_sample_01.txt --mock

# 真实调用（需要 API key）
export JINGGUAN_LLM_API_KEY=sk-xxxx          # 或 DEEPSEEK_API_KEY
export JINGGUAN_LLM_BASE_URL=https://api.deepseek.com   # 可选，默认即此
export JINGGUAN_LLM_MODEL=deepseek-chat                # 可选，默认即此
node scripts/jingguan/run_extract.mjs --input interface/samples/pledge_sample_01.txt
```

每次运行产生 `runs/<run_id>/`：

- `events.json` —— 按 v0.1 信封结构输出的事件结果
- `call_log.json` —— 模型调用日志（请求、耗时、token 用量、原始返回；不含密钥）

`--event-type pledge|equity_change|bid_won` 可显式指定；缺省从文件名推断（`pledge_*` / `equity_change_*` / `bid_won_*`）。

## 二、信封结构（event envelope）

```
{
  "schema_version": "0.1",
  "run_id": "20260927T151234-pledge-a1b2",
  "is_mock": false,
  "source": {
    "file_id": "sha256:…",          // 文件唯一标识（张智博 D6 依赖）
    "file_name": "pledge_sample_01.txt",
    "file_sha256": "…",
    "parse_meta": { "parser_version": null, "page_count": 1 }
  },
  "events": [ /* Event，见下 */ ],
  "run_meta": {
    "entry": "cli",                 // cli | web | tool
    "model": "deepseek-chat",
    "started_at": "2026-09-27T15:12:34+08:00",
    "duration_ms": 4321,
    "errors": []                    // 结构校验发现的问题，如实记录
  }
}
```

Event：

```
{
  "event_id": "E01",
  "event_type": "pledge",           // pledge | equity_change | bid_won
  "fields": { "<字段名>": { …FieldValue… } },
  "extraction_method": "model",     // model | rule | hybrid | mock
  "notes": null
}
```

FieldValue（**核心结构，四个人都要消费**）：

```
{
  "raw_value": "20,000,000股",      // 原文原样字符串；无则 null
  "value": 20000000,                // 标准化数值；缺失必须为 null，禁止填 0
  "unit": "shares",                 // shares|cny|percent|date|text|count
  "standardized": true,
  "status": "extracted",            // extracted|not_mentioned|unreadable|needs_review
  "provenance": [                   // 出处；status=extracted 时至少 1 条
    { "block_id": null, "page": 1, "region": null, "quote": "质押股数：20,000,000股" }
  ],
  "denominator": null,              // 比例字段专用：shares_held|total_shares|null
  "cumulative": null,               // 质押字段专用：true|false|null（单次/累计）
  "note": null
}
```

### 状态语义（评测与页面都依赖）

| status | 含义 | value |
|---|---|---|
| `extracted` | 原文有值且已抽取 | 有值（可为 0——"0"也是原文真实值） |
| `not_mentioned` | 原文未提及 | 必须 null |
| `unreadable` | 扫描件/无法读取 | 必须 null |
| `needs_review` | 疑似有值但不确定 | 可有候选值，页面标"待复核" |

**缺失不能填 0**：`value=0` 只允许出现在 status=extracted 且原文确有"0"时。错误填充率指标以此判定。

### 标准化数值口径（v0.1 约定，待方轩诚 D1 口径字典细化）

- `shares`：股（"万股"→×10⁴，"亿股"→×10⁸）
- `cny`：元（"万元"→×10⁴，"亿元"→×10⁸）
- `percent`：百分数数值（"16.67%"→16.67，不带 % 号）
- `date`：ISO `YYYY-MM-DD`
- 换算依据不足（如币种不明）→ `standardized:false` + status=`needs_review`

## 三、字段注册表（按事件类型）

### pledge 质押

| 字段名 | 含义 | unit | 备注 |
|---|---|---|---|
| pledgor | 质押人 | text | |
| pledgee | 质权人 | text | |
| pledged_shares | 质押股数 | shares | |
| pledged_ratio | 质押比例 | percent | `denominator` 必填 |
| pledge_amount | 质押金额 | cny | 可 not_mentioned |
| start_date | 质押起始日 | date | |
| end_date | 质押到期日 | date | |
| purpose | 资金用途 | text | |
| announcement_date | 公告日期 | date | |

### equity_change 股权变动

| 字段名 | 含义 | unit | 备注 |
|---|---|---|---|
| holder | 变动股东 | text | |
| direction | 变动方向 | text | increase / decrease |
| shares_before | 变动前持股 | shares | |
| shares_after | 变动后持股 | shares | |
| ratio_before | 变动前比例 | percent | `denominator` 必填 |
| ratio_after | 变动后比例 | percent | `denominator` 必填 |
| change_shares | 变动股数 | shares | |
| method | 变动方式 | text | 集中竞价/大宗交易等 |
| change_date | 变动完成日 | date | |

### bid_won 中标

| 字段名 | 含义 | unit | 备注 |
|---|---|---|---|
| bidder | 中标人 | text | |
| tenderer | 招标人 | text | |
| project_name | 项目名称 | text | |
| bid_amount | 中标金额 | cny | |
| currency | 币种 | text | 默认 CNY |
| tax_included | 是否含税 | text | true/false/unknown |
| duration | 工期 | text | 保留原文表述 |
| consortium | 联合体及份额 | text | v0.1 用文本，v0.2 再结构化 |
| bid_date | 中标/公告日期 | date | |

## 四、各成员对接点

- **张智博（解析/出处）**：D2 起 `source.parse_meta` 由你填充（parser_version、page_count、blocks）；`provenance.block_id`/`region` 由你的解析结果供给。D1 纯文本阶段允许 `page:1 + quote`，但 quote 必须是原文子串，禁止事后按数字反搜。
- **方轩诚（口径/标准化）**：FieldValue 的 value/unit/standardized/denominator/cumulative 按你的口径字典产出；你的 10 个换算用例直接以 FieldValue 结构书写。
- **陈家浩（页面）**：三栏原型＝上传 / events 列表 / 证据（provenance.quote + page）。状态字段渲染：not_mentioned→"原文未提及"，unreadable→"无法读取"，needs_review→"待复核"。`is_mock=true` 的 runs/ 文件就是你的模拟数据源。
- **宗博文（评测）**：计分分母＝注册表字段中"原文有值应提取"的字段；错误填充率＝status=extracted 但答案为缺失的字段占比；出处命中＝provenance 定位到正确证据。标注答案建议直接用同结构的 FieldValue 表达。

## 五、harness 集成（插件路径）

`packages/jingguan/core` 是 dsh 插件（`@jingguan/core`），注册了工具 `jingguan_extract_events`，D2 起接入解析/标准化接口并走 `ctx.llm` 统一模型层。今天先以 `scripts/jingguan/run_extract.mjs` 作为可运行任务入口。

## 六、目录

```
interface/
  README.md                      ← 本文件（接口 v0.1 发布稿）
  event-envelope.schema.json     ← JSON Schema（机器可校验的同一契约）
  samples/                       ← D1 冻结样例（合成文本，仅联调用）
runs/<run_id>/                   ← 每次运行的输出 + 调用日志（证据）
scripts/jingguan/run_extract.mjs ← 运行入口
packages/jingguan/core/          ← dsh 插件包（工具注册 + 结构校验）
```
