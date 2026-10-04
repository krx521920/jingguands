# 陈家浩 · 临时工作台（每日更新，随手记）

> 用法：每天开工先勾 TODO；阻塞随手记；交接物拿到就打勾。本文件不需要优雅，需要及时。
> 最近更新：2026-09-30（D4 当天）

---

## 0. 环境状态快照（2026-09-27）

- [x] SSH 专钥 `id_ed25519_github` 配置并验证（走 ssh.github.com:443）
- [x] 仓库克隆 `D:\chenjh\code\program\jingguanpluge\jingguands`（浅克隆 depth=1）
- [x] 分支 `cjh-workspace` 建立（基于 origin/develop @ 477b4f4）
- [x] `pnpm install` 完成（335 workspace 项目，pnpm 11.7.0）
- [x] `pnpm run typecheck` 通过（环境验收 ✔）
- [x] 首次提交：**已完成**（2026-09-27，方案 A：`workspace/cjh/` 整体入仓，commit 413095e，已推送 origin/cjh-workspace，pre-commit/pre-push 钩子全过）
- [x] D1 页面骨架开工（并完成，见 §1）

## 1. D1（09-27）TODO —— 已收口

- [x] 三栏页面骨架（上传/结果/证据）→ **已升级为独立工程并入仓** `workspace/cjh/page_prototype/`：Node 零依赖 server + ES Modules 前端，全相对路径，README 维护目录
- [x] 约定状态字段（成功 / 失败 / 无法读取 / 待复核 / 模拟）→ `public/js/status.js` 单一事实源
- [x] 模拟接口（显式标"模拟"）→ data/ 数据集（pledge + share_change）+ mock/remote 双模式适配层
- [x] 最小子单元跑通：端到端 smoke 测试全 200（/api/datasets、/api/result×2、静态页、app.js）
- [x] 调用文档 + 完整使用 demo → docs/API.md（数据契约 v0.1 + 扩展指南）、demo/使用演示.md（5 个演示）
- [x] 向魏/张反馈：页面需要的字段清单 → 已写入 `03_D1任务规划.md` §3–§4

## 1b. D2（09-28）TODO —— 已收口

- [x] 口径对齐：从 `origin/feature/fang-rules@c856882` 拉取方轩诚口径字典 + 换算用例（快照存 `docs/_ref_fang_*.md`，只读）
- [x] 转接口 `page_prototype/bridge/upstream_bridge.js`：方口径标准化记录 → 契约 v0.2；mock/remote 自动过桥；未知格式透传留痕
- [x] 契约 v0.2：`normalized` 统一十进制字符串、比例=百分点（mock 的 0.085 已修正为 "8.5"）；fields 增可选 `qualifier/scope/denominator`；`source_file.sha256`
- [x] 前端口径标注：约/不超过 · 单次/累计 · 分母=… · 标准化值（results.js）
- [x] 验证数据集 `data/upstream_case.json`（方换算用例 2/5/6/7/9/10 的合成上游样例，显式标 simulated）
- [x] 自测：桥单测 + server 端到端冒烟全通过
- [x] 魏的事件 JSON → **v0.3 已冻结（weiwenyu@00a472c）**：bid_won→award_contract、分母四值枚举、6 状态、质押 13 字段注册表；页面已按 v0.3 更新并消费真实 run 样例（见 04 文档 §1b）
- [ ] 张的分支有产出后：拉 bbox 结构 → 补坐标渲染与原文回跳（B2；region 语义 v0.3 已冻结：PDF 点、左上原点、y 向下）
- [ ] 17:30 联调：等统一演示样例（B3）

## 1c. D3（今天 09-29）TODO —— 质押真实闭环 ⭐里程碑

- [x] 新规范拉取：魏 `weiwenyu@59c1d79`（契约 v0.3b：source_type 枚举/date_range/award 14 字段）+ 张 `zhangzhibo@b108a85`（evidence/0.7 + sample/D3）+ 宗 `zongbowen@7e6d0e7`（gold/contract-gaps）+ 方 `fang-rules@24b7656`（D2 标准化模块）→ 快照 `_ref_*` ×11 入 docs
- [x] 真实数据集：`data/wei_real_pledge_0197.json` + `wei_real_pledge_ce37.json`（魏真实 PDF run，已核 is_mock:false；09-29 的 033353 系列是 mock 门禁输出，不入 data/）
- [x] 转接口 v0.3b：evidences 增 source_type、字段增 status_raw、WEI_UNIT_TEXT 补 date_range
- [x] 完整性断链检查 `checkIntegrity()`：有值无出处/引用不存在/cell 缺 table_id+cell_ref → error；table 兜底块 → warn 降权；页面红/黄警告条
- [x] 状态错位修复：字段徽章/CSV 状态改字段级（`status_override || success`），不再继承事件级待复核；原始 6 态进 `status_raw`
- [x] JSON/CSV 导出：`/api/export?dataset=x&format=json|csv`（与 result 同路径同桥；CSV 18 列 + BOM + RFC4180）；前端"导出 CSV/JSON"按钮
- [x] 证据锚点升级：`证据 ev-0001 · 表格#r2c1`；证据栏显示出处类型中文
- [x] 自测：桥 5 项（含故意破坏检测）+ server 冒烟（6 数据集 CSV 全 200、JSON 导出逐字节一致、路径注入 400）+ 前端 3 模块语法
- [x] 给魏确认：CSV 状态列字段级口径（`status_raw` 保留 6 态）是否符合其统计需要 → **已关闭（领导 09-29 21:47：无需转告，附加内容仅为页面侧判断）**
- [ ] 张的 `continues` 跨页续表拼接 → D4 做（页面先忠实展示不拼接）
- [x] award_contract 14 字段中文注册表 → **已补（10-02 晚）**：FIELD_TEXT 按 v0.3c 权威清单补齐（consortium 拆分为 members/shares + contract_signed / formal_award_notice_received / price_adjustment_status / recognized_revenue；旧字段名 consortium 保留兼容）

## 1d. D4（今天 09-30）TODO —— 证据查看与异常状态页面

- [x] 新规范拉取：魏 `e1610b84`（v0.4 增补 direction + 多事件落地 + 跨块 quote）+ 张 `3d64f4aa`（evidence/0.9：covers + 扫描降级区域）+ 宗 `728d2334`（evaluation/D4：10/10 MATCH + D4-SCAN 扫描挑战）→ 快照 `_ref_*` ×4 入 docs
- [x] **异常状态汇总条**（D4 核心交付）：按状态 chip（待复核/无法读取/未提及/未披露/不适用/有值无出处 × 计数），点击循环定位字段行 + flash 高亮，异常行淡黄底
- [x] **direction 渲染**（v0.4 宗裁决）：release → 橙色"解除质押"徽章（枚举键在 normalized，raw_value 是中文）；字段表显示中文
- [x] **证据降级提示**（evidence/0.9）：scan_region/degraded 块 amber 描边 + missing_reason 中文 + quote 空显式声明"无文本层"；covers/continues/header_path 透传展示
- [x] 桥完整性 D4 增补：值仅由扫描降级块支撑 → warn；scan_region 缺 missing_reason → warn
- [x] 真实数据集：`wei_real_PLD001_3ev.json`（三事件+异常态）+ `wei_real_PLD005_release.json`（质押+解押）
- [x] 自测：桥（含合成 scan_region 双 warn + D3 回归）+ 前端语法 + server 9 数据集全 200
- [x] 扫描件 run：✔ 魏已推 `20260930T093845-pledge-scan`（真实模型、scanned_synthetic.pdf、14 字段全部诚实 unreadable、integrity 无误报）——已入页面 `wei_real_D4_scan.json`。**口径观察**：魏实现为"全字段 unreadable 无出处"，非张 schema 的 scan_region+degraded 降级块；页面两种路径都已支持（unreadable 徽章 / amber 降级提示），无需改动（待确认区 #12 关闭）
- [x] D5（10-01）**轮值主持**：议程已成文（08 文档 §1，13:00 发群）；统一演示样例 = D4-PLD-001 全链路（领导拍板，§2 演示脚本就绪）；17:30 联调主持
- [x] D5 整理之前文件内容：demo/使用演示.md 重写至 D5 现状（5→9 个演示）、README 索引补漏（07 文档曾漏登记）、10/10 数据集冒烟全绿（见 08 文档 §3）

## 1e. D5（10-01）TODO —— equity_change 页面补全（领导晨会指出的"部分完成"项）

- [x] **方向徽章扩展**：`DIRECTION_TEXT` 增 increase/decrease（增持/减持），equity_change 卡片标题区直接显示；配色遵循中式涨红跌绿（增持红 / 减持绿 / 解除质押橙），`results.js` + `bridge/upstream_bridge.js` 两处同步
- [x] **前后对比块**（equity_change 专属）：卡片头部与字段表之间并排展示"股数 前→后（Δ）"与"比例 前→后（Δ）"；原文口径字符串优先显示，降级态字段不进对比
- [x] **冲突提示**（只比对页面内自有字段，不猜测）：① 勾稽——变动后−变动前 ≠ 变动股数（0.5 股容差）；② 方向核对——increase/decrease 与前后值大小关系矛盾；③ 比例变动方向与股数方向相反 → 提示"可能存在总股本变动，建议人工复核"（不判错，增发/回购合法）
- [x] **mock 数据集升级**：`data/share_change.json` 从 D1 旧字段（share_change/change_reason，契约 v0.1）重写为魏 v0.3 信封格式 equity_change 三事件（is_mock:true）：D5-EQC-M01 增持（勾稽一致）、D5-EQC-M02 减持（勾稽一致）、D5-EQC-M03 故意构造变动股数冲突（演示冲突提示）；事件号带 M 前缀，明确区别于魏的真实 D5-EQC-001..010
- [x] 自测：桥 11/11 数据集全过；server 端到端（/api/result share_change 200 三事件 dir=increase、/api/export CSV 28 行含 EQC）
- [x] ~~仍待魏（阻塞项 1）~~ → **已解决（10-02）**：魏干净批次 `batch-20261002T120859` 已发布（D5-EQC-002/007 已修），十份真实信封已接入 `data/wei_real_eqc_001..010.json`，页面零改动消费（见 §1f）

## 1f. D6（10-02）TODO —— 真实股权变动页面闭环（领导晨会清单逐项收口，"拉取最新码"）

- [x] **拉最新码**：GitHub 网络劣化（~10KB/s，全量 fetch 卡死 11 分钟）→ 改 **blobless 浅拉**（--depth=1 --filter=blob:none，秒级）+ `git show` 按需取 blob；远端定位：魏批次 `runs/batch-20261002T120859`（十份 EQC 校验问题全 0=干净批次）、方 `tools/fang-equity/src_D5/equity_check_D5.ts` v0.5.0
- [x] **真实 D5-EQC-001..010 信封入页面**：`data/wei_real_eqc_001..010.json`（is_mock:false，001 含 5 事件 / 002 含 3 事件；004/008 增持、其余减持；比例分母声明 total_share_capital，仅 003 比例未提及）
- [x] **接入方冲突码**：方的核验报告以 **sidecar**（`data/<dataset>.check.json`）随数据集走——server.readDataset 自动挂 `check_report` → bridge 按事件 id/index 合并 `ev.checks[]`（code/severity/fields/message 原样，不翻译码值）→ 页面对比块下按严重级渲染（冲突/错误红、复核黄）；报告全文 `contract.check_report` 只增不改
- [x] **页面侧兜底检查改方码**：无报告数据集（mock）本地检查同码口径——CHANGE_SHARES_MISMATCH / DIRECTION_MISMATCH / RATIO_DIRECTION_CONFLICT / RATIO_BASIS_MISMATCH（有报告则方报告优先，本地退位防重复）
- [x] **分母口径提示**：比例行下显式显示"分母口径：公司总股本"；未声明→"⚠ 分母口径未声明（不默认总股本）"；两侧分母不同→"⚠ 分母口径不一致，比例不相减"；mock 比例字段已补分母声明
- [x] **方向徽章/前后并排**（昨夜 7cc470e4 已有，本轮回归验证通过）：增持红/减持绿；股数、比例 前→后（Δ）并排
- [x] **证据展开验证（脚本断言）**：十份真实信封全部字段"有值必有出处、证据引用必存在、quote 必非空"零失败；integrity 全 ok；桥 20/20 数据集通过
- [x] **server e2e**：21 数据集（.check.json 不进下拉）；`/api/result wei_real_eqc_003` → mode=real + check_report(tool=equity_check_D5) + ev.checks=MISSING_SHARE_PAIR,MISSING_RATIO_PAIR；eqc_006 → EQUAL_SHARES_NO_DIRECTION,RATIO_CHANGED_WITH_EQUAL_SHARES；CSV 导出 200
- [x] 方核验实测（npx tsx 跑 equity_check_D5）：001/002/007/008/009 verified；003 前后值不全；006 股数相等但比例变化；004/005/010 UNCONFIRMED_FIELD+MISSING_OR_INVALID_PERIOD；**clean 批次零 conflict 级 finding**
- [x] 方 D5 快照 → `_ref_*`：`_ref_fang_D5_README.md` / `_ref_fang_D5_equity_output.json` / `_ref_fang_D5_equity_check_src.ts`（核验模块源码 v0.5.0，此前只在临时目录，本轮正式入库）

## 1g. D6（10-02 晚）批量上传闭环 —— 领导截图差距项逐条收口（"快快快补全"）

截图差距项四件套 + D3 遗留上传回调，全部实现并 e2e 12/12 通过：

- [x] **批量上传**：`POST /api/upload`（零依赖 multipart 解析，多文件）——逐文件"JSON 校验 → 过桥干跑（toContract）→ 落数据集"；同名再传自动改名 `-2/-3` 不覆盖
- [x] **进度**：XHR upload.onprogress 字节级总进度条（`up-progress`）
- [x] **失败列表**：坏文件（坏 JSON / 非 JSON / 缺 events / 过桥失败）**每条都在批次报告里，绝不消失**（对应领导复盘优先修复项 1）——红色置顶块 + 明确失败原因
- [x] **日志下载**：`logs/upload_log.jsonl`（JSONL 逐文件一行，含 batch_id/size/error）+ `GET /api/upload/log` 附件下载；页面报告底部与上传区 hint 均有入口
- [x] **真实上传闭环（D3 遗留，原 D1 占位"只读文本长度打印日志"作废）**：上传成功 → 自动刷新下拉 → 首个成功数据集自动加载 → 栏二结果/栏三证据/股权对比同源生效
- [x] e2e（临时脚本，4 文件批次）：好信封 ok+事件数上报；坏 JSON/非 JSON/缺 events 三种失败原因各自明确；落数据集后 `/api/result` 可加载；下拉自动进新数据集；同名查重改名；日志 5 行含失败项 —— **12/12 PASS**；测试残留已清（data/good_envelope*、logs/）

## 1h. D7（10-03 晚）张智博回复接入 + AWD 真实批次 —— "继续完成任务"

**拉码定位**（blobless 浅拉）：张 `reviews/D7-给群里的回复.md`（解析侧交付 + 两件对齐事）、魏 34f938a6（**对我页面的独立验收：证据联动/冲突提示/导出一致性三项实证通过**，10-03 00:45）、宗 D7 eval 报告。

- [x] **张第二节点名事项（三条"不保证"页面化）**：栏三顶部新增可折叠**出处口径说明**块——✔ 保证×2（字符守恒 / text_raw 必为原文子串）＋ ⚠ 不保证×3（region 外接矩形可含邻块字符→取字用 text_raw；text_raw 无换行→跨行匹配须空白归一；quote 不唯一定位→以 block_id 为准）
- [x] **弱锚定标注**：无 block_id 的出处（文本模式输入）显式黄标"quote 在原文可能命中多处，不能唯一定位"——真实数据实证：PLD001_3ev 39/39 条弱锚定（文本模式），eqc_001 0 条（块模式），与张复核结论一致
- [x] **quote 歧义检测**：同数据集内同一 quote 被 ≥2 条出处引用 → 卡片黄标"同文出处 ×N，定位以 block_id 为准"——eqc_001 命中 4 组、PLD001 命中 9 组（张实测 翟军×6 / 50,350,000×4 同源问题）
- [x] **张能力边界表快照**：`_ref_zhang_D7_解析能力边界表.md` + `_ref_zhang_D7_解析能力边界.json`（机器可读版含 evidence_guarantees，页面文案来源）
- [x] **D6-AWD 真实批次接入**：统一开发集 batch-20261002T120859 的 `D6-AWD-001..010`（17 个 award_contract 事件）→ `data/wei_real_awd_001..010.json`；**14 字段注册表与真实数据 100% 对齐**——每事件恰好 14 字段全带出处，"有值无出处"断言零失败，integrity 全 ok；awd_002 多事件×4 实证
- [x] 回归：桥 31/31 数据集全过；server e2e（31 数据集、awd_002 四事件 14 字段、CSV/JSON 导出链路共用 readDataset 不受影响）
- [ ] **张第三节口径问题（D4-PLD 重跑 vs 单列弱锚定组）**：等宗博文裁决——页面侧已按方案 2 做好弱锚定标注，裁决后若选重跑，数据零改动直接换

## 1i. D8（10-04 晚）：跨文档配对视图——交接单点名两项 + 领导截图两条质疑，全部收口

**交付（page_prototype）**
- **`GET /api/pairs`**：宗 13 组封存清单 v0.2（`data/pairs/pairs_manifest.json`）× 魏 B 全量报告（`data/pairs/b_report.json`，20261004，PAIR-013=unknown）服务端合并；本地信封能对上的成员附代表原文锚点（provenance.quote + 页码），对不上的如实标"本地无此信封"。
- **配对视图**（`render/pairs.js` + 头部「跨文档配对 D8」按钮，与三栏视图互斥切换）：每组卡片双栏并排。
- **质疑①修复（双侧元数据上屏）**：A/B 两侧 `issuer_code` / `notice_number` 显式显示 + raw/gold sha256 前 12 位；编号 null 显式显示"—（首页无本文件编号）"+ 黄字"正文引用编号 2025-097（非本文件编号）"（宗 v0.2 更正口径）——EQC-003 清单本身 issuer_code=null（财务顾问核查意见首页无代码），如实显示"清单未登记"，不代填。
- **质疑②修复（PAIR-013 三态）**：`predicted_relation=unknown` 一律渲染黄徽章「证据不足 · 无法判定」+ 黄条解释（INSUFFICIENT_SIGNALS / 一侧 0 可用字段）+ 卡片描边高亮；代码层 `clsOf()` 保证 insufficient/unknown 同态，**绝不落入"不同事件"**。
- 每组附：预期（宗清单）→ 实判（魏 B）徽章 + 一致性勾叉、reasons 中文 chips、互证点/矛盾计数、A-run 链路（a_run_id@code_version，版本可追踪）。
- 顶部诚实边界横幅：同事件上界 C(3,2)+C(2,2)=4，据实交付 13 组不凑 6（宗 README 口径）。

**验证**：`/api/pairs` e2e 断言 3/3 PASS（13 组预期 vs 实判同态；013=unknown→证据不足；双侧元数据字段全送达）；原文锚点 20/26 成员命中（6 个缺：PLD-002/003/004/006/008 本地无信封 + pledge-scan-degrade 0 可用字段——如实标注）；datasets 回归 31 个不受影响；模块语法全过。

**快照**：宗交接单 + 评测 README → `docs/_ref_zong_D8_配对清单交接单.md` / `_ref_zong_D8_评测README.md`。

## 2. 待确认区（阻塞于交流数据 / 待拍板文件，等总体完成后统一请领导确认）



> 用法：凡是"需要队友给数据"或"需要领导拍板"导致做不下去的项，全部挂到这里，先推进其他不阻塞的工作；**总体完成后一次性请领导确认**，不零碎打扰。

| # | 事项 | 等谁 | 当前状态 | 确认后的动作 |
|---|---|---|---|---|
| 1 | **骨架落点已按领导指令定为"独立本地工程"**（2026-09-27 19:30 确认）；后续仅剩：目录调整与提交时机（等领导指令） | 领导 | ✔ 已定，待提交指令 | 目录整理后 git add + commit + push（等"提交"指令） |
| 2 | **事件 JSON 接口**：✔ v0.3 候选冻结（00a472c）→ v0.3b 增补（59c1d79：source_type/date_range/award 14 字段），页面 D3 已对齐 | 魏文宇/全员 | ✔ 已对齐（v0.3b） | 全队签署表更新 |
| 3 | **页面块/坐标系/证据结构**：✔ 张已交付 evidence/0.7（zhangzhibo@b108a85）：region 语义显式化 + cell_ref 唯一 + continues 续表标注；页面已消费 cell 出处 | 张智博 | ✔ 已对齐（v0.7） | D4：bbox 屏幕换算 + 原文回跳 + continues 拼接 |
| 4 | **统一演示样例文件**：✔ 领导已拍板（09-30 23:35）——定为 **D4-PLD-001 全链路**：张 `sample/D4/raw/D4-PLD-001.pdf`（原文）→ 张 parse → 魏 `batch-20260930T095256` run（10/10 成功）→ 宗 `evaluation/D4/dev/gold/D4-PLD-001.envelope.json`（标准答案）；页面侧对应 `wei_real_PLD001_3ev.json`（已消费验证） | 领导 | ✔ 已定 | D5 议程写明，17:30 联调全员用此链路，无需新造数据 |
| 5 | **工作区文档 + 原型入库** | 领导 | ✔ 已定已提交（方案 A，2026-09-27，commit 413095e 已推送） | —— |
| 9 | **分支双轨制**（领导 20:17 定）：`cjh-workspace` = 当日工作分支；`feature/chen-ui` = 备份分支。22:00 定时备份同步运行正常（09-27 夜已验证，两分支均 ef2bff1） | 领导 | ✔ 运转中 | 每晚 22:00 自动同步 |
| 6 | MP4 录制工具与分辨率/码率约定（≤500MB 约束） | 领导/全员 | ⏸ 挂起（D13 前定即可） | —— |
| 7 | 干净环境（D13）用哪台机器/虚拟机 | 领导 | ⏸ 挂起（D12 前定即可） | —— |
| 8 | **方轩诚 D1 口径产物**：已由其本人提交到 `feature/fang-rules@c856882`（docs/D1_方轩诚_口径字典_v0.1.md + 换算用例）；根目录 zip 保持 untracked 不入库；快照已拉到 `docs/_ref_fang_*.md`，口径已对齐进契约 v0.2 | 方轩诚 | ✔ 已对齐 | 转接口已按其口径实现（04 文档 §2） |
| 10 | **多事件（同一公告 3 笔质押只出 1 事件）**：✔ 魏已修（d78e9ced"多事件抽取当日落地，PLD-001 三事件 33/33"）；页面已消费真实三事件 run `wei_real_PLD001_3ev.json`，3 卡片/异常态/CSV 全部正确 | 魏文宇 | ✔ 已修已验证 | 关闭 |
| 11 | **表格列头单位继承（万股→股换算错）**：上游已动作——方推修复分支 `fix/d3-unit-a11b110`（万股单位传播）+ fang-rules D4 口径模块交付包；魏回归套件含 `wan-gu-unit.json` 用例 | 魏文宇/方轩诚 | ✔ 上游已修（待真 run 终证） | 下次质押批次过桥时抽查 364.00万股 类单元格换算展示 |

## 3. 14 天任务勾选（我的交付物）

- [x] D1 页面骨架＋模拟接口（独立原型，落点见待确认区 #1）
- [x] D2 口径对齐（方分支拉取）＋ 转接口 `bridge/upstream_bridge.js` ＋ 契约 v0.2
- [x] D3 质押真实闭环（魏真实 PDF run 入页面）＋ JSON/CSV 导出 ＋ 断链错位修复 ⭐
- [x] D4 证据查看与异常状态页面（异常汇总条定位高亮 + direction 徽章 + 扫描降级提示，消费张 v0.9 / 宗 evaluation/D4）⭐
- [x] D5 轮值议程 + 统一样例（D4-PLD-001 全链路）演示脚本 + 文件整理（demo 更新/README 补漏/10 数据集冒烟）

## 3a. 需领导拍板（需要沟通内容 · D4 收口 2026-09-30）

| # | 事项 | 现状与建议 | 不拍板的后果 |
|---|---|---|---|
| 1 | **release 徽章样式**：解押事件卡片橙色"解除质押"徽章（当前 `--warn` 系配色） | 仅视觉问题，页面可跑；若领导觉得颜色/文案不合适，改 `style.css` 一处即可 | 无阻塞，默认保留 |
| 2 | **跨页续表 `continues` 处理策略**：页面当前忠实展示不拼接（单一事实源原则），张 v0.9 已出续表标记 | 建议维持不拼接；若评审要求"同一表格视觉合并"，需另排 0.5 天改 evidences 渲染 | 评审观感，非数据正确性 |
| 3 | **D5（明天 10-01）我轮值主持**：股权变动对比页 + 合流议程；魏 0434 批次已有 equity_change 真实 run 可直接消费 | 已按总规划执行，无需额外授权；仅提醒明天议程 13:00 前发出 | —— |
| 4 | ~~魏的扫描件 run 未推~~ **✔ 已解决（09-30 晚）**：魏已推扫描 run（全字段 unreadable 诚实降级），已入页面验证；遗留口径差异（魏 unreadable 路径 vs 张 scan_region 路径）页面两端兼容，转 D5 合流时口头同步即可 | —— | ✔ 已收口 | —— |

## 4. 阻塞与支援记录

| 日期 | 阻塞事项 | 需要谁 | 状态 |
|---|---|---|---|
| （示例）09-27 | 事件 JSON 接口字段未定 | 魏文宇 | 待合流 |

## 5. 交接物收货清单（每天 13:00 核对）

- [ ] 魏：接口/结果 JSON（D1 起）
- [ ] 张：页面块 + 坐标系 + 证据 ID（D2 起）
- [ ] 方：标准化值 + 判定文案（D2 起）
- [ ] 宗：样例 + 误报案例 + 成绩数字（D1 起）
- [ ] 统一：每天同一份演示样例（17:30 用）

## 6. 碎记（随时写，每周清理进正式文档）

- pnpm install 必须在有符号链接权限的终端跑（沙箱内会被拦）
- git 写操作同样沙箱受限——分支/提交类操作用自己的终端
- 演示视频硬约束：≤5 分钟、≤500MB、与源码同版
- 轮值我排到 D5（10-01）和 D10（10-06），提前一天准备合流议程
