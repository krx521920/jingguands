// render/results.js —— 栏二：抽取结果（事件卡片 + 字段表 + 证据锚点）
import { badge } from "../status.js";

export const FIELD_TEXT = {
  pledgor: "出质人", pledgee: "质权人", share_count: "质押股数",
  pledge_ratio: "质押比例", announce_date: "公告日期",
  amount: "交易金额", share_change: "变动股数",   // D2：方口径记录映射进来的字段
  // 股权变动（D5 预留）
  holder: "股东", shares_before: "变动前持股", shares_after: "变动后持股",
  change_reason: "变动原因"
};

// D2 转接口附带的口径标记（方的 qualifier/scope → 中文）
const QUALIFIER_TEXT = { approx: "约", at_most: "不超过" };
const SCOPE_TEXT = { single: "单次", cumulative: "累计" };

export function fmtValue(f) {
  let v = f.value;
  if (typeof v === "number") v = v.toLocaleString("zh-CN");
  if (f.unit) v += " " + f.unit;
  return v;
}

// 口径标注：约/不超过 · 单次/累计 · 分母口径 · 标准化值（十进制字符串，比例=百分点）
export function fmtMarks(f) {
  const parts = [];
  if (f.qualifier && QUALIFIER_TEXT[f.qualifier]) parts.push(QUALIFIER_TEXT[f.qualifier]);
  if (f.scope && SCOPE_TEXT[f.scope]) parts.push(SCOPE_TEXT[f.scope]);
  if (f.denominator) parts.push(`分母=${f.denominator.kind_text || f.denominator.kind}`);
  let s = parts.length ? "（" + parts.join(" · ") + "）" : "";
  if (f.normalized != null && String(f.normalized) !== String(f.value)) {
    s += ` 标准化=${f.normalized}${f.unit ? " " + f.unit : ""}`;
  }
  return s.trim();
}

export function renderResults(container, data, onFocusEvidence) {
  const count = document.getElementById("evCount");
  count.textContent = `（${data.events.length} 个事件）`;
  container.replaceChildren();

  for (const ev of data.events) {
    const card = document.createElement("div");
    card.className = "event-card";

    const head = document.createElement("div");
    head.className = "head";
    const title = document.createElement("strong");
    title.textContent = `事件 ${ev.event_id} · ${ev.event_type}`;
    const eid = document.createElement("span");
    eid.className = "eid";
    eid.textContent = ev.event_id;
    head.append(title, badge(ev.status), eid);
    card.append(head);

    const table = document.createElement("table");
    table.className = "fields";
    for (const [key, f] of Object.entries(ev.fields)) {
      const tr = document.createElement("tr");
      const tdK = document.createElement("td");
      tdK.className = "k";
      tdK.textContent = FIELD_TEXT[key] || key;
      const tdV = document.createElement("td");
      tdV.className = "v";
      tdV.append(fmtValue(f), badge(f.status_override || ev.status));
      const marks = fmtMarks(f);
      if (marks) {
        const mk = document.createElement("span");
        mk.className = "ev-link none";
        mk.textContent = marks;
        tdV.append(mk);
      }
      if (f.evidence_id) {
        const link = document.createElement("span");
        link.className = "ev-link";
        link.textContent = `证据 ${f.evidence_id}`;
        link.addEventListener("click", () => onFocusEvidence(f.evidence_id));
        tdV.append(link);
      } else {
        const none = document.createElement("span");
        none.className = "ev-link none";
        none.textContent = "无出处";
        tdV.append(none);
      }
      tr.append(tdK, tdV);
      table.append(tr);
    }
    card.append(table);
    container.append(card);
  }
}

export function clearResults(container) {
  document.getElementById("evCount").textContent = "";
  container.replaceChildren();
  const empty = document.createElement("div");
  empty.className = "empty";
  empty.textContent = "尚未加载数据——先上传文件或选择数据集加载";
  container.append(empty);
}
