# D2 交付：三份真实公告解析

> **交付人**：张智博　**分支**：`zhangzhibo`　**日期**：2026-09-28（D2）
> **任务**：解析 3 份文本 PDF，保留页码和区域；提供稳定 block_id
> **交付**：3 份解析结果 ＋ 页面坐标
> **结构版本**：`evidence/0.3`

---

## 一、交付内容

| 文件 | 说明 |
| --- | --- |
| `parse/pledge-001.parse.json` | 万集科技 股份质押（2 页 95 块） |
| `parse/equity-change-001.parse.json` | 诺唯赞 减持结果（4 页 58 块） |
| `parse/award-001.parse.json` | 华康洁净 项目中标（4 页 75 块） |
| `manifest.json` | 来源链接、sha256、页数/块数/校验结果 |
| `evidence/` | 10 张可视验证图，**表格单元格画成品红色**（一眼看出哪些是 cell 级证据） |
| `fetch_samples.py` | 按来源链接取回原始 PDF（**PDF 本身不入库**，见下） |
| `docs/给群里的回复.md` | 给宗博文、魏文宇的两条回复，可直接复制粘贴 |

**代码不在这里**，在模块的唯一位置 `../../src/finstruct/parse/`。
D2 是**交付物目录**，不是代码的第二份拷贝——避免同一份代码两处漂移。

### 为什么仓库里不放原始 PDF

团队数据规则写着「不二次分发原始文件」，而本仓库是**公开仓库**。
宗博文的 fixture 也是同样做法（只留 `source_url` + `source_hash`）。
所以原始 PDF 由 `fetch_samples.py` 按需取回，取回后自动校验 sha256。

---

## 二、三份样例的来源与核验

三份都来自宗博文 D1 的 fixture，直接从巨潮资讯取的公开披露文件：

| 样例 | 公司 | 事件 | 来源哈希与 fixture 一致 |
| --- | --- | --- | --- |
| `D1-PLD-001` | 北京万集科技 | 股份质押 | ✓ |
| `D1-EQC-001` | 南京诺唯赞 | 减持结果 | ✓ |
| `D1-AWD-001` | 武汉华康洁净 | 项目中标 | ✓ |

**三份的 sha256 与宗博文 fixture 里记录的 `source_hash` 逐一核对一致**，
说明解析输入与评测 fixture 是同一份文件，`file_sha256` 可以沿链对上。

---

## 三、D2 实测发现的真问题（这条比交付本身重要）

### 问题：表格会让块级出处失去自洽性

D1 的解析器在自造的样例（竞赛通知，**没有表格**）上区域重建一致率 100%。
换成真实公告后，`pledge-001` 掉到 **81.8%**，第 1 页 **68 个字符被两个以上的块重复覆盖**。

**根因**：行聚类容差（中位字高 × 0.6）在表格里会把相邻两行并成一行，于是块的
外接矩形互相压住。实测：

```
01_b00034   y = 660.0 – 673.4   「本次质押前 本次质押后 已质押股份」
01_b00035   y = 665.9 – 679.2   「股东名 持股数量 持股比例 …」
                                  ↑ 重叠 7.5pt
```

这是股权质押情况表的**多行表头**。不是调参数能解决的，必须按表格自己的几何来切。

### 修法：把「全页字符一起聚类」改成「每个字符归属唯一所有者」

```
表格单元格先占位  →  source_type = "cell"，带 table_ref={table_id, cell_id, row, col}
表格内未归入单元格的字符  →  按行兜底，source_type = "table"，标 degraded
其余字符  →  段落聚类，source_type = "paragraph"
```

单元格之间互不重叠（pdfplumber 的 `cells` 平铺整张表），flow 字符是它的补集，
因此「每个字符恰好被一个块拥有」是**构造保证**的，不再依赖容差调参。

**结果**：

| 指标 | 修前 | 修后 |
| --- | --- | --- |
| 段落×段落重叠（真 bug） | 68 字 | **0** |
| 丢字 | 0 | **0** |
| 区域重建一致（pledge） | 81.8% | **98.9%** |
| 区域重建一致（equity-change / award） | 100% / 100% | **100% / 100%** |

### 遗留（D3 的活）

`pledge-001` 还有 **1 个块**区域重建不一致，是表格里未归入单元格的表头字符兜底分组后
文本乱序所致。这类块已标 `degraded: true`，并在 `quality.warnings` 里如实记录：

> page 1: 表格内有 3 组字符未能归入检出单元格，已按行兜底（source_type=table，degraded=true），文本可能乱序

**D3 的「多层表头继承 + 合并单元格还原」正是要消掉这一类。** 在那之前，下游不应把
`source_type=table` 的块当作可靠的行级引文。

---

## 四、补齐的接口缺口

### 缺口 1：`source_type`（评测方要求，D1 完全没有）

宗博文的 `evaluation/D1/schemas/evidence.schema.json` 要求证据带 `source_type`
（`paragraph` / `table` / `cell` / `scan_region` / `document`），而他的指标定义写着：

> **证据命中率**：文档和页码、**段落、表格/区域分层统计**；只按相同数字搜索不算命中。

**分层统计就必须能区分来源类型。** D1 的扁平 block 做不到，D2 补上了。
注意它与 `source` 是**两个正交维度**：`source` 说的是"这段字怎么读出来的"
（TEXT_LAYER / OCR_OS / VLM），`source_type` 说的是"它在文档里是什么结构"。

### 缺口 2：`document_id` 要落在证据对象上

宗博文的证据结构要求 `document_id` 必填。D2 起每个块自带 `doc_id`——
块被单独摘出来传递时仍知道属于哪份文件。

### 缺口 3：三家字段名不同，没人给出对照

| 概念 | 解析（本模块） | 魏文宇（抽取契约） | 宗博文（评测契约） |
| --- | --- | --- | --- |
| 页面区域 | `region` | `region` | `bbox` |
| 原文引文 | `text_raw` | `quote` | `excerpt` |
| 文档标识 | `doc_id` | `source.file_id`（`sha256:…` 形态） | `document_id` |
| 结构类型 | `source_type` | （未定义） | `source_type` |
| 表格定位 | `table_ref.table_id` | （未定义） | `table` |
| 单元格定位 | `table_ref.cell_id` | （未定义） | `cell` |

D2 起输出顶层 `handoff.field_aliases` 把这张表固化下来，下游不用猜。

---

## 五、已验证到什么程度

| 检查项 | pledge | equity-change | award |
| --- | --- | --- | --- |
| JSON Schema 严格校验（`evidence.v0.3`） | ✓ | ✓ | ✓ |
| 区域重建一致 | 94/95 = 98.9% | **58/58 = 100%** | **75/75 = 100%** |
| 丢字 | 0 | 0 | 0 |
| 段落×段落重叠（真 bug） | 0 | 0 | 0 |
| 页码/区域齐全 | ✓ | ✓ | ✓ |
| 非文本页如实降级 | — | p4 MIXED | p4 MIXED |

回归用例：**42 条全绿**（模块内）。其中 **16 条专测这三份真实公告** —— 见下。

### 关于回归保护

D2 新写了 `table_detect` 和「字符归属唯一所有者」的整套逻辑，改动量很大，
但原来的 26 条用例全部跑在 D1 那份**无表格**的竞赛通知上 ——
等于表格这条代码路径一行保护都没有，改一下聚类容差就可能悄悄破坏三份真实公告的解析。

D2 补了 16 条针对真实公告的用例（自检 / schema / 字符守恒 / block_id 稳定 / source_type / 表格检出）。
它们会自动探测 `raw/*.pdf`：**跑过 `fetch_samples.py` 的人自动获得这份保护，没有文件时整组 skip**，
模块仍保持自包含。

---

## 六、怎么复现

```bat
:: 在仓库根目录执行

:: 1) 取回原始 PDF（会自动校验 sha256）
cd sample\D2
python fetch_samples.py
cd ..\..

:: 2) 用模块解析
set PYTHONPATH=src
python -m finstruct.parse.parse_pdf sample\D2\raw\pledge-001.pdf -o sample\D2\parse\pledge-001.parse.json

:: 3) 验证
python tools\check_evidence.py   sample\D2\parse\pledge-001.parse.json sample\D2\raw\pledge-001.pdf
python tools\validate_schema.py  sample\D2\parse\pledge-001.parse.json
python -m pytest tests -q
```

---

## 七、需要别人确认的两件事

> 已经写成可直接粘贴的形式，见 [`docs/给群里的回复.md`](docs/给群里的回复.md)。

1. **给魏文宇**：你 D1 的 mock `pledge_sample_01.parse.json` 有 4 处不符合解析侧的
   结构（`/doc` 缺 `parser`；`doc_id` 少了 `d` 前缀；`/quality` 缺 `degraded` 与 `warnings`）。
   如果陈家浩按 schema 校验去消费它，会直接挂。第 5 处（`parse_meta.blocks`）是我的问题，
   你已在 D2 修好契约，我已跟着放开。
2. **给宗博文**：你在接口对接报告里点名要我确认「provenance、block_id、region 和
   **表格定位能力**」。D2 的答复就是这份交付：`source_type` 已补，
   单元格定位用 `table_ref={table_id, cell_id, row, col}`；同时如实报告
   **表头兜底这一类还没做干净，是 D3 的活**。
