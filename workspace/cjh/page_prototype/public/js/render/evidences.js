// render/evidences.js —— 栏三：证据列表（出处展示 + 高亮联动）
import { badge } from "../status.js";

// v0.3b D3：出处块类型中文
const SOURCE_TYPE_TEXT = {
  paragraph: "段落", cell: "表格单元格", table: "表格兜底", scan_region: "扫描区域", document: "整份文档"
};

export function renderEvidences(container, data) {
  const count = document.getElementById("srcCount");
  count.textContent = `（${data.evidences.length} 条）`;
  container.replaceChildren();

  for (const e of data.evidences) {
    const item = document.createElement("div");
    item.className = "ev-item";
    item.id = "card-" + e.evidence_id;

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

    const quote = document.createElement("div");
    quote.className = "quote";
    quote.textContent = e.quote;
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
