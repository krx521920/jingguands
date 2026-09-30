"""出处（evidence）结构的唯一定义处。

## 这个模块回答一个问题：下游凭什么相信一个字段值？

## v0.1 → v0.2 的变更（2026-09-27 D1 夜，为对齐全队公共契约）

全队公共契约是 `interface/event-envelope.schema.json`（魏文宇，D1 冻结）。
本模块原本独立设计，现按契约做了四处对齐：

1. **`bbox` 改名为 `region`** —— 契约里 provenance 用的字段名是 `region`。
   改完之后抽取层可以直接 `prov["region"] = block["region"]`，零映射。
2. **新增 `text_raw`** —— 契约要求 `quote` 必须是**原文子串**、禁止事后按数字反搜。
   而 `text` 为了可读性会在跨行处补空格，不是严格子串。`text_raw` 按阅读顺序
   直接拼接原始字符、不插入任何字符，因此保证是原文子串。
3. **新增 `doc.file_id`** —— 契约里 `source.file_id` 的格式是 `sha256:…`。
4. **新增顶层 `handoff`** —— 把契约要的 `source` 对象预先拼好，可原样拷贝。

**坐标系统一声明**（契约里没写，这是 D1 发现的缺口，已反馈）：
契约的 `region` 只写了 `[x1,y1,x2,y2] 页面区域坐标`，**没有声明单位和原点**。
本模块统一为：单位 PDF point（1/72 英寸）、原点页面左上角、y 轴向下为正、
顺序 `[left, top, right, bottom]`。页面尺寸随页给出，下游按 `region/[width,height]`
归一化后再画高亮。

## 设计受三条硬约束支配（来自团队 14 天表）

1. **D3：禁止事后按数字搜索补出处。** region 只能在解析阶段生成、随数据一路传递。
2. **D10：防同名串证据。** doc_id 由文件内容哈希派生，不依赖文件名。
3. **指标：出处命中率按「区域」和「单元格」分开统计，缺出处计失败。**
   所以 block 级和 cell 级是两套独立坐标，表格里的值必须能定位到行列。
"""
from __future__ import annotations

import hashlib
from typing import Dict, List, Optional

SCHEMA_VERSION = "evidence/0.8"
PARSER_NAME = "finstruct.parse"
PARSER_VERSION = "0.8.0"

# 全队公共契约（用于 handoff 声明与自检提示）
TEAM_CONTRACT = "interface/event-envelope.schema.json v0.1"

# ---------------------------------------------------------------- 枚举值
# 页面形态（逐页判定，不按整份文档判定）
FORM_TEXT = "TEXT"          # 有可用文本层
FORM_SCANNED = "SCANNED"    # 无文本层，需走 OCR
FORM_MIXED = "MIXED"        # 文本层与图像混排，两条通道都跑

# 块角色
ROLE_TITLE = "TITLE"        # 居中标题块（通常是文件大标题）
ROLE_SECTION = "SECTION"    # 章节标题（一、二、(一)(二) 等）
ROLE_BODY = "BODY"
ROLE_HEADER = "HEADER"      # 页眉，移出正文流但保留
ROLE_FOOTER = "FOOTER"      # 页脚
ROLE_FOOTNOTE = "FOOTNOTE"  # 脚注，常承载表格单位说明，不能丢

# 抽取来源通道（"这段字是怎么读出来的"）
SRC_TEXT_LAYER = "TEXT_LAYER"  # pdfplumber 直接读的文本层
SRC_OCR_OS = "OCR_OS"          # 通道 A：系统/离线 OCR
SRC_VLM = "VLM"                # 通道 B：视觉大模型

# 证据来源类型（"这段字在文档里是什么结构"）
# 对齐评测方 evaluation/D1/schemas/evidence.schema.json 的 source_type 枚举。
# 与上面的"通道"是两个正交维度：同一段字可以既是 text_layer 通道、又是 cell 结构。
KIND_PARAGRAPH = "paragraph"
KIND_TABLE = "table"
KIND_CELL = "cell"
KIND_SCAN_REGION = "scan_region"
KIND_DOCUMENT = "document"

# 无法取到出处时的原因码（缺出处要能被统计，不能静默）
MISSING_NOT_PARSED = "NOT_PARSED"
MISSING_ILLEGIBLE = "ILLEGIBLE"
MISSING_DEGRADED = "DEGRADED"


# ---------------------------------------------------------------- 标识符
def file_sha256(path: str) -> str:
    """整文件内容哈希。D10 要求它沿链传递，用于校验证据没有串文件。"""
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def make_doc_id(sha: str) -> str:
    """doc_id 由内容哈希派生，**不用文件名** —— 这是 D10「防同名串证据」的实现。"""
    return "d" + sha[:8]


def make_file_id(sha: str) -> str:
    """契约要求的 file_id 形态：`sha256:<hex>`。"""
    return "sha256:" + sha


def make_block_id(doc_id: str, page: int, seq: int) -> str:
    """稳定且全局唯一的块标识。同一份文件重复解析，同一块得到同一个 id。"""
    return f"{doc_id}_p{page:03d}_b{seq:05d}"


def make_table_id(doc_id: str, page: int, seq: int) -> str:
    return f"{doc_id}_p{page:03d}_t{seq:03d}"


# ---------------------------------------------------------------- 几何
def region_of(chars: List[Dict]) -> List[float]:
    """合并一组字符的包围盒，返回 [left, top, right, bottom]。

    输入为 pdfplumber 的 char 字典。字段名与顺序按全队契约的 `region`。
    """
    x0 = min(c["x0"] for c in chars)
    x1 = max(c["x1"] for c in chars)
    top = min(c["top"] for c in chars)
    bottom = max(c["bottom"] for c in chars)
    return [round(x0, 2), round(top, 2), round(x1, 2), round(bottom, 2)]


def region_union(regions: List[List[float]]) -> List[float]:
    """合并多个区域。"""
    return [
        round(min(r[0] for r in regions), 2),
        round(min(r[1] for r in regions), 2),
        round(max(r[2] for r in regions), 2),
        round(max(r[3] for r in regions), 2),
    ]


def area_ratio(regions: List[List[float]], page_w: float, page_h: float) -> float:
    """区域并集面积占页面面积的比例。用于形态判定的 text_area_r / img_area_r。"""
    if not regions:
        return 0.0
    nx, ny = 200, 200
    grid = bytearray(nx * ny)
    for x0, y0, x1, y1 in regions:
        cx0 = max(0, min(nx - 1, int(x0 / page_w * nx)))
        cx1 = max(0, min(nx - 1, int(x1 / page_w * nx)))
        cy0 = max(0, min(ny - 1, int(y0 / page_h * ny)))
        cy1 = max(0, min(ny - 1, int(y1 / page_h * ny)))
        for gy in range(cy0, cy1 + 1):
            base = gy * nx
            for gx in range(cx0, cx1 + 1):
                grid[base + gx] = 1
    return sum(grid) / (nx * ny)


# ---------------------------------------------------------------- 构造函数
def make_block(
    doc_id: str,
    page: int,
    seq: int,
    text: str,
    region: List[float],
    text_raw: Optional[str] = None,
    role: str = ROLE_BODY,
    source_type: str = KIND_PARAGRAPH,
    table_ref: Optional[Dict] = None,
    font_size: Optional[float] = None,
    source: str = SRC_TEXT_LAYER,
    ocr_confidence: Optional[float] = None,
    degraded: bool = False,
    missing_reason: Optional[str] = None,
) -> Dict:
    """构造一个文本块。region 是必填 —— 没有坐标的块不应产出。

    `text`     ：拼接后的可读文本（跨行处可能补空格），供模型与展示使用
    `text_raw` ：按阅读顺序直接拼接原始字符，**不插入任何字符**，
                 因此保证是原文子串——契约要求 quote 必须是原文子串，
                 抽取层应使用 text_raw 作为 quote。
    """
    return {
        "block_id": make_block_id(doc_id, page, seq),
        # doc_id 放在块上是"自足"需要：块被单独摘出来传递时，仍知道它属于哪份文件
        "doc_id": doc_id,
        "page": page,
        "type": "TEXT",
        "source_type": source_type,
        "role": role,
        "text": text,
        "text_raw": text_raw if text_raw is not None else text,
        "region": region,
        "table_ref": table_ref,
        "font_size": None if font_size is None else round(float(font_size), 2),
        "source": source,
        "ocr_confidence": ocr_confidence,
        "degraded": degraded,
        "missing_reason": missing_reason,
    }


def make_table_cell(
    doc_id: str,
    page: int,
    table_seq: int,
    row: int,
    col: int,
    text: str,
    region: List[float],
    rowspan: int = 1,
    colspan: int = 1,
    is_header: bool = False,
    header_path: Optional[str] = None,
    degraded: bool = False,
) -> Dict:
    """构造一个表格单元格。**cell 级出处与 block 级分开** —— 表格里的值必须能定位到行列。"""
    return {
        "doc_id": doc_id,
        "table_id": make_table_id(doc_id, page, table_seq),
        "page": page,
        "row": row,
        "col": col,
        "rowspan": rowspan,
        "colspan": colspan,
        "is_header": is_header,
        "header_path": header_path,
        "text": text,
        "region": region,
        "degraded": degraded,
    }


def make_page(
    page: int,
    form: str,
    width: float,
    height: float,
    form_evidence: Dict,
    blocks: List[Dict],
    tables: Optional[List[Dict]] = None,
    columns: Optional[List] = None,
) -> Dict:
    return {
        "page": page,
        "form": form,
        "width": round(float(width), 2),
        "height": round(float(height), 2),
        "form_evidence": form_evidence,
        # 多栏页面的各栏 x 范围（左到右）；单栏为空数组。
        # 记下来是为了让阅读顺序可解释：为什么这块排在前面。
        "columns": columns or [],
        "blocks": blocks,
        "tables": tables or [],
    }


def flatten_blocks(pages: List[Dict]) -> List[Dict]:
    """把各页的块拉平成一维列表，只保留抽取层需要的字段。

    `pages[].blocks[]` 是规范形式（带 font_size / source / table_ref 等）；
    这里给的是精简版，供契约的 `parse_meta.blocks` 使用。
    """
    out = []
    for pg in pages:
        for b in pg["blocks"]:
            out.append(
                {
                    "block_id": b["block_id"],
                    "page": b["page"],
                    "role": b["role"],
                    "text": b["text"],
                    "text_raw": b["text_raw"],
                    "region": b["region"],
                }
            )
    return out


def make_handoff(
    file_id: str, file_name: str, sha: str, page_count: int, pages: Optional[List[Dict]] = None
) -> Dict:
    """把全队契约要的 `source` 对象预先拼好，抽取层可原样拷贝，零映射。

    `parse_meta.blocks` 与契约对齐：契约 `interface/README.md` 第四节要求解析侧
    在 parse_meta 里提供 blocks，`event-envelope.schema.json` 的 parse_meta
    已加入 `blocks`（type: array|null）。(D1 时该字段缺失、且 additionalProperties
    为 false，写入会导致校验失败；D2 魏文宇已按对齐报告修好。)
    """
    return {
        "target_contract": TEAM_CONTRACT,
        "source": {
            "file_id": file_id,
            "file_name": file_name,
            "file_sha256": sha,
            "parse_meta": {
                "parser_version": f"{PARSER_NAME}/{PARSER_VERSION}",
                "page_count": page_count,
                "blocks": flatten_blocks(pages) if pages else None,
            },
        },
        # 抽取层组装 provenance 时按这个取
        "provenance_from_block": {
            "block_id": "block.block_id",
            "page": "block.page",
            "region": "block.region",
            "quote": "block.text_raw",
            "source_type": "block.source_type",
            "document_id": "block.doc_id",
            "table": "block.table_ref.table_id",
            "cell": "block.table_ref.cell_id",
        },
        # 三方字段名不同，这里一次给全，避免各自猜。
        # 魏 = 抽取契约 interface/event-envelope.schema.json
        # 宗 = 评测证据契约 evaluation/D1/schemas/evidence.schema.json
        "field_aliases": {
            "region": {"parser": "region", "wei": "region", "zong": "bbox"},
            "text_raw": {"parser": "text_raw", "wei": "quote", "zong": "excerpt"},
            "doc_id": {
                "parser": "doc_id",
                "wei": "source.file_id（形态为 sha256:<hex>，见 handoff.source.file_id）",
                "zong": "document_id",
            },
            "source_type": {"parser": "source_type", "zong": "source_type", "wei": "（未定义）"},
            "table_ref": {
                "parser": "table_ref.table_id / cell_id",
                "zong": "table / cell",
                "wei": "（未定义）",
            },
        },
        "blocks_path": "pages[].blocks[]",
        "warnings": [
            "parse_meta.blocks 是 pages[].blocks[] 的精简副本（block_id/page/role/text/text_raw/region）。"
            "页级细节（font_size/source/table_ref/form_evidence）只在 pages[] 里。",
            "provenance.quote 请取 block.text_raw —— text 在跨行西文处会补空格，不是逐字原文。",
        ],
    }


def make_document(
    file_name: str,
    sha: str,
    page_count: int,
    pages: List[Dict],
    reading_order: List[str],
    parsed_at: str,
    file_size: Optional[int] = None,
    quality: Optional[Dict] = None,
) -> Dict:
    """构造解析结果的顶层对象。"""
    file_id = make_file_id(sha)
    return {
        "schema_version": SCHEMA_VERSION,
        "doc": {
            "doc_id": make_doc_id(sha),
            "file_id": file_id,
            "file_name": file_name,
            "file_sha256": sha,
            "file_size": file_size,
            "page_count": page_count,
            "parsed_at": parsed_at,
            "parser": {"name": PARSER_NAME, "version": PARSER_VERSION},
            # 坐标系统一声明 —— 契约里缺这一条，下游渲染高亮必须按它换算
            "coord_system": {
                "unit": "pdf_point",
                "unit_zh": "PDF 点（1 pt = 1/72 英寸）",
                "origin": "top_left",
                "origin_zh": "页面左上角，y 轴向下为正",
                "field": "region",
                "order": ["left", "top", "right", "bottom"],
                "normalize_hint": "屏幕坐标 = region / [page.width, page.height] × 显示尺寸",
            },
        },
        "pages": pages,
        # 阅读顺序显式输出，不指望下游自己拼
        "reading_order": reading_order,
        "handoff": make_handoff(file_id, file_name, sha, page_count, pages),
        "quality": quality or {"degraded": False, "degrade_reasons": [], "warnings": []},
    }


# ---------------------------------------------------------------- 自检
REQUIRED_BLOCK_KEYS = ("block_id", "doc_id", "page", "source_type", "region", "source")
REQUIRED_CELL_KEYS = ("table_id", "page", "row", "col", "region")


def self_check(doc: Dict) -> Dict:
    """轻量结构自检（不依赖 jsonschema）。

    对应团队指标「输出格式合规率 100%」：不合规的记录必须暴露出来，
    而不是当成功输出。返回 {"ok": bool, "errors": [...]}。
    """
    errs: List[str] = []
    if doc.get("schema_version") != SCHEMA_VERSION:
        errs.append(f"schema_version 应为 {SCHEMA_VERSION}")
    d = doc.get("doc", {})
    for k in ("doc_id", "file_id", "file_name", "file_sha256", "page_count"):
        if not d.get(k):
            errs.append(f"doc.{k} 缺失")
    if d.get("file_id") and not str(d["file_id"]).startswith("sha256:"):
        errs.append("doc.file_id 应为 sha256:<hex> 形态（全队契约）")
    cs = d.get("coord_system") or {}
    for k in ("unit", "origin", "order"):
        if not cs.get(k):
            errs.append(f"doc.coord_system.{k} 缺失（下游渲染高亮依赖它）")

    seen_ids = set()
    for pg in doc.get("pages", []):
        pno = pg.get("page")
        if not pg.get("width") or not pg.get("height"):
            errs.append(f"page {pno}: 缺少页面尺寸")
        for b in pg.get("blocks", []):
            for k in REQUIRED_BLOCK_KEYS:
                if b.get(k) in (None, ""):
                    errs.append(f"page {pno} block {b.get('block_id')}: 缺 {k}")
            r = b.get("region")
            if not (isinstance(r, list) and len(r) == 4):
                errs.append(f"page {pno} block {b.get('block_id')}: region 不是 4 元组")
            elif not (r[0] <= r[2] and r[1] <= r[3]):
                errs.append(f"page {pno} block {b.get('block_id')}: region 顺序错误")
            # scan_region 例外：它断言的是"这块读不出字"，本来就没有可引用的原文。
            # 强制它非空会诱导实现去编一个占位串，反而破坏"quote 必须是原文"的保证。
            if b.get("source_type") == KIND_SCAN_REGION:
                if b.get("text_raw"):
                    errs.append(
                        f"page {pno} block {b.get('block_id')}: scan_region 不该有文本"
                        f"（它标注的是不可读区域）"
                    )
                if not b.get("degraded") or not b.get("missing_reason"):
                    errs.append(
                        f"page {pno} block {b.get('block_id')}: scan_region 必须 degraded=true 且有 missing_reason"
                    )
            elif b.get("text_raw") in (None, ""):
                errs.append(f"page {pno} block {b.get('block_id')}: 缺 text_raw（契约的 quote 取它）")
            if b.get("source_type") not in (
                KIND_PARAGRAPH, KIND_TABLE, KIND_CELL, KIND_SCAN_REGION, KIND_DOCUMENT
            ):
                errs.append(f"page {pno} block {b.get('block_id')}: source_type 非法 {b.get('source_type')!r}")
            if b.get("source_type") == KIND_CELL and not b.get("table_ref"):
                errs.append(f"page {pno} block {b.get('block_id')}: source_type=cell 但缺 table_ref")
            bid = b.get("block_id")
            if bid in seen_ids:
                errs.append(f"block_id 重复: {bid}")
            seen_ids.add(bid)
        for t in pg.get("tables", []):
            for c in t.get("cells", []):
                for k in REQUIRED_CELL_KEYS:
                    if c.get(k) in (None, ""):
                        errs.append(f"page {pno} cell: 缺 {k}")

    all_ids = {b["block_id"] for pg in doc.get("pages", []) for b in pg.get("blocks", [])}
    ro = set(doc.get("reading_order", []))
    if ro != all_ids:
        missing = all_ids - ro
        extra = ro - all_ids
        if missing:
            errs.append(f"reading_order 漏掉 {len(missing)} 个块")
        if extra:
            errs.append(f"reading_order 含 {len(extra)} 个不存在的块")

    return {"ok": not errs, "errors": errs}
