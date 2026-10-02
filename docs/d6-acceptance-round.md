# D6 完整验收记录：同一轮 30 份＋坏文件＋页面覆盖

- 验收人：魏文宇（架构/抽取/编排）
- 日期：2026-10-02
- 批次：`runs/batch-20261002T120859`（**一条命令、同一代码版本、35 个文件一次跑完**）
- 复现命令：

```bash
node scripts/jingguan/run_batch.mjs \
  corpus/zongbowen/d4/raw corpus/zhangzhibo/d5/parse-official \
  corpus/zongbowen/d6/raw corpus/adversarial \
  --gold --gold-manifest corpus/combined-manifest.json
```

## 一、30 份正常文档（三类 × 10）

| 类别 | 数量 | gold 字段准确率 | 错误填充 | 校验错误 |
|---|---|---|---|---|
| 质押 D4 | 10 | 182/182 = **100%** | 0 | 0 |
| 股权变动 D5 | 10 | 137/137 = **100%** | 0 | 0 |
| 中标 D6 | 10 | 118/118 = **100%** | 0 | 0 |
| **合计** | **30** | **437/437 = 100%** | **0** | **0** |

事件数 30/30 全部一致（含 D5-EQC-001 的 5 事件、EQC-002 的 3 事件、D6-AWD-002/009 的 4/3 事件）。

## 二、5 份对抗文件（corpus/adversarial/，覆盖四种失败路径）

| 文件 | 失败路径 | 批次行为 | 分母 |
|---|---|---|---|
| `note-unknown.json` | 无法推断事件类型 | skipped＋skip_reason 记录 | ✓ 计入 35 |
| `pledge-corrupt.json` | JSON 损坏（非评测格式） | skipped＋skip_reason（**本轮修复：此前被 `continue` 静默吞掉、分母消失**） | ✓ 计入 35 |
| `pledge-empty.txt` | 空文本 | runner 拒绝调用模型（exit 2，"拒绝调用模型以免编造"），failed＋output_tail | ✓ 计入 35 |
| `award-empty-text.txt` | 纯空白文本 | 同上（类型可推断、内容为空） | ✓ 计入 35 |
| `pledge-scan-degrade.parse.json` | 全页 SCANNED 无可读文本 | **诚实降级**：不调模型，14 字段全 unreadable，extraction_method=rule，run_meta 注明降级原因 | ✓ 计入 35（ok=true，verr=1 为设计内降级通告） |

**汇总行如实报告：成功 31/35**——失败/跳过文件不从分母删除；31 个成功文件的抽取互不污染（30 份正常文件全部 100%，证明单文件失败完全隔离）。

## 三、页面覆盖

- 全页扫描：`pledge-scan-degrade.parse.json`（降级路径，零编造）
- 混合页面（部分页 TEXT/部分页 SCANNED）：D5-EQC-003（第 34 页 SCANNED，MIXED 提示记 call_log.repairs，不影响其余页抽取，acc=100%）
- 多页长文：D6-AWD-003（82 块）、D5-EQC-001（34 页详式报告，分块抽取）

## 四、本轮修复清单（对应评测反馈三条）

1. **失败计数漏洞**：`run_batch.mjs` 两处——非评测格式文件此前被 `continue` 静默跳过（分母消失），现记 skipped＋原因；单文件产物损坏此前会 `JSON.parse` 抛异常炸整批，现 try/catch 按 failed 记录后继续。
2. **完整验收记录**：本文档＋`runs/batch-20261002T120859/batch_report.{md,json}`＋envelopes/ 逐份信封——同一轮 30＋5、四种失败路径、页面形态全覆盖。
3. **Harness 工具接真实抽取**：`packages/jingguan/core/src/index.ts` v0.4——`jingguan_extract_events` 默认 `mode="real"`，spawn `scripts/jingguan/run_extract.mjs`（30 份 ×100% 验证过的管线），返回真实 v0.3 信封＋校验问题；`mode="mock"` 保留 D1 骨架联调。行为冒烟已通过（pledgor=广弘元、pledgee=中信银行宁波分行、shares=5,200,000、ratio=10.08、quote 锚定原文）。

## 五、自动化回归（评测方要求：损坏 JSON／损失文件批量回归，常驻门禁）

`scripts/jingguan/test_batch_denominator.mjs`（已纳入 gates.mjs 第 8 道门禁，每次改动自动跑）：

- 7 种输入形态一次批量：合法样例＋JSON 截断＋pages=[] 内容损失＋无 pages 键结构损失＋非 UTF-8 二进制＋纯空白文本＋无法推断类型
- 断言：`results.length === 输入数`（分母零丢失）、每类坏文件的 ok/skip_reason/拒绝原因、合法样例不受污染（隔离对照）
- 产物损坏路径：假 RUNNER 模拟"打印 runs 路径但产物缺失"→ 断言记 `failed（产物不可读/损坏）` 且批次不崩、报告照常产出
- 批量进程 exit 1 是设计内失败信号（`errTotal>0 || ok<total`），测试判 0/1 均为正常完成，仅 null/信号为崩溃

## 六、门禁

修复后全量门禁通过（含契约五方一致、全量信封校验、gold 一致性、行为回归、**批量分母回归**、git 守卫、远端同步）。
