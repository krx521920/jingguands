# Evaluation assets（评测侧正典目录）

本目录属于**独立评测侧**：评测输入、gold 标注、计分定义、校验脚本与证据。口径纪律见各子目录 README。

## 0. 编号说明（**先读这一节，避免误读**）

- **团队排期**的 D1–D14 ＝ 2026-09-27 ~ 2026-10-10（14 天冲刺，`team_plan_14days`）。
- **本目录下的 `Dxx` 是「评测侧交付批次号」，不是「第几天」**。D1–D13 那几天与排期日恰好对齐；**2026-10-10（= 排期 D14，最后一天）我方连出 5 个批次**，沿用当天排期号顺延编为 **D14–D18**——所以会出现"D17"这种**超出 14 天排期**的编号。
- 因此：**看到 `evaluation/D17/` 不等于存在"第 17 天"**；批次实际日期以各目录 README 首行的日期为准。
- **此后新增批次一律用日期前缀命名**（如 `2026-10-11-xxx/`），不再顺延 `Dxx`，避免继续与排期日混淆。

## 1. 目录索引

| 目录 | 内容 | 日期 |
|---|---|---|
| `D1/`–`D4/` | 接口冻结与签署、契约缺口、字段比对（早期每日评测） | 09-27 ~ 09-30 |
| `D5/` `D6/` | 权益变动（EQC）／中标（AWD）开发集与 gold | 10-01 ~ 10-02 |
| `D7/` | 分层字段规范与归一化裁决（A 流报告） | 10-03 |
| `D8/` | 跨文档配对：13 组清单 + B 流报告冻结 | 10-04 |
| `D9/` | 规则评分器（20 条归因用例）、块级快照引用、误报分析 | 10-05 ~ 10-06 |
| `D10/` | 集成用例（10 组）+ 结构门 `check-integration.mjs` + **关系门 `check-relation.mjs`** | 10-05 ~ 10-10 |
| `D11/` | **首测（五段）**：31 份冻结信封、报告、失败清单、锁存清单 | 10-07 ~ 10-08 |
| `D12/` | 修后回归／并发／性能 + **留出变异集**（4/4） | 10-08 |
| `D13/` | **陌生样例**（3 份，cninfo 公开来源＋哈希锁）、评测章节、复现规程/裁定/主持记录 | 10-09 ~ 10-10 |
| `D14/` | **展示层本地服务实测**（17 探针）＋ 副本时效门 `check-page-copies.mjs` | 10-10 |
| `D15/` | **展示层深度审计**（11 条发现，落人）＋ 口径对账门 `check-metrics-caliber.mjs` ＋ 评测侧数字接口 | 10-10 |
| `D16/` | 采纳魏 INT-008 裁定：用例拆 `expected_relation`＋`attribution_demo`；关系门落地；信封三键转发 | 10-10 |
| `D17/` | **`standardized` 判据裁定**（主口径 229/229）＋ 检查器 `check-standardized.mjs` | 10-10 |
| `D18/` | **解析快照覆盖**（魏清单 34 条复核 31/31）＋ 覆盖门 `check-snapshot-coverage.mjs` | 10-10 |
| `dev-30/` | 开发集 30 份文档清单 | 10-02 |
| `sealed/` | 封存集（30 单文档＋20 跨文档）与哈希锁 | 10-02 ~ 10-04 |
| `integration/` | 跨批次：裁决书、问题总汇总、签署/冻结表、`check-lock` / `check-docs` | 持续 |

## 2. 给队友的可转发正文（写给人看的，不是规范）

| 对象 | 文件 |
|---|---|
| 陈 | `D17/给陈-standardized判据收口-20261010.md`、`D18/给陈-物化解析快照-20261010.md`、`D16/给陈-用例口径拆分与三键消费-20261010.md`、`D15/给陈-页面指标收口与上传闸门-20261010.md`、`D14/给陈-展示层本地实测结论-20261010.md`、`D13/给陈-两项阻塞裁定-20261010.md` |
| 魏 | `D17/给魏-弃权字段标true-20261010.md`、`D15/给魏-解析快照可核范围-20261010.md`、`D14/给魏-D10集成包版本与008判定-20261010.md`、`integration/给魏-待办三项-20261008.md` |
| 方 | `D16/给方-三键消费要点-20261010.md`、`D15/给方-核验覆盖权威批-20261010.md`、`integration/给方-第4项异议已勘误-20261009.md` |
| 张 | `D15/给张-解析快照与版本-20261010.md` |

## 3. 推送前必跑（我方自己的门，任何一项 FAIL 不推送）

```bash
node evaluation/integration/check-lock.mjs      # 锁：53 文件
node evaluation/integration/check-docs.mjs      # 文档引用/枚举一致性
node evaluation/sealed/verify-sealed.mjs        # 封存集
node evaluation/D8/score-pairs.mjs --self-check
node evaluation/D9/score-rules.mjs --self-check
node evaluation/D10/check-integration.mjs --self-check
```

对**展示层**的三道门（现状有意为红，随陈修复转绿）：`D14/check-page-copies.mjs`、`D15/check-metrics-caliber.mjs`、`D10/check-relation.mjs`；另有 `D17/check-standardized.mjs`、`D18/check-snapshot-coverage.mjs`。

## 4. Rules（原样保留）

- The evaluator does not modify production extraction, parsing, normalization, or UI code.
- Development, sealed, and challenge data are separate.
- First-test results are immutable after execution; fixes produce a separate regression result.
- Every field value requires a document, page, and source excerpt unless its status is explicitly `not_mentioned`, `unreadable`, or `not_applicable`.
- Every public fixture retains its source URL, source hash, publication date, and page-level extracted text. Synthetic fixtures may be used only for tooling development and must be labelled separately.