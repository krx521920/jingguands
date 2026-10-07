# D10「Web/CLI」条目核查结论

> 核查人：陈家浩（页面侧）　2026-10-07 22:25
> 核查对象：宗博文`zongbowen@7bcddcb` 新提交中的 `web_cli_same_result` 判据
> 触发：宗报告原话「Web/CLI 那条要么补对照产物，要么同意标"未覆盖"——我倾向后者，没载体就不算通过。」
> **核查结论：同意宗的意见，且理由比他说得更充分。这条不该算PASS，应标「未覆盖」。**

---

## 一、宗这句话的出处与原始判据

### 1.1 判据定义（`evaluation/D10/README.md` 第 39 行）

| 测试 | 断言 |
|---|---|
| 缓存重放 | `replay_business_fields_identical === true` |
| 清缓存重跑 | `cold_cache_new_call_log === true` |
| **Web/CLI** | **`web_cli_same_result === true`（同次结果一致）** |

### 1.2 校验实现（`evaluation/D10/check-integration.mjs:32`）

```js
if (ct.web_cli_same_result !== true) notes.push('WEB_CLI_MISMATCH');
```

**该字段是一个布尔常量，由bundle 的作者（被测方）自己填。校验脚本只检查这个布尔值是否为 `true`，不检查任何实际对照数据。**

### 1.3 宗自己给的定义（`cache-evidence.json:27`）

> `"web_cli_definition": "同一次运行的信封 JSON 为唯一事实源：Web（陈页面）与 CLI 消费同一文件；缓存重放逐字节一致 31/31。"`

魏侧 bundle 里的定义更直白（`weiwenyu-bundle.json`）：

> `"web_cli_same_result": "CLI 产物（信封 JSON）为唯一事实源，Web（陈页面）读取同一文件——三态批次两两逐字节一致"`

---

## 二、为什么这条不能算通过

### 2.1 根本问题：这是「同一个文件被读两次」，不是「两条路径各自产出」

宗和魏的定义都已经自陈：**Web 与 CLI 消费的是同一份信封 JSON**。

那么这项测试实际验证的是：
- ✅ 真的验证了：同一份输入文件被两个消费者读取时，**下游解析与呈现是否一致**
- ❌ 没有验证：**Web 端独立跑一次管线** 与 **CLI 端独立跑一次管线**，结果是否一致

后者才是「Web/CLI 一致性」通常想测的东西——例如两边抽取策略不同时是否给出同样结果、是否有渲染层精度丢失（数值格式化、日期格式、单位换算）等。

**用同一份产物做对照，等于把「抽取差异」这一维度整个消掉了，只剩下「读同一文件的两个消费者行为是否一致」。这个测试有真实价值，但价值远低于 D10 承诺的语义，必须改名才诚实。**

### 2.2 我方页面确实只读文件，不参与产出——可作证

`workspace/cjh/page_prototype/server.js:136-142`：

```js
const file = path.join(DATA_DIR, dataset + ".json");
if (!file.startsWith(DATA_DIR) || !fs.existsSync(file)) {   // 目录逃逸防护
const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
```

页面侧**没有任何管线调用**，只有 `readFileSync` + `JSON.parse`。**这就是一个纯消费端，连"跑一遍抽取"的能力都没有**，所以客观上不具备产出独立对照产物的条件。

### 2.3 三份 bundle 的 code_version 不一致，跨批更不可比

| 文件 | `code_version` | `web_cli_same_result` |
|---|---|---|
| `d10-bundle.json` | `292d252b` | **false** |
| `d10-bundle-rebuilt.json` | `292d252b` | **true** |
| `weiwenyu-bundle.json` | **`bcc0cc6e`** | **true** |

★ 注意第二列：**三份 bundle 分属两个不同的抽取批（`292d252b` / `bcc0cc6e`）**。跨批的"逐字节一致"说明不了任何Web/CLI 关系，只能说明缓存重放稳定。

### 2.4 仓库里同时躺着 FAIL 与 PASS 两份成绩单

| 文件 | 结果 |
|---|---|
| `evaluation/D10/results/d10-score.json` | **FAIL 0/10**（10 组全 `WEB_CLI_MISMATCH` 等 4 类notes） |
| `evaluation/D10/results/score-rebuilt.json` | **PASS 10/10** |

FAIL 那份的 `run_id` 是 `null`、`replay_business_fields_identical: false`、`cold_cache_new_call_log: false`——**正是靠"补对照产物"才转成 PASS 的**。

**这就是宗那句话的现实语境**：三项缓存断言此前全部为 false，是通过补造`cache` 块（而非补造实际对照数据）转成 true 的。

---

## 三、我的立场与建议

### 3.1 同意宗的意见，且建议比"未覆盖"更严格

| 项 | 建议 |
|---|---|
| **判定** | **标「未覆盖」（NOT_COVERED），不计入 10 组 PASS** |
| **理由** | 没有独立对照产物；同一文件被两个消费者读取 ≠ Web/CLI 一致性验证 |
| **改名建议** | 若要保留现有检查，断言应改名为 `same_source_same_result`（同源同结果），并**从D10 核心判据降级为「幂等性/一致性冒烟检查」** |
| **真正通过的条件** | 需要 Web 端与 CLI 端**各自独立跑一次抽取管线**，比对同一份原始 PDF 的输出信封逐字段一致 |

### 3.2 补对照产物的可行性（如果领导要求补）

技术上可做，但成本与口径要说清：

1. 页面侧接一根「CLI 模式」入口：`GET /api/datasets?mode=cli` 走纯CLI 抽取管线落盘；
2. Web 侧走现有 bridge 管线；
3. 同一份 PDF 两侧各出一份信封，比对 615 个字段。

**但需先解决一个前置问题**：页面侧目前**没有 PDF**，也没有抽取管线代码（只有 `readFileSync`）。所以这不是"页面侧配合跑一下"的事，**需要魏文宇提供可被页面调用的 CLI 抽取入口**。这一项应作为 **N09** 登记，责任人 **魏文宇**（提供 CLI 入口）＋ **陈家浩**（页面侧对照壳）。

### 3.3 顺带修正另一条

`cache-evidence.json` 自陈 `known_boundary`：

> "两次独立冷跑间存在 note/引文装饰层抖动（8/31，字段值全部一致，两批均 437/437）——temperature=0 运行间抖动的既有已知项"

**这条也建议在成绩单里显式标注**：冷跑之间已有 8/31 的装饰层抖动，说明**即使同一份代码两次独立运行也不是逐字节一致的**。这直接削弱了「Web/CLI 一致」的可解释性——真正一致的是**文件本身**，不是**产出过程**。

---

## 四、给合流会的一句话

**宗这条判断是对的，建议直接采纳。** `web_cli_same_result` 当前是一个由被测方手填的布尔常量，校验脚本不验任何对照数据；其真实语义是"同一份信封文件被两个消费者读取"，应改名为 `same_source_same_result` 并降级为幂等性冒烟检查，**从 D10 的 PASS 判据中移除、标为「未覆盖」**。

若要真正通过，需 Web 端与 CLI 端各自独立跑一次抽取并比对 615 字段——但**前置卡在页面侧没有 PDF 也没有抽取管线**，须魏文宇先提供可调用的 CLI 抽取入口（N09）。

---

## 附：本次核查的实证命令与只读性说明

- 全部为只读操作：`git fetch --depth=1 --filter=blob:none` ＋ `git show <sha>:<path>` 检出到 `.work_tmp_zk/`（临时目录，未入库），**未修改宗分支任何文件、未修改 develop、未触碰封存集**。
- 核查对象 SHA：`zongbowen@7bcddcb077a017cc4528a5db1931852a291e4853`（宗较上次 `5dc133f4` 的新提交）。