# DELIVERY-README · 最终交付包入口（v2.0 终态 · 完整并集）

> 本包 = **运行侧封版树**（魏 `delivery/v2.0` 线，tag 落点＝本提交）＋ **展示层**（陈 `feature/chen-ui@a4174c56`，L-1/L-2 口径落地）＋ **评测侧正典**（宗 `zongbowen@b41ee5a5`，S1 四项裁定＋F4 重锁＋F1 剥离）＋ **运行侧证据**（`evaluation/run-side/weiwenyu/`，217 份字节不动）＋ **交付材料**（`materials/`：计划书 PDF ＋ 演示 MP4）。
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

**评测入口**：`evaluation/README.md`（编号说明、目录索引、引用纪律）；成绩单：`evaluation/2026-10-12-scorecard/评分成绩单-20261016.json`（11 项＋caliber 段，每项带分子/分母、批次、code_version、出处）。
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

**口径注记（材料随包声明，S1 裁定 2026-10-16；10-16 晚宗复核补两行）**：
- 标准化：主口径 **229/229**（权威批 31 份，非 text 有值字段）；含本地演示件为 **235/235**，两口径不并列、不互推。
- 冷跑 10×3（三分口径，"严格字节"一词作废——按字面复算全文件字节为 5/10）：**值层·保序 8/10（官方）／自然键 9/10／全文件字节 5/10**。差异两处已定性：1 处为事件轮转（值层无差），1 处为单字段判读抖动（判读类字段不作为"确定性可达"展示）。
- 出处命中率两行分列：**严格原文口径 432/451＝95.79%**（目标 95，余量仅 0.79pp）；**空白归一辅助口径 451/451＝100%**。复算件：`zongbowen@378c2cde`（`evaluation/2026-10-16-s1-decisions/`＋`evaluation/2026-10-14-sprint/R1-评分器加固/严格评分实测-20261014.json`）。
- C-1 判据改名落地件与 10-16 三口径精化版见 `zongbowen@d32ffcf9`（评测方正典冻结点；本包 `evaluation/` 取自 b41ee5a5 时点，实质修复均在包内：封存 LF 重锁／六 PDF 剥离／成绩单 20261016）。
- D13 陌生样例：随包**不含原始 PDF**（计划书 §七.3 不二次分发），按 `evaluation/D13/陌生样例-锁.json` 的 source.url＋file_sha256 取回原件后可复现——不可离线复现为已声明边界。

## 四、版本对应表

| 角色 | 版本 |
|---|---|
| 运行侧封版树 | `delivery/v2.0`（本提交＝tag 落点；T-16 类型根修＋两轮验收＋S1 冲刺并入） |
| 展示层 | `feature/chen-ui@a4174c56`（页面文件随包；L-1/L-2 口径落地：三数并存＋限定语＋pending 单列） |
| 评测侧正典 | `zongbowen@b41ee5a5`（S1 四项裁定／F4 封存锁重锁 LF 基准／F1 六 PDF 剥离改索引／成绩单 20261016） |
| 交付材料 | 计划书 PDF（5 页）＋ 演示 MP4（6.79 MB / 4 分 35 秒） |
| 交付标签 | **`v2.0-delivery` → 本提交（S1 一次移位，2026-10-16，轨迹与冷跑双数见 tag 注释）**；历史：036a2662（并包态）→ 41f15d31（完整并集）→ 8e75ea46（MP4 rev2） |

## 五、已知未达标／未解决（如实呈现）

见 `evaluation/2026-10-10-final-delivery/未达标与未解决项-20261010.md` 与 `evaluation/2026-10-11-handoff/收口表-20261011.md`。摘要：展示层已修 15 项；仍开 **2 项**（舍入/归因容差规则待方/魏；注册表三项待接成绩单）；已声明边界 6 项、未测 2 项（弃权正确率、Web/CLI 独立一致性）。