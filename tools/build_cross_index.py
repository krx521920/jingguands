#!/usr/bin/env python3
"""建立跨文档索引（D8 交付物之一）。

## 本工具做与不做的事

**做**：从**解析输出**里建立四类可定位的索引，每个索引键都带**块级出处**：
  · 文件索引 —— doc_id / sha256 / 页数 / 形态
  · 主体索引 —— 主体名 → [(case_id, block_id, quote)]
  · 日期索引 —— 日期 → [(case_id, block_id)]
  · 公告版本索引 —— 同一主体的多份公告按日期排序成版本链

**不做**：不判定「两份公告是否同一事件」。那是 B 流程的语义裁决（同公司 ≠ 同事件），
归方轩诚/魏文宇。本工具只保证：**给出索引键时，能指回它出现在哪个文件的哪个块** ——
即「跨文件双侧出处」所需的那一半。

主体/日期的判定用**启发式规则**（见下），因此每个键都带出处，消费方可自行复核，
而不是相信一个不带依据的判断。

用法：
    python tools/build_cross_index.py <解析包目录...> -o <输出.json>
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys

# 公告标题里的公司全称：以「股份有限公司」「有限公司」结尾，最长匹配
# 主体名左侧必须是「非汉字」边界（串首、标点、空格、引号等）。
# 不加这条会把前文一起吞进来 —— 实测出现过「为保证洛阳科创新材料股份有限公司」
# 「乙方应共同向中国证券登记结算有限责任公司」这类假主体。
_ENTITY_RE = re.compile(
    r"(?<![\u4e00-\u9fa5A-Za-z0-9])"
    r"[\u4e00-\u9fa5][\u4e00-\u9fa5A-Za-z0-9（）()·]{1,29}?(?:股份有限公司|有限责任公司|有限公司)"
)
# 日期：2026年9月25日 / 2026-09-25 / 2026/09/25
_DATE_RE = re.compile(r"(20\d{2})\s*[年\-/]\s*(\d{1,2})\s*[月\-/]\s*(\d{1,2})\s*日?")
# 公告编号
_NOTICE_RE = re.compile(r"公告编号[：:]\s*([0-9\-—－]+)")
# 证券代码 / 证券简称：上市公司公告的标准表头，**无歧义地标识发行主体**。
# 用它当发行主体键，而不是靠公司名匹配 —— 实测按名匹配会失败：
#   · 「科创新材」的报告书标题块里没有公司全称（首块是财务顾问国海证券）
#   · 同一主体在不同文档里的写法可能不同（简式/详式、有无地名前缀）
# 而证券代码是唯一的，且几乎总在首页表头行里。
# 标签不止一种：公告用「证券代码」，报告书用「股票代码」—— 实测 D5-EQC-002 用后者。
# 只认一种会漏掉整类文档。
_CODE_RE = re.compile(r"(?:证券代码|股票代码)[：:]\s*([0-9]{6})")
_ABBR_RE = re.compile(r"证券简称[：:]\s*([^\s，,、]{2,10})")


def _norm_date(y: str, m: str, d: str) -> str:
    return f"{y}-{int(m):02d}-{int(d):02d}"


def index_document(path: str) -> dict:
    doc = json.load(open(path, encoding="utf-8"))
    meta = doc["doc"]
    case_id = os.path.basename(path).replace(".parse.json", "")
    blocks = [b for p in doc["pages"] for b in p["blocks"]]

    entities, dates, notices, codes, abbrs = {}, {}, {}, {}, {}
    for b in blocks:
        t = b.get("text_raw") or ""
        if not t:
            continue
        bid = b["block_id"]
        for m in _ENTITY_RE.finditer(t):
            entities.setdefault(m.group(0), []).append({"block_id": bid, "page": b["page"], "quote": m.group(0)})
        for m in _DATE_RE.finditer(t):
            dates.setdefault(_norm_date(*m.groups()), []).append({"block_id": bid, "page": b["page"], "quote": m.group(0)})
        for m in _NOTICE_RE.finditer(t):
            notices.setdefault(m.group(1), []).append({"block_id": bid, "page": b["page"], "quote": m.group(0)})
        for m in _CODE_RE.finditer(t):
            codes.setdefault(m.group(1), []).append({"block_id": bid, "page": b["page"], "quote": m.group(0)})
        for m in _ABBR_RE.finditer(t):
            abbrs.setdefault(m.group(1), []).append({"block_id": bid, "page": b["page"], "quote": m.group(0)})

    # 标题块：取页面靠前、字号最大且含实体名的块，作为公司全称的首选依据
    title_entity = None
    for b in blocks[:12]:
        t = b.get("text_raw") or ""
        if "公告" in t:
            m = _ENTITY_RE.search(t)
            if m:
                title_entity = {"name": m.group(0), "block_id": b["block_id"], "page": b["page"], "quote": t[:60]}
                break

    return {
        "case_id": case_id,
        "event_type": doc.get("handoff", {}).get("source", {}).get("event_type") or None,
        "doc_id": meta["doc_id"],
        "file_id": meta["file_id"],
        "file_name": meta.get("file_name"),
        "page_count": meta["page_count"],
        "page_forms": sorted({p["form"] for p in doc["pages"]}),
        "schema_version": doc["schema_version"],
        "block_count": len(blocks),
        "title_entity": title_entity,
        "entities": {k: v[:6] for k, v in entities.items()},
        "dates": {k: v[:6] for k, v in dates.items()},
        "notice_numbers": notices,
        "stock_codes": codes,
        "stock_abbrs": abbrs,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("dirs", nargs="+")
    ap.add_argument("-o", "--out", required=True)
    a = ap.parse_args()

    docs = []
    for d in a.dirs:
        for f in sorted(os.listdir(d)):
            if f.endswith(".parse.json"):
                docs.append(index_document(os.path.join(d, f)))

    # 主体索引：主体名 → 文档
    by_entity: dict = {}
    for doc in docs:
        for name, hits in doc["entities"].items():
            by_entity.setdefault(name, []).append({"case_id": doc["case_id"], "hits": hits})
        if doc["title_entity"]:
            n = doc["title_entity"]["name"]
            by_entity.setdefault(n, [])
            if not any(x["case_id"] == doc["case_id"] for x in by_entity[n]):
                by_entity[n].append({"case_id": doc["case_id"], "hits": [doc["title_entity"]]})

    # 日期索引
    by_date: dict = {}
    for doc in docs:
        for d, hits in doc["dates"].items():
            by_date.setdefault(d, []).append({"case_id": doc["case_id"], "hits": hits})

    # 公告版本索引：**只按标题里的发行主体**建，不按正文中出现的所有主体。
    #
    # 为什么不按所有主体：实测「中国证券登记结算有限责任公司」出现在 8 份质押公告里，
    # 但它是**登记结算机构**，不是发行主体 —— 按它建链会得到一条毫无意义的「版本链」。
    # 这正是「同一主体 ≠ 同一发行主体 ≠ 同一事件」，语义裁决归 B 流程，索引层不替它决定。
    versions = []
    issuer_members: dict = {}
    for doc in docs:
        code = sorted(doc["stock_codes"])[0] if doc["stock_codes"] else None
        if code:
            key, basis = f"code:{code}", "证券代码"
        else:
            te = doc.get("title_entity")
            key, basis = (f"name:{te['name']}", "标题公司名") if te else (None, None)
        if key:
            doc["_issuer_key"], doc["_issuer_basis"] = key, basis
            issuer_members.setdefault(key, []).append(doc)
    for name, members in sorted(issuer_members.items()):
        if len(members) < 2:
            continue
        chain = []
        for doc in members:
            ds = sorted(doc["dates"])
            # 排序键用**公告编号**（它按主体单调递增），不用正文里随便一个日期 ——
            # 实测正文首个日期常来自「历史沿革」章节（出现过 2008/2015），
            # 用它排序会把版本链排乱。判「公告日期」是抽取语义，索引层不替它决定。
            nums = sorted(doc["notice_numbers"])
            chain.append({"case_id": doc["case_id"],
                          "notice_number": nums[0] if nums else None,
                          "date_candidates": ds[:3],
                          "issuer_key": doc.get("_issuer_key"),
                          "issuer_basis": doc.get("_issuer_basis"),
                          "issuer_evidence": (sorted(doc["stock_codes"].items())[0][1] if doc["stock_codes"]
                                              else ([(doc.get("title_entity") or {}).get("block_id")] if doc.get("title_entity") else []))})
        # 公告编号形如 2026-075，按字符串排序即按年份+序号排序
        chain.sort(key=lambda x: (x["notice_number"] or "9999"))
        for i, v in enumerate(chain, 1):
            v["version"] = i
        versions.append({"issuer_key": name, "count": len(chain), "chain": chain})

    out = {
        "built_by": "张智博",
        "day": "D8",
        "purpose": "跨文档索引 ＋ 版本引用（每个索引键带块级出处）",
        "entity_index_semantics": "按正文中出现的公司名建索引，含质权人/登记机构等非发行主体；仅表示「该名出现在此文件的此块」",
        "version_index_semantics": "只按**发行主体键**（证券/股票代码，回退标题公司名）建版本链；同一主体不等于同一事件（语义裁决归 B 流程）",
        "version_order_basis": "公告编号（按主体单调）；不使用正文日期 —— 判公告日期属抽取语义",
        "date_index_semantics": "正文中出现的所有日期候选，**未筛**公告日期，仅供检索",
        "scope_note": "本索引只做可定位性，不判定「是否同一事件」——那是 B 流程的语义裁决。",
        "documents": len(docs),
        "files": [{k: d[k] for k in ("case_id", "doc_id", "file_id", "file_name",
                                     "page_count", "page_forms", "schema_version", "block_count")}
                  for d in docs],
        "entity_index": by_entity,
        "issuer_index": {k: [d["case_id"] for d in v] for k, v in issuer_members.items()},
        # 没有发行主体键的文档**显式列出**，不猜。
        # 实测 D5-EQC-003 是《财务顾问核查意见》：首页没有证券代码表头，
        # 首块是**财务顾问**（国海证券）而非发行主体 —— 简单规则无法定出主体，
        # 需要语义裁决（B 流程）。索引层报「我定不出来」，比给一个错的键有用。
        "issuer_key_missing": [d["case_id"] for d in docs if not d.get("_issuer_key")],
        "date_index": by_date,
        "version_index": versions,
    }
    json.dump(out, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"{a.out}: {len(docs)} 份文档，{len(by_entity)} 个主体，{len(by_date)} 个日期，{len(versions)} 条版本链")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
