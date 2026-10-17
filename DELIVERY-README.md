# DELIVERY-README · 当前交付包入口

新版演示优先按 [START-HERE.md](START-HERE.md) 启动：张智博新版 UI + 陈的数据服务 + 魏的真实抽取。三项收口结果见 [10-17 真实页面验收](evaluation/run-side/weiwenyu/2026-10-17-live-delivery/README.md)，录屏交接见 [DEMO-CHECKLIST.md](DEMO-CHECKLIST.md)。当前指标与答辩引用统一采用[交付成绩单](evaluation/2026-10-17-delivery-metrics/metrics.md)，由同目录 metrics.json 驱动页面；以下旧冻结数据保持其原口径。

> 本包 = **运行侧封版树**（魏 `delivery/v2.0` 线，当前分支包含冻结标签之后的修复）＋ **展示层**（陈 `a4174c56` 基础展示层＋`cf0c2b4c` 的导出回导及畸形 URL 修复）＋ **评测侧正典**（宗 `zongbowen@fe2b2cbc`：金标 v1.3／D9 评分器加固／成绩单 20261017／MP4 审片实测）＋ **运行侧证据**（`evaluation/run-side/weiwenyu/`，217 份字节不动）＋ **交付材料**（`materials/`：计划书 PDF ＋ 演示 MP4 ＋ 旁白与合成工具包）。
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

**评测入口**：`evaluation/README.md`（编号说明、目录索引、引用纪律）；当前成绩单：`evaluation/2026-10-17-delivery-metrics/metrics.json` / `metrics.md`（历史冻结批、本轮真实抽取、未测项分列）。`评分成绩单-20261016.json` 保留为历史记录。
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
node scripts/jingguan/build_delivery_metrics.mjs  # 离线重算 D9、负例、严格/辅助出处和本轮 Web/CLI，生成页面与材料共用成绩单
```

**口径注记（材料随包声明，S1 裁定 2026-10-16；10-16 晚宗复核补两行；10-17 金标 v1.3 更新）**：
- **金标 v1.3（2026-10-17，宗，取代 v1.2）**：字段值一致率 **436/437＝99.77%**（多填 1：E01 通知书状态，跨项目证据套用）／Gold 期望召回率 **436/438＝99.54%**（漏抽 2：E01/E02 合同签订），**两行并报**，不得再宣称"期望字段全部抽到"。裁定与复算件：`zongbowen@fe2b2cbc`（`evaluation/2026-10-17-gold-review/`）。
- D6-AWD-002 E03/E04 `contract_signed` **维持 true，标注"组级部分已签"**（宗 10-17 清单③"维持＋注明"分支）：原文仅组级「…暖通专业甲供设备项目部分已签订合同」，未细分（三）/（四）分项，信封双侧引文即锚该句。若后续裁「子项须自身明示已签」降 needs_review，则值一致 434/435＝99.77%（百分率不变）／期望召回 434/436＝99.31%（−0.23pp），分子分母同步收窄。
- 标准化：主口径 **229/229**（权威批 31 份，非 text 有值字段）；含本地演示件为 **235/235**，两口径不并列、不互推。
- 冷跑 10×3（三分口径，"严格字节"一词作废——按字面复算全文件字节为 5/10）：**值层·保序 8/10（官方）／自然键 9/10／全文件字节 5/10**。差异两处已定性：1 处为事件轮转（值层无差），1 处为单字段判读抖动（判读类字段不作为"确定性可达"展示）。
- 出处命中率两行分列：**严格原文口径 432/451＝95.79%**（目标 95，余量仅 0.79pp）；**空白归一辅助口径 451/451＝100%**。复算件：`zongbowen@378c2cde`（`evaluation/2026-10-16-s1-decisions/`＋`evaluation/2026-10-14-sprint/R1-评分器加固/严格评分实测-20261014.json`）。
- C-1 判据改名落地件与 10-16 三口径精化版见 `zongbowen@d32ffcf9`（评测方正典冻结点；本包 `evaluation/` 取自 b41ee5a5 时点，实质修复均在包内：封存 LF 重锁／六 PDF 剥离／成绩单 20261016）。
- D13 陌生样例：随包**不含原始 PDF**（计划书 §七.3 不二次分发），按 `evaluation/D13/陌生样例-锁.json` 的 source.url＋file_sha256 取回原件后可复现——不可离线复现为已声明边界。

## 四、版本对应表

| 角色 | 版本 |
|---|---|
| 运行侧封版树 | `delivery/v2.0`（T-16 类型修复、S1 合入、扫描并发和归因修复、10-17 页面修复与三类流程验收） |
| 展示层 | `a4174c56` 基础＋`cf0c2b4c` 两项修复；交付侧同步更新 L3 导出对照 |
| 评测侧正典 | 宗 `zongbowen@fe2b2cbc`（金标 v1.3＋评分器加固＋成绩单 20261017＋审片实测）；当前成绩单见 `evaluation/2026-10-17-delivery-metrics/`，历史冻结产物保留 |
| 交付材料 | 计划书 PDF（5 页）＋ 演示 MP4（6.79 MB / 4 分 35 秒，**待补旁白**——工具包在 `materials/旁白与合成工具包/`，录完两条命令出终版） |
| 交付标签 | `v2.0-delivery` 固定在 `97a0dda0`，属于 10-16 冻结版本；当前分支包含后续修复，不能用旧标签代替。交付时记录 `git rev-parse HEAD`。 |

## 五、本轮验收与剩余工作

2606dc67 后续四项修复：通知书肯否冲突保留双侧出处并转待复核；评分器拒绝空证据、不完整求和和非数值合计；漏跑与失败分别计数。28 项边界检查、原有定向测试和八份真实记录的离线复算通过，详细范围见[修复验收](.github/tdd/wei-code-gap-fixes-20261017.md)。

10-17 合入、真实抽取和导出回导证据见[本轮验收记录](evaluation/run-side/weiwenyu/2026-10-17-delivery/README.md)。扫描并发和无依据舍入修复见[前轮回执](.github/tdd/wei-release-fixes.md)。本轮不改写冻结成绩单，不将已复现流程推算为项目全部指标达标。

评分器已定向整合宗博文 e4eed7dd 修复，并复验伪引文、悬空块和错误求和反例；成绩单百分比按分子分母实算，分母为零标未测。整合记录见 [评测与指标回执](evaluation/2026-10-17-delivery-metrics/README.md)。剩余项：陈家浩重录新版 UI 的 MP4 并完整复核；三类样例的独立 Web/CLI 对照已完成（125/125 字段一致，见本轮回执）；全量泛化与弃权正确率仍由宗博文复核。扫描 OCR 与陌生样本泛化仍按已声明范围说明。旧收口表仅作历史记录，以本轮回执明确关闭的项目为准。
