// render/evidences.js —— 栏三：证据列表（出处展示 + 高亮联动 + D4 异常/降级提示 + D7 出处口径说明）
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

// D7 出处口径说明（张智博解析能力边界表 evidence_guarantees，快照 _ref_zhang_D7_解析能力边界*.json）
const GUARANTEES = [
  "每字符恰好属于一个块（字符守恒）",
  "text_raw 为原始字符直拼，必为原文子串"
];
const NOT_GUARANTEED = [
  "region 是块自身字符的外接矩形，可含相邻块字符——按区域取字 ≠ 取到该块的字，取字请用 text_raw",
  "text_raw 不含换行符——跨行引用带 \\n，与 text_raw 匹配前须先做空白归一",
  "单靠 quote 无法唯一定位（表格内同文天然重复）——定位以 block_id 为准"
];

/** 出处口径说明（可折叠，置于栏三顶部；默认收起不占空间） */
function renderGuaranteeNote(container) {
  const box = document.createElement("details");
  box.className = "ev-guarantee";
  const sum = document.createElement("summary");
  sum.textContent = "关于原文定位与证据适用范围";
  box.append(sum);
  const g = document.createElement("div");
  g.className = "ev-note";
  g.textContent = "✔ 保证：" + GUARANTEES.join("；");
  const n = document.createElement("div");
  n.className = "ev-note warn";
  n.innerHTML = "不保证：<br>· " + NOT_GUARANTEED.join("<br>· ");   // ⚠ 由 .ev-note.warn::before 统一加
  box.append(g, n);
  container.append(box);
}

export function renderEvidences(container, data) {
  const count = document.getElementById("srcCount");
  count.textContent = `（${data.evidences.length} 条）`;
  container.replaceChildren();
  renderGuaranteeNote(container);

  // D7 quote 歧义检测：同一 quote 文本被多条出处引用 → 无 block_id 时无法判定是哪一处
  const quoteHits = new Map();
  for (const e of data.evidences) {
    const q = (e.quote || "").trim();
    if (q) quoteHits.set(q, (quoteHits.get(q) || 0) + 1);
  }

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
    meta.firstElementChild.className = "evidence-label";
    meta.append(Object.assign(document.createElement("span"), { textContent: e.page != null ? "第 " + e.page + " 页" : "页码未提供" }));
    item.append(meta);
    const technical = document.createElement("details");
    technical.className = "evidence-technical";
    const technicalSummary = document.createElement("summary");
    technicalSummary.textContent = "查看定位信息 ⌄";
    const technicalText = document.createElement("p");
    technicalText.textContent = ["块标识：" + (e.block_id || "未提供"), "坐标：" + (e.bbox ? "已提供" : "待补充"), e.table_id ? "表格：" + e.table_id : "", e.cell_ref ? "单元格：" + e.cell_ref : ""].filter(Boolean).join(" · ");
    technical.append(technicalSummary, technicalText);

    // D7：弱锚定——无块级锚点的出处（文本模式输入），quote 不唯一时定位无据
    if (!e.block_id && e.source_type !== "scan_region" && e.source_type !== "document") {
      const wk = document.createElement("div");
      wk.className = "ev-note warn";
      wk.textContent = "弱锚定：无 block_id（文本模式出处）——quote 在原文可能命中多处，不能唯一定位";
      item.append(wk);
    }
    // D7：quote 歧义——同数据集多条出处引用同一文本
    const q = (e.quote || "").trim();
    if (q && quoteHits.get(q) > 1) {
      const am = document.createElement("div");
      am.className = "ev-note warn";
      am.textContent = `quote 歧义：同文出处 ×${quoteHits.get(q)}——跳转定位需以 block_id 为准${e.block_id ? "（本条：" + e.block_id + "）" : ""}`;
      item.append(am);
    }
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
    item.append(quote, technical);


    container.append(item);
  }
}

export function focusEvidence(id) {
  document.querySelectorAll(".ev-item").forEach(el => el.classList.remove("active"));
  const card = document.getElementById("card-" + id);
  if (card) {
    card.classList.add("active");
    card.tabIndex = -1;
    card.focus({ preventScroll: true });
    card.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" });
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
