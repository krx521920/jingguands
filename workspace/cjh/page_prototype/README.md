# page_prototype · 展示层可拓展骨架

> 公告事件提取与核验智能体 · 网页/展示/演示（陈家浩 · cjh-workspace）
> 位置：仓库内 `workspace/cjh/page_prototype/`（独立工程：**零外部依赖**，Node.js 内置模块即可运行，**全相对路径**，可整体搬移）。

## 快速开始

### 本地界面重排（2026-10-08）

新增 `public/css/workspace.css` 作为界面样式层：暖灰底色、葡萄紫主色、鼠尾草绿与杏色辅助色。桌面布局为侧边导航、紧凑数据工具栏、事件与证据双栏；窄屏自动改为横向导航和单栏阅读。

`public/js/app.js` 保留原有五个接口视图，提供固定导航、文档计数概览及清空状态同步。首次默认选择已保存的真实样例（若存在）。数据模式、抽取方式、未测项与缺失状态仍明确显示。结果与证据的定位信息可展开，质量报告的详细对照与历史统计默认折叠。

此版本仅调整展示与交互，未启用在线模型抽取。

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
│   ├── data_source.js      # ★数据源单一真源（D20建，D21 接宗锚点）—— 两批登记（权威 data_unified/ ＋ 演示池 data/）、**权威批次锚点实算与漂移检测**（宗 2026-10-09 裁决 `381c760f…`，本地实算非抄录）、**同源变体自动聚类**（按 file_sha256，21 组）、P0-01 标注、分母口径（已裁决：权威 606，615 为含演示件的扩大口径）。只登记不算数
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
├── data_unified/           # ★D20：权威冻结批次（32 份，其中 31 份入页面指标口径）
│   ├── D4-PLD-001..010.json   # 股份质押批（10 份）—— D4-PLD-001 即 P0-01 的正确形态（3 事件/3 质权人）
│   ├── D5-EQC-001..010.json   # 股权变动批（10 份）
│   ├── D6-AWD-001..010.json   # 中标合同批（10 份）
│   ├── pledge-scan-degrade.json # 扫描件降级用例（D13 scan_degrade 分母来源，属 31 份之一）
│   └── DEMO-EQC-HL-0930.json   # ★本地演示件，不在魏冻结批次内 ⇒ 不计入权威口径（唯一判据＝DEMO- 前缀）
├── public/                 # 前端（原生 ES Modules，无构建步骤）
│   ├── index.html          # 四栏页面骨架：上传 / 结果 / 证据 + 头部四视图切换（单文档 / 配对 D8 / 核验 D9 / 集成 D10）
│   ├── css/
│   │   └── style.css       # 样式（含模拟/真实/状态徽章配色）
│   └── js/
│       ├── app.js          # 装配入口：模式横幅 → 数据集选择 → 三栏渲染
│       ├── adapter.js      # 数据源适配层（前端不感知 mock/remote）
│       ├── status.js       # 状态枚举单一事实源（成功/失败/无法读取/待复核/模拟）
│       └── ★ app.js 中的 renderDatasetNotice()：★D20 数据集来源提示条（批次/角色/P0-01 标注，切数据集即刷新）
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
    _data_source_check.js    # D20/D21：数据源对账 22 项（批次结构/逐字节对比 --wei <sha>；换源后验收）
    _r_requirements_check.js # ★D21：宗博文「指标单一真源裁决」R1–R4 验收 27 项（R1–R4 判 FAIL、R5–R6 判 WARN，--strict 收紧）
    _shot_r_requirements.py  # ★D21：R1–R4 上屏验收 21 项（Playwright，断言批次标识/同源变体真的渲染了）
    _scan_markdown.js        # D21：扫 API 响应里会 textContent 上屏的字符串是否残留 markdown 标记
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

## 数据源切换（D12：provider 取代旧的 mock/remote；★D20：批次口径单一真源）

| 引擎 | 启动方式 | 数据来自 | 独立抽取 |
|---|---|---|---|
| `file`（默认） | `node server.js` | **权威批次 `data_unified/`（31 份入口径，D11首测冻结）优先，演示池 `data/` 兜底**，路径由 `bridge/data_source.js` 解析 | 否 |
| `cli`（真跑） | `.env` 里配好密钥 + `EXTRACT_CLI_PARSE_DIR`，`node server.js` | 魏 `scripts/jingguan/run_extract.mjs`（argv `--parse/--out-dir/--event-type`，产物落盘 `events.json`） | **是** |
| `http` | `ENGINE=http EXTRACT_HTTP_URL=<地址> node server.js` | 魏的抽取服务（预留） | 是 |

**未接通的引擎不会静默回落到 `file`**——`/api/engines` 报 `available:false` 并给出可执行的解阻原因，`/api/parity` 直接判 `not_covered`。这是 D10 `web_cli_same_result` 造假的根因，封死了。

### ★ D20：两批数据与"页面指标只跑哪批"（领导 10-09 裁定「换源」）

| 批次 | 目录 | 份数 | 是否进页面指标分母 | 说明 |
|---|---|---|---|---|
| `authoritative`（★本次口径） | `data_unified/` | 32（**31 份入口径**） | 31 份计入 | 与魏分支 `evaluation/D11/firsttest-envelopes/` 逐字节一致（`--wei <sha>` 可复验）。第 32 份 `DEMO-EQC-HL-0930` 是本地演示件，不计入 |
| `legacy` | `data/` | 30 | **0 份**（仅供查看） | mock 演示件、v0.1 旧版、不可兼容类型 `guarantee`、上传落盘，**以及 P0-01 物证 `wei_real_pledge_0197`／`wei_real_pledge_ce37`** |

- **页面上的任何数字都必须带批次**：`/api/metrics` 与 `/api/datasets` 均下发 `data_source` 段（批次、份数、目录 SHA-256 指纹），质量报告页顶部有数据源卡片，下拉旁有常驻批次徽标。
- **`/api/metrics?batch=legacy|all`** 可查对照批，但响应里会显式警告"数字不可与材料成绩并列引用"。
- **P0-01 物证保留 + 标注**（领导裁定②）：下拉里带 `［P0-01 物证］` 标记与悬停说明，选中后页面顶部弹说明条，指出它与 `D4-PLD-001` 同 `file_sha256`、旧抽取漏抽 2 个质权人整条事件。**不得删除——这是该缺陷的唯一物证。**
- ⚠ **待领导与宗博文裁定**：权威批内部还有 **606（纯冻结 31 份）/ 615（含本地演示件 32 份）** 两种分母口径，覆盖率分别72.11% / 72.52%。页面两个数并列上屏并标注来源，**不静默取其一**。详见 `docs/D20_换源落地.md` 第四节。
- ⚠ **解析产物跨 parser 版本不可比对**：`parse/0.7.0` 与 `0.9.0` 的 `block_id` 编号体系不同（同一文本编号会错位）。L3 出处核验优先用信封自带的 `source.parse_meta.blocks`，外部快照仅在 parser 版本一致时可用；版本不匹配的字段**判未核不计入分母**，绝不折算成命中率。

## 密钥管理（D14）

密钥放 `page_prototype/.env`（**不入库**），由 `bridge/extractor.js` 的 `loadDotEnv()` 读入——只在变量尚未存在于 `process.env` 时注入，真机环境变量优先。

```bash
# page_prototype/.env（形如，具体值不上材料、不入仓）
JINGGUAN_LLM_API_KEY=sk-…
DEEPSEEK_API_KEY=sk-…
```

**提交前必跑**：`node demo/_secret_guard.js` —— 验 `.env` 被双重忽略 + 已跟踪/未跟踪文件里没有密钥（7 项守卫）。

## 权威批次口径（D21，对齐宗博文 2026-10-09 裁决）

页面上屏的一切指标**只跑权威批次**，口径由宗博文裁决登记的唯一锚点定义：

| 项 | 值 |
|---|---|
| 权威批次 |魏 D11 首测冻结批次 = **31 份**（30 核心 + 1 扫描降级） |
| 不计入 | `DEMO-EQC-HL-0930`（本地演示补料，1 份 / 9 字段） |
| 权威分母 | **606 字段 / 31 份** |
| 唯一锚点 | `381c760fa07b2dc3a8256282e23009bce4b79445fdc7f4f4280168af6c90cef0` |

三条纪律：

1. **锚点本地实算，不是抄录登记值**——按宗给的算法（文件名升序 → 逐份 sha256 → `文件名:哈希` 行 `\n` 连接 → 整体再取 sha256）自己算。篡改任一份文件即检出漂移（`bridge/data_source.js` 的 `anchor()`），页面徽标变红报警。锚点要改须走裁决登记。
2. **材料旧文的「615」是含演示件的扩大口径**，按裁决不作权威分母引用；确需引用须写成「含演示件的扩大口径」（446/615 = 72.52%）。
3. **同一 `file_sha256` 的多次抽取必须标为同源变体**（R4）。实测 62 个数据集中有 **21 组**同源——`D5-EQC-00x`↔`wei_real_eqc_00x` 等 20 组是同源改名（字段名集合与事件数完全一致），P0-01 那组才是真正的抽取差异。按 sha 自动聚类，新增同源组自动进登记区。

验收：`node demo/_r_requirements_check.js`（27 项，R1–R4 判 FAIL）；上屏自检 `python demo/_shot_r_requirements.py http://127.0.0.1:<port>`（21 项）。裁决原文见 `zongbowen@74f9505b:evaluation/integration/指标单一真源裁决-20261009.md`。

## 约定与红线（继承 01_规则.md）

- 模拟数据显式标"模拟"，不得计入真实成绩；
- 每个字段值必须挂 `evidence_id`，无证据写 `null`，不编造；
- 契约字段只增不改，破坏性变更必须升 `schema_version`；
- 本目录结构变更必须同步更新本 README；
- **不主动 commit/push——等领导明确说"提交"**。
