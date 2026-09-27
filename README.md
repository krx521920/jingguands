# wei-core

比赛核心代码区。本目录由 **张智博** 负责的「文档解析与表格还原」模块填充。

> **分支**：`zhangzhibo`
> **当前进度**：D1（2026-09-27）
> **结构版本**：`evidence/0.2`（已对齐全队公共契约 `interface/event-envelope.schema.json` v0.1）

---

## 一、这一层做什么

把一份 PDF 变成**带出处的结构化中间表示（IR）**，交给下游的抽取层锚定字段、展示层高亮原文。

一句话概括价值：**下游拿到的每一个字段，都能顺着这里给的坐标回到原文那一页、那一块、那个单元格。**

### 与全队契约的关系

```
interface/event-envelope.schema.json   ← 全队公共契约（魏文宇，D1 冻结）
                ▲
                │ 我提供 provenance 的四个字段 + source 对象
                │
   wei-core/（本目录，张智博）
        │  pages[].blocks[]  →  block_id / page / region / text_raw
        ▼
   scripts/jingguan/run_extract.mjs     ← 抽取层（Node）
```

契约侧要求的三处，本目录已全部对齐，并且在输出的顶层给出 `handoff` 段，抽取层**不需要猜字段名**：

```json
"handoff": {
  "source": { "file_id": "sha256:…", "file_name": "…", "file_sha256": "…",
              "parse_meta": { "parser_version": "finstruct.parse/0.2.0", "page_count": 4 } },
  "provenance_from_block": {
    "block_id": "block.block_id",
    "page":     "block.page",
    "region":   "block.region",
    "quote":    "block.text_raw"      ← 注意是 text_raw，不是 text
  }
}
```

**详细的对齐说明与发现的契约问题见 [`docs/契约对齐报告_D1.md`](docs/契约对齐报告_D1.md)。**

---

## 二、目录结构

```
wei-core/
├── README.md                        ← 本文件
├── requirements.txt                 ← 依赖（全部跨平台）
├── .gitignore
├── src/finstruct/parse/             ← 代码
│   ├── evidence.py                    出处结构的唯一定义处（枚举、id、region 合并、handoff、自检）
│   ├── doc_form.py                    逐页形态判定 TEXT / SCANNED / MIXED
│   ├── text_layer.py                  文本层抽取、行聚类、段落切分、阅读顺序
│   └── parse_pdf.py                   命令行入口
├── schemas/evidence.v0.2.json       ← 出处结构契约（JSON Schema）
├── tools/
│   ├── check_evidence.py              出处自洽性 + text_raw 子串校验
│   ├── validate_schema.py             用 JSON Schema 严格校验输出
│   └── verify_evidence.py             可视验证（把 region 画回页面图）
├── tests/test_parse.py              ← 22 条回归用例
├── docs/
│   ├── D1_出处结构说明.md             D1 交接说明（接口、坐标系、边界）
│   └── 契约对齐报告_D1.md             ← 给全队的对齐报告（含发现的契约问题）
├── sample/                          ← 解析样例与验证图
│   ├── 附件1通知.pdf                  输入：真实公文
│   ├── 附件1通知.parse.json           输出：4 页 71 块（evidence/0.2）
│   └── evidence_p1..p4.png            可视验证图
└── outputs/                         ← 跑出来的结果放这里（不进版本库）
```

---

## 三、怎么跑

```bat
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

set PYTHONPATH=src
python -m finstruct.parse.parse_pdf sample\附件1通知.pdf -o outputs\out.json
python tools\check_evidence.py  outputs\out.json sample\附件1通知.pdf
python tools\validate_schema.py outputs\out.json
python tools\verify_evidence.py outputs\out.json sample\附件1通知.pdf
python -m pytest tests -q
```

建议 Python 3.10–3.12。**依赖全部跨平台**，没有一条路径依赖特定操作系统。

---

## 四、当前状态（D1）

| 检查项 | 结果 |
| --- | --- |
| JSON Schema 严格校验 | **完全合规**（0 错误） |
| 结构自检（字段完整、region 顺序、id 唯一、reading_order 一致） | 通过 |
| **出处自洽率**（region 里装的就是它声称的文字） | **71/71 = 100%** |
| **`text_raw` 是原文子串**（契约硬要求） | **71/71 = 100%** |
| 回归用例 | **22 条全绿**（含 7 条契约对齐专项） |
| 形态判定 | 4 页全部正确判为 TEXT，判据留痕 |
| 段落切分 | 每页 17 / 14 / 22 / 18 块 |
| 章节标题识别 | 16 个全中，无误报 |

### 已知边界（诚实标注）

1. **只实现文本层通道。** `SCANNED` / `MIXED` 页面会被判定并如实降级（写进 `quality.degrade_reasons`），暂不产出块。OCR 双通道是 D4 的工作。
2. **分栏检测尚未实现。** 阅读顺序目前是单栏自上而下，多栏排版会交错读。D2/D4 补。
3. **表格重建尚未实现。** `tables` 为空数组，但单元格级结构已在代码里定义好，D3/D4 直接往里填。
4. **「1.xxx」编号段落不识别为标题**，只认「一、」「(一)」。正文里也常用这种编号，误判代价高于漏判，属刻意取舍。
5. **页眉页脚的跨页重复判定尚未实现**，目前只按页面上下 8% 的几何位置判定。

---

## 五、出处结构速览

```json
{
  "block_id":  "d116fbfae_p001_b00003",
  "page":      1,
  "role":      "BODY",
  "text":      "为贯彻落实《教育强国建设规划纲要(2024一2035年)》及三年行动计划，",
  "text_raw":  "为贯彻落实《教育强国建设规划纲要(2024一2035年)》及三年行动计划，",
  "region":    [111.0, 163.78, 505.2, 175.78],
  "source":    "TEXT_LAYER"
}
```

**坐标系**（在 `doc.coord_system` 里显式声明，下游必须按它换算）：

| 项 | 值 |
| --- | --- |
| 单位 | PDF point（1 pt = 1/72 英寸） |
| 顺序 | `[left, top, right, bottom]` |
| 原点 | 页面**左上角**，y 轴向下为正 |
| 换算 | `屏幕坐标 = region / [page.width, page.height] × 显示尺寸` |

**五条硬约束**：

1. `region` 必填——取不到坐标的块不允许产出（团队 D3：禁止事后按数字搜索补出处）
2. `text_raw` 必填——契约要求 `quote` 是原文子串，**quote 取它而不是 `text`**
3. `source` 必填——标明来自文本层 / 通道 A（离线 OCR）/ 通道 B（视觉大模型）
4. `doc_id` 由 `file_sha256` 派生，**不用文件名**——防同名串证据（团队 D10）
5. cell 级出处与 block 级**分开统计**，表格里的值必须能定位到行列

---

## 六、变更记录

| 日期 | 天 | 内容 |
| --- | --- | --- |
| 2026-09-27 | D1 | 出处结构 evidence/0.1 定稿；文本层解析；首行缩进段落切分；逐页形态判定；13 条回归 |
| 2026-09-27 夜 | D1 | **对齐全队契约**：`bbox`→`region`、新增 `text_raw` / `file_id` / `handoff` / `coord_system`；结构升 v0.2；新增 schema 严格校验；回归 13→22 条 |
