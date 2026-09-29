// render/results.js —— 栏二：抽取结果（事件卡片 + 字段表 + 证据锚点）
import { badge } from "../status.js";

// v0.3 事件类型（bid_won 已改名 award_contract）
export const EVENT_TYPE_TEXT = {
  pledge: "质押", equity_change: "股权变动", award_contract: "中标·合同签署"
};

export const FIELD_TEXT = {
  // —— 通用/旧提案字段 ——
  pledgor: "出质人", pledgee: "质权人", announce_date: "公告日期",
  share_count: "质押股数", pledge_ratio: "质押比例",   // D1 mock 数据集字段（旧提案，保留兼容）
  amount: "交易金额", share_change: "变动股数",
  // —— pledge 质押（v0.3 注册表 13 字段）——
  pledged_shares_this_time: "本次质押股数", pledged_shares_cumulative: "累计质押股数",
  pledged_ratio_this_time_of_held: "本次质押占其所持股份比例", pledged_ratio_this_time_of_total: "本次质押占公司总股本比例",
  pledged_ratio_cumulative_of_held: "累计质押占其所持股份比例", pledged_ratio_cumulative_of_total: "累计质押占公司总股本比例",
  pledge_amount: "质押金额", start_date: "质押起始日", end_date: "质押到期日", purpose: "资金用途",
  announcement_date: "公告日期",
  // —— equity_change 股权变动（9 字段）——
  holder: "变动股东", direction: "变动方向", shares_before: "变动前持股", shares_after: "变动后持股",
  ratio_before: "变动前比例", ratio_after: "变动后比例", change_shares: "变动股数", method: "变动方式",
  change_date: "变动完成日",
  // —— award_contract 中标/合同签署（9 字段，v0.3 由 bid_won 改名）——
  bidder: "中标人", tenderer: "招标人", project_name: "项目名称", bid_amount: "中标金额",
  currency: "币种", tax_included: "是否含税", duration: "工期", consortium: "联合体及份额",
  bid_date: "中标/公告日期"
};

// D2 转接口附带的口径标记（qualifier/scope → 中文；分母；标准化值）
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
  const nu = f.normalized_unit ?? f.unit;
  let s = parts.length ? "（" + parts.join(" · ") + "）" : "";
  if (f.normalized != null && String(f.normalized) !== String(f.value)) {
    s += ` 标准化=${f.normalized}${nu ? " " + nu : ""}`;
  }
  return s.trim();
}

// v0.3b D3：出处块类型中文（与桥 SOURCE_TYPE_TEXT 一致）
const SOURCE_TYPE_TEXT = {
  paragraph: "段落", cell: "表格", table: "表格兜底", scan_region: "扫描区域", document: "整份文档"
};

export function renderResults(container, data, onFocusEvidence) {
  const count = document.getElementById("evCount");
  count.textContent = `（${data.events.length} 个事件）`;
  container.replaceChildren();

  // D3 完整性警告条（桥的断链/错位自检结果）
  if (data.integrity && data.integrity.issues.length) {
    const warn = document.createElement("div");
    warn.className = "integrity-warn" + (data.integrity.ok ? " warn-only" : "");
    const errs = data.integrity.issues.filter(i => i.level === "error").length;
    warn.textContent = `⛓ 完整性检查：${errs ? errs + " 处断链，" : ""}${data.integrity.issues.length} 条提示 —— ` +
      data.integrity.issues.map(i => `${i.where}: ${i.what}`).join("；");
    container.append(warn);
  }

  for (const ev of data.events) {
    const card = document.createElement("div");
    card.className = "event-card";

    const head = document.createElement("div");
    head.className = "head";
    const title = document.createElement("strong");
    title.textContent = `事件 ${ev.event_id} · ${EVENT_TYPE_TEXT[ev.event_type] || ev.event_type}`;
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
      tdV.append(fmtValue(f), badge(f.status_override || "success"));   // D3：字段级状态（不再继承事件级待复核，修错位）
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
        // D3：锚点带上出处定位（表格 cell_ref / 段落），一眼看清出处类型
        const first = (data.evidences || []).find(x => x.evidence_id === f.evidence_id) || {};
        const st = first.source_type && SOURCE_TYPE_TEXT[first.source_type] ? SOURCE_TYPE_TEXT[first.source_type] : "";
        const loc = first.cell_ref ? "#" + first.cell_ref : (first.page != null ? " p" + first.page : "");
        link.textContent = `证据 ${f.evidence_id}${st ? " · " + st + loc : ""}`;
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
