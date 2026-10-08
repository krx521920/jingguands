# 调用文档 · 数据契约与接口（v0.3）

> 面向对象：魏文宇（结果 JSON 生产方）、张智博（证据/坐标生产方）、方轩诚（标准化口径）、后续接入页面的任何人。
> 页面只认本文契约，不关心数据来自 mock 还是真实服务——切换数据源前端零改动。
> **v0.2 变更（只增不改）**：`normalized` 统一为**十进制字符串**，比例=百分点（`"2.5"` 表示 2.5%，不乘 100，对齐方轩诚口径字典 v0.1）；fields 新增可选 `qualifier / scope / denominator`；`source_file` 新增可选 `sha256`；新增上游格式转接口 `bridge/`（见 §7）。
> **v0.3 变更（对齐 weiwenyu@00a472c 事件信封 v0.3）**：事件类型 `bid_won` → **`award_contract`**；分母枚举统一为 **`holder_shares / total_share_capital / net_assets / other`**；字段级状态对齐 6 状态（`extracted / not_disclosed / not_applicable / not_mentioned / unreadable / needs_review`，后五者以 `status_override` 承载、文案见 status.js）；evidences 新增可选 `table_id / cell_ref`（表格证据不丢失），`bbox` 承载 v0.3 冻结的 `region` 语义（`[left,top,right,bottom]` PDF 点、左上原点、y 向下）；fields 新增可选 `evidence_ids`（多出处）与 `note`；事件可选 `extraction_method`；顶层可选 `run_meta`、`source_file.parse_meta`。页面已按魏 README §七消费：渲染全部 6 状态与文案；`is_mock=true` 的 runs 只作联调数据。

## 1. 运行与访问

```bash
cd workspace/cjh/page_prototype
node server.js          # 或 pnpm start / npm start
# → http://127.0.0.1:8642
```

| 环境变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | 8642 | 监听端口 |
| `ENGINE` | `file`（`DATA_SOURCE=remote` 时为 `http`） | 抽取引擎：`file`／`cli`／`http` |
| `DATA_SOURCE` | （兼容别名） | `remote` 等价于 `ENGINE=http` |
| `REMOTE_API_URL` | （空） | `ENGINE=http` 时的上游地址 |
| `EXTRACT_CLI_CMD` | `node scripts/jingguan/run_extract.mjs` | 魏的抽取入口 |
| `EXTRACT_CLI_REPO` | 仓库根 | 魏的代码所在仓库根（`cwd` 须在仓库内） |
| `EXTRACT_CLI_PARSE_DIR` | （空） | 张的解析 JSON 目录（优先，喂 `--parse`） |
| `EXTRACT_CLI_TXT_DIR` | （空） | 纯文本目录（回退，喂 `--input`） |
| `EXTRACT_CLI_OUT_DIR` | `<REPO>/runs` | 输出根，产物在 `<OUT_DIR>/cjh-l4/<caseId>/events.json` |
| `EXTRACT_CLI_TIMEOUT` | 180000 | 单例超时 ms |
| `EXTRACT_CLI_EVENT_TYPE_MAP` | （空） | JSON，覆盖事件类型推断（caseId→契约类型） |
| `JINGGUAN_LLM_API_KEY`／`DEEPSEEK_API_KEY` | （空） | LLM 密钥 |

### ★ 密钥放哪：`.env`（D14）

**密钥不写进代码、不提交、不进材料。** 放在 `page_prototype/.env`（形如 `JINGGUAN_LLM_API_KEY=sk-…`），
由 `bridge/extractor.js` 的 `loadDotEnv()` 读取——**零依赖自实现 12 行**，不用引第三方包。

| 规则 | 做法 |
|---|---|
| 双重忽略 | 根 `.gitignore` 第 2 行 `.env` ＋ 本机 `.git/info/exclude`（防上游改 `.gitignore` 时失守） |
| 优先级 | 只在变量**尚未存在于 `process.env`** 时注入 ⇒ 真机/CI 环境变量永远优先，不会被本机旧值覆盖 |
| 缺文件不报错 | 队友 clone 后没这个文件是正常的，静默跳过；此时 `cli` provider 因缺密钥**显式判「未接通」**，不退回 `--mock` |
| 自检 | `node demo/_secret_guard.js` —— 查 `.env` 是否被忽略 + 已跟踪/未跟踪文件里有无密钥，**提交前必跑** |

密钥一旦入库，git 历史删不干净（每个 clone 都背着），所以这不是"注意一下"能解决的，靠脚本顶住。

## 2. 前端消费的接口（由 server.js 提供）

| 接口 | 返回 | 用途 |
|---|---|---|
| `GET /api/datasets` | `{ "source": "mock", "datasets": ["pledge", "share_change"] }` | 上传栏数据集下拉（自动列举 `data/*.json`） |
| `GET /api/result?dataset=pledge` | 数据契约对象（见 §3，读数自动过转接口） | 结果+证据一次性拉取 |
| `GET /api/export?dataset=x&format=json\|csv` | 附件下载（D3 新增） | 导出当前数据集：JSON=契约对象原样；CSV=每字段一行（18 列，含出处/table_id/cell_ref/source_type/quote，RFC 4180 转义 + BOM）。**与 /api/result 同一读取+过桥路径，页面所见即导出所得** |
| `GET /api/pairs`（D8） | `{ meta, summary, pairs[] }` | 跨文档配对三态视图：宗 13 组封存清单 × 魏 B 全量报告 + 本地原文锚点 |
| `GET /api/verify`（D9） | `{ summary, findings[], pairs[] }` | 核验清单：方 sidecar 发现聚合（先归因）+ 张 provenance 出处 + 魏 B 互证点双侧证据 |
| `GET /api/integration`（D10） | `{ meta, summary, cases[] }` | 多公告集成：**五份队友产物在服务端合并**——宗 `integration_cases`（预期）× 魏 `integration_bundle`（实判 records/diff_list/report/cache）× 魏 `cache_evidence`（缓存三态）× 张 `chain_check`（出处链四段 + 重复文字组）× 方 `fang_report_bundle`（报告五段：事件/差异/归因/计算/边界 + 逐成员缓存核对）。派生 `expected_relation`（宗自然语言 expected → 三态词映射）、`relation_match`（抽不出时为 `null`，不计不一致）、`required_check[]`（宗必填七项自检）、成员级 `chain`（五段布尔 + `duplicate_top`）。缺数据返回 503 并指明缺哪份 |

`remote` 模式下 `/api/result` 会转发到 `REMOTE_API_URL?dataset=<name>`，上游直接返回契约对象即可。

### 3a. 完整性检查（integrity，D3 新增；D4 增补扫描降级）

转接口对魏信封路径自动附 `contract.integrity = { ok, issues[] }`，issue 为 `{ level: "error"|"warn", where, what }`：

| 检查 | 级别 |
|---|---|
| 有值字段无出处（断链） | error |
| 字段引用不存在的 evidence_id | error |
| `source_type=cell` 缺 table_id/cell_ref（表格证据丢失，契约红线） | error |
| `source_type=table` 兜底块（未归入检出单元格，消费方降权） | warn |
| 有值字段的所有出处均为扫描降级块（无文本层原文可核验，D4） | warn |
| `scan_region`+`degraded` 缺 `missing_reason`（降级原因未声明，D4） | warn |

页面在结果栏顶部显示警告条（红=有断链，黄=仅提示）。字段级状态修复：页面/CSV 状态取 `status_override || success`（不再继承事件级待复核），信封原始 6 态保留在 `status_raw`。

### 3b. 异常状态汇总条与降级提示（D4 新增）

- **异常汇总条**：结果栏在完整性警告条下方按状态渲染 chip（待复核/无法读取/未提及/未披露/不适用/有值无出处 × 计数）；chip 悬停列出全部命中字段，点击循环定位到字段行（`row-<event_id>-<field>`）并 flash 高亮。异常行淡黄底显示。
- **direction 徽章**（魏 v0.4 增补）：pledge 事件新增 `direction` 字段（枚举键在 `normalized`：pledge/release；raw_value 是中文原文）。`release` → 卡片标题区橙色"解除质押"徽章；字段表 direction 行显示中文。
- **证据降级提示**（张 evidence/0.8→0.9）：证据卡透传 `header_path`（多层表头）/`continues`（跨页续表碎片）/`covers`（合并单元格覆盖位置）/`degraded`+`missing_reason`（扫描降级块，amber 描边 + 原因中文；quote 为空显式声明"无文本层"）。

## 3. 数据契约 v0.1（结果 JSON）

```jsonc
{
  "run_id": "mock-run-0001",          // 运行唯一标识（D10 报告导出要用）
  "schema_version": "0.1",            // 契约版本；字段只增不改，破坏性变更升版本号
  "data_mode": "simulated",           // simulated | real —— 页面据此显式标"模拟/真实"
  "source_file": {                    // 上传文件描述
    "file_id": "mock-file-001",
    "filename": "质押公告样例.txt",
    "parse_status": "success"          // 见 §4 状态枚举
  },
  "events": [                         // A 工作流：单文档多事件
    {
      "event_id": "evt-0001",
      "event_type": "pledge",          // pledge | share_change | ...（枚举由魏冻结，新增类型页面自动兼容渲染）
      "status": "success",             // 见 §4；字段可用 status_override 单独覆盖
      "fields": {                      // 字段名 → 值描述（每个值必须可溯源）
        "share_count": {
          "value": 12000000,           // 原文值（数字/字符串）
          "unit": "股",                // 可选：单位，页面拼接展示
          "normalized": 12000000,      // 可选：标准化值（方的口径落点，页面暂不展示，预留）
          "evidence_id": "ev-0001"     // 出处锚点；无证据时必须为 null（页面显示"无出处"）
        }
      }
    }
  ],
  "evidences": [                      // 证据列表（出处展示核心）
    {
      "evidence_id": "ev-0001",
      "block_id": "blk-0007",          // 张的页面块 ID
      "page": 3,                       // 页码（最低要求）
      "bbox": null,                    // 区域坐标（待张给结构；null 时页面降级为页码级）
      "quote": "……原文摘录……"
    }
  ]
}
```

**字段约定**：
- 每个 `fields` 值挂 `evidence_id`（溯源红线）；缺证据 → `null`，不许编造；
- `value` 与 `normalized` 分离（原文值 vs 标准化值）；`normalized` 一律十进制字符串，比例=百分点、不乘 100；
- v0.2 可选口径字段（来自方轩诚口径字典，转接口自动填充）：`qualifier`（`exact/approx/at_most`，页面显示"约/不超过"）、`scope`（`single/cumulative/unknown`，显示"单次/累计"）、`denominator`（比例分母 `{kind, kind_text, definition}`，显示"分母=公司总股本"等）；
- `source_file.sha256`（可选）：文件哈希，离线核验用（口径字典 §6）；
- 事件类型/字段名新增不改旧字段（向前兼容）。

## 4. 状态枚举（页面与接口共用）

| 值 | 含义 | 页面表现 |
|---|---|---|
| `success` | 成功 | 绿色徽章 |
| `failed` | 失败 | 红色徽章 |
| `unreadable` | 无法读取 | 灰色徽章（诚实展示，不填 0） |
| `pending_review` | 待复核 | 橙色徽章 |
| `simulated` | 模拟 | 紫色徽章（叠加全局 `data_mode` 横幅） |

## 5. 如何扩展（骨架的预留缝）

| 想加什么 | 改哪里 |
|---|---|
| 新数据集（模拟） | `data/` 下放 `<新名字>.json`，下拉自动出现，零代码 |
| 上游格式数据（方的标准化记录） | 直接放 `data/`，server 自动识别并过转接口（见 §7），零配置 |
| 接真实接口 | 启动 server 时设 `DATA_SOURCE=remote` + `REMOTE_API_URL`，前端零改动 |
| 新字段中文显示 | `public/js/render/results.js` 的 `FIELD_TEXT` 加一行；未登记的字段自动显示原始字段名 |
| 新事件类型 | 无需改页面——按契约给 `event_type` + `fields` 即自动渲染 |
| 新的栏/视图 | `public/js/render/` 下新建渲染器，在 `app.js` 装配（注册式，不侵入现有三栏） |
| 状态新枚举 | `public/js/status.js` 的 `STATUS` 加一行（单一事实源） |

## 7. 转接口（bridge/，★ D15 改为契约优先）

上游产物不必先改成契约格式——server 读到数据后自动过 `bridge/upstream_bridge.js`（mock 与 remote 两条路都生效）。

### 7.1 两层结构：契约为本体，视图为投影

```
toContract(obj) → { envelope, view, contract_validation }
```

| 层 | 内容 | 消费者 |
|---|---|---|
| **`envelope`** | 严格符合 `interface/event-envelope.schema.json` v0.3（`additionalProperties=false`）：顶层 6 项必填（`schema_version`/`run_id`/`is_mock`/`source`/`events`/`run_meta`），字段层 `raw_value`/`value`/`unit`/`standardized`/`status`/`provenance[]` | 下游入库、评测方、`GET /api/contract` |
| **`view`** | 页面渲染投影：`data_mode`/`source_file`/`evidences[]`/`events[].fields[].{value,normalized,evidence_id,status_override}`/`integrity`/`error_fill_audit` | 全部 `/api/*` 页面接口（结构与 D14 前一致，**前端零改动**） |

**三条纪律**：
1. **视图字段绝不写进 `envelope`** —— 契约 `additionalProperties=false`，写进去即违规；
2. **`view` 只能从 `envelope` 派生** —— 不存在两份真源；
3. **不合规数据如实上报，不静默修好** —— 转接口是通道不是裁判（见 §7.4）。

### 7.2 输入识别

| 输入识别 | 行为 |
|---|---|
| 已是契约对象（有 `schema_version`+`events`） | 校验后透传，零损耗 |
| **魏文宇事件信封 v0.3** | 输入输出同构：仅规范化 + 补 `run_meta` + 记 `notes`，**不改数值、不改状态语义**（计划书 §四.1 模型只找数不算数） |
| `bridge: "fang-normalization-v0.1"` | 方口径 4 态 → **契约 6 态**映射（`present`/`explicit_zero`→`extracted`；`not_mentioned`→`not_mentioned`；`unreadable`→`unreadable`）；`unit` **查注册表**决定，不按 `kind` 猜 |
| 其他未知格式 | **不猜测**，按契约骨架包空事件 + `notes` 留痕 |

**v0.3 字段级状态映射（契约→视图）**：`extracted`→正常；`needs_review`→待复核；`unreadable`→无法读取；`not_disclosed`→未披露（不推断）；`not_applicable`→不适用；`not_mentioned`→未提及。**6 态全渲染**，各自的语义忠于信源。

### 7.3 契约机器校验（`bridge/contract_validate.js`，D15 新增）

零依赖手写校验器（不引 ajv：本项目不装依赖，且手写能给出人话错误信息）。两层：

| 层 | 校验内容 |
|---|---|
| **L1 JSON Schema** | 顶层 6 项必填、`additionalProperties=false`、枚举、类型、`event_id` pattern `^E[0-9]+$`、`quote` minLength |
| **L2 字段注册表** | 字段名在注册表内？`unit` 与注册表一致？`denominator` 是否满足 `fixedDenominator`/`requiresDenominator`？ |

- **注册表直读 `spec/v0.3/registry.mjs`**（3 事件类型 / 37 字段），不手抄；**解析失败直接抛错**，绝不返回空注册表（空注册表会让所有字段"合规"）。
- 额外把计划书 §四 变成机器断言：§四.1 零数值运算、§四.2 有值字段必带出处且 `quote` 非空、§四.4 错误填充率。

```json
"contract_validation": {
  "ok": true, "errors": [], "error_count": 0,
  "schema_version": "0.3", "is_stale_version": false,
  "layers": { "schema": 0, "registry": 0 }
}
```

`is_stale_version=true` 表示这是 v0.1/v0.2 旧版数据（本就��合 v0.3），页面归为"旧版数据"而非"违规"——避免淹没真错误。

### 7.4 错误填充审计（计划书 §四.4）

```json
"error_fill_audit": {
  "phantom_count": 0, "fields_compared": 13, "phantom_fields": [],
  "reads": "状态声明「原文未提及/未披露/不适用」却带着取值 —— 属计划书 §四.4 的错误填充，原样上报不抹除"
}
```

★ **原样上报，不抹除**：抹掉值＝替上游改数据＝这个一级指标就永远测不出来。`demo/_contract_check.js` 有断言锁住"原值保留"。

### 7.5 新增接口 `GET /api/contract?dataset=<id>`

返回**契约本体**，供下游入库 / 评测方。与 `/api/result` 的区别：后者给视图投影，本接口给严格信封，两者**同源同函数**，不是两份数据。

| 字段 | 说明 |
|---|---|
| `envelope` | 严格符合 schema v0.3 的信封 |
| `validation` | 两层校验结果 |
| `schema_file` / `registry_source` | 契约与注册表来源 |
| `relation` | 视图与契约的关系说明，防止下游误把视图当契约入库 |

★ **前端不暴露**（2026-10-08 领导裁定）：页头**不提供**「查看契约本体」入口，页面正文也不显示契约合规结论 —— 面向使用页面的用户不需要了解契约校验的返回值。本接口保留给下游入库方、评测方与本机自检；校验在后端照跑，`demo/_shot_contract.py` 逐个数据集断言它真的执行了（并用注入违规信封反证校验器不是恒返回 0）。

### 7.6 上游记录格式（方口径字典 v0.1 + 事件归属信封）

`{ bridge, data_mode, source_file{file_id,filename,sha256}, records[{ event_id, event_type, field, kind, rawText, rawValue, qualifier, scope, status, value, unit, denominator, evidence{block_id,page,source_type,table_id,cell_ref,quote} }] }`

样例：`data/upstream_case.json`（方合成用例）、`data/wei_real_*.json`（魏 D6 真实运行输出）。

## 6. 给魏/张的最小对接要求

- **魏**：结果 JSON 按本文 §3/§7.1 组织即可被页面直接消费。契约必填 6 项：`schema_version / run_id / is_mock / source / events / run_meta`；字段层用 `raw_value / value / unit / status / provenance[]`（**不要**用 `normalized` / `evidence_id` / `status_override` —— 那是页面视图字段名，写进契约即违规）。**有值字段必须带 `provenance` 且 `quote` 非空**（计划书 §四.2 出处随数据生成）。
- **张**：出处最低要求 `page` + `quote`；`source_type=cell` 必带 `table_id` + `cell_ref`（表格出处定位到单元格）。坐标 `region` 定稿后补，页面已预留降级路径。
