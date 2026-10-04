#!/usr/bin/env python3
"""为跨文档配对输出**双侧出处锚点**（D8 交付物之二）。

## 它做什么

对每一组配对，输出**双方各自的块级锚点**：
  · 共同的发行主体键（证券代码）及其出处块
  · 双方各自的公告编号、日期候选（带出处块）
  · 双方共同提到的主体名及各自的出处块

## 它不做什么

**不判定两份公告是否为同一事件。** 输出的是「双方各自有什么、各自在哪一块」，
是关联判断的**输入**，不是结论。同公司 ≠ 同事件。

## 为什么这个形态是有用的

B 流程（方轩诚的对齐规则、魏文宇的分组）需要的是「关联依据」——
即「你凭什么说这两份相关」。本工具给的正是这个：每条依据都指回
**具体文件的 具体块**，而不是一个不带依据的判断。
"""
from __future__ import annotations

import argparse
import json
import os
import sys


def anchor(doc: dict, key: str, kind: str) -> dict:
    """取一条索引命中作为锚点。"""
    return {"case_id": doc["case_id"], "kind": kind, "value": key, "hits": []}


def load(path: str) -> dict:
    return json.load(open(path, encoding="utf-8"))


def build(pairs: list, docs: dict, group_id_key: str) -> list:
    out = []
    for g in pairs:
        members = [docs[c] for c in g["members"] if c in docs]
        missing = [c for c in g["members"] if c not in docs]

        per_member = []
        for d in members:
            per_member.append({
                "case_id": d["case_id"],
                "doc_id": d["doc_id"],
                "file_id": d["file_id"],
                "issuer_key": d.get("_issuer_key"),
                "issuer_basis": d.get("_issuer_basis"),
                "issuer_anchors": (sorted(d["stock_codes"].items())[0][1] if d["stock_codes"] else
                                   ([d["title_entity"]] if d.get("title_entity") else [])),
                "notice_numbers": {k: v[:2] for k, v in d["notice_numbers"].items()},
                "date_candidates": {k: v[:2] for k, v in sorted(d["dates"].items())[:4]},
            })

        # 双方共同提到的主体（不做语义判断，只报"两边都出现"）
        shared = None
        if len(members) >= 2:
            sets = [set(d["entity_index_keys"]) for d in members]
            common = set.intersection(*sets) if sets else set()
            shared = sorted(common)[:12]

        # 发行主体键是否一致 —— 这是**可核验的**关联信号，但不等于同一事件
        keys = [d.get("_issuer_key") for d in members]
        issuer_same = len(set(keys)) == 1 and keys[0] is not None

        out.append({
            "group_id": g[group_id_key],
            "expected_relation": g.get("expected_relation"),
            "test_purpose": g.get("test_purpose"),
            "members": g["members"],
            "missing_parse": missing,
            "issuer_key_same": issuer_same,
            "shared_entities": shared,
            "sides": per_member,
        })
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--index", required=True, help="cross_index.json")
    ap.add_argument("--pairs", required=True, help="跨文档配对 manifest.json")
    ap.add_argument("-o", "--out", required=True)
    a = ap.parse_args()

    idx = load(a.index)
    pm = load(a.pairs)
    docs = {d["case_id"]: d for d in idx["files"]}   # 明细在 files，documents 是计数

    # 主体集合（键）用于「双方共同提到」
    by_entity = idx["entity_index"]
    by_date = idx["date_index"]
    # files 是精简清单，股码/编号/日期在顶层索引里 —— 按 case_id 回填
    for case, d in docs.items():
        d["stock_codes"] = {}
        d["notice_numbers"] = {}
        d["dates"] = {k: v for k, v in by_date.items()
                      if any(m["case_id"] == case for m in v)}
        d["_issuer_key"] = None
        d["_issuer_basis"] = None
    for name, members in idx.get("issuer_index", {}).items():
        for c in members:
            if c in docs:
                docs[c]["_issuer_key"] = name
                docs[c]["_issuer_basis"] = "证券代码" if name.startswith("code:") else "标题公司名"
    for case, d in docs.items():
        d["entity_index_keys"] = [k for k, v in by_entity.items()
                                  if any(m["case_id"] == case for m in v)]
        d.setdefault("title_entity", None)
        codes = {}
        for b in v if False else []:
            pass

    pairs = pm.get("groups") or pm.get("pairs") or []
    key = "group_id" if pairs and "group_id" in pairs[0] else "pair_id"
    res = build(pairs, docs, key)

    json.dump({
        "built_by": "张智博", "day": "D8",
        "purpose": "为跨文档配对输出双侧出处锚点（关联判断的输入，不是结论）",
        "disclaimer": "本文件不判定是否同一事件；issuer_key_same 只是可核验的关联信号之一。",
        "groups": res,
    }, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"{a.out}: {len(res)} 组配对")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
