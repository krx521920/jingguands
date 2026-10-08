# D12 三组运行（魏方交付，供宗评测 A/B/C 三项）· 2026-10-08

对宗《D12 评测计划》第三节"需要的输入"——三组同输入（首测冻结批次：D4×10＋D5×10＋D6×10＋扫描降级 1，共 31 份）运行全部完成，逐份 call_log 已归档。

## 三组运行

| 组 | 批次 | 命令要点 | 结果 | 耗时 |
|---|---|---|---|---|
| **A 修后基线** | `runs/batch-20261008T005756` | `--jobs 1` 冷跑（全新缓存目录 `runs/.model-cache-d12`，31 miss→31 write） | 31/31 | 183.6s（均 5.9s/份） |
| **B 并发对比** | `runs/batch-20261008T010231` | `--jobs 4` 冷跑（`--no-cache`，不污染 A 缓存） | 31/31 | 53.6s（3.4× 提速；均 1.7s/份） |
| **C 缓存重放** | `runs/batch-20261008T010943` | `--jobs 4 --cache-dir runs/.model-cache-d12`（30 文档调用全命中，含 D5-EQC-002 分块 2 键） | 31/31 | 0.96s |

完整命令（A 例，B/C 换并发与缓存参数）：

```bash
node scripts/jingguan/run_batch.mjs \
  corpus/zhangzhibo/d4/parse-official corpus/zhangzhibo/d5/parse-official \
  corpus/zongbowen/d6/raw corpus/adversarial/pledge-scan-degrade.parse.json \
  --cache-dir runs/.model-cache-d12 --jobs 1
```

## 自检结果（比对脚本 `scripts/jingguan/compare_runs.mjs`，口径对齐宗计划第四节：值层主判据、null 状态翻转发清单不计失败）

| 项 | 比对 | 值层 | 业务字段层 | 含 note 层（events 逐字节） |
|---|---|---|---|---|
| **A 修后回归** | A vs 首测冻结信封 | **437/437 = 100%** ✅ | 30/31 同构；翻转 2 条＝D6-AWD-002 formal_award_notice_received `not_disclosed↔not_mentioned`（null/null，跨轮状态枚举抖动已知族，同 D11 W2 记录） | 17/31（note/引文装饰层冷跑抖动，已知边界） |
| **B 并发一致性** | B vs A | **437/437 = 100%** ✅ **零并发缺陷** | 30/31 同构；翻转 1 条＝D4-PLD-009 end_date `not_mentioned↔needs_review`（null/null，与宗 D11 `cold-run-verification.json` 记录的是同一条） | 17/31（两次独立冷跑间装饰层抖动） |
| **C 缓存重放确定性** | C vs A | 437/437 ✅ | **31/31** | **31/31 逐字节一致** ✅（D10 口径达标） |

三份机器可读比对报告：`D12-A-regression.json` / `D12-B-concurrency.json` / `D12-C-replay.json`（本目录）。

## call_log（宗计划第三节第 4 项：并发下日志完整性）

`call-logs/` 共 93 份（A/B/C 各 31，`A-<case>.call_log.json` 命名），manifest 核验：三组全部 31/31 字段完整（run_id/endpoint/request/response/timing 齐全）。并发（B）与顺序（A）日志结构无差异；耗时字段逐份在（D12 耗时日志）。

## 附带交付

1. **分块路径缓存上报缺口修复**（本轮发现）：D5-EQC-002 走 `parse-blocks-chunked`（2 块 2 键），缓存实际生效但 call_log 顶层 `hit/key` 恒 null——已修（聚合上报，key=null 表多键）。C 组证据为修复后代码产出（EQC-002：`hit:true, hits:2`）。
2. `cache-snapshot-d12/`：A 轮缓存 31 条冻结（SHA256SUMS.json 在内）——任何人重放 C 项可复现逐字节一致。
3. 宗计划第六节 C2（D6 块级盲区）已在 D11 晚间闭合：`evaluation/D9/parses-blocks/`（D6 全 10 份块级解析，W3）。
