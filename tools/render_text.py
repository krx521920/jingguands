"""把解析 JSON 渲染成**可读的纯文本**，供抽取层的纯文本模式使用。

## 为什么需要它

魏文宇的入口有两条路：`--input <公告文本>`（纯文本）与 `--parse <解析JSON>`。
纯文本模式拿到的是什么，直接决定那条路能不能用。

早期我把块**一条一行**地倒出来，结果一个表格行的 11 个值散成 11 行裸值：

```
翟军
是
2,100,000
2.40%
```

模型看到这堆值，**无法判断哪个数属于哪一列** —— 只能靠顺序猜。纯文本模式因此形同虚设。

## 现在的渲染规则

- **正文段落**：原样输出
- **表格**：按**行**渲染，每格带列名（优先用 `header_path`），值用 ` | ` 分隔
- **合并单元格**：在被它覆盖的每一行都重复该值 —— 这是**渲染层**的重复，
  不影响数据层「每个字符恰好属于一个块」的不变量
- **不可读区域**（`scan_region`）：输出一处显式标记，而不是静默留空

渲染层做重复是安全的，因为它是派生视图；数据层不能重复，因为那会破坏字符守恒。

用法：
    python tools/render_text.py <parse.json> -o <out.txt>
"""
from __future__ import annotations

import argparse
import json
import os
import sys


def _row_cells(blocks, table_id: str, row: int):
    """取出某表某行的所有列 → 值，含合并单元格的覆盖。"""
    direct = {}
    covers = {}
    for b in blocks:
        tr = b.get("table_ref") or {}
        if b.get("source_type") != "cell" or tr.get("table_id") != table_id:
            continue
        if tr.get("row") == row:
            direct[tr.get("col")] = (tr.get("header_path"), b.get("text", ""))
        for cov in tr.get("covers") or []:
            if cov.get("row") == row:
                covers[cov.get("col")] = (tr.get("header_path"), b.get("text", ""))
    merged = dict(covers)
    merged.update(direct)          # 直接属于该格的优先
    return merged


def render(doc: dict) -> str:
    out = []
    for pg in doc["pages"]:
        out.append(f"===== 第 {pg['page']} 页 =====")
        if pg.get("form") != "TEXT":
            out.append(f"【本页形态 {pg['form']}】")
        blocks = pg["blocks"]
        i = 0
        while i < len(blocks):
            b = blocks[i]
            st = b.get("source_type")

            if st == "scan_region":
                r = b["region"]
                out.append(
                    f"【不可读区域：({r[0]:.0f},{r[1]:.0f})-({r[2]:.0f},{r[3]:.0f})，"
                    f"原因 {b.get('missing_reason')}，未产出文字】"
                )
                i += 1
                continue

            if st == "cell":
                tr = b["table_ref"]
                tid, row = tr["table_id"], tr["row"]
                cells = _row_cells(blocks, tid, row)
                parts = []
                for col in sorted(cells):
                    label, text = cells[col]
                    label = label or f"第{col + 1}列"
                    # 表头行里列名与值相同（header_path 就是这一格自己的文字），
                    # 渲染成「股东名称: 股东名称」是噪声，去重
                    parts.append(text if label == text else f"{label}: {text}")
                out.append(" | ".join(parts))
                # 跳到该表的下一行
                while i < len(blocks):
                    nb = blocks[i]
                    ntr = nb.get("table_ref") or {}
                    if nb.get("source_type") == "cell" and ntr.get("table_id") == tid and ntr.get("row") == row:
                        i += 1
                    else:
                        break
                continue

            out.append(b.get("text", ""))
            i += 1
    return "\n".join(out) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser(description="把解析 JSON 渲染成可读纯文本")
    ap.add_argument("parse_json")
    ap.add_argument("-o", "--out")
    a = ap.parse_args()
    out = a.out or os.path.splitext(a.parse_json)[0] + ".txt"
    doc = json.load(open(a.parse_json, encoding="utf-8"))
    text = render(doc)
    open(out, "w", encoding="utf-8").write(text)
    print(f"{out}  ({len(text.splitlines())} 行)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
