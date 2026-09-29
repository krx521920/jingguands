# 历史结构版本

冻结的历史交付物按它**当时**的结构版本校验，所以旧 schema 必须留档 ——
否则旧交付物变成无法验证的孤儿。

| 版本 | 用在 | 说明 |
| --- | --- | --- |
| `evidence.v0.3.json` | `sample/D2/`（已冻结） | D2 交付时用的是这一版。校验：`python tools/validate_schema.py sample/D2/parse/pledge-001.parse.json schemas/archive/evidence.v0.3.json` |

`v0.1` / `v0.2` 是仓库建立之前的本地迭代版，未入库；如需可从未公开的本地历史取。
