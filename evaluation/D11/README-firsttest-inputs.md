# D11 首测输入冻结包（交宗执行）

> 魏文宇｜2026-10-07｜对应宗的 evaluation/D11/first-test-kickoff.md 等待项

## 冻结内容

| 文件 | 说明 |
|---|---|
| `firsttest-envelopes/*.json` | 31 份信封（30 语料＋1 扫描降级），**含全部修复**（PLD-009 守卫/简称归全称/跨块重锚/AWD-007 币种） |
| `firsttest-batch-report.json` | 原始批次报告（437/437=100%） |

## 宗的执行命令（B/D8/D9/D10 评分）

```bash
# ① 封存 20 组
node scripts/jingguan/verify_crossdoc.mjs \
  --envelopes-dir evaluation/D11/firsttest-envelopes \
  --manifest corpus/zongbowen/sealed/cross-doc-manifest.json --expect

# ② D8 13 组（插件模式＝正典 B）
node scripts/jingguan/verify_crossdoc.mjs \
  --envelopes-dir evaluation/D11/firsttest-envelopes \
  --manifest evaluation/D8/pairs/pairs.dev30.json \
  --matcher tools/fang-matching/src_D8/matching_D8.mjs --expect
node evaluation/D8/score-pairs.mjs --report <报告> --json <评分> --strict

# ③ D9 归因 20 条（含块级校验）
node scripts/jingguan/run_d9_rules.mjs \
  --cases evaluation/D9/cases/rules-cases.dev.json \
  --verify-blocks evaluation/D11/firsttest-envelopes --out <报告>
node evaluation/D9/score-rules.mjs --report <报告> --json <评分> --strict

# ④ D10 集成 10 组
node scripts/jingguan/build_d10_bundle.mjs \
  --envelopes evaluation/D11/firsttest-envelopes
node evaluation/D10/check-integration.mjs \
  --bundle runs/D10-integration-bundle.json --json <评分> --strict
```

## 冻结版本

- 代码：weiwenyu@4018418f（含 D11 全部修复，非 v0.6-d11-firsttest 旧标签——旧标签无修复）
- 信封：batch-20261007T084852（缓存重放产出，模型确定性已由 D10 缓存三态实证）
- 修复清单：docs/d11-defect-localization.md＋docs/d12-perf-and-stability.md 第五节

## 宗反馈补丁（2026-10-07）

宗指出三个缺口，逐一回应：
1. **信封 run_id**：`firsttest-envelopes/*.json` 31 份每份都有 `run_id`（v0.3 schema required）——请拉 `weiwenyu@5f25133a` 确认
2. **缓存三件**：`D10-cache-evidence.json` 已拷入本目录（三态实测：冷31miss→重放31hit/0miss→清31miss，业务字段逐字节一致31/31）
3. **D10 bundle**：`D10-integration-bundle.json` 已拷入本目录（`check-integration --strict` PASS 10/10 的那份）
4. **call_log**：个体运行目录已清（节省体积）；`firsttest-run-registry.json` 有全部 run_id 映射。**2026-10-07 晚已重建入库**：`evaluation/D11/call-logs/` 31 份 call_log＋逐份分类 manifest＋缓存快照（14 份首测原响应字节 / 12 份冷跑实验覆写后值层等价 / 5 份 API 402 待充值补齐），差异说明见该目录 README——勿再用 `runs/.model-cache` 重放（已被冷跑实验部分覆写，改用快照目录）
