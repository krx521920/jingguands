# sample · 解析交付物与样例

这个目录放三类东西，**性质不同，更新策略也不同**：

| 位置 | 性质 | 是否随代码更新 |
| --- | --- | --- |
| `附件1通知.*` | **D1 样例**，同时是模块自测用的 fixture | ✅ **跟着代码走** —— 改了解析器就要重新生成，否则自测用例会校验过时的输出 |
| `D2/` | **D2 交付，已冻结** | ❌ 不动。结构版本 `evidence/0.3`，按 `schemas/archive/evidence.v0.3.json` 校验 |
| `D3/` | **D3 交付** | ❌ 完成后同样冻结。结构版本 `evidence/0.6` |

## 为什么要分 D2 / D3

团队惯例是**只追加、不覆盖**（魏文宇用 `runs/<时间戳>/`，宗博文用 `evaluation/D1/`+`evaluation/D2/`）。
覆盖旧交付会让基线对比失去参照 —— 宗博文的评测需要拿固定的一版做对照。

所以 D3 重新解析时没有覆盖 `sample/D2/`，而是从 git 恢复了 D2 那版、另开 `sample/D3/`。

## 原始 PDF 不入库

`D2/` 与 `D3/` 里各有自己的 `fetch_samples.py` 与 `.gitignore`（忽略 `raw/`）。
原始公告 PDF 不进仓库：团队规则「不二次分发原始文件」，且本仓库是公开仓库。

```bat
cd sample\D3
python fetch_samples.py          :: 按 manifest 里的 source_url 取回，自动校验 sha256
```

## 结构版本对照

各版的结构版本记在各自的 `manifest.json` 里，也在每个解析 JSON 的顶层 `schema_version`。
**冻结版按它当时的 schema 校验**，旧 schema 留在 `schemas/archive/`：

```bat
:: 当前版
python tools\validate_schema.py sample\D3\parse\pledge-001.parse.json

:: D2 冻结版（要用归档的 schema）
python tools\validate_schema.py sample\D2\parse\pledge-001.parse.json schemas\archive\evidence.v0.3.json
```
