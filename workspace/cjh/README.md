# workspace/cjh · 陈家浩工作区

> cjh-workspace 分支 · 链路终点角色：网页 / 展示 / 演示 / 交付整合（D1–D14）。

```
workspace/cjh/
├── README.md             # 本文件：工作区入口
├── page_prototype/       # 三栏展示骨架（独立工程，零依赖，全相对路径）→ 详见其 README.md
├── spec/                 # 本地规范副本（只读参考，权威在各队友分支 + develop）
│   └── v0.3/             # 当前核心规范：信封 schema ＋ 接口变更记录＋ 字段注册表单一真源
└── docs/                 # 工作区文档
    ├── cjh_workspace_00_总规划.md       # 14 天任务线 + 21 天缓冲视角
    ├── cjh_workspace_01_规则.md         # 分支/提交/编辑/协作规则与红线
    ├── cjh_workspace_02_临时.md         # 每日 TODO、待确认区、阻塞记录（随手更新）
    ├── cjh_workspace_03_D1任务规划.md   # D1 任务分解与接口提案
    ├── cjh_workspace_04_D2任务规划.md   # D2 口径对齐记录 + 转接口设计
    ├── cjh_workspace_05_D2交接与待办.md # D2 交接：队友对接要求 + 待办清单
    ├── cjh_workspace_06_D3任务规划.md   # D3：新规范拉取记录 + 导出/断链修复 + 自测证据
    ├── cjh_workspace_07_D4任务规划.md   # D4：证据查看与异常状态页面（异常汇总条/direction/扫描降级）
    ├── cjh_workspace_08_D5轮值议程与演示.md # D5：轮值议程 + 统一样例演示脚本 + 文件整理清单
    ├── cjh_workspace_09_D10轮值议程与演示.md # D10：轮值议程（六议题）+ 演示三步 + 四方交付核实
    ├── _ref_fang_口径字典_v0.1.md       # 只读参照：源=origin/feature/fang-rules@c856882（勿改）
    ├── _ref_fang_换算用例_v0.1.md       # 只读参照：同上（勿改）
    ├── _ref_wei_interface_README_v0.3.md     # 只读参照：源=origin/weiwenyu@00a472c（勿改）
    ├── _ref_wei_event-envelope.schema_v0.3.json # 只读参照：同上（勿改）
    ├── _ref_wei_events_pledge_v0.3.json      # 只读参照：魏真实运行样例（勿改）
    ├── _ref_wei_interface_README_v0.3b.md    # 只读参照：源=origin/weiwenyu@59c1d79（勿改）
    ├── _ref_wei_event-envelope.schema_v0.3b.json # 只读参照：同上（勿改）
    ├── _ref_wei_run_pledge_latest.json       # 只读参照：魏 09-29 最新 run（mock 门禁输出，仅对照勿作真实数据）
    ├── _ref_wei_batch_report.md              # 只读参照：魏 D3 批量报告（勿改）
    ├── _ref_zhang_evidence_v0.7.json         # 只读参照：源=origin/zhangzhibo@b108a85，解析出处结构（勿改）
    ├── _ref_zhang_D3_README.md               # 只读参照：张 D3 交付说明（勿改）
    ├── _ref_zhang_D3_给群里的回复.md         # 只读参照：张 D3 成稿（勿改）
    ├── _ref_zhang_D3_pledge.parse.json       # 只读参照：张真实质押公告解析样例（勿改）
    ├── _ref_zong_D2-evaluation.md            # 只读参照：源=origin/zongbowen@7e6d0e7（勿改）
    ├── _ref_zong_contract-gaps.md            # 只读参照：同上（勿改）
    ├── _ref_zong_gold_PLD-001.json           # 只读参照：宗 gold 信封样例（勿改）
    ├── _ref_wei_interface_README_v0.3c.md    # 只读参照：源=origin/weiwenyu@e1610b84，v0.4 增补 direction（勿改）
    ├── _ref_wei_run_D3PLD001_multi.json      # 只读参照：魏 PLD-001 run 样例（勿改）
    ├── _ref_zhang_evidence_v0.9.json         # 只读参照：源=origin/zhangzhibo@3d64f4aa，covers+扫描降级（勿改）
    ├── _ref_zong_D4-evaluation.md            # 只读参照：源=origin/zongbowen@728d2334，D4 评测 10/10 MATCH（勿改）
    │
    │   ── 收口落地记录（D20 起，按日期）──
    ├── D20_换源落地.md                        # 页面数据源换到权威批次 data_unified/ ＋ 信息源披露
    ├── D21_对齐宗裁决.md                      # 按宗 10-09 指标裁决对齐 ＋ 21 组同源变体聚类
    ├── D22_D13陌生样例复现执行记录.md          # D13 哈希闸门拦停记录（含两条阻塞缺陷）
    ├── D22_给宗-D13裁定请求.md                # 给宗的裁定请求（由领导走其他渠道转交）
    ├── D23_D14收口清单落地.md                 # 收口清单步骤 1–3：权威数据入库/关系判定改读法/快照物化
    ├── D24_收口清单步骤4标准化口径收口.md     # 步骤 4：标准化两指标拆分 ＋ 注册表 4 项收口（详见该文件）
    ├── D25_收口清单步骤5上传闸门接契约校验.md # 步骤 5：上传接契约机检（宗审计 P1-2）＋ sources 带契约状态
    └── D26_收口清单步骤6其余小项.md           # 步骤 6：5 个小项 ＋ parity 报告 stale 检测 ＋ L3 基准错配修复
```

**现场导入/使用须知（步骤 7 落地，评审现场照此操作）**：

- **现场导入只收 `.json` 信封文件**——页面**不做在线 PDF 抽取**。要导PDF，
  须先经张智博的 DocumentIR 解析、再由魏文宇的抽取管线产出信封，页面只消费信封。
  上传件会经 `bridge/contract_validate.js` **机检**：缺 `run_id`/`is_mock`/`source`/`run_meta`
  的件判 `ok:false` 且**不落盘**，逐条列出缺哪个字段。
- **`GET /api/result` 必须带 `dataset` 参数**（无参返 400，不静默回落演示件）。
  数据集名**大小写不敏感**（`d4-pld-001` 可命中 `D4-PLD-001`），未命中时返回候选提示。
- **权威口径只跑 `data_unified/`**（31 份 / 分母 606，锚点 `381c760fa07b…`）；
  `data/` 是演示池，仅供查看，不计入任何分子分母。
- **演示前必跑一遍 `node server.js`** 确认指标卡非 null（`/api/metrics` 的 `summary.fields_total` 应为 606）。

**查找规范（任务/进度查证顺序）**：
1. **某天该干什么、干到哪一步** → 仓库外 `D:\chenjh\code\program\jingguanpluge\team_plan_14days.xlsx` 的**「陈家浩_D1-D14明细」表**（2026-10-01 新增：64 条单元任务，含产出物/协作对象/状态列，公式汇总在表尾）；
2. **当天的执行细节** → `docs/cjh_workspace_0N_DN任务规划.md` 对应天的文档 + `docs/cjh_workspace_02_临时.md`（当日 TODO / 待确认区 / 阻塞记录）；
3. **冲突裁决**：xlsx 状态列与文档记录不一致时，**以当日实际执行记录（02_临时/日志）为准**，并回填 xlsx 状态列；
4. **接口/证据结构** → `docs/_ref_*` 只读参照文件（源头是他人的分支提交，勿改）。

**纪律**：目录结构变更须同步本文件与 page_prototype/README.md；提交等领导指令。