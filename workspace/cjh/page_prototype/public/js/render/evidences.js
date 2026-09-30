// render/evidences.js —— 栏三：证据列表（出处展示 + 高亮联动 + D4 异常/降级提示）
import { badge } from "../status.js";

// v0.3b D3：出处块类型中文
const SOURCE_TYPE_TEXT = {
  paragraph: "段落", cell: "表格单元格", table: "表格兜底", scan_region: "扫描区域", document: "整份文档"
};

// v0.8/v0.9（张智博 evidence schema）：扫描降级块缺失原因码 → 中文
const MISSING_REASON_TEXT = {
  NOT_PARSED: "该区域无文本层（扫描件）",
  ILLEGIBLE: "字迹不可辨认",
  DEGRADED: "来源质量降级"
};

export function renderEvidences(container, data) {
  const count = document.getElementById("srcCount");
  count.textContent = `（${data.evidences.length} 条）`;
  container.replaceChildren();

  for (const e of data.evidences) {
    const item = document.createElement("div");
    item.className = "ev-item";
    item.id = "card-" + e.evidence_id;
    // D4：扫描降级块 amber 描边 + table 兜底块淡黄（与完整性检查降权一致）
    if (e.source_type === "scan_region" || e.degraded) item.classList.add("ev-degraded");

    const meta = document.createElement("div");
    meta.className = "meta-row";
    meta.append(
      Object.assign(document.createElement("span"), { textContent: e.evidence_id }),
      Object.assign(document.createElement("span"), { textContent: e.source_type ? (SOURCE_TYPE_TEXT[e.source_type] || e.source_type) : "出处类型:—" })
    );
    if (e.block_id) meta.append(Object.assign(document.createElement("span"), { textContent: "block: " + e.block_id }));
    meta.append(Object.assign(document.createElement("span"), { textContent: "第 " + e.page + " 页" }));
    if (e.table_id || e.cell_ref) {
      // v0.3 表格证据：table_id + cell_ref 不丢失
      meta.append(Object.assign(document.createElement("span"), { textContent: "表格 " + (e.table_id || "?") + (e.cell_ref ? "#" + e.cell_ref : "") }));
    }
    meta.append(
      Object.assign(document.createElement("span"), { textContent: e.bbox ? "bbox:有" : "bbox:待补" })
    );
    item.append(meta);

    // D4：多层表头完整列名（同名子列区分）
    if (e.header_path) {
      const hp = document.createElement("div");
      hp.className = "ev-note";
      hp.textContent = "列头: " + e.header_path;
      item.append(hp);
    }
    // D4：跨页续表碎片——直接当值会截断，提示消费方已由上游拼接/需注意
    if (e.continues) {
      const ct = document.createElement("div");
      ct.className = "ev-note warn";
      ct.textContent = `跨页续表：碎片接上一页 表格#${e.continues.cell_ref || "?"}（直接读取会截断）`;
      item.append(ct);
    }
    // D4：合并单元格覆盖范围（v0.9 covers：跨行共享值应用到被覆盖行）
    if (Array.isArray(e.covers) && e.covers.length) {
      const cv = document.createElement("div");
      cv.className = "ev-note";
      cv.textContent = "合并单元格覆盖: " + e.covers.map(c => c.cell_ref).join(", ");
      item.append(cv);
    }
    // D4：扫描降级块——只断言"读不出字"，无原文可引；缺失原因显式展示
    if (e.source_type === "scan_region" || e.degraded) {
      const dg = document.createElement("div");
      dg.className = "ev-note warn";
      dg.textContent = "降级块：" + (e.missing_reason ? (MISSING_REASON_TEXT[e.missing_reason] || e.missing_reason) : "降级原因未声明");
      item.append(dg);
    }

    const quote = document.createElement("div");
    quote.className = "quote";
    // scan_region 无文本层，quote 必为空——显式声明而非留白
    quote.textContent = e.quote || (e.source_type === "scan_region" ? "（该区域无文本层，无原文可引）" : "");
    item.append(quote);

    item.addEventListener("click", () => focusEvidence(e.evidence_id));
    container.append(item);
  }
}

export function focusEvidence(id) {
  document.querySelectorAll(".ev-item").forEach(el => el.classList.remove("active"));
  const card = document.getElementById("card-" + id);
  if (card) {
    card.classList.add("active");
    card.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

export function clearEvidences(container) {
  document.getElementById("srcCount").textContent = "";
  container.replaceChildren();
  const empty = document.createElement("div");
  empty.className = "empty";
  empty.textContent = "加载结果后此处显示证据列表";
  container.append(empty);
}
