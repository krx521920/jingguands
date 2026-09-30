# finstruct · 文档解析与出处

**张智博**负责的「文档解析与表格还原」模块。把一份 PDF 变成**带出处的结构化中间表示**，
交给下游的抽取层锚定字段、展示层高亮原文。

> **分支**：`zhangzhibo`　**结构版本**：`evidence/0.9`
> **已对齐**：魏文宇的抽取契约 `interface/event-envelope.schema.json` v0.3；
> 宗博文的证据结构 `evaluation/D1/schemas/evidence.schema.json` v0.1

一句话概括价值：**下游拿到的每一个字段，都能顺着这里给的坐标回到原文那一页、那一块、那个单元格。**

---

## 一、在链路里的位置

```
原始 PDF
   │
   ▼  src/finstruct/parse/  ← 本模块
   │     pages[].blocks[]  →  block_id / page / region / text_raw
   │     table_ref          →  table_id / cell_ref / header_path
   ▼
scripts/jingguan/run_extract.mjs   ← 抽取层（魏文宇，Node）
   │     EventEnvelope
   ▼
方轩诚标准化 → 陈家浩页面 → 宗博文评测
```

跨语言：本模块是 Python，抽取层是 Node，**只通过 JSON 文件交互**。

输出的顶层有 `handoff` 段，抽取层不需要猜字段名：

```json
"handoff": {
  "source": { "file_id": "sha256:…", "file_name": "…", "file_sha256": "…",
              "parse_meta": { "parser_version": "finstruct.parse/0.6.0", "page_count": 2 } },
  "provenance_from_block": {
    "block_id": "block.block_id",  "page": "block.page",
    "region":   "block.region",    "quote": "block.text_raw",
    "table":    "block.table_ref.table_id", "cell": "block.table_ref.cell_ref"
  },
  "field_aliases": { "region": {"parser":"region","wei":"region","zong":"bbox"}, "…": "…" }
}
```

`field_aliases` 是三方字段名对照表（本模块 / 魏 / 宗），避免各自猜。

---

## 二、目录结构

```
src/finstruct/
├── README.md                    ← 本文件
├── docs/
│   ├── D1_出处结构说明.md         D1 交接说明（接口、坐标系、边界）
│   └── 契约对齐报告_D1.md         D1 给全队的对齐报告（含发现的契约问题）
└── parse/
    ├── evidence.py              出处结构的唯一定义处（枚举、id、handoff、自检）
    ├── doc_form.py              逐页形态判定 TEXT / SCANNED / MIXED
    ├── text_layer.py            文本层抽取、行聚类、段落切分、阅读顺序、单元格归属
    ├── table_detect.py          表格区域、单元格切分、多层表头（header_path）
    ├── table_link.py            跨页续表标注
    ├── columns.py               分栏检测（栏缝 / 整幅行分段 / 按栏拆行）
    ├── scan.py                  扫描件降级路径（OCR 入口 + 不可读区域）
    └── parse_pdf.py             命令行入口
```

模块外的相关位置：

```
schemas/evidence.v0.9.json      ← 当前出处结构契约（JSON Schema）
schemas/archive/                ← 历史版本（冻结交付物按当时版本校验）
tools/                          ← check_evidence / validate_schema / verify_evidence
                                   render_text / build_manifest
tests/test_parse.py             ← 51 条回归用例
sample/附件1通知.*               ← D1 样例（竞赛通知，无表格）
sample/D2/                      ← D2 交付（冻结，evidence/0.3）
sample/D3/                      ← D3 交付（evidence/0.6）
requirements.txt
```

---

## 三、怎么跑

```bat
:: 在仓库根目录执行
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

set PYTHONPATH=src
python -m finstruct.parse.parse_pdf sample\附件1通知.pdf -o outputs\out.json
python tools\check_evidence.py    outputs\out.json sample\附件1通知.pdf
python tools\validate_schema.py   outputs\out.json
python tools\verify_evidence.py   outputs\out.json sample\附件1通知.pdf
python -m pytest tests -q
```

建议 Python 3.10–3.12。**依赖全部跨平台**，没有一条路径依赖特定操作系统。

**改完解析一定要跑 `tools/build_manifest.py <目录>`** —— manifest 里的页数/块数/类型分布
都是派生值，手工维护必然变陈旧（D3 期间就发生过：数据已是 `0.5`/127 块，manifest 还写着 `0.3`/95 块）。

---

## 四、当前状态

| 检查项 | 结果 |
| --- | --- |
| JSON Schema 严格校验 | **完全合规**（三份真实公告 + D1 样例） |
| 结构自检（字段完整、region 顺序、id 唯一、reading_order 一致） | 通过 |
| **区域重建一致率**（region 里装的就是它声称的文字） | **127/127 · 61/61 · 75/75 = 100%** |
| 字符守恒（无丢字、无段落×段落重叠） | 通过 |
| 回归用例 | **79 条全绿**（15 条 D3 质押 + 6 条分栏 + 5 条扫描降级 + 5 条合并单元格/渲染） |
| 表格单元格切分 | 150 个，全部归属单元格，兜底块 0 |
| 多层表头 `header_path` | 106 个非空 |
| 跨页续表 | 检出 2 张（1 张含碎片单元格） |
| 扫描降级 | 扫描页产出带坐标的 `scan_region` 块；落款页可读文本不再被丢弃 |
| 合并单元格 | `rowspan`/`colspan` + `covers`（覆盖位置）；值继承不必下游推行列网格 |
| 分栏 | 双栏 fixture 正确分栏；13 份真实文档零误报 |

### 已知边界（诚实标注）

1. **扫描件只降级、不识别。** `SCANNED` 页会产出**带坐标**的 `source_type=scan_region`
   降级块（`degraded=true`、`missing_reason=NOT_PARSED`、`text_raw` 为空），
   展示层可据此框出"这块读不了"。OCR 入口（`scan.try_ocr`）已存在但明确返回不可用，
   D5+ 接入真实通道时只替换该函数。**非 TEXT 页上仍可读的文本照常产出**，不再整页丢弃。
2. **分栏检测只处理竖向栏缝**，不处理同栏内嵌套分栏；表格横跨栏缝时不切栏并给警告。
3. **续表只打标、不自动拼接。** 怎么拼取决于语义（同一单元格的延续 vs 恰好同列的两个
   不同值），解析层不替下游决定。消费方读 `table_ref.continues` 自己拼。
4. **无框表格检不出。** `find_tables()` 依赖绘制线，纯 stream 模式的表格会漏。
5. **表头行判定是启发式**：前导行中「值型单元格 ≤1」即表头行，上限 3 行。
   若某张表的表头里含 ≥2 个纯数字单元格会被误判。
6. **「1.xxx」编号段落不识别为标题**，只认「一、」「(一)」。正文里也常用这种编号，
   误判代价高于漏判 —— 刻意取舍。
7. **页眉页脚的跨页重复判定尚未实现**，目前只按页面上下 8% 的几何位置判定。

---

## 五、出处结构速览

```json
{
  "block_id":    "d116fbfae_p001_b00003",
  "doc_id":      "d116fbfae",
  "page":        1,
  "source_type": "paragraph",
  "role":        "BODY",
  "text":        "为贯彻落实《教育强国建设规划纲要(2024一2035年)》及三年行动计划，",
  "text_raw":    "为贯彻落实《教育强国建设规划纲要(2024一2035年)》及三年行动计划，",
  "region":      [111.0, 163.78, 505.2, 175.78],
  "table_ref":   null,
  "source":      "TEXT_LAYER"
}
```

**坐标系**（在 `doc.coord_system` 里显式声明，下游必须按它换算）：

| 项 | 值 |
| --- | --- |
| 单位 | PDF point（1 pt = 1/72 英寸） |
| 顺序 | `[left, top, right, bottom]` |
| 原点 | 页面**左上角**，y 轴向下为正 |
| 换算 | `屏幕坐标 = region / [page.width, page.height] × 显示尺寸` |

**七条硬约束**：

1. `region` 必填 —— 取不到坐标的块不允许产出（禁止事后按数字搜索补出处）
2. `text_raw` 必填 —— 契约要求引文是原文子串，**取它而不是 `text`**（`text` 跨行会补空格）
3. `source_type` 必填 —— `paragraph` / `table` / `cell` / `scan_region` / `document`；
   评测方的证据命中率要**按段落、表格/区域分层统计**，靠这个字段区分
4. `source` 必填 —— 标明这段字"怎么读出来的"（TEXT_LAYER / OCR_OS / VLM）。
   它与 `source_type` 是**两个正交维度**
5. `doc_id` 由 `file_sha256` 派生，**不用文件名** —— 防同名串证据；且每个块自带
6. 表格单元格以 `source_type=cell` 的块交付，`table_ref` 带
   `{table_id, cell_id, cell_ref, row, col, rowspan, colspan, header_path}`；
   `tables[]` 只留元数据，**同一内容不放两处**
7. 合并单元格**只写覆盖位置（`covers`），不复制文本** —— 复制会让同一字符被两个块拥有，
   破坏字符守恒。需要值继承的消费方按 `covers` 查，或直接用 `tools/render_text.py` 的渲染
8. **禁止事后按数字搜索补出处** —— 出处随字符在解析时生成，三组回归用例把它钉死
   （同页同文字必得不同出处 / 出处覆盖 100% 的块 / 区域自洽）

---

## 六、变更记录

| 日期 | 天 | 内容 |
| --- | --- | --- |
| 2026-09-27 | D1 | 出处结构 `evidence/0.1` 定稿；文本层解析；首行缩进段落切分；逐页形态判定；13 条回归 |
| 2026-09-27 夜 | D1 | **对齐全队契约**：`bbox`→`region`、新增 `text_raw`/`file_id`/`handoff`/`coord_system`；升 v0.2；新增 schema 严格校验；13→22 条 |
| 2026-09-28 | D2 | **修「表格破坏块出处」**：改成「每个字符归属唯一所有者」（单元格先占位）＋表格检测；新增 `source_type`/`doc_id`；`handoff.field_aliases`；升 v0.3；22→26 条 |
| 2026-09-28 收尾 | D2 | 补 **16 条真实公告回归**（原来表格代码路径无保护）；`verify_evidence` 按 `source_type` 上色 + `--dpi/--no-overview`；26→42 条 |
| 2026-09-29 | D3 | **输出 `cell_ref`** 对齐魏的契约（原先是 `cell_id`，他读不到会静默丢成 null）；**修正行号推导**（原用 pdfplumber 重叠的 `t.rows` 边界，会把第 2 行误判成第 1 行）；升 v0.4 |
| 2026-09-29 | D3 | **多层表头绑定**：`header_path` + `rowspan`/`colspan`；**修 `cell_id` 跨表撞车**（D2 那个 94/95 的根因，t002 覆盖了 t001 的 c001–c035）；升 v0.5；42→47 条 |
| 2026-09-29 | D3 | **跨页续表标注**：`continued_from` + 碎片单元格 `continues`；**「禁止反查」的回归证明**；`schemas/archive/` 留档历史版本；升 v0.6；47→51 条 |
| 2026-09-29 | D3 | **分栏检测**：`page.columns` + 「整幅行分段、段内逐栏」阅读顺序；新增 `columns.py` 与合成双栏 fixture；升 v0.7；51→56 条 |
| 2026-09-30 | D4 | **扫描件降级区域**：`scan_region` 带坐标降级块 + OCR 入口；非 TEXT 页的可读文本不再整页丢弃；检查器覆盖非 TEXT 页；升 v0.8；56→73 条 |
| 2026-09-30 | D4 | **合并单元格值继承**：`covers` 只写位置不复制文本；纯文本改按行渲染带列名（原一格一行，模型无法判断值的列归属）；升 v0.9；73→**79 条** |
