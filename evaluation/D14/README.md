> **编号说明**：本目录是评测侧**交付批次号** `D14`（展示层本地服务实测（2026-10-10）），**不是团队排期第 14 天**；团队排期 D14 ＝ 2026-10-10（最后一天），当天我方连出 D14–D18 五个批次。命名约定见 `evaluation/README.md`。

# D14 · 展示层本地服务实测（2026-10-10）

评测侧（宗）｜被测对象：陈家浩展示层 `feature/chen-ui` @ `e7bec616`

## 一、这次测什么

不是"看代码像不像"，而是**把服务在本机跑起来、打真接口**，回答四个问题：

| # | 问题 | 结论 |
|---|---|---|
| Q1 | 服务能不能起、接口全不全 | 能；17 个探针全 200（`本地服务测试报告.md` §二） |
| Q2 | 指标单一真源裁决 R1–R4 是否真落地 | 落地，逐条实测（§三） |
| Q3 | **别人 clone 下来能不能看到权威数字** | **不能**（P0：`data_unified/` 未入库 → 0 份入口径、指标卡 null） |
| Q4 | 页面里从别处拷来的文件是不是当前版 | 1 处过期（P1：D10 集成包为旧构建，008 关系判定与权威版不同） |

## 二、可复核锚点

| 项 | 值 |
|---|---|
| 被测提交 | `e7bec616`（`feature/chen-ui` = `cjh-workspace`） |
| 被测文件 | `workspace/cjh/page_prototype/` 137 个 blob，本地副本逐个 sha256 **137/137 一致** |
| 契约快照 | `workspace/cjh/spec/v0.3/` |
| 权威数据 | `evaluation/D11/firsttest-envelopes/` 32 份（31 + `DEMO-EQC-HL-0930.json`） |
| 运行 | Node v24.20.0，`node server.js` → 端口 **8642** |

## 三、复现命令

```bash
cd workspace/cjh/page_prototype
mkdir -p data_unified && cp ../../../evaluation/D11/firsttest-envelopes/*.json data_unified/
node server.js                 # → http://127.0.0.1:8642
```

页面副本时效门（评测侧新门）：

```bash
node evaluation/D14/check-page-copies.mjs --page <page_prototype 目录>
```

## 四、本目录文件

| 文件 | 作用 |
|---|---|
| `本地服务测试报告.md` | 主报告：接口实测、R1–R4 逐条、P0/P1/P2、边界、待办 |
| `api-probe-20261010.json` | 17 探针原始留痕（状态码/耗时/返回摘要） |
| `metrics-无data_unified-20261010.json` | clone 现状的 `/api/metrics` 快照（0 份入口径） |
| `metrics-有data_unified-20261010.json` | 补齐权威数据后的 `/api/metrics` 快照（31 份 / 606 字段 / 锚点匹配） |
| `check-page-copies.mjs` | **消费副本时效门**：页面里的文件是否等于上游原件 |
| `page-copies-manifest.json` | 时效门清单：每条登记唯一正确哈希 + 上游出处 |
| `page-copies-result-*.json` | 三组实测结果（带数据 / 无数据 / 修复后正向对照） |
| `给陈-展示层本地实测结论-20261010.md` | 可直接转发的结论与待办 |
| `给魏-D10集成包版本与008判定-20261010.md` | 008 判定问询 + 副本清理提醒 |
| `checker-自检记录.md` | 时效门的负向 + 正向对照记录 |

## 五、时效门怎么用

```
node evaluation/D14/check-page-copies.mjs --page <页面目录>
```

- 清单登记的是**上游原件**（`page-copies-manifest.json`，每条都写出处）。
- 退出码 1 表示有 gate 项对不上 → **不要改清单去迁就现状**（改清单＝把错的事实写成对的）。
- 本次实测：现状 **FAIL**（集成包过期；`data_unified/` 缺失时再 FAIL 一项）；把集成包换成魏 D11 版后 **PASS**（正向对照）。
## 六、后续变更（2026-10-10 晚，D16）

用例正典 `evaluation/D10/cases/integration-cases.json` 已按魏的裁定拆分（`expected_relation`＋`attribution_demo`，新哈希 `40d9e267…`）——见 `evaluation/D16/README.md`。本目录的 `page-copies-result-*.json` 是**变更前**的快照，用于证明门会响；页面副本需按 D16 给陈那份刷新。