# 信证公告审阅台

> 可信公告事件提取与跨文档核验智能体 · 金融 AI 竞赛 14 天冲刺（2026-09-27 ~ 10-10）

把公告里的每个数、每个主体，钉回它所在的原文块；两份公告说的是不是同一件事，证据说了算。

## 一句话

- **工作流 A（单文档抽取）**：公告 PDF/解析包 → 结构化事件（质押/股权变动/中标三类，37 字段 v0.3 契约）——每个字段带块级出处（block_id/页码/区域/表格 cell/引文），无依据不填值。
- **工作流 B（跨文档核验）**：多份公告 → 同事件判定三态（related / unrelated / unknown，证据不足绝不硬判）＋数值互证/矛盾（先归因后矛盾：口径差异、累计口径、币种折算、合计勾稽、时点衔接、显式更正……不能解释则保留疑点）。

## 实测成绩（全部可复跑：`node scripts/jingguan/gates.mjs`，17 道门禁；从零复现见 docs/d13-reproduction.md）

| 项 | 成绩 |
|---|---|
| 30 份公开开发集字段抽取 | **437/437 = 100%**（三类同代码态；含外币折合判定 317,915,000/CNY） |
| 宗 13 组跨文档配对 --strict | **PASS 13/13**（内置引擎与方 matching 插件双模式） |
| 封存 20 组回放 | 20/20（相关 4/4 命中、无关 16 零误报） |
| 宗 20 条归因用例 --strict | **PASS 20/20**（矛盾误报 0 漏报 0） |
| 对抗输入（损坏/空文件/扫描降级） | 全部留在分母，诚实降级零编造 |

## 快速开始

```bash
# 评测侧文件（用例/评分器）单一真源在 zongbowen 分支，按需物化（门禁会自动做）：
git fetch origin zongbowen && git checkout origin/zongbowen -- evaluation/D8 evaluation/D9 evaluation/D10

# 单文档抽取（真实模型，需 JINGGUAN_LLM_API_KEY；缓存重放免密钥见 docs/d13-reproduction.md §4.2）
node scripts/jingguan/run_extract.mjs --input 公告.txt --event-type pledge

# 批量＋Gold 对照
node scripts/jingguan/run_batch.mjs <目录...> --gold --gold-manifest corpus/combined-manifest.json

# 跨文档核验（三态判定＋一致性核验；--manifest 是宗侧用例，先跑上方 checkout 行物化）
node scripts/jingguan/verify_crossdoc.mjs --envelopes-dir <信封目录> --manifest evaluation/D8/pairs/pairs.dev30.json --expect

# 差异归因（先归因后矛盾）
node scripts/jingguan/attribute_b.mjs --report <B报告.json>

# 首测冻结（D11：一次命令出全套报告包）
node scripts/jingguan/freeze_first_test.mjs
```

## 文档地图

**从零复现（依赖/环境/许可证/复现/陌生样例入口）：docs/d13-reproduction.md**｜N09 抽取 HTTP 入口（docs/n09-extract-service.md）｜接口契约 v0.3（interface/）｜D6 验收（docs/d6-acceptance-round.md）｜B 引擎设计（docs/d8-crossdoc-verification.md）｜归因引擎（docs/d9-attribution.md）｜同公司不同事件实证（docs/d8-demo-same-issuer-pair.md）

---
*本仓库 fork 自 DeepSeek Harness（上游见 LICENSE 与 THIRD_PARTY_NOTICES）；业务代码在 scripts/jingguan/、packages/jingguan/、interface/、corpus/、docs/。*
