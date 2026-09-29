# 陈家浩 · 临时工作台（每日更新，随手记）

> 用法：每天开工先勾 TODO；阻塞随手记；交接物拿到就打勾。本文件不需要优雅，需要及时。
> 最近更新：2026-09-29（D3 当天）

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
- [ ] 给魏确认：CSV 状态列字段级口径（`status_raw` 保留 6 态）是否符合其统计需要
- [ ] 张的 `continues` 跨页续表拼接 → D4 做（页面先忠实展示不拼接）
- [ ] award_contract 14 字段中文注册表 → D6 前补

## 2. 待确认区（阻塞于交流数据 / 待拍板文件，等总体完成后统一请领导确认）

> 用法：凡是"需要队友给数据"或"需要领导拍板"导致做不下去的项，全部挂到这里，先推进其他不阻塞的工作；**总体完成后一次性请领导确认**，不零碎打扰。

| # | 事项 | 等谁 | 当前状态 | 确认后的动作 |
|---|---|---|---|---|
| 1 | **骨架落点已按领导指令定为"独立本地工程"**（2026-09-27 19:30 确认）；后续仅剩：目录调整与提交时机（等领导指令） | 领导 | ✔ 已定，待提交指令 | 目录整理后 git add + commit + push（等"提交"指令） |
| 2 | **事件 JSON 接口**：✔ v0.3 候选冻结（00a472c）→ v0.3b 增补（59c1d79：source_type/date_range/award 14 字段），页面 D3 已对齐 | 魏文宇/全员 | ✔ 已对齐（v0.3b） | 全队签署表更新 |
| 3 | **页面块/坐标系/证据结构**：✔ 张已交付 evidence/0.7（zhangzhibo@b108a85）：region 语义显式化 + cell_ref 唯一 + continues 续表标注；页面已消费 cell 出处 | 张智博 | ✔ 已对齐（v0.7） | D4：bbox 屏幕换算 + 原文回跳 + continues 拼接 |
| 4 | **统一演示样例文件**：17:30 联调要用同一份，还没定用哪份 | 全员合流 | ⏸ 待确认 | 用真样例替换模拟数据跑一遍 |
| 5 | **工作区文档 + 原型入库** | 领导 | ✔ 已定已提交（方案 A，2026-09-27，commit 413095e 已推送） | —— |
| 9 | **分支双轨制**（领导 20:17 定）：`cjh-workspace` = 当日工作分支；`feature/chen-ui` = 备份分支。22:00 定时备份同步运行正常（09-27 夜已验证，两分支均 ef2bff1） | 领导 | ✔ 运转中 | 每晚 22:00 自动同步 |
| 6 | MP4 录制工具与分辨率/码率约定（≤500MB 约束） | 领导/全员 | ⏸ 挂起（D13 前定即可） | —— |
| 7 | 干净环境（D13）用哪台机器/虚拟机 | 领导 | ⏸ 挂起（D12 前定即可） | —— |
| 8 | **方轩诚 D1 口径产物**：已由其本人提交到 `feature/fang-rules@c856882`（docs/D1_方轩诚_口径字典_v0.1.md + 换算用例）；根目录 zip 保持 untracked 不入库；快照已拉到 `docs/_ref_fang_*.md`，口径已对齐进契约 v0.2 | 方轩诚 | ✔ 已对齐 | 转接口已按其口径实现（04 文档 §2） |
| 10 | **多事件（同一公告 3 笔质押只出 1 事件）**：问题在魏的模型输出与编排提示（runner 已证明可处理 3 事件）；页面已实证零改动就绪——合成 3 事件数据集 `wei_multi_event_test.json` 页面/CSV 全部正确渲染 | 魏文宇 | ⏸ 等魏修模型/编排 | 修好后真 run 丢 data/ 即页面验证 |
| 11 | **表格列头单位继承（万股→股换算错）**："364.00万股→364 股"为上游标准化错误（魏/方）；页面忠实透传并列展示（原文/标准化），错值肉眼可见，不做二次复算（单一事实源）。小数万股 27,495.8065 万股=274,958,065 股为整数，×10⁴ 校验应通过 | 魏文宇/方轩诚 | ⏸ 等上游修复 | 修复后用 `wei_multi_event_test.json` E03 对照页面对错值敏感度 |

## 3. 14 天任务勾选（我的交付物）

- [x] D1 页面骨架＋模拟接口（独立原型，落点见待确认区 #1）
- [x] D2 口径对齐（方分支拉取）＋ 转接口 `bridge/upstream_bridge.js` ＋ 契约 v0.2
- [x] D3 质押真实闭环（魏真实 PDF run 入页面）＋ JSON/CSV 导出 ＋ 断链错位修复 ⭐

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
