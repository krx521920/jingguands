// render/results.js —— 栏二：抽取结果（事件卡片 + 字段表 + 证据锚点）
import { badge } from "../status.js";

export const FIELD_TEXT = {
  pledgor: "出质人", pledgee: "质权人", share_count: "质押股数",
  pledge_ratio: "质押比例", announce_date: "公告日期",
  // 股权变动（D5 预留）
  holder: "股东", shares_before: "变动前持股", shares_after: "变动后持股",
  change_reason: "变动原因"
};

export function fmtValue(f) {
  let v = f.value;
  if (typeof v === "number") v = v.toLocaleString("zh-CN");
  if (f.unit) v += " " + f.unit;
  return v;
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
