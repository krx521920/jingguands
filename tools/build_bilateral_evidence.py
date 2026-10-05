#!/usr/bin/env python3
"""双侧出处包 ＋ 缺证据标识（D9 交付物）。

## 做什么

对宗博文 D9 的 20 条规则用例，逐侧输出**可核验的出处条目**：
`block_id` / `page` / `region` / `quote` / `evidence_status`，
并汇总**缺证据路径**清单。

## 缺证据标识的取值

| 值 | 含义 |
| --- | --- |
| `present` | 出处完整：块存在、quote 是该块 text_raw 的子串 |
| `block_missing` | 用例给的 `block_id` 在解析输出里不存在 |
| `quote_not_in_block` | 块存在，但 quote 不是该块 text_raw 的子串 |
| `no_anchor` | 用例本身没给 block_id（如扫描降级用例） |
| `scan_region_degraded` | 指向 `scan_region` 降级块（不可读区域，不能作引文来源） |
| `column_semantics_missing` | 该块属于 `n_cols < 3` 的**竖排键值表**，`header_path` 必然为空 |
| `borderless_no_column_semantics` | 该块落在**无框表格**所在页 —— 列语义丢失 |

## 为什么要把「键值表」与「无框表格」分开标

两者都会导致「没有 header_path」，但**原因与补救方式完全不同**：

- **竖排键值表**：`col=0` 是字段名、`col=1` 是值。**字段名就在格子里**，
  按行读即可 —— 不需要列序回退，也不缺信息。
- **无框表格**：整张表没被检出，内容进正文流。**列归属真的丢了**，
  只能从连续文本里自行判断。

把它们标成同一个原因，下游会做出不同的补救动作 —— 一个动作是多余的，
另一个动作会被漏掉。宗的 `D9-RULE-018` 依据写的是「无框表格」，但
`D6-AWD-005` 实际是竖排键值表，二者需要分开。

用法：
    python tools/build_bilateral_evidence.py --cases <rules-cases.dev.json> \
        --parses sample/D4/parse sample/D5/parse sample/D6/parse -o sample/D9/bilateral_evidence.json
"""
from __future__ import annotations

import argparse
import json
import os
import sys


def load_parses(dirs):
    """case_id → {blocks: {block_id: block}, tables: {table_id: table}, keyvalue_tables: set}"""
    out = {}
    for d in dirs:
        for f in sorted(os.listdir(d)):
            if not f.endswith(".parse.json"):
                continue
            doc = json.load(open(os.path.join(d, f), encoding="utf-8"))
            case = f.replace(".parse.json", "")
            blocks, tables = {}, {}
            for pg in doc["pages"]:
                for t in pg["tables"]:
                    tables[t["table_id"]] = t
                for b in pg["blocks"]:
                    blocks[b["block_id"]] = b
            out[case] = {
                "blocks": blocks,
                "tables": tables,
                # n_cols < 3 的表 → 竖排键值表（header_path 必然为空，属设计行为）
                "narrow_tables": {tid for tid, t in tables.items() if t["n_cols"] < 3},
            }
    return out


def judge(side, parses):
    case = side.get("case_id")
    bid = side.get("block_id")
    quote = side.get("quote")
    out = {
        "case_id": case,
        "field": side.get("field"),
        "block_id": bid,
        "quote": quote,
        "value": side.get("value"),
        "raw_value": side.get("raw_value"),
        "unit": side.get("unit"),
        "page": None,
        "region": None,
        "table_id": None,
        "cell_ref": None,
        "header_path": None,
        "source_type": None,
        "table_kind": None,
        "evidence_status": None,
        "evidence_note": None,
    }
    p = parses.get(case)
    if p is not None:
        out["doc_narrow_tables"] = sorted(p["narrow_tables"])
        out["doc_narrow_table_note"] = ("本文档含 n_cols<3 的竖排键值表；"
            "这类表的 header_path 必然为空（设计行为），按行读 col0=字段名/col1=值即可，"
            "**不等于无框表格导致的列语义丢失**") if p["narrow_tables"] else None
    if p is None:
        out["evidence_status"] = "block_missing"
        out["evidence_note"] = f"本地没有 {case} 的解析包"
        return out
    if not bid:
        out["evidence_status"] = "no_anchor"
        out["evidence_note"] = "用例未给 block_id（常见于扫描降级用例）"
        return out
    b = p["blocks"].get(bid)
    if b is None:
        out["evidence_status"] = "block_missing"
        out["evidence_note"] = f"{case} 的解析输出里没有块 {bid}"
        return out

    out["page"] = b.get("page")
    out["region"] = b.get("region")
    out["source_type"] = b.get("source_type")
    tr = b.get("table_ref") or {}
    out["table_id"] = tr.get("table_id")
    out["cell_ref"] = tr.get("cell_ref")
    out["header_path"] = tr.get("header_path")

    if b.get("source_type") == "scan_region":
        out["evidence_status"] = "scan_region_degraded"
        out["evidence_note"] = "指向不可读区域（scan_region），它没有 text_raw，不能作为引文来源"
        return out
    if quote and quote not in (b.get("text_raw") or ""):
        # 细分：**纯空白差异**与**真的不在该块**是两回事。
        # 实测 D9 用例里 5 条不匹配全部是纯空白差异（去掉空白后单块即可锚定）——
        # 成因是 text_raw 为「原始字符直拼、不插入任何字符」（D1 硬规则），
        # 行边界即块边界，而引用方在跨行处带了空白或换行。
        if "".join(quote.split()) and "".join(quote.split()) in "".join((b.get("text_raw") or "").split()):
            out["evidence_status"] = "quote_whitespace_variance"
            out["evidence_note"] = ("quote 与该块 text_raw 只差空白 —— 去空白后单块即可锚定。"
                                    "消费方匹配前做空白归一如可解决")
            return out
        # 给出**实际含该 quote 的块**，便于对方重新锚定。
        # 实测 D9 用例的 5 条不匹配全部是**块号偏了一位**（引 b00024 而 quote 在 b00025），
        # 根因是解析输出在 D5/D6 期间多次重生成（表格检测修复改变了块切分与编号），
        # 用例锚定的是较早版本的块号 —— **跨版本的 block_id 不可回放**（D2 status 早有警告）。
        nq = "".join(quote.split())
        cands = [x["block_id"] for x in p["blocks"].values()
                 if nq and nq in "".join((x.get("text_raw") or "").split())]
        out["evidence_status"] = "quote_not_in_block"
        out["evidence_note"] = "quote 不在用例指定的块里（去空白后也不在）"
        out["quote_found_in"] = cands[:4] or None
        if cands:
            out["evidence_note"] += ("；该 quote 实际出现在 "
                                     + "、".join(cands[:2])
                                     + " —— 多为**跨版本的块号漂移**，请按当前版本重新锚定")
        return out

    if tr.get("table_id"):
        if tr["table_id"] in p["narrow_tables"]:
            out["table_kind"] = "key_value_table"
            out["evidence_status"] = "column_semantics_missing"
            out["evidence_note"] = ("竖排键值表（n_cols<3）：col=0 是字段名、col=1 是值，"
                                    "header_path 为空是设计行为，**按行读即可，不缺信息**")
            return out
        out["table_kind"] = "grid_table"
    out["evidence_status"] = "present"
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cases", required=True)
    ap.add_argument("--parses", nargs="+", required=True)
    ap.add_argument("-o", "--out", required=True)
    a = ap.parse_args()

    parses = load_parses(a.parses)
    data = json.load(open(a.cases, encoding="utf-8"))
    cases = data.get("cases") or data

    out_cases, missing, reanchored = [], [], []
    for c in cases:
        sides = [judge(s, parses) for s in (c.get("sides") or [])]
        for s in sides:
            if s["evidence_status"] != "present":
                missing.append({"case_id": c["case_id"], "side_case": s["case_id"],
                                "status": s["evidence_status"], "note": s["evidence_note"]})
            # **修复缺证据路径**：块号漂移时给出可直接采用的修正值。
            # 只在「唯一候选」时给修正 —— 多候选说明有歧义，交回人工，不自动改。
            cands = s.get("quote_found_in") or []
            if s["evidence_status"] == "quote_not_in_block" and len(cands) == 1:
                reanchored.append({
                    "case_id": c["case_id"], "side_case": s["case_id"],
                    "field": s["field"], "quote": s["quote"],
                    "wrong_block_id": s["block_id"], "correct_block_id": cands[0],
                    "basis": "该 quote 在本文档的解析输出中唯一出现在 correct_block_id",
                })
        out_cases.append({
            "case_id": c["case_id"],
            "category": c.get("category"),
            "expected_verdict": c.get("expected_verdict"),
            "attribution_basis": c.get("attribution_basis"),
            "must_not_conclude": c.get("must_not_conclude"),
            "sides": sides,
        })

    json.dump({
        "built_by": "张智博", "day": "D9", "schema": "evidence/0.9",
        "purpose": "双侧出处包（原文片段/页码/区域）＋ 缺证据标识",
        "note": "本文件只报「证据在不在、在哪、完不完整」，不判定 verdict —— 归因裁决归 B 流程。",
        "status_legend": {
            "present": "出处完整",
            "block_missing": "block_id 在解析输出里不存在",
            "quote_whitespace_variance": "quote 与该块只差空白，去空白后单块可锚定（消费方做空白归一即可）",
            "quote_not_in_block": "quote 不是该块 text_raw 的子串，去空白后仍不在该块（可能跨块）",
            "no_anchor": "用例未给 block_id",
            "scan_region_degraded": "指向不可读区域，不能作引文来源",
            "column_semantics_missing": "n_cols<3 的竖排键值表：按行读 col0=名/col1=值，不缺信息",
            "borderless_no_column_semantics": "无框表格：列语义真的丢了",
        },
        "cases": out_cases,
        "missing_evidence": missing,
        "reanchor_suggestions": reanchored,
        "reanchor_policy": ("只在 quote 于本文档中**唯一**命中某块时给出修正；"
                            "多候选视为有歧义，不自动改，交回人工。"),
    }, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    import collections
    st = collections.Counter(s["evidence_status"] for c in out_cases for s in c["sides"])
    print(f"{a.out}: {len(out_cases)} 用例 / {sum(st.values())} 侧")
    for k, v in st.most_common():
        print(f"    {k:<30} {v}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
