# 陈家浩 · D1 任务规划（2026-09-27）

> D1 共同目标：冻结数据接口，跑通最小示例。
> 我的交付物：上传/结果/证据 三栏页面骨架 ＋ 模拟接口（显式标"模拟"）。
> 提交纪律：**一切 commit/push 等领导明确说"提交"才执行**（已写入 01_规则.md）。

---

## 1. 待办事项总览

### A. 无需队友输入 · 本轮已完成 ✅

| # | 事项 | 产出 | 状态 |
|---|---|---|---|
| A1 | 三栏页面骨架（上传/结果/证据） | `workspace/cjh/page_prototype/`（public/index.html 三栏） | ✅ 已完成 |
| A2 | 状态字段约定（成功/失败/无法读取/待复核/模拟） | 页面状态徽章 + 接口 schema `status` 字段 | ✅ 已完成 |
| A3 | 模拟接口（显式标"模拟"） | `page_prototype/data/*.json`（pledge / share_change，契约提案见 docs/API.md） | ✅ 已完成 |
| A4 | 最小子单元跑通 | 浏览器打开原型：加载模拟数据 → 三栏渲染 → 证据点击高亮 | ✅ 已验证 |
| A5 | 向魏/张反馈页面所需字段清单 | 见本文 §4 | ✅ 已成文（待 13:00 合流发出） |

### B. 依赖队友输入 · 已挂"待确认区"⏸

| # | 事项 | 等谁 | 去向 |
|---|---|---|---|
| B1 | 事件 JSON 接口 v0.1 真实字段（我的只是提案） | 魏文宇 | 临时文档·待确认区 |
| B2 | 页面块/坐标系/证据 ID 的真实结构 | 张智博 | 临时文档·待确认区 |
| B3 | 统一演示样例文件（17:30 联调用同一份） | 全员合流 | 临时文档·待确认区 |

### C. 需领导拍板 · 已挂"待确认区"⏸

| # | 事项 | 选项 |
|---|---|---|
| C1 | 页面技术栈与落点：仓库无现成 web 工程（apps/ 只有 cli，website/ 是文档站） | ① 原型验证后新建 `apps/web-demo` 包入仓；② 独立仓库/目录长期放；③ 其他 |
| C2 | 本三份工作区 md 是否入库 | 入 cjh-workspace / 只留本地 |
| C3 | 骨架评审通过后再补真实数据接入（D2 范围） | —— |

## 2. 最小子单元定义（D1 完成线）

1. 浏览器直接打开 `index.html`（无服务器、无依赖）；
2. 点「加载模拟数据」→ 结果栏渲染事件卡片、证据栏渲染证据列表；
3. 每条数据带状态徽章，页面顶部常驻「模拟数据」横幅；
4. 点证据条目 → 高亮对应字段（出处联动雏形）；
5. 上传栏可读入本地 `.txt`（真实解析属 D2，D1 只做入口与状态占位）。

**以上 5 条全部验证通过。**

## 3. 模拟接口 v0.1 提案（给魏的核心问题都埋在字段里）

```jsonc
{
  "run_id": "mock-run-0001",            // 运行唯一标识（D10 报告导出要用）
  "schema_version": "0.1",              // 接口版本，冻结后不破结构
  "data_mode": "simulated",             // simulated | real —— 页面据此显式标"模拟"
  "source_file": {                       // 上传文件描述
    "file_id": "mock-file-001",
    "filename": "质押公告样例.txt",
    "parse_status": "success"            // success | failed | unreadable | pending_review
  },
  "events": [                            // 抽取结果（A 工作流：单文档多事件）
    {
      "event_id": "evt-0001",
      "event_type": "pledge",            // 事件类型：pledge(质押) | share_change(股权变动) | ...待魏定枚举
      "status": "success",               // success | failed | unreadable | pending_review
      "fields": {                        // 字段名 → { value, unit, normalized, evidence_id }
        "pledgor":   { "value": "模拟股东甲", "evidence_id": "ev-0001" },
        "share_count": { "value": 12000000, "unit": "股", "normalized": 12000000, "evidence_id": "ev-0001" },
        "pledge_ratio": { "value": "8.5%", "normalized": 0.085, "evidence_id": "ev-0002" },
        "pledgee":   { "value": "模拟质权机构", "evidence_id": "ev-0002" },
        "announce_date": { "value": "2026-09-20", "normalized": "2026-09-20", "evidence_id": "ev-0001" }
      }
    }
  ],
  "evidences": [                         // 证据（出处展示的核心，张的部分）
    {
      "evidence_id": "ev-0001",
      "block_id": "blk-0007",            // 张的页面块 ID
      "page": 3,                         // 页码
      "bbox": null,                      // 区域坐标（待张给结构，D1 可空）
      "quote": "……（原文摘录，模拟）……"
    }
  ]
}
```

**关键设计**：每个字段值都挂 `evidence_id`（出处锚点）；`normalized` 与 `value` 分离（方的标准化口径有落点）；`data_mode` 全局声明模拟/真实。

## 4. 给魏/张的字段反馈清单（13:00 合流发出）

**问魏**：
1. 事件 JSON 的真实字段名与事件类型枚举（我按 pledge 质押先提案，见表格 D3 目标）；
2. 批量任务状态与失败隔离信号从哪个字段来（D6 页面要用）；
3. 缓存/版本信息（D10 报告导出要用）是否在结果 JSON 里。

**问张**：
1. `block_id`、页码、区域坐标的真实结构与坐标系原点约定；
2. 证据能否回跳原文视图（D4 证据查看页、D8 双栏原文页都依赖）；
3. 文件唯一标识怎么给（上传栏要与解析结果对齐）。

**给两人的**：页面端能消费的证据锚点最低要求 = `evidence_id + block_id + page + quote`，坐标缺失可先降级为页码级跳转。
