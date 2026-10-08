# page_prototype · 展示层可拓展骨架

> 公告事件提取与核验智能体 · 网页/展示/演示（陈家浩 · cjh-workspace）
> 位置：仓库内 `workspace/cjh/page_prototype/`（独立工程：**零外部依赖**，Node.js 内置模块即可运行，**全相对路径**，可整体搬移）。

## 快速开始

```bash
cd workspace/cjh/page_prototype
node server.js
# 打开 http://127.0.0.1:8642
```

完整玩法（含扩展演示）见 [demo/使用演示.md](demo/使用演示.md)；数据契约与对接要求见 [docs/API.md](docs/API.md)。

## 目录结构

```
page_prototype/
├── server.js               # 零依赖本地服务器：静态资源 + /api 数据接口（mock/remote 双模式，读数自动过转接口）+ /api/export（D3：JSON/CSV 导出）+ /api/upload（D6：批量上传，坏文件进失败列表）+ /api/upload/log（D6：上传日志下载）+ /api/pairs（D8：跨文档配对三态视图）+ /api/verify（D9：核验清单先归因 + 双侧证据）+ /api/integration（D10：五份队友产物服务端合并）+ /api/contract（D15：契约本体出口，供入库/评测方）
├── bridge/
│   ├── upstream_bridge.js  # 转接口（D2/D3，★D15 改契约优先）：上游格式（方口径记录 / 魏事件信封 v0.3）→ **envelope（严格符合 schema v0.3，可入库）+ view（页面投影）两层分离**；完整性断链检查；错误填充审计；未知格式透传留痕
│   ├── contract_validate.js # ★D15 新增：v0.3 契约零依赖机器校验器（JSON Schema 层 + 字段注册表层，注册表直读 registry.mjs 不手抄）
│   ├── parity_criteria.js  # L4 Web/CLI 一致性判据单一真源（D14）：五级 S0–S4 + 9 条归一化，双向反例守卫
├── package.json            # scripts: start / demo（仅声明，无需 install）
├── .env                     # ★ 本机私有：LLM 密钥（JINGGUAN_LLM_API_KEY / DEEPSEEK_API_KEY）＋可选引擎配置。不入库（双重忽略），由 bridge/extractor.js 读取
├── README.md               # 本文件（目录结构维护处，结构变更必须同步更新）
├── docs/
│   └── API.md              # 调用文档：数据契约 v0.3、接口清单、状态枚举、环境变量、转接口、密钥管理、扩展指南
├── data/                   # 数据集（mock 模式：server 自动列举，放进来即出现在下拉）
│   ├── pledge.json         # 质押事件样例（D1 mock，旧版 v0.1 页面私有约定，**经转接口兼容升到 v0.3**）
│   ├── share_change.json   # 股权变动样例（D5：v0.3 信封 equity_change ×3——增持/减持/冲突演示，比例带分母声明；is_mock=true 仅演示，已对齐契约零违规）
│   ├── upstream_case.json  # 方口径上游格式合成用例（经转接口转换展示，D2 验证）
│   ├── wei_run_pledge.json # 魏文宇 v0.3 信封真实运行输出（09-28，D2 接入）
│   ├── wei_real_pledge_0197.json  # 魏 D3 真实 PDF run（pledge.pdf · deepseek-chat · is_mock:false，质押闭环主线）
│   ├── wei_real_pledge_ce37.json  # 同源对照 run（D3）
│   ├── wei_real_PLD001_3ev.json   # 魏 D4 真实 run：PLD-001 三事件 + 未提及/待复核异常态（异常汇总条演示）
│   ├── wei_real_PLD005_release.json # 魏 D4 真实 run：E01 质押 + E02 解除质押（direction=release 渲染）
│   ├── wei_real_D4_scan.json      # 魏 D4 真实扫描件 run：14 字段全 unreadable（无法读取全量场景，09-30 晚补）
│   ├── wei_real_eqc_001..010.json # 魏 D5 真实 equity_change 批次 batch-20261002T120859 十份信封（契约问题清零，含多事件 001×5 / 002×3）
│   ├── wei_real_eqc_XXX.check.json # 上列十份的同名 sidecar：方 equity_check_D5 v0.5.0 旁路核验报告（冲突码/复核码，不进下拉）
│   └── wei_real_awd_001..010.json # 魏 D6 真实 award_contract 同批次十份信封（17 事件 × 14 字段全带出处，14 字段注册表实证；D7 晚补入）
│   └── pairs/              # D8 配对数据（子目录不进数据集下拉）：pairs_manifest.json（宗 13 组封存清单 v0.2）+ b_report.json（魏 B 全量报告 20261004，PAIR-013=unknown）
│   └── d10/                # D10 集成数据（子目录不进数据集下拉）：五份队友产物同源装配
│       ├── integration_cases.json    宗：10 组多公告集成案例 + expected 预期口径
│       ├── integration_bundle.json   魏：同 10 组实判 records/diff_list/report/cache（code 4e0b910c）
│       ├── cache_evidence.json       魏：缓存三态实测（冷启 31miss → 重放 31hit 3.6s → 清缓存 31miss，重放逐字节一致 31/31）
│       ├── chain_check.json          张：出处链四段检查 + 同名串证据风险（10 组/24 成员/重复文字组内块 2009）
│       └── fang_report_bundle.json   方：核验报告五段（事件/差异/归因/计算/边界，1.3MB，10 组全量非摘要）
├── public/                 # 前端（原生 ES Modules，无构建步骤）
│   ├── index.html          # 四栏页面骨架：上传 / 结果 / 证据 + 头部四视图切换（单文档 / 配对 D8 / 核验 D9 / 集成 D10）
│   ├── css/
│   │   └── style.css       # 样式（含模拟/真实/状态徽章配色）
│   └── js/
│       ├── app.js          # 装配入口：模式横幅 → 数据集选择 → 三栏渲染
│       ├── adapter.js      # 数据源适配层（前端不感知 mock/remote）
│       ├── status.js       # 状态枚举单一事实源（成功/失败/无法读取/待复核/模拟）
│       └── render/         # 渲染器（注册式，可扩展新栏/新视图）
│           ├── upload.js     # 栏一：批量上传（D6 闭环：多文件 + 进度条 + 失败列表 + 日志下载；坏文件永远可见）
│           ├── results.js    # 栏二：事件卡片 + 字段表 + 证据锚点（v0.3 注册表 + 口径标注 + D5 股权变动前后对比块/分母口径/方冲突码）
│           ├── evidences.js  # 栏三：证据列表 + 高亮联动（含表格证据 table_id/cell_ref；D7 出处口径说明块 + 弱锚定/quote 歧义提示）
│           ├── pairs.js      # D8 配对视图：双栏成员对比（双侧 issuer_code/notice_number/哈希 + 本地原文锚点）+ 三态徽章（unknown→「证据不足」，绝不渲染为「不同事件」）
│           ├── verify.js     # D9 核验清单视图：先归因再判矛盾（方的 message 文案在前、判定码在后 + 张的 provenance 出处）+ 双侧证据视图（互证点 A|B 并排 + 合计勾稽形态）
│           └── integration.js # D10 集成视图：10 组「预期→实判」并排 + 缓存三态面板 + 方报告五段折叠区（差异明细/计算/边界/逐成员缓存核对）+ 出处链面板
└── demo/
    └── 使用演示.md          # 完整使用 demo（15 个演示）：统一样例全链路/异常汇总条/导出/扫描降级/扩展/remote/自检/股权变动对比页/配对 D8/核验 D9/缓存三态 D10/10 组集成/方报告五段+出处链
    _engine_check.js         # D12：抽取引擎适配层自检 56 项（机制诚实性，不发模型请求）
    _secret_guard.js         # D14：密钥泄漏守卫 7 项（.env 是否被忽略 + 已跟踪/未跟踪文件有无密钥）★ 提交前必跑
    _l4_preflight.js         # D12：Web/CLI 真跑前置体检（不发请求，只查输入资产/入口/密钥）
```

## 架构（三条缝，扩展不动骨架）

```
数据集(data/*.json)                魏 run_extract.mjs（真跑）      魏的 HTTP 抽取服务
      │ file provider                    │ cli provider              │ http provider
      ▼                                   ▼                           ▼
┌─────────────────────── server.js /api ───────────────────────┐
│  /api/datasets（列举）  /api/result?dataset=x  /api/export（D3）│
│  /api/engines（D12 引擎清单/可用性）  /api/parity（D12 Web/CLI）│
│  /api/upload（D6 批量上传）  /api/upload/log（D6 日志下载）      │
│  /api/pairs（D8：13 组配对 = 宗清单 × 魏B报告 + 本地原文锚点）   │
│  /api/verify（D9：sidecar 发现聚合（先归因）+ 互证点双侧证据）  │
│  /api/integration（D10：宗案例 × 魏bundle × 缓存三态 × 张链检 × 方报告五段）│
│  /api/metrics（D11 实算）  /api/metrics/registry（D12 单一真源）│
│  /api/contract（D15 契约本体，供入库/评测方）│
│  bridge/upstream_bridge.js：上游格式 → 契约 + 断链自检  │
│           bridge/contract_validate.js：契约两层机器校验   │
└──────────────────────────────┬───────────────────────────────┘
                               ▼
                    adapter.js（前端唯一数据出口）
                               ▼
        app.js 装配 ──► render/upload.js │ render/results.js │ render/evidences.js
                    └► render/pairs.js（D8）│ render/verify.js（D9）│ render/integration.js（D10）
                    └► render/metrics.js（D11/D12 指标 + 对照三层）
                               ▼
                    status.js（状态枚举单一事实源）
```

- **数据缝**：换数据源只动 `ENGINE=file|cli|http`，前端零改动；
- **格式缝**：上游格式（方口径记录 / 魏事件信封）直接进 `data/` 或 provider 返回，转接口自动转换，契约对象零损耗透传；
- **契约缝**（D15）：转接口产出 **envelope（严格符合 `interface/event-envelope.schema.json` v0.3，`additionalProperties=false`，可机器校验/可入库）+ view（页面投影）两层分离**。视图只能从契约派生，不存在两份真源；**视图字段绝不写进信封**（写了即破坏契约）；不合规数据**如实上报不静默修好**。校验结果保留在接口层（`GET /api/contract` 返回 `contract_validation`，两层违规数+ 注册表真源路径），**前端不暴露**（2026-10-08 领导裁定：前端用户不需要了解该接口返回值）——后端照跑照查，只是不上屏。
- **渲染缝**：新栏/新视图 = 新渲染器 + app.js 一行装配；
- **状态缝**：状态枚举只改 `status.js` 一处；
- **导出缝**（D3）：导出与页面同一 `readDataset` 路径——页面所见即导出所得，CSV 每字段一行（含出处/单元格号/quote）。

## 数据源切换（D12：provider 取代旧的 mock/remote）

| 引擎 | 启动方式 | 数据来自 | 独立抽取 |
|---|---|---|---|
| `file`（默认） | `node server.js` | `data/*.json` 预生成信封，页面常驻"模拟"横幅 | 否 |
| `cli`（真跑） | `.env` 里配好密钥 + `EXTRACT_CLI_PARSE_DIR`，`node server.js` | 魏 `scripts/jingguan/run_extract.mjs`（argv `--parse/--out-dir/--event-type`，产物落盘 `events.json`） | **是** |
| `http` | `ENGINE=http EXTRACT_HTTP_URL=<地址> node server.js` | 魏的抽取服务（预留） | 是 |

**未接通的引擎不会静默回落到 `file`**——`/api/engines` 报 `available:false` 并给出可执行的解阻原因，`/api/parity` 直接判 `not_covered`。这是 D10 `web_cli_same_result` 造假的根因，封死了。

## 密钥管理（D14）

密钥放 `page_prototype/.env`（**不入库**），由 `bridge/extractor.js` 的 `loadDotEnv()` 读入——只在变量尚未存在于 `process.env` 时注入，真机环境变量优先。

```bash
# page_prototype/.env（形如，具体值不上材料、不入仓）
JINGGUAN_LLM_API_KEY=sk-…
DEEPSEEK_API_KEY=sk-…
```

**提交前必跑**：`node demo/_secret_guard.js` —— 验 `.env` 被双重忽略 + 已跟踪/未跟踪文件里没有密钥（7 项守卫）。

## 约定与红线（继承 01_规则.md）

- 模拟数据显式标"模拟"，不得计入真实成绩；
- 每个字段值必须挂 `evidence_id`，无证据写 `null`，不编造；
- 契约字段只增不改，破坏性变更必须升 `schema_version`；
- 本目录结构变更必须同步更新本 README；
- **不主动 commit/push——等领导明确说"提交"**。
