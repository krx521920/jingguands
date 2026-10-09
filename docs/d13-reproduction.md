# D13 · 依赖 / 环境 / 许可证 / 复现说明

> 魏文宇（抽取/编排侧）｜2026-10-09｜适用分支：`weiwenyu`
> 本文是"从零克隆到全部成绩复现"的唯一入口说明。评测侧规程以宗 `zongbowen` 分支为准；
> 解析侧可复现性以张 `sample/D13/D13-B1诊断与可复现性.md` 为准；本文覆盖**抽取侧全链**。

## 〇、产物地图（谁的分支放什么）

| 分支 | 内容 |
|---|---|
| `weiwenyu` | A 流抽取器/B 流核验/D9 归因 runner/N09 HTTP 入口＋全部代码、门禁、缓存快照、我方证据（evaluation/D11/call-logs、D12/wei-runs、D9/parses-blocks） |
| `zongbowen` | **evaluation/ 评测侧唯一正典**（用例、评分器、首测信封、锁存清单、裁定书）——本分支不留副本，运行时按需物化（见 §4.1） |
| `zhangzhibo` | 解析器 finstruct＋D4/D5/D6 语料 parse-official |
| `feature/fang-rules` | 方 D7/D8/D9 规则库源（tools/ 内为字节一致 vendor 副本） |
| `feature/chen-ui` | 页面/工作台 |

## 一、依赖

**抽取/核验/归因/门禁全链：推荐 Node 24.x（团队实测 24.17/24.21），零 npm 依赖。**
下限说明：抽取侧脚本自身仅用 Node 20.11+ 特性（import.meta.dirname/AbortSignal.any），但 vendored 方规则库（.mts 直跑）仅在 24.x 实测过——**不承诺 Node 20 原样可跑**（方的 D13 核验意见，已采纳）。
所有脚本纯 Node 标准库（node:http / node:crypto / node:fs / node:child_process / fetch），`git clone` 后**不需要 `npm install`** 即可运行：

```bash
node scripts/jingguan/gates.mjs        # 17 道门禁，一条命令
```

| 组件 | 依赖 | 说明 |
|---|---|---|
| run_extract / run_batch / verify_crossdoc / run_d9_rules / attribute_b / gates | Node ≥20.11（用 import.meta.dirname、AbortSignal.any、原生 fetch） | 温度 0 模型调用含 180s 超时＋网络错误重试一次 |
| tools/fang-d7 · fang-matching · fang-attribution · fang-report | Node ≥20 | .mts 直跑，无需构建 |
| tools/zhang-bilateral | 数据包 | 无运行时依赖 |
| serve_extract.mjs（N09） | 同上 | node:http 零依赖 |
| 解析器 finstruct（张，PDF→parse） | Python＋pypdf 等 | 仅复现解析时需要；复现**抽取**不需要——语料 parse 已入库 |

## 二、环境

### 环境变量（唯一密钥通道）

| 变量 | 默认 | 说明 |
|---|---|---|
| `JINGGUAN_LLM_API_KEY` | （必填，回落 `DEEPSEEK_API_KEY`） | 模型密钥。**只走环境变量，绝不写文件/入库**（`.env` 已 gitignore；公开仓库提交密钥会被扫密机器人数分钟内盗刷） |
| `JINGGUAN_LLM_BASE_URL` | `https://api.deepseek.com` | OpenAI 兼容端点 |
| `JINGGUAN_LLM_MODEL` | `deepseek-chat` | 模型名 |
| `JINGGUAN_CURRENCY_POLICY` | 空（=现行折合人民币口径） | 逃生口：`legacy` 回退旧双币种行为，仅诊断用 |

```bash
# PowerShell：$env:JINGGUAN_LLM_API_KEY="sk-…"   Git Bash/mac/linux：export JINGGUAN_LLM_API_KEY=sk-…
```

### 其他

- Git 建议设 `git config core.quotepath off`（中文路径明文显示，避免脚本转义问题）；
  本仓库已带 `.gitattributes`（`tools/fang-matching/** -text`）防 vendored 包 CRLF 分叉。
- 平台：Windows 11 实测全程；路径统一 `node:path` 处理，macOS/Linux 无已知障碍。
- 网络：GitHub 不稳时 `git config http.version HTTP/1.1`；模型调用走 api.deepseek.com。

## 三、许可证

- 本仓库是 **DeepSeek `deepseek-harness` 的公开 fork**：上游 `LICENSE`、`THIRD_PARTY_NOTICES.md` 对继承部分（apps/、packages/、Makefile 等）有效，未改动。
- 五人竞赛新增产物（`scripts/jingguan/`、`interface/`、`corpus/`、`docs/`、`evaluation/` 中的我方交付、`tools/` vendor 包）为团队竞赛作品，随本仓库发布；`tools/` 各包的源头与字节一致性记录在各包同目录说明及 `docs/d8-crossdoc-verification.md` 等。
- 无任何第三方运行时依赖（见 §一），不引入传递许可。

## 四、复现

### 4.1 一键门禁（17 道全绿）

```bash
git clone https://github.com/krx521920/jingguands && cd jingguands
git checkout weiwenyu
node scripts/jingguan/gates.mjs
```

评测侧文件（用例/评分器）**不在我分支**——门禁首次运行自动从 `origin/zongbowen` 物化到
`runs/.tmp-eval/`（git show 字节精确，来源 sha 记 `runs/.tmp-eval/.provenance.json`），
无需手工步骤。门禁含：契约五方机检、出处断言、宗 20 条格式、gold 一致性、行为回归、
封存回放 20/20、D8 13/13、D9 20/20（含 W7 合计勾稽记录）、D10 10/10、D11 缺陷固化等。

### 4.2 零成本重放 437/437（无需 API 密钥的确定性证明）

```bash
node scripts/jingguan/run_batch.mjs \
  corpus/zhangzhibo/d4/parse-official corpus/zhangzhibo/d5/parse-official \
  corpus/zongbowen/d6/raw corpus/adversarial/pledge-scan-degrade.parse.json \
  --cache-dir evaluation/D12/wei-runs/cache-snapshot-d12 --jobs 4
```

D12 冻结缓存快照（31 条＋SHA256SUMS）：模型响应字节与 D12-A 基线一致。
**已实测（2026-10-09，批次 runs/batch-20261009T112750）**：按本节命令全量重放，
events 与 D12-A 基线 **31/31 逐字节一致**、模型调用 30/30 缓存命中（第 31 份为扫描降级件，
设计上不调用）。三组运行与比对报告见 `evaluation/D12/wei-runs/README.md`。

### 4.3 冷跑（需要密钥）：修后基线 / 并发 / 重放三组

命令与判据见 `evaluation/D12/wei-runs/README.md`——A：`--jobs 1` 冷跑对首测冻结值层
437/437；B：`--jobs 4` 对 A 值层 437/437（零并发缺陷）；C：同缓存重放 events 逐字节一致。

### 4.4 首测五段评测（宗口径）

```bash
git fetch origin zongbowen && git checkout origin/zongbowen -- evaluation/D9 evaluation/D8 evaluation/D10 evaluation/D11/firsttest-envelopes
```

然后按 `evaluation/D11/README-firsttest-inputs.md` 的 ①–⑤ 命令执行（封存 20 / D8 13 /
D9 20 / D10 10）。评测侧正典在 zongbowen 分支，也可直接在该分支运行。

### 4.5 N09 抽取 HTTP 入口（Web/CLI 同源）

```bash
node scripts/jingguan/serve_extract.mjs --port 8788   # 密钥走环境变量
curl -X POST localhost:8788/extract -d '{"event_type":"pledge","parse_path":"corpus/zhangzhibo/d4/parse-official/D4-PLD-001.parse.json"}'
```

详见 `docs/n09-extract-service.md`（默认挂 D12 冻结缓存，已实测 HTTP 与 CLI events 逐字节一致）。

### 4.6 陌生样例执行——抽取侧入口规范（回答陈 D13 问题②三项）

评测侧裁定归宗；抽取侧的入口、标识与落盘约定如下，评测 README 可直接引用：

1. **入口命令**（逐份独立、干净环境；事件类型**必须显式指定**——陌生样例文件名不含
   pledge/equity/award 关键字，`run_batch` 的文件名推断对它们会返回 null 并跳过，实测
   STR-04/05/06 文件名均无法推断）：
   ```bash
   node scripts/jingguan/run_extract.mjs --parse <样例.parse.json> --event-type <pledge|equity_change|award_contract>
   ```
   类型以评测侧样例登记为准（`run_batch` 推断入口仅适用于按惯例命名的文件）。
2. **run_id 生成规则**：`<YYYYMMDDTHHMMSS>-<event_type>-<4位十六进制随机>`（运行起始时间戳＋事件类型＋随机后缀）；扫描降级件固定后缀 `-scan`。run_id 写入信封顶层与 call_log，同码可追溯。
3. **落盘路径**：单份 `runs/<run_id>/events.json`（v0.3 信封）＋ `runs/<run_id>/call_log.json`（含请求参数/响应/缓存命中/耗时，无密钥）；批量 `runs/batch-<stamp>/batch_report.{json,md}`＋`envelopes/`。原始输出即上述文件，**不手改、不裁剪**。
4. **耗时口径**：`call_log.timing.total_ms` 与批次报告 `duration_ms`（墙钟，含模型调用；解析为纯本地输入不在内）。
5. **缓存纪律**：陌生样例首测**不得预热缓存**——用 `--no-cache` 或指向空目录，防止"见过输入"。

### 4.7 已知边界（如实登记）

- 两次独立**冷跑**间存在 note/引文装饰层与事件顺序抖动（值层稳定：D12 实测 A/B/首测三方值层 437/437）；**缓存重放完全消除**（逐字节）。
- 首测时代的 5 条缓存已被冷跑实验覆写/删除过（W2 复盘），现行快照为 D12-A 基线——历史口径见 `evaluation/D11/call-logs/README.md`。
- 解析侧（PDF→parse）当前源码对部分入库 parse 复现不一致（块分组差异）——张 B1 诊断＋裁定归张/宗，抽取侧消费的是入库 parse 字节，不受影响。

## 五、快速核对清单（评审用）

| 想验证 | 一条命令 | 预期 |
|---|---|---|
| 工程健康 | `node scripts/jingguan/gates.mjs` | 17/17 全绿 |
| 确定性 | §4.2 重放 | 31/31，events 逐字节一致 |
| 值层正确性 | §4.3 A 组冷跑对首测 | 值层 437/437 |
| 20 页性能 | `evaluation/D12/wei-runs/w6-perf-20page.md` | 4 样本全 ≤90s |
| 抽取入口 | §4.5 | HTTP=CLI 逐字节 |
