# workspace/cjh · 陈家浩工作区

> cjh-workspace 分支 · 链路终点角色：网页 / 展示 / 演示 / 交付整合（D1–D14）。

```
workspace/cjh/
├── README.md             # 本文件：工作区入口
├── page_prototype/       # 三栏展示骨架（独立工程，零依赖，全相对路径）→ 详见其 README.md
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
    └── _ref_zong_D4-evaluation.md            # 只读参照：源=origin/zongbowen@728d2334，D4 评测 10/10 MATCH（勿改）
```

**查找规范（任务/进度查证顺序）**：
1. **某天该干什么、干到哪一步** → 仓库外 `D:\chenjh\code\program\jingguanpluge\team_plan_14days.xlsx` 的**「陈家浩_D1-D14明细」表**（2026-10-01 新增：64 条单元任务，含产出物/协作对象/状态列，公式汇总在表尾）；
2. **当天的执行细节** → `docs/cjh_workspace_0N_DN任务规划.md` 对应天的文档 + `docs/cjh_workspace_02_临时.md`（当日 TODO / 待确认区 / 阻塞记录）；
3. **冲突裁决**：xlsx 状态列与文档记录不一致时，**以当日实际执行记录（02_临时/日志）为准**，并回填 xlsx 状态列；
4. **接口/证据结构** → `docs/_ref_*` 只读参照文件（源头是他人的分支提交，勿改）。

**纪律**：目录结构变更须同步本文件与 page_prototype/README.md；提交等领导指令。
