"""用 JSON Schema 严格校验解析输出（D1 起纳入回归）。

对应团队指标「输出格式合规率 100%」：不合规的输出必须被拦住，
而不是当成功结果交出去。

用法：
    python tools/validate_schema.py sample/附件1通知.parse.json [schemas/evidence.v0.2.json]

退出码：0 = 合规；1 = 有错误。
"""
from __future__ import annotations

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_SCHEMA = os.path.join(HERE, "..", "schemas", "evidence.v0.2.json")


def validate(doc_path: str, schema_path: str | None = None) -> int:
    try:
        import jsonschema
    except ImportError:
        print("需要 jsonschema：pip install jsonschema", file=sys.stderr)
        return 2

    schema_path = schema_path or DEFAULT_SCHEMA
    schema = json.load(open(schema_path, encoding="utf-8"))
    doc = json.load(open(doc_path, encoding="utf-8"))

    validator = jsonschema.Draft202012Validator(schema)
    errs = sorted(validator.iter_errors(doc), key=lambda e: list(e.path))

    print(f"结构版本 : {doc.get('schema_version')}")
    print(f"校验用   : {os.path.basename(schema_path)}")
    if not errs:
        n_blocks = sum(len(p.get("blocks", [])) for p in doc.get("pages", []))
        print(f"结果     : ✓ 完全合规（{len(doc.get('pages', []))} 页 / {n_blocks} 块）")
        return 0

    print(f"结果     : ✗ {len(errs)} 处不合规")
    for e in errs[:20]:
        loc = "/".join(str(x) for x in e.path) or "(根)"
        print(f"  ✗ /{loc}")
        print(f"      {e.message[:150]}")
    if len(errs) > 20:
        print(f"  … 另有 {len(errs) - 20} 处")
    return 1


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    return validate(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)


if __name__ == "__main__":
    raise SystemExit(main())
