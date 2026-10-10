# DELIVERY-README · 最终交付包入口（v2.0-delivery 候选）

> 本包 = **运行侧封版树**（魏 `weiwenyu@dc4080ac`）＋ **评测侧正典**（宗 `zongbowen` 的 `evaluation/`）＋ **运行侧证据并入件**（`evaluation/run-side/weiwenyu/`）。
> 合包方式：以**评测正典为主**（裁决 A，2026-10-10 魏裁定）；运行侧 217 份证据**字节不动**、按原路径并入 `evaluation/run-side/weiwenyu/`，出处已标注。
> 魏侧脚本（`run_extract` / `serve_extract` / `check_provenance_e1`）经 `scripts/jingguan/lib/side_paths.mjs` 自动解析镜像：指向我方 `evaluation/D*` 旧路径的命令在本包上原样可跑（详见 `docs/d13-reproduction.md` 头部路径对照）。

---

## 一、包结构（先看这张表）

| 目录 | 内容 | 归属 |
|---|---|---|
| `interface/` | **契约**：`event-envelope.schema.json`（v0.3）＋接口 README ＋注册表 | 魏 |
| `scripts/jingguan/` | 抽取／核验／归因／门禁（零 npm 依赖，Node 标准库） | 魏 |
| `corpus/` | 语料与解析产物（`zhangzhibo/d4|d5|d6/parse-official` 等） | 张（魏侧 vendor） |
| `tools/` | 方侧规则库 vendor（D7 归一／配对／归因／报告） | 方 |
| `runs/` | 运行批次与缓存快照（含 `_archive`） | 魏 |
| `docs/` | 架构／运行／复现说明（含 `d9-attribution` / `d10-cache-integration` / `d11-firsttest-*` / `d12-perf-and-stability` / `d13-reproduction`） | 全员 |
| `evaluation/` | **评测侧正典**：封存集、评分器、用例、冻结信封、裁定书、五道门 | 宗 |
| `evaluation/run-side/weiwenyu/` | 运行侧证据（call-logs、D10 集成包、D12-A/B/C、D6 块级快照）**原路径并入、字节不动** | 魏 |
| `materials/` | 交付材料：**计划书 PDF**（`项目计划书-可信公告事件提取与跨文档核验智能体.pdf`，5 页，2026-10-10 入仓，未达标清单第 17 条销项）；MP4 待补 | 团队 |

## 二、评测入口

1. **总索引**：`evaluation/README.md`（编号说明、目录索引、给队友的可转发正文清单、推送前必跑门）；
2. **方法**：`evaluation/2026-10-10-final-delivery/评测附件-20261010.md`（主成绩表每条都带**分母＋出处**）；
3. **诚实边界**：`evaluation/2026-10-10-final-delivery/未达标与未解决项-20261010.md`（20 条，含责任人与话术）。

## 三、一键复算（五道门，任何人可跑）

```bash
node evaluation/integration/check-lock.mjs      # 锁：53 文件，期望 PASS（stale 0 / missing 0）
node evaluation/integration/check-docs.mjs      # 文档引用与枚举一致性，期望 PASS
node evaluation/D10/check-relation.mjs --bundle evaluation/D10/results/weiwenyu-bundle.json   # 关系层，期望 PASS 10/10
node evaluation/D17/check-standardized.mjs --dir evaluation/D11/firsttest-envelopes --exclude DEMO-EQC-HL-0930
node evaluation/D18/check-snapshot-coverage.mjs --exclude DEMO-EQC-HL-0930                    # 快照覆盖，期望 31/31、451/451
```

**首测五段**（30 单文档 / 封存 20 / D8 13 / D9 20 / D10 10）与 **D12 零成本重放 31/31** 的命令，见 `evaluation/D11/README-firsttest-inputs.md` 与 `evaluation/D12/D12回归一致性性能报告.md`。

## 四、版本对应表

| 角色 | 版本 |
|---|---|
| 运行侧封版树（本包基底） | `weiwenyu@dc4080ac`（门禁 17 道全绿；含 run_batch 收容根治与 §4.2 口径更新，为合包时 `weiwenyu` 分支头） |
| 运行侧交付标签 | `v2.0-delivery`（由魏在合包提交上打；`v1.0-d14-release` / `v1.1-final` 保留为历史里程碑，不重指） |
| 评测侧正典 | `zongbowen@77771bc4`（合包时的 `evaluation/` 内容快照） |
| 展示层（页面） | `feature/chen-ui@e7bec616`（**注意：与封版不同源，见未达标清单第 7 项**） |
| 契约 | `interface/event-envelope.schema.json` v0.3（四方签署表见 `evaluation/integration/D1-freeze-decision.md`） |

## 五、已知未达标／未解决（必须在材料中如实呈现）

见 `evaluation/2026-10-10-final-delivery/未达标与未解决项-20261010.md`。摘要：展示层 7 项（权威数据未随页面入库、集成包旧构建、用例读法、标准化口径、快照未物化、上传闸门、展示与源码不同版）；抽取侧 4 项（单点数据卫生已修、`parser_version` 未升版、解析复现不一致、扫描件仅降级）；评测口径 5 项（封存集为公开语料回放、弃权正确率未测、Web/CLI 独立一致性未测等）；材料侧 4 项中计划书 PDF 已入仓 `materials/` 销项（余 MP4 未入仓、两份 `evaluation/` 已按 A 合包、`develop` 未合流）。

## 六、来源与出处（可复核）

- 本包 `evaluation/` 下的每个文件都能在 `zongbowen` 分支找到同字节原件；`evaluation/run-side/weiwenyu/**` 的每个文件都能在 `weiwenyu` 分支找到同字节原件（合包时**直接复用 blob sha**，未重新写入，故字节必然一致）。
- 合包提交的树 = 运行侧封版树（`base_tree`）＋ 新的 `evaluation/` 子树 ＋ 本文件；因此 `scripts/` `corpus/` `docs/` `interface/` `tools/` `runs/` **逐字节等于**运行侧封版树，未做任何改动。