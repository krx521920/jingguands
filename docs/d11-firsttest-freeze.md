# D11 首测冻结包（交宗独立执行）

> 冻结人：魏文宇　日期：2026-10-07　冻结标签：**v0.6-d11-firsttest**（commit 4a8d0c33）
> 分工（任务表 D11）：魏＝冻结代码/配置交宗执行＋首测后缺陷定位；**宗＝独立跑 30 份单文档＋20 组跨文档首测，锁存原始输出及成绩**。开发不干预：自宗拉取标签起至其成绩发布，我不改代码不重跑发布数字。

## 一、冻结状态（冻结时点全绿）

| 项 | 冻结时点状态 |
|---|---|
| 门禁 | 16/16 |
| 统一批次（我方预检，非官方成绩） | 437/437＝100%（多轮冷跑稳定） |
| D8 配对（插件模式＝正典 B） | 宗 --strict 13/13 |
| 封存 20 组回放 | 20/20（相关 4/4、无关 16 零误报） |
| D9 归因 20 条（含 --verify-blocks 块级） | 宗 --strict 20/20 |
| D10 集成 bundle | 宗 --strict 10/10 |
| 方案 C 强度回传 | 已清偿（illegal=71 实证方案 C，见 docs/adjudication/D7-方案C强度分布回传.md） |

## 二、宗的执行步骤（独立、可复现）

```bash
git fetch --all && git checkout v0.6-d11-firsttest   # 冻结代码（我方 weiwenyu 分支）

# ① 30 份单文档抽取（真实 API，需 JINGGUAN_LLM_API_KEY 环境；约 6 分钟）
#    如需缓存重放验证确定性：加 --cache-dir runs/.model-cache（重放 3.6 秒、逐字节一致）
node scripts/jingguan/run_batch.mjs \
  corpus/zhangzhibo/d4/parse-official corpus/zhangzhibo/d5/parse-official corpus/zongbowen/d6/raw \
  corpus/adversarial/award-empty-text.txt corpus/adversarial/note-unknown.json \
  corpus/adversarial/pledge-corrupt.json corpus/adversarial/pledge-empty.txt \
  corpus/adversarial/pledge-scan-degrade.parse.json \
  --gold --gold-manifest corpus/combined-manifest.json

# ② 20 组跨文档（封存集）
node scripts/jingguan/verify_crossdoc.mjs --envelopes-dir <①的批次信封目录> \
  --manifest corpus/zongbowen/sealed/cross-doc-manifest.json --expect

# ③ D8 13 组（插件模式＝正典 B）
node scripts/jingguan/verify_crossdoc.mjs --envelopes-dir <①的批次信封目录> \
  --manifest evaluation/D8/pairs/pairs.dev30.json \
  --matcher tools/fang-matching/src_D8/matching_D8.mjs --expect
node evaluation/D8/score-pairs.mjs --report <报告> --json <评分> --strict

# ④ D9 归因 20 条（含块级校验）
node scripts/jingguan/run_d9_rules.mjs --cases evaluation/D9/cases/rules-cases.dev.json \
  --verify-blocks <①的批次信封目录> --out <报告>
node evaluation/D9/score-rules.mjs --report <报告> --json <评分> --strict

# ⑤（可选）一键五段：node scripts/jingguan/freeze_first_test.mjs --dry
```

## 三、锁存要求（宗）

原始输出（批次目录＋B/D8/D9 报告＋评分 JSON）原样入库；成绩按你口径发布；
失败清单交我（魏）做错误类型定位与公开回归复现。

## 四、输入完整性

全部输入 40 份（30 语料＋5 对抗＋5 清单/用例集）逐文件 sha256 见
`runs/D11-firsttest-input-manifest.json`（与标签同冻结）。

## 五、已知边界（如实告知，非缺陷）

- temperature=0 运行间 note/引文装饰层抖动（约 8/31 信封；**字段值与 gold 成绩稳定 437/437**）；
  缓存重放可完全消除（如需逐字节可复现成绩，建议 ① 用 --cache-dir 两段式：冷跑建缓存→重放出官方成绩）。
- EQC-010 五字段（段落裸数字 none 锚）与 PLD-009 两字段（conflict）按方案 C 应 needs_review，
  gold 是否跟改待你裁决（docs/adjudication/D7-方案C强度分布回传.md）——**本冻结版按现行 gold**。
- run_extract 的 run_meta 为封闭契约（无缓存字段）；缓存状态在 call_log 边车（.cache 块）。
