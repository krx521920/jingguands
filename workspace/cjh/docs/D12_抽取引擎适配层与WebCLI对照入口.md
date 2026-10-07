# D12 预留入口：抽取引擎适配层与 Web/CLI 真实对照

> 领导指令（2026-10-07）：「先修复陈侧的问题，预留入口，后期能通过转接口进行连接魏」
> 对应问题：**N09（P1）** `web_cli_same_result` 无独立对照产物｜原责任人 魏文宇 + 陈家浩

---

## 一、结论先说

陈侧能做的那一半已经做完并验证通过；剩下的一半**客观上不在页面侧**，卡在魏提供抽取入口。

| 项 | 状态 |
|---|---|
| 页面侧"把同源消费渲染成一致 ✔"的错标 | **已修**（改为中性「未覆盖」，双处） |
| 抽取引擎抽象层（预留入口） | **已建**：`bridge/extractor.js`，file / cli / http 三个 provider |
| Web/CLI 真实对照的实现 | **已建**：`/api/parity`，同源拒判 + 空跑拒判 + 差异捕获 |
| CLI 通道是否真的能跑 | **已验证**：接假 CLI 跑通 30/30 例、562/562 字段 |
| 页面侧还缺什么 | **什么都不缺**。只等魏给抽取入口 + 原始 PDF |
| 验证脚本 | `demo/_engine_check.js` — **40/40 PASS** |

**魏侧接通成本＝设两个环境变量，页面与接口零改动。**

---

## 二、为什么必须做这层抽象（根因回顾）

D10 的 `web_cli_same_result` 被判未覆盖，根因不在校验脚本，在**页面侧没有独立跑抽取的能力**：

```
改造前： server.js  →  readFileSync(data/<case>.json)  →  toContract()  →  页面
                    └─ 只有一个数据来源，没有"第二路"的概念
```

所以两侧只能读同一个文件，验出来的只是"读同一文件的两个消费者行为是否一致"（幂等性冒烟），
把「抽取差异」这个维度整个消掉了。在此基础上把布尔填 `true` 并渲染成绿色 ✔，就成了造假。

改造后：

```
                    ┌─ file provider ── 读 data/<case>.json（预生成信封）
extract(caseId) ────┤
                    ├─ cli  provider ── spawn 魏的 CLI  （env: EXTRACT_CLI_CMD）★预留
                    └─ http provider ── HTTP 调魏的服务  （env: EXTRACT_HTTP_URL）★预留
                              │
                        toContract() 统一过桥 v0.3
                              │
              ┌───────────────┴───────────────┐
         /api/result                  /api/parity?a=file&b=cli
      （附 extraction_engine 标记）    （两侧各跑一次，逐字段比对）
```

---

## 三、预留接口契约（★需与魏文宇对齐后固化）

### 3.1 CLI 方式（推荐）

页面侧启动时设两个环境变量：

```bash
EXTRACT_CLI_CMD="node scripts/jingguan/extract.mjs"   # 抽取命令
EXTRACT_CLI_PDF_DIR="D:/path/to/raw_pdfs"            # 原始 PDF 目录
```

调用约定（已实现在 `bridge/extractor.js` 的 `cliProvider`）：

| 项 | 约定 |
|---|---|
| 调用方式 | `spawn(exe, args, { env: { ...process.env, CASE_ID, PDF_PATH } })` |
| 入参 | `CASE_ID` = 数据集名；`PDF_PATH` = `<PDF_DIR>/<CASE_ID>.pdf` |
| 期望输出 | **stdout 一个信封 JSON**（与 `data/<case>.json` 同构），`exit=0` |
| 超时 | `EXTRACT_CLI_TIMEOUT`，默认 120s |
| 失败处理 | 非 0 退出 / stdout 非 JSON → 该例判失败并带原因，**不静默回落 file** |

### 3.2 HTTP 方式（备选）

```bash
EXTRACT_HTTP_URL="http://127.0.0.1:8800/extract"
```

`GET <URL>?case_id=xxx` → 返回信封 JSON。超时 `EXTRACT_HTTP_TIMEOUT` 默认 120s。

### 3.3 魏侧需要交付的两件事

1. **可被页面调用的抽取入口**（CLI 脚本或 HTTP 服务，二选一）
2. **原始 PDF**——页面侧目前一份 PDF 都没有，`EXTRACT_CLI_PDF_DIR` 无从谈起

> 这两项都不是页面侧能自己解决的：PDF 属上游资产，抽取入口属魏的职责边界。

---

## 四、三条写死的反造假铁律（`bridge/extractor.js` 顶部注释）

D10 那条造假不是偶然，是"没封死就会再犯"。以下三条已写进代码并有测试守着：

### 铁律① 同源拒判

两侧都声明 `same_file_as_peer` ⇒ `verdict="not_covered"`，**不允许 pass**。
理由：同源只能验幂等性，验不了抽取一致性。

### 铁律② 空跑拒判

一个 case 都没跑成（`cases_ran === 0`）⇒ `verdict="not_covered"`，**不允许 pass**。

> ★ 这条是**我写代码时自己踩到的**：第一版 `parity()` 里 `totalDiff=0 && totalOnly=0` 就直接判 pass，
> 结果 30 例全失败却输出 `verdict:"pass"`。**与 D10 `d10-score.json`(FAIL 0/10) → `score-rebuilt.json`(PASS 10/10)
> 是同一款漏洞**——"没跑成"被算成"跑成了且一致"。已修，并加进测试守着。

### 铁律③ 空清单拒判

调用方显式传 `cases=[]` ⇒ 判 `not_covered`。
（区分「未传」与「传了空列表」：前者跑全量，后者是调用方明确表示无对照对象，不得静默展开成全量）

### 附：不静默回落

未配置的 provider 一律 `available()=false` 并给出可执行原因，**绝不悄悄退回 file**——
静默回落等于"假装跑过"，正是 D10 已犯的错。

---

## 五、验证结果（可重跑）

### 5.1 引擎验证 `node demo/_engine_check.js` → **40/40 PASS**

| 组 | 验什么 | 结果 |
|---|---|---|
| 1 引擎清单 | 能力声明是否诚实、未配置是否报 false | 7/7 |
| 2 同源拒判 | file vs file、file vs 未接通 cli 都判 not_covered | 5/5 |
| 3 CLI 通道实跑 | 接假 CLI → 30/30 例、562/562 字段 | 4/4 |
| 4 空对象拒判 | 空清单 / PDF 目录消失 / 有引擎但 0 例跑成 | 8/8 |
| 5 差异捕获 | 注入 29 处篡改 → 判 mismatch 且逐字段抓到 | 3/3 |
| 6 页面修正 | 不再渲染绿色 ✔、中性样式、页头接入 | 11/11 |

**第 5 组是关键**：如果注入差异后仍判 pass，说明比对逻辑是死的。实测捕获 29/29 例。

### 5.2 既有脚本回归（全部未受影响）

| 脚本 | 结果 |
|---|---|
| `demo/_survey.js` | 数据集 30 份 · 单文档 **30/30 成功** · **缺陷 0 条** · 慢请求 0 |
| `demo/_v03_gap_check.js` | **20/20 PASS**（v0.3 契约适配未破） |
| `demo/_retest_unified.js` | **437/437 = 100%**（D11 口径未变） |

---

## 六、改动清单

| 文件 | 改动 |
|---|---|
| `bridge/extractor.js` | **新建**。抽取引擎适配层：file / cli / http 三 provider、`extract()`、`parity()`、`describeEngines()`、业务键 `evKey()` |
| `server.js` | 引入适配层；`readDataset` 改走 `file.run()`；删 `fetchRemote` 与 `DATA_SOURCE` 分支（留兼容别名）；新增 `/api/engines`、`/api/parity`；`/api/result` 下发 `extraction_engine`；启动日志逐引擎打印可用性 |
| `public/js/render/integration.js` | 缓存面板第三项改中性「判未覆盖」；新增 Web/CLI 独立对照面板（实调 `/api/parity`）；case 卡徽标改「Web/CLI 未覆盖」 |
| `public/js/adapter.js` | 新增 `fetchEngines()` |
| `public/js/app.js` | 页头 `engineMeta`：明示「预生成信封」/「独立抽取」，完整口径进 title |
| `public/index.html` | 页头加 `engineMeta` 占位 |
| `public/css/style.css` | 新增 `.int-assert.neutral`、`.up-badge-neutral`、`.int-parity`；修 `header h1` 被挤压成竖排的老问题 |
| `demo/_engine_check.js` | **新建**。40 项验证（只读、可重跑） |
| `demo/_fake_extract_cli.js` | **新建**。假 CLI，仅用于证明链路是活的（不得作为成绩） |
| `demo/_shot_parity.py` | **新建**。Playwright 截图脚本 |

---

## 七、口径变化（页面显式声明了什么）

| 位置 | 改造前 | 改造后 |
|---|---|---|
| 缓存面板第三项 | 绿色 ✔「Web/CLI：同次结果一致」 | 灰色虚线「Web/CLI 对照：同源消费，非独立对照 —— 判未覆盖」 |
| 10 张 case 卡徽标 | 绿色 ✔「Web/CLI 一致」 | 灰色虚线「Web/CLI 未覆盖」 |
| 页头 | 无 | 「引擎 预生成信封」（橙）/「引擎 独立抽取」（绿），title 列出预留入口与阻塞原因 |
| `/api/result` | 无来源标记 | 附 `extraction_engine`：`reruns_extraction` / `engine_owner` / `source_path` / `code_version` |
| 新增面板 | — | Web/CLI 独立对照：pass / mismatch / **未覆盖** 三态 + 阻塞项 + 解阻建议 |

---

## 八、遗留与下一步

**页面侧已无待办。** N09 的剩余部分全在魏侧：

| 待办 | 责任人 | 交付物 |
|---|---|---|
| 提供可被页面调用的抽取入口 | **魏文宇** | CLI 脚本或 HTTP 服务（契约见 §3） |
| 提供原始 PDF | **魏文宇** | PDF 目录（31 例对应） |
| 跑真对照并出结论 | 陈家浩（入口接通后） | `/api/parity` 输出 + 成绩单 |

**建议合流会口径**：N09 状态从「页面侧无能力」改为「**页面侧入口已就绪、待上游接通**」。
不要再表述为"页面侧没法做"——那已不成立。

**遗留观察**：宗侧 `check-integration.mjs:32` 仍只读 `web_cli_same_result` 一个布尔。
建议同步建议宗把该字段改名为 `same_source_same_result` 并降级为幂等性冒烟检查（见 `D10_WebCLI条目核查结论.md`）。