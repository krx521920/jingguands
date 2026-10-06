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
| `DATA_SOURCE` | `mock` | `mock`＝读 `data/*.json`；`remote`＝反向代理上游真实接口 |
| `REMOTE_API_URL` | （空） | `remote` 模式的上游地址，如 `http://127.0.0.1:9000/result` |

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

## 7. 转接口（bridge/，v0.2 新增）

上游产物不必先改成契约格式——server 读到数据后自动过 `bridge/upstream_bridge.js`（mock 与 remote 两条路都生效）：

| 输入识别 | 行为 |
|---|---|
| 已是契约对象（有 `schema_version`+`events`） | 原样透传，零损耗 |
| **魏文宇事件信封 v0.3**（`schema_version:"0.3"` + `is_mock` + `source`） | 自动转换为契约 v0.3：`is_mock`→`data_mode`；6 状态→`status_override`；`provenance[]`→多证据（region→bbox、table_id/cell_ref 保留）；`unit` 枚举→中文单位；分母四值枚举直通 |
| `bridge: "fang-normalization-v0.1"`（方的标准化记录 `records[]`） | 自动转换为契约 v0.2（映射规则见 `docs/cjh_workspace_04_D2任务规划.md` §2），转换留痕在顶层 `bridge.notes` |
| 其他未知格式 | **不猜测，原样透传**并留 `bridge.passthrough` 痕 |

**v0.3 字段级状态映射（wei→页面）**：`extracted`→正常；`needs_review`→待复核；`unreadable`→无法读取；`not_disclosed`→未披露（不推断）；`not_applicable`→不适用；`not_mentioned`→未提及（信封要求 6 态全渲染；与方口径记录的 not_mentioned"不产出"规则不同，各自忠实体源语义）。

上游记录格式（方的口径字典 v0.1 + 事件归属信封）：`{ bridge, data_mode, source_file{file_id,filename,sha256,parse_status}, records[{ event_id, event_type, field, kind, rawText, rawValue, sourceUnit, qualifier, scope, status, value, unit, denominator, evidence{block_id,page,quote} }] }`。

样例：`data/upstream_case.json`（方的合成用例过桥）、`data/wei_run_pledge.json`（魏 v0.3 真实运行输出，runs/20260928T061450-pledge-3506）。

## 6. 给魏/张的最小对接要求

- **魏**：结果 JSON 按本文 §3 组织即可被页面直接消费；至少提供 `run_id / data_mode / events[].fields[].evidence_id / evidences[]`。
- **张**：证据最低要求 `evidence_id + block_id + page + quote`；坐标（bbox）结构定稿后补，页面已预留降级路径。
