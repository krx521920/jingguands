# D11 call_log 可审计证据（回应宗 W2）· 2026-10-07

## 这是什么

首测要求"锁存原始输出"，但个体运行目录（`runs/<run_id>/`）当时为省体积已清，只剩
`firsttest-run-registry.json` 的 run_id 映射。本目录用 `--cache-dir` 重放首测批次，把全部
31 份 `call_log.json` 重建入库（`<case>.call_log.json`），逐份分类见 `manifest.json`。

## 重放命令（可复现）

```bash
node scripts/jingguan/run_batch.mjs \
  corpus/zhangzhibo/d4/parse-official corpus/zhangzhibo/d5/parse-official \
  corpus/zongbowen/d6/raw corpus/adversarial/pledge-scan-degrade.parse.json \
  --cache-dir runs/.model-cache --jobs 4
```

批次报告：`runs/batch-20261007T144951`（26 份缓存命中）＋`runs/batch-20261007T151331`（5 份充值后真实重调），合计 31/31。

## 「与原运行是否逐字节一致」的诚实结论

**call_log 任何两次运行之间都不可能逐字节一致**——它含四类必然变化的易变字段：
`run_id`（时间戳前缀）、`timing`（墙钟耗时）、`cache` 命中标志与计数、`created_at`。
首测当天的两次重放之间同样不一致。可审计的稳定内核是：
`endpoint / model / request 全参数 / response.content / response.usage`——
**重放命中缓存时，response.content 与缓存条目逐字节一致**（缓存条目保存的就是原调用的响应字节）。

## 逐份分类（manifest.json 可查，三类）

| 类别 | 份数 | 说明 |
|---|---|---|
| `firsttest-era-response` | 14 | 缓存条目仍是首测时代写入 → response.content＝首测原响应字节（sha256 在 manifest），信封 events 与首测冻结件**逐字节一致** |
| `later-round-response` | 12 | 缓存条目已被 D11 当日三次冷跑实验（408415c7 / 5eb52997）**覆写**。今日重放返回后一轮冷跑响应：值层顺序无关一致（值与状态 25/26；唯一例外 D6-AWD-002 为空值字段状态枚举 `not_mentioned↔not_disclosed` 抖动，值均为 null），事件顺序／引文装饰层／provenance 块锚定存在轮间抖动（已知边界，同 `D10-cache-evidence.json` 的 known_boundary 族；PLD-009 引文长度差异亦在此类） |
| `fresh-recall-402已恢复` | 5 | D6-AWD-006~010：缓存条目在 C 轮清缓存时删除，首次重放被 API 402 拒（余额耗尽）；**当晚充值后已真实重调补齐（HTTP 200，批次 runs/batch-20261007T151331）**——其中 4 份 events 与首测冻结件**逐字节一致**（temperature=0 复现原响应），D6-AWD-007 值层一致、仅 note 装饰层抖动（"未提及联合体中标"↔"未提及联合体"） |

## 防复发：缓存快照冻结

`cache-snapshot/`＝当日 `runs/.model-cache` 全量 31 条冻结（充值重调后已含 D6-AWD-006~010 新条目）。
`runs/.model-cache` 本体被 .gitignore 排除、不会进库——这是此前丢失的根源。今后重放请指向本快照：

```bash
--cache-dir evaluation/D11/call-logs/cache-snapshot
```

response 字节对本快照稳定——D12 评测 C 项（缓存重放确定性）可直接使用。

## 教训（D12 起的流程修正）

首测冻结时只冻了信封，没冻缓存目录；若当时同冻 `.model-cache`，今日 26 份全部是
firsttest-era。**D12 起证据包一律附缓存快照。**
