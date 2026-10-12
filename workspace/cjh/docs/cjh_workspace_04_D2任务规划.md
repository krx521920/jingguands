# 陈家浩 · D2 任务规划（2026-09-28）

> D2 共同目标：接通文本、数值与出处。我的交付物：展示真实返回值的页面（字段/状态/页码）＋ 转接口。
> 口径对齐方式：**从队友分支直接拉对应文件核对**（领导 09-28 授权），不靠口头转述。

---

## 1. 口径对齐记录（今日完成）

### 已对齐 ✅

| 来源 | 分支/文件 | 结论 |
|---|---|---|
| 方轩诚《金融数据口径字典 v0.1》 | `origin/feature/fang-rules` @ **c856882** · `docs/D1_方轩诚_口径字典_v0.1.md` | 已拉取，快照存 `docs/_ref_fang_口径字典_v0.1.md`（只读参照） |
| 方轩诚《换算用例 v0.1》（10 组） | 同上 · `docs/D1_方轩诚_换算用例_v0.1.md` | 已拉取，快照存 `docs/_ref_fang_换算用例_v0.1.md` |

**方口径要点（页面端必须遵守）**：
1. 数值一律**十进制字符串**，禁止二进制浮点；
2. 比例 `normalized` = **百分点字符串**（原文 2.5% → `"2.5"`），**不乘 100**；
3. `qualifier`：`exact / approx（约）/ at_most（不超过）`，约数与上界不得伪装成精确值；
4. `scope`：`single（单次）/ cumulative（累计）/ unknown`，两者不是别名，不得相减推断；
5. 比例必须带分母：`total_share_capital / holder_shares / net_assets / other` + 原文口径说明；
6. 缺失状态：`present / not_mentioned / explicit_zero / unreadable`——**缺失≠零、不可读≠未提及**，不填 0 不猜测；
7. 出处随字段保存：文件 SHA-256、页码、`block_id`、原文片段。

**我方契约的修正（D2 落实）**：`pledge.json` 的 `normalized: 0.085`（小数）与方口径冲突 → 统一改为 `"8.5"`（百分点字符串），`share_count.normalized` 改为字符串。契约升 **v0.2**（字段只增不改）。

### 未对齐 ⏸（分支尚无产出）

| 队友 | 分支状态 | 影响 | 挂起动作 |
|---|---|---|---|
| 魏文宇 | `feature/wei-core` = 477b4f4（基点，无提交） | 事件 JSON 真实字段未冻结，转接口对魏只做了"透传+留痕" | 他推分支后重跑本规划 §3 步骤 1 |
| 张智博 | `feature/zhang-parser` = 477b4f4（基点，无提交） | bbox/坐标结构未冻结，证据 `bbox` 保持 null 降级为页码级 | 同上 |

另：根目录 `D1_方轩诚_金融口径与换算_v0.1.zip` 内容已由其本人提交到 fang-rules 分支，zip 本身保持 untracked 不入库。

## 2. 转接口（今日核心交付 ✅）

**位置**：`page_prototype/bridge/upstream_bridge.js`（零依赖，server 与前端之间的格式缝）。

**数据流**：

```
方口径标准化记录（records[]，v0.1 字典格式）
        │  bridge: "fang-normalization-v0.1"
        ▼
upstream_bridge.js ──识别──► 契约对象 → 原样透传（零损耗）
        │                └─上游格式 → 转换（映射规则见下）
        ▼
契约 v0.2（schema_version: "0.2"）
        ▼
server.js /api/result（mock 与 remote 两条路都过桥）→ 页面
```

**映射规则**（全部可追溯到口径字典条目）：
1. `kind=amount/shares/ratio` → 默认字段名 `amount / share_count / pledge_ratio`（record.field 优先）；
2. `rawText/rawValue` → 契约 `value`（原文口径展示）；方的 `value/unit` → 契约 `normalized/unit`（标准化展示）；
3. `qualifier ≠ exact`、`scope ≠ unknown` → 契约可选字段 `qualifier / scope`，前端渲染为"约 / 不超过 / 单次 / 累计"；
4. 比例的 `denominator` → 契约 `denominator { kind, kind_text, definition }`，前端显示"分母=公司总股本"等；
5. `status=present/explicit_zero` → 正常产出；`not_mentioned` → **字段不产出**，记入顶层 `bridge.notes`；`unreadable` → 产出但 `status_override: unreadable`，事件级状态转 `pending_review`；
6. `record.evidence` → 契约 `evidences[]`（`evidence_id` 自动编号；bbox 未冻结保持 null）；
7. 未知上游格式 → **不猜测，原样透传**并留 `bridge.passthrough` 痕。

**契约 v0.2 增量**（只增不改）：fields 可选 `qualifier / scope / denominator`；`source_file` 可选 `sha256`；顶层可选 `bridge`（转换留痕）。

**验证数据集**：`data/upstream_case.json`——按方换算用例 2/5/6/7/9/10 构造的**合成**上游格式样例（显式标 simulated），经桥后页面显示：万元→元、万股→股、亿股→负 1 股、百分点不乘百、约/单次/分母标注、not_mentioned 不产出、unreadable 降级待复核。

**自测结果（2026-09-28）**：桥单测 ✅（1.25万元→"12500"元·approx·single；2.5%→"2.5"+分母=公司总股本；-0.00000001亿股→"-1"股；契约对象恒等透传）＋ server 端到端 ✅（/api/datasets 出现 upstream_case；/api/result 三数据集全通）。

## 1b. v0.3 对齐记录（09-28 下午，weiwenyu@00a472c）

领导转达裁决后，直接从 `origin/weiwenyu@00a472c` 拉取 `interface/README.md`、`interface/event-envelope.schema.json`、真实运行样例确认：

1. **裁决确认**：事件类型 `bid_won` → **`award_contract`**；分母枚举 → **`holder_shares / total_share_capital / net_assets / other`**（与我上午按方口径对齐的四值一致，无需返工）。
2. **超出裁决的实质变化（必须跟进）**：v0.2 已把质押拆成 13 个独立字段（本次/累计 × 股数/比例），比例由 4 个字段名固定 denominator；6 状态（新增 not_disclosed / not_applicable）；provenance 为数组且冻结 region 语义（PDF 点、左上原点、y 向下）+ table_id/cell_ref 表格出处。
3. **页面已按 v0.3 更新**：转接口新增 `wei-event-envelope-v0.3` 识别与映射（6 状态→status_override、provenance[]→多证据、unit 枚举→中文、分母直通）；status.js 加 未披露/不适用/未提及 三徽章；results.js 全量字段注册表（31 字段中文）+ 事件类型中文；evidences.js 展示表格出处。
4. **页面已消费真实输出**：`data/wei_run_pledge.json` = 魏 `runs/20260928T061450-pledge-3506/events.json`（deepseek-chat 真实调用，非 mock），页面下拉直接可选、自动过桥渲染。
5. 快照存档（只读）：`docs/_ref_wei_interface_README_v0.3.md`、`docs/_ref_wei_event-envelope.schema_v0.3.json`、`docs/_ref_wei_events_pledge_v0.3.json`。
6. 遗留：region 屏幕换算与原文回跳仍等张智博的页面尺寸数据（parse_meta.blocks/page_count 可空）；`npm run jingguan:validate` 是魏侧校验器，我的页面消费侧自测以桥单测+冒烟为准。

---

## 3. 待办事项

### A. 无需队友输入 · 已完成 ✅


### A. 无需队友输入 · 已完成 ✅

| # | 事项 | 产出 |
|---|---|---|
| A1 | 拉方分支口径文件并对齐 | `docs/_ref_fang_*.md` ×2 ＋ 本文档 §1 |
| A2 | 转接口模块 + server 集成 | `bridge/upstream_bridge.js`、`server.js`（mock/remote 均过桥） |
| A3 | 契约 v0.2 + mock 口径修正 | `data/pledge.json` normalized 百分点化；API.md 增补 |
| A4 | 验证数据集 + 前端口径标注渲染 | `data/upstream_case.json`、`results.js`（qualifier/scope/分母/标准化展示） |
| A5 | 自测 | 桥单测 + server 冒烟全通过 |

### B. 依赖队友输入 · 挂起 ⏸

| # | 事项 | 等谁 | 触发动作 |
|---|---|---|---|
| B1 | 魏的事件 JSON 真实字段 | 魏文宇推分支 | 照 §1 方法拉取 → 转接口加 `from-wei-*` 映射 → 重建 mock |
| B2 | 张的 bbox 结构与坐标系原点 | 张智博推分支 | 拉取 → 桥的 bbox 直通位补结构 → 原文回跳 |
| B3 | 统一演示样例 | 全员 | 用真样例替换 upstream_case 跑 17:30 联调 |

### C. 需领导拍板 ⏸

| # | 事项 | 说明 |
|---|---|---|
| C1 | D2 产物提交时机 | 按纪律等"提交"指令（涉及 commit：bridge/ + data/ + docs/ + 02/04 文档） |
| C2 | `_ref_fang_*.md` 快照是否入库 | 建议：入库（注明"只读参照，源=fang-rules@c856882"），便于审阅口径对齐依据；不入库则仅本地留存 |
