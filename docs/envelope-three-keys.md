# 信封三键方案说明（parse_meta.blocks 的 source_type / table_ref / header_path）

> 魏文宇｜2026-10-10｜回应队友任务分配"方案说明（含信封三键）"
> 变更来源：D12-W1（宗待办，weiwenyu 7282b2b9）；本文是它的正式方案文档。

## 一、三键是什么、在哪

每个事件信封（v0.3）的 `source.parse_meta.blocks[]` 是**逐块全保真投影**（与输入解析
JSON 的 `pages[].blocks` 同源，无删改）。其中三个键是**块级锚定信息**：

| 键 | 值域 | 语义 |
|---|---|---|
| `source_type` | `"paragraph"` / `"cell"` / `"scan_region"` / …（解析器产出） | 该块的来源形态——段落文本还是表格单元格 |
| `table_ref` | `null` 或对象（含 `table_id/row/col/cell_ref/covers` 等） | 非表格块恒 `null`；cell 块携带表格定位 |
| `header_path` | `null` 或字符串（如 `"合同签订日期/2025年5月/2025年7月"`） | 多层表头已拼全的列语义路径；cell 块才有，段落块恒 `null` |

投影代码：`run_extract.mjs` 的 `projectBlocks()`——六键简约版（block_id/page/role/text/
text_raw/region）＋上述三键。**降级路径（扫描件）同样下发**；纯文本模式（`--input txt`）
无解析层，`parse_meta.blocks = null`。

## 二、为什么要加（问题背景）

v0.2 起信封内嵌块走 handoff 的六键简约版——**下游拿不到锚定三键**。后果实测：
方 D7 标准化审计在信封侧判出 76 处 UNIT_MISSING，其中 **71 处是误判**（他判不出单元格
表头锚，误以为"无锚"）；宗的 D9 块级复核有 3 个 D6 侧"做不了"。修法二选一（宗 W1 给的
选项）：三键随信封下发，或文档定死"下游一律回原始解析文件（parses-map）"。**已实施前者**
——下游不再必须回源文件才能判锚。

## 三、适用条件（什么时候有什么值）

| 输入形态 | `parse_meta.blocks` | 三键情况 |
|---|---|---|
| 解析 JSON（evidence/0.2…0.9，`--parse`） | 全保真块数组 | 段落块：`source_type=paragraph`，`table_ref/header_path=null`；cell 块：三者有值（`header_path` 取块自带或 `table_ref.header_path`） |
| 扫描降级件 | 块数组（多为 scan_region） | 如实投影，通常无可读文本 |
| 纯文本（`--input txt`） | `null` | 不适用——文本模式无块概念 |

**首测数据实况**（D12-A 批 31 信封）：D4-PLD-001 的 128 块全部带 `source_type`，90 块带
`header_path`，100 块带 `table_ref`（其余为 null）——即约七成块在表格语境里。

## 四、与现有字段/查询的关系（关键：别查错地方）

| 你要查 | 去哪查 | 区别 |
|---|---|---|
| 某字段值的证据定位 | `events[].fields[].provenance[]`（`block_id/page/quote/table_id/cell_ref/source_type`） | **字段级**证据，直接消费 |
| 某块的表头语义／是否表格 | `source.parse_meta.blocks[]` 按同一 `block_id` 查三键 | **块级**语境，判锚/归因用 |
| 全保真原始解析 | 输入解析 JSON 本体（或 `evaluation/D9/parses-blocks/`、`corpus/**/parse-official/`） | 需要解析层全部字段（如 region 精度、ocr_confidence）时 |

两处 `source_type` 的关系：provenance 里的 `source_type` 是**该证据引用的块**的形态快照；
`parse_meta.blocks` 的是块全集。同一 block_id 两处一致（同一次投影写入）。

## 五、下游消费指引

- **归因/标准化（方）**：判单元格锚用 `header_path`（强锚）与 `table_ref`（表锚）——
  方案 C 分层里 cell 三重→strong、块级 header_path→medium 的判定基础；从信封直读即可，
  不必再走 parses-map。
- **页面（陈）**：表格字段展示列语义时可挂 `header_path`；"该证据来自表格还是段落"用
  `source_type`。注意 **null 是合法值**（段落块），不要把 null 渲染成异常。
- **复核（宗）**：`quote ∈ block` 的块内容核验用 `text_raw`；锚定核验用三键。

## 六、边界与已知项

1. **老信封没有三键**：D12-W1 之前产出的信封（含首测冻结的 `firsttest-envelopes/`）仍是
   六键简约版——它们是**冻结证据**，不重造。新批次（D12 起所有 runs/batch-*）都带三键。
   消费方对旧信封需回 parses-map（这正是宗 W1 的兼容选项，两条路径并存）。
2. **键值域由解析器决定**：三键的取值（如 source_type 的枚举）来自张的解析产物，信封
   只做忠实投影、不自造值（W4 枚举纪律）。
3. **体积影响**：实测最大信封约 +14%（D5-EQC-002 +85KB/624KB），全批 +约 3MB，可接受。
