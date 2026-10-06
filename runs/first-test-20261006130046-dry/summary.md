# 首测冻结报告（DRY 联调）

- 冻结时间：2026-10-06T13:00:46.182Z
- 代码版本：bcc0cc6e

## A. 统一批次 — DRY 复用 runs/batch-20261005T063943（437/437 见该批次报告）
## B1. D8 配对·内置引擎 — ✓（206ms）
- 命令：`scripts/jingguan/verify_crossdoc.mjs --envelopes-dir runs/batch-20261005T063943/envelopes --manifest evaluation/D8/pairs/pairs.dev30.json --expect --out runs/first-test-20261006130046-dry/d8-builtin.json`
- 指标：verdict=13/13
- > [封存回放] 相关命中 4/4｜无关零误报 8/8｜判定一致 13/13
- > [证据不足] 第三态命中 1/1
- --strict：**PASS 13/13**
## B2. D8 配对·方 matching 插件 — ✓（143ms）
- 命令：`scripts/jingguan/verify_crossdoc.mjs --envelopes-dir runs/batch-20261005T063943/envelopes --manifest evaluation/D8/pairs/pairs.dev30.json --matcher tools/fang-matching/src_D8/matching_D8.mjs --expect --out runs/first-test-20261006130046-dry/d8-plugin.json`
- 指标：verdict=13/13
- > [封存回放] 相关命中 4/4｜无关零误报 8/8｜判定一致 13/13
- > [证据不足] 第三态命中 1/1
- --strict：**PASS 13/13**
## C. 封存 20 组回放 — ✓（144ms）
- 命令：`scripts/jingguan/verify_crossdoc.mjs --envelopes-dir runs/batch-20261003T160213/envelopes --manifest corpus/zongbowen/sealed/cross-doc-manifest.json --expect`
- 指标：verdict=20/20
- > [跨文档核验] 20/20 组｜判定相关 4｜互证 10｜矛盾 0
- > [封存回放] 相关命中 4/4｜无关零误报 16/16｜判定一致 20/20
## D. D9 归因 20 条（含双侧证据） — ✓（124ms）
- 命令：`scripts/jingguan/run_d9_rules.mjs --cases evaluation/D9/cases/rules-cases.dev.json --bilateral tools/zhang-bilateral/bilateral_evidence.json --out runs/first-test-20261006130046-dry/d9-rules.json`
- 指标：cases=20
- > [D9归因runner] 20 案｜corroborated=5｜explainable_difference=11｜insufficient=2｜restated=1｜conflict=1｜双侧证据 {"present":25,"quote_not_in_block":5,"block_missing":5}｜报告 
- --strict：**PASS 20/20**

## 总判定：✓ 全部通过
