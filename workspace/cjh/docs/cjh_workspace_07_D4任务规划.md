# D4 任务规划 · 证据查看与异常状态页面（复杂表格与缺失字段）

> 日期：2026-09-30 ｜ 负责：陈家浩 ｜ 上游：魏文宇（direction 契约/多事件 run）、张智博（evidence/0.9）、宗博文（D4 评测 10/10 MATCH）
> 总规划定位：D4 交付"证据查看与异常状态页面（高亮/降级提示）"，与魏/张同步异常提示。

## 1. 新规范拉取（快照见 `docs/_ref_*`，只读勿改）

| 来源 | 提交 | D4 相关增量 |
|---|---|---|
| 魏 | `weiwenyu@e1610b84` | **v0.4 增补**：pledge 注册表新增 `direction`（text：pledge/release，宗 17:30 裁决）——解除质押不再丢弃，同组合先押后解为两个事件；多事件抽取落地（PLD-001 三事件）；跨块 quote 贪心分段；万股感知 |
| 张 | `zhangzhibo@3d64f4aa` | **evidence/0.9**：`table_ref.covers`（合并单元格覆盖位置，只写位置不复制文本）；v0.8 扫描件降级区域（`scan_region` + `degraded:true` + `missing_reason:NOT_PARSED/ILLEGIBLE/DEGRADED`，text_raw 为空、不可作 quote 来源）；合并单元格值继承（covers）+ 纯文本按行渲染 |
| 宗 | `zongbowen@728d2334` | **evaluation/D4**：10 份质押文档 15 事件 210 字段；真实对照 10/10 MATCH、字段/事件差异 0；扫描降级挑战显式走 `SCANNED + scan_region + degraded + NOT_PARSED`；D4 gold 含 direction 标注 |
| 方 | `fang-rules@5d1d86be` | D3 口径与比例核验模块（页面无直接动作） |
| fix 分支 | `fix/d3-unit-a11b110@32f2cdc0` | 表格股数单位传播修复（已被魏侧收编方向一致） |

## 2. 页面改动（全部在 `page_prototype/`）

### 2.1 异常状态汇总条（D4 核心交付）
- `render/results.js`：`collectAbnormal()` 扫描全量字段，产出异常清单；`renderAnomalyBar()` 渲染 chip：**待复核 n / 无法读取 n / 未提及 n / 未披露 n / 不适用 n / 有值无出处 n**（空态不显示）。
- chip 悬停显示全部命中字段（`eventId.field`）；点击**循环定位**到对应字段行（行号锚点 `row-<event_id>-<field>`）+ flash 动画。
- 判定规则：`status_override` 非空即异常；有值但无 `evidence_id` 记"有值无出处"。

### 2.2 降级提示
- 字段行：异常行淡黄底 + 关键列黄边（`row-abnormal`）；flash 高亮动画。
- 证据卡：扫描降级块（`scan_region`/`degraded`）amber 左边条 + 降级原因中文（无文本层/字迹不可辨/质量降级）；`missing_reason` 缺失时显式声明"降级原因未声明"；quote 为空显示"（该区域无文本层，无原文可引）"。
- 证据卡新增三行注释：`header_path`（多层表头完整列名）、`continues`（跨页续表碎片：直接读取会截断）、`covers`（合并单元格覆盖的 cell_ref 列表）。

### 2.3 direction 渲染（v0.4）
- 事件卡片标题区加方向徽章：`release` → 橙色"解除质押"（默认 pledge 绿色"质押"，仅 pledge 事件显示）。
- 字段表 direction 行显示中文（**枚举键在 `normalized`，raw_value 是中文原文**——如 raw"解除质押"/normalized"release"，显示优先 normalized 反查）。

### 2.4 转接口（bridge）
- provenance 透传新增：`header_path / degraded / missing_reason / continues / covers`（v0.7→v0.9 全部细节不丢失）。
- `checkIntegrity()` D4 增补两条 warn（不算断链）：
  - 有值字段的所有出处都是扫描降级块 → "值仅由扫描降级块支撑（无文本层原文可核验）"；
  - `scan_region` 且 `degraded` 但缺 `missing_reason` → "降级原因未声明"。
- 新增导出：`DIRECTION_TEXT`、`MISSING_REASON_TEXT`。

### 2.5 真实数据集（is_mock:false 已核）
| 文件 | 内容 | 覆盖场景 |
|---|---|---|
| `data/wei_real_PLD001_3ev.json` | PLD-001 三事件 run（魏 152309 批次） | 多事件 + 未提及×3 + 待复核×3 → 异常汇总条 |
| `data/wei_real_PLD005_release.json` | PLD-005 双事件（E01 质押 + E02 解除质押） | direction=release 渲染 |

## 3. 自测记录（2026-09-30）

- 桥：PLD001 状态分布 {success:36, not_mentioned:3, pending_review:3} ✓；release 检出 E02 ✓；合成 scan_region 证据 → integrity warn 命中"值仅由扫描降级块支撑" ✓；缺 missing_reason → warn ✓；D3 cell run（0197）回归 integrity ok ✓。
- 前端：results.js / evidences.js `node --check` ✓。
- server：9 数据集全列出；PLD001 3 事件 6 异常字段；PLD005 release=E02；CSV 导出 5 数据集全 200。

## 4. 待办与协作事项

| # | 事项 | 谁 | 状态 |
|---|---|---|---|
| 1 | direction=release 的**颜色/文案**是否合领导意（现：橙色"解除质押"徽章，默认 pledge 不加噪音） | 领导 | 待确认 |
| 2 | 扫描件 run（宗 D4-SCAN-001 挑战）：魏侧尚未推扫描 run，推后页面直接消费（scan_region 提示已就绪） | 魏文宇 | ⏸ 等上游 |
| 3 | equity_change/award_contract 真实 run（魏 0434 批次已有）→ D5 股权变动对比页消费 | 我（D5） | 明日 |
| 4 | D5（10-01）**轮值主持**：今晚备合流议程 | 我 | 今天 |
| 5 | bbox→屏幕坐标换算的原文回跳：等张的页面 width/height 消费链路（v0.9 已有 pages 尺寸） | 我+张 | 挂起 |

## 5. 30 秒上手

```bash
cd workspace/cjh/page_prototype
node server.js            # http://127.0.0.1:8642
# 数据集选 wei_real_PLD001_3ev → 看异常状态汇总条（3 未提及 + 3 待复核），点 chip 定位字段行
# 数据集选 wei_real_PLD005_release → 看 E02"解除质押"橙色徽章
```
