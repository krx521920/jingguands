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
├── server.js               # 零依赖本地服务器：静态资源 + /api 数据接口（mock/remote 双模式，读数自动过转接口）
├── bridge/
│   └── upstream_bridge.js  # 转接口（D2）：上游格式（方的标准化记录）→ 契约 v0.2；未知格式透传留痕
├── package.json            # scripts: start / demo（仅声明，无需 install）
├── README.md               # 本文件（目录结构维护处，结构变更必须同步更新）
├── docs/
│   └── API.md              # 调用文档：数据契约 v0.3、接口清单、状态枚举、转接口、扩展指南
├── data/                   # 数据集（mock 模式：server 自动列举，放进来即出现在下拉）
│   ├── pledge.json         # 质押事件样例（D3 主线）
│   ├── share_change.json   # 股权变动样例（D5 预留）
│   ├── upstream_case.json  # 方口径上游格式合成用例（经转接口转换展示，D2 验证）
│   └── wei_run_pledge.json # 魏文宇 v0.3 信封真实运行输出（原样入 data/，server 自动过转接口）
├── public/                 # 前端（原生 ES Modules，无构建步骤）
│   ├── index.html          # 三栏页面骨架：上传 / 结果 / 证据
│   ├── css/
│   │   └── style.css       # 样式（含模拟/真实/状态徽章配色）
│   └── js/
│       ├── app.js          # 装配入口：模式横幅 → 数据集选择 → 三栏渲染
│       ├── adapter.js      # 数据源适配层（前端不感知 mock/remote）
│       ├── status.js       # 状态枚举单一事实源（成功/失败/无法读取/待复核/模拟）
│       └── render/         # 渲染器（注册式，可扩展新栏/新视图）
│           ├── upload.js     # 栏一：上传（D1 仅入口；真实解析属 D2）
│           ├── results.js    # 栏二：事件卡片 + 字段表 + 证据锚点（v0.3 事件类型/字段注册表 + 口径标注）
│           └── evidences.js  # 栏三：证据列表 + 高亮联动（含表格证据 table_id/cell_ref）
└── demo/
    └── 使用演示.md          # 完整使用 demo：启动/上传/扩展新数据集/切真实接口/接口自检
```

## 架构（三条缝，扩展不动骨架）

```
数据集(data/*.json)                          魏/张/方的真实产物
      │ mock 模式                                  │ remote 模式
      ▼                                            ▼
┌─────────────────────── server.js /api ───────────────────────┐
│  /api/datasets（列举）   /api/result?dataset=x（读数自动过转接口）│
│           bridge/upstream_bridge.js：上游格式 → 契约 v0.2       │
└──────────────────────────────┬───────────────────────────────┘
                               ▼
                    adapter.js（前端唯一数据出口）
                               ▼
        app.js 装配 ──► render/upload.js │ render/results.js │ render/evidences.js
                               ▼
                    status.js（状态枚举单一事实源）
```

- **数据缝**：换数据源只动 server 环境变量，前端零改动；
- **格式缝**：上游格式（方的标准化记录）直接进 `data/` 或 remote 返回，转接口自动转换，契约对象零损耗透传；
- **渲染缝**：新栏/新视图 = 新渲染器 + app.js 一行装配；
- **状态缝**：状态枚举只改 `status.js` 一处。

## 数据源切换

| 模式 | 启动方式 | 数据来自 |
|---|---|---|
| 模拟（默认） | `node server.js` | `data/*.json`，页面常驻"模拟"横幅 |
| 真实 | `DATA_SOURCE=remote REMOTE_API_URL=<上游地址> node server.js` | 反向代理上游接口，返回同一契约 |

## 约定与红线（继承 01_规则.md）

- 模拟数据显式标"模拟"，不得计入真实成绩；
- 每个字段值必须挂 `evidence_id`，无证据写 `null`，不编造；
- 契约字段只增不改，破坏性变更必须升 `schema_version`；
- 本目录结构变更必须同步更新本 README；
- **不主动 commit/push——等领导明确说"提交"**。
