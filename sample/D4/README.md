# D4 交付：十份真实质押公告的解析/出处包

> **交付人**：张智博　**分支**：`zhangzhibo`　**日期**：2026-09-30（D4）
> **任务**：处理合并单元格/续表；增加扫描件识别入口或明确无法读取，失败降级区域
> **交付**：复杂表格解析 ＋ 扫描降级路径
> **结构版本**：`evidence/0.9`
> **对齐目标**：`evaluation/D4/dev/manifest.json`（宗博文的 D4 十份质押挑战集）

---

## 一、交付内容

| case_id | 公司 | 页 | 块 | 表 | 单元格 | 合并 | 区域重建 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `D4-PLD-001` | 万集科技 | 2 | 128 | 3 | 100 | 10 | 100% |
| `D4-PLD-002` | 兰石重装 | 2 | 88 | 2 | 57 | 9 | 100% |
| `D4-PLD-003` | 联创电子 | 3 | 111 | 2 | 79 | 9 | 100% |
| `D4-PLD-004` | 中国天楹 | 2 | 105 | 2 | 79 | 9 | 100% |
| `D4-PLD-005` | 光线传媒 | 2 | 79 | 3 | 57 | 0 | 100% |
| `D4-PLD-006` | *ST春天 | 2 | 95 | 4 | 66 | 0 | 100% |
| `D4-PLD-007` | 坤彩科技 | 2 | 187 | 2 | 156 | 9 | 100% |
| `D4-PLD-008` | 立航科技 | 3 | 93 | 2 | 68 | 9 | 100% |
| `D4-PLD-009` | 宏发股份 | 3 | 96 | 3 | 75 | 9 | 100% |
| `D4-PLD-010` | 博迁新材 | 3 | 103 | 2 | 79 | 9 | 100% |

`D4-PLD-001..005` 与 `sample/D3/` 同源（宗博文 manifest 以 `source_case_id` 标注），
本目录用当前版本重新解析，故版本一致但**块数可能与 D3 目录不同**（D3 是当时冻结的版本）。

目录：`parse/` 解析结果、`text/` 纯文本版、`evidence/` 验证图、
`fetch_samples.py` 取 PDF（PDF 不入库）、`manifest.json` 来源与派生统计。

---

## 二、D4 做的三件事

### 1. 扫描件降级区域（任务核心）

非文本层页面不再整页产出空块，而是给出**带坐标**的不可读区域：

```json
{ "source_type": "scan_region", "region": [0, 0, 596, 842],
  "degraded": true, "missing_reason": "NOT_PARSED", "text": "", "text_raw": "" }
```

展示层据此能在页面上把「这块读不了」框出来，而不是只能说「这页读不了」。

**与宗博文 `evaluation/D4/dev/scan/D4-SCAN-001.expected.json` 逐字段核对一致**
（`page_form` / `source_type` / `degraded` / `missing_reason` / `text_raw` 五项全中）。
OCR 入口 `scan.try_ocr` 存在但明确返回不可用，D5+ 接真实通道只需替换该函数。

**顺带修掉一个真问题**：非 TEXT 页上的可读文本原先被整页丢弃。
`equity-change-001` p4 是落款页（43 个字符），早期实现把它全扔了。
诚实降级 = 标注读不了的部分，**不是丢弃读得了的部分**。

### 2. 合并单元格的值继承

跨行合并的值（如「股东名称」）用 `covers` 写出它覆盖的其它位置：

```json
{ "cell_ref": "r2c1", "rowspan": 3,
  "covers": [{"row": 2, "col": 0, "cell_ref": "r3c1"},
             {"row": 3, "col": 0, "cell_ref": "r4c1"}] }
```

**只写位置、不复制文本** —— 复制会让同一字符被两个块拥有，破坏字符守恒与区域重建。

### 3. 纯文本按行渲染

`tools/render_text.py`：表格按**行**渲染、每格带列名（优先 `header_path`），
合并单元格的值在被覆盖的每一行重复。`scan_region` 显式标出。

原先是「一条块一行」，一个表格行散成 11 行裸值 —— 模型无法判断哪个数属于哪一列。

---

## 三、D4 修掉的两个真 bug

### bug 1：居中行无条件合并，把页码吞进正文段落

`cluster_blocks` 的居中分支写死 `new = False`，**完全跳过间距判据**。
`D3-PLD-002` p1 的正文（y=632）被并进页面底部页码（y=798），相隔 166pt 却合成一块，
`region` 从 632 拉到 808 白装整片表头 —— 一致率掉到 98.9%。

### bug 2：单列「表格」是正文被误检

`D4-PLD-009` p3 是 99.0%。根因：pdfplumber 把该页正文章节判成 **4 行×1 列**的表格，
其"行"正好是正文四行。该行字符被当表格处理，而「，」的字符中心恰好落在表格右边界
505.3 上，**浮点擦边没被认领** → 掉回正文流单独成行 → 单字符块。

修：表格检测增加 `n_cols >= 2`。实测全部文档仅此 1 张单列假表，真表格都是 2–11 列。

---

## 四、验证结果

| 检查项 | 结果 |
| --- | --- |
| JSON Schema 严格校验 | 10/10 完全合规 |
| **区域重建一致率** | **10/10 = 100%** |
| 字符守恒（无丢字、无段落×段落重叠） | 达标 |
| 来源 sha256 与宗博文 manifest | 10/10 一致 |
| `doc_id` 与宗博文 manifest 预留值 | 10/10 一致 |
| 扫描挑战 D4-SCAN-001 期望值 | **逐字段一致** |
| 回归用例 | **81 条全绿** |

---

## 五、怎么复现

```bat
cd sample\D4
python fetch_samples.py          :: 按 source_url 取回 10 份并校验 sha256
cd ..\..
set PYTHONPATH=src
python -m finstruct.parse.parse_pdf sample\D4\raw\D4-PLD-009.pdf -o sample\D4\parse\D4-PLD-009.parse.json
python tools\check_evidence.py   sample\D4\parse\D4-PLD-009.parse.json sample\D4\raw\D4-PLD-009.pdf
python tools\validate_schema.py  sample\D4\parse\D4-PLD-009.parse.json
python tools\render_text.py      sample\D4\parse\D4-PLD-009.parse.json -o sample\D4\text\D4-PLD-009.txt
python tools\build_manifest.py   sample\D4
python -m pytest tests -q
```

---

## 六、已知边界

1. **续表只打标、不自动拼接**（`continued_from` + `continues`），拼接交消费方。
2. **无框表格检不出**（依赖绘制线）。
3. **分栏只处理竖向栏缝**；表格横跨栏缝时不切栏并给警告。
4. **表头行判定是启发式**（前导行中值型单元格 ≤1，上限 3 行）。
5. **扫描件只降级、不识别** —— OCR 通道为 D5+ 预留。
6. **`D4-PLD-008` p3 是 MIXED 页**（文本层稀疏），已按可读部分产出。
7. **双栏正例是合成 fixture**，13 份真实文档全是单栏。
