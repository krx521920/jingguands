# DELIVERY-README · 最终交付包入口（v2.0.3 候选 · 完整并集）

> 本包 = **运行侧封版树**（魏 `weiwenyu@dc4080ac`）＋ **展示层**（陈 `feature/chen-ui@411b6f1b`）＋ **评测侧正典**（宗 `zongbowen@21789906`）＋ **运行侧证据**（`evaluation/run-side/weiwenyu/`，217 份字节不动）＋ **交付材料**（`materials/`：计划书 PDF ＋ 演示 MP4）。
> 合包依据：裁决 A（以评测正典为主）＋ D32 陈的合并提交（把页面与封版线并到一起）。**这是"评测入口＋演示入口"都在一个树里的版本。**

---

## 一、包结构（先看这张表）

| 目录 | 内容 | 归属 |
|---|---|---|
| `interface/` | 契约：`event-envelope.schema.json`（v0.3）＋接口 README ＋注册表 | 魏 |
| `scripts/jingguan/` | 抽取／核验／归因／门禁（零 npm 依赖） | 魏 |
| `corpus/` | 语料与解析产物（`zhangzhibo/d4|d5|d6/parse-official`） | 张（魏侧 vendor） |
| `tools/` | 方侧规则库 vendor | 方 |
| `runs/` | 运行批次与缓存快照 | 魏 |
| `docs/` | 架构／运行／复现说明 | 全员 |
| `workspace/cjh/page_prototype/` | **展示层**（零依赖本地服务：`node server.js` → 8642） | 陈 |
| `evaluation/` | **评测侧正典**：封存集、评分器、用例、冻结信封、裁定书、六道门、**评测成绩单** | 宗 |
| `evaluation/run-side/weiwenyu/` | 运行侧证据（call-logs／D10 集成包／D12 / D6 块级快照）原路径并入 | 魏 |
| `materials/` | 计划书 PDF ＋ 演示 MP4 | 陈 |

## 二、两个入口

**评测入口**：`evaluation/README.md`（编号说明、目录索引、引用纪律）；成绩单：`evaluation/2026-10-12-scorecard/评分成绩单-20261012.json`（10 项，每项带分子/分母、批次、code_version、出处）。
**演示入口**：
```bash
cd workspace/cjh/page_prototype && node server.js   # → http://127.0.0.1:8642
```
（页面权威口径需要 `data_unified/`，本包已随页面入库 31 份。）

## 三、一键复算（我方六道门）

```bash
node evaluation/integration/check-lock.mjs          # 锁：53 文件，期望 PASS
node evaluation/integration/check-docs.mjs          # 文档引用/枚举，期望 PASS
node evaluation/D10/check-relation.mjs --bundle evaluation/D10/results/weiwenyu-bundle.json   # 关系层 10/10
node evaluation/D17/check-standardized.mjs --dir evaluation/D11/firsttest-envelopes --exclude DEMO-EQC-HL-0930
node evaluation/D18/check-snapshot-coverage.mjs --exclude DEMO-EQC-HL-0930                    # 快照覆盖 31/31、451/451
node evaluation/2026-10-12-scorecard/build-scorecard.mjs                                       # 成绩单（自校验：重算锚点＝381c760f…）
```

## 四、版本对应表

| 角色 | 版本 |
|---|---|
| 运行侧封版树 | `weiwenyu@dc4080ac` |
| 展示层 | `feature/chen-ui@411b6f1b`（页面文件 182 份随包） |
| 评测侧正典 | `zongbowen@21789906` |
| 交付材料 | 计划书 PDF（5 页）＋ 演示 MP4（6.47 MB / 4 分 35 秒） |
| 交付标签 | **由魏在本提交上打**（建议 `v2.0.3-delivery`）；`v2.0-delivery@036a2662` 为不含页面/不含四项修复的旧态，保留为历史里程碑 |

## 五、已知未达标／未解决（如实呈现）

见 `evaluation/2026-10-10-final-delivery/未达标与未解决项-20261010.md` 与 `evaluation/2026-10-11-handoff/收口表-20261011.md`。摘要：展示层已修 15 项；仍开 **2 项**（舍入/归因容差规则待方/魏；注册表三项待接成绩单）；已声明边界 6 项、未测 2 项（弃权正确率、Web/CLI 独立一致性）。