"""从解析结果重新生成 manifest 的派生字段，避免它跟数据脱节。

为什么需要它：manifest 里的页数/块数/source_type 分布/schema_version 都是**派生值**。
手工维护必然在下次重新解析后变陈旧 —— 实测就发生过：解析结果已升到 evidence/0.5、
块数变成 127/61/75，而 manifest 还写着 evidence/0.3 和 95/58/75。
所以这些字段一律由本脚本从数据本身重算。

**来源信息（source_url / source_hash）不动** —— 那是外部事实，不是派生值。

用法：
    python tools/build_manifest.py sample/D2
"""
from __future__ import annotations

import collections
import json
import os
import sys


def refresh(manifest_path: str) -> int:
    m = json.load(open(manifest_path, encoding="utf-8"))
    if "samples" not in m:
        return 0

    base = os.path.dirname(manifest_path)
    changed = 0
    versions = set()
    for s in m["samples"]:
        p = os.path.join(base, s["parse_file"])
        if not os.path.exists(p):
            print(f"  ! 缺文件 {s['parse_file']}")
            continue
        d = json.load(open(p, encoding="utf-8"))
        versions.add(d["schema_version"])
        blocks = [b for pg in d["pages"] for b in pg["blocks"]]
        fresh = {
            "doc_id": d["doc"]["doc_id"],
            "file_id": d["doc"]["file_id"],
            "page_count": d["doc"]["page_count"],
            "page_forms": [pg["form"] for pg in d["pages"]],
            "block_count": len(blocks),
            "source_type_counts": dict(collections.Counter(b["source_type"] for b in blocks)),
            "schema_version": d["schema_version"],
        }
        for k, v in fresh.items():
            if s.get(k) != v:
                s[k] = v
                changed += 1

    # 整份 manifest 的结构版本取所有样例的交集；不一致就写明
    m["schema"] = versions.pop() if len(versions) == 1 else "MIXED:" + ",".join(sorted(versions))
    json.dump(m, open(manifest_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"  {os.path.relpath(manifest_path)}: 刷新 {changed} 个派生字段，结构版本 {m['schema']}")
    return changed


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    total = 0
    for arg in sys.argv[1:]:
        path = arg if arg.endswith(".json") else os.path.join(arg, "manifest.json")
        total += refresh(path)
    print(f"共刷新 {total} 个字段")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
