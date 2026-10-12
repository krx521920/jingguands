# D10 · 模型调用缓存／重放／清缓存＋宗 10 组集成 bundle（2026-10-06）

> 交付人：魏文宇　任务行：完善 A→B 入口、模型调用缓存、缓存重放与清缓存重跑（整链命令＋缓存/重放日志）

## 一、模型调用缓存（run_extract / run_batch）

- `--cache-dir <dir>`（或 env `JINGGUAN_CACHE_DIR`）开启；`--no-cache` 旁路（清缓存重跑）。
- key＝sha256(model＋system＋user)，temperature=0 下确定性重放；缓存文件含 model 防错配。
- call_log 记 `cache{enabled,hit,key,hits,misses,writes}`＋`timing.real_call_ms`；契约（run_meta）不动。

## 二、三态实测（35 输入统一批次，runs/D10-cache-evidence.json）

| 态 | 批次 | gold | 缓存 |
|---|---|---|---|
| 冷启动 | batch-20261006T083905 | 437/437 | 31 miss / 0 hit（31 次真实调用） |
| 缓存重放 | batch-20261006T085807 | 437/437 | **31 hit / 0 miss**，全程 3.6 秒 |
| 清缓存重跑 | batch-20261006T084717 | 437/437 | 31 miss（全新调用日志） |

- **重放业务字段逐字节一致 31/31**（schema/is_mock/sha/events 全量，含 note）。
- 已知边界：两次独立冷跑存在 note/引文装饰层抖动（8/31，字段值全一致、两批均 437/437）——
  temperature=0 运行间抖动的既有项；**缓存重放完全消除**（这正是缓存对 D11 首测复现的价值）。
- Web/CLI 同次结果一致：信封 JSON 为唯一事实源，陈页面与 CLI 消费同一文件。

## 三、宗 10 组集成 bundle（check-integration --strict **PASS 10/10**）

`build_d10_bundle.mjs`：每案例 input_sha256（信封 sha 链）·records（成员 A 运行＋缓存态）·
diff_list（B 冲突）·report{events,diffs,attribution,boundaries}·cache 三项。判定全部符合预期：
001 related 互证10／002 related 反向咬合／**003 同公司不同事件 unrelated**／006·010 第三态 unknown。

## 四、顺手修复：降级信封哈希语义

降级路径原对 joinedRaw（空）取哈希→信封携带"空字符串的 sha256"（语义错误）。
已改为**输入解析文件字节哈希**（张链检可复核）；scan-degrade 现为 2ee08158…。

## 五、给张的补充（链检 7/10→10/10）

- `pledge-scan-degrade`：合成对抗件无源 PDF，file_sha256＝解析文件字节哈希
  `2ee081587db9216dc3868b034eacca66b9662862f6d1bd07ad0e2def69aeae26`
- `DEMO-EQC-HL-0930`：`3b1abc7f47dbb6062f40f7631b263356bfacd930f23672ebd7a1e96603671a02`（演示 PDF 不入库）
