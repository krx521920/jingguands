# 调用文档 · 数据契约与接口（v0.1）

> 面向对象：魏文宇（结果 JSON 生产方）、张智博（证据/坐标生产方）、后续接入页面的任何人。
> 页面只认本文契约，不关心数据来自 mock 还是真实服务——切换数据源前端零改动。

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
| `GET /api/result?dataset=pledge` | 数据契约 v0.1 对象（见 §3） | 结果+证据一次性拉取 |

`remote` 模式下 `/api/result` 会转发到 `REMOTE_API_URL?dataset=<name>`，上游直接返回契约对象即可。

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
- `value` 与 `normalized` 分离（原文值 vs 标准化值）；
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
| 接真实接口 | 启动 server 时设 `DATA_SOURCE=remote` + `REMOTE_API_URL`，前端零改动 |
| 新字段中文显示 | `public/js/render/results.js` 的 `FIELD_TEXT` 加一行；未登记的字段自动显示原始字段名 |
| 新事件类型 | 无需改页面——按契约给 `event_type` + `fields` 即自动渲染 |
| 新的栏/视图 | `public/js/render/` 下新建渲染器，在 `app.js` 装配（注册式，不侵入现有三栏） |
| 状态新枚举 | `public/js/status.js` 的 `STATUS` 加一行（单一事实源） |

## 6. 给魏/张的最小对接要求

- **魏**：结果 JSON 按本文 §3 组织即可被页面直接消费；至少提供 `run_id / data_mode / events[].fields[].evidence_id / evidences[]`。
- **张**：证据最低要求 `evidence_id + block_id + page + quote`；坐标（bbox）结构定稿后补，页面已预留降级路径。
