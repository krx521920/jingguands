# D6 块级解析（回应宗 W3）· 2026-10-07

## 背景

`runs/D9-parses-map.json` 的 D6 条目原指 `corpus/zongbowen/d6/raw/*.raw.json`。
raw 文件**本身有完整块级结构**（`pages[].blocks[].block_id / source_type / table_ref /
header_path`），但 `handoff.source.parse_meta.blocks` 是六键简约版——只读 handoff 路径的
复核工具拿不到锚定三键，宗的 D9 块级复核因此有 3 个 D6 侧做不了（"raw 层没有块号"的
实际含义）。

## 本目录内容

D6 全部 10 份的块级解析（`D6-AWD-001~010.parse-blocks.json`，块数分别为
27/47/82/78/80/13/10/24/40/31），每份为对应 `corpus/zongbowen/d6/raw/*.raw.json`
的 `pages[].blocks` **全保真拷贝**（无任何字段删改）。

每份文件**双路径可读**（两种读取习惯都能拿到块号与三键）：
- `pages[].blocks`：逐块全保真
- `handoff.source.parse_meta.blocks`：同一数组的拷贝

生成方式（可复现）：`node scripts/jingguan/emit_block_parses.mjs --d6`

## 宗复核口径（按新 map 应能全覆盖）

v0.2 报告（`runs/D9-rules-report-v02-20261005.json`）35 侧的分域核验结果：

| 侧类别 | 份数 | 块级核验 | 说明 |
|---|---|---|---|
| D4/D5/D6 真实文档侧 | 30 | ✅ 全部可核（D6 8 侧已对 parse-blocks 验证 quote∈block 通过；D4/D5 走 parse-official） | |
| `SYNTH-CTRL-01-A/B`、`SYNTH-CTRL-02-A/B` | 4 | **设计上不可核** | 受控构造（`synthetic_controlled: true`），block_id 为 `synth-a` 等占位符，quote 以"（受控构造）"开头，无真实文档 |
| `pledge-scan-degrade` | 1 | **设计上不可核** | 全页扫描降级控制件：14 字段全 unreadable、quote/block_id 均为 null（D9-RULE-017 即测"不得据空缺下结论"） |

即：**可核侧 30/30 全覆盖；5 个合成/降级侧为设计使然不可核**，上表即"无法覆盖清单与原因"。

## 与张 Z1 的关系

张的 Z1 会把 D6 三类的官方 `parse-official` 入库；届时 `runs/D9-parses-map.json` 可改指
官方件复核（预期一致：本目录文件与其同源于张的解析器）。在此之前，宗按本目录复核即可全覆盖。
