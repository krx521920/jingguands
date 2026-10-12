// render/verify.js —— D9 核验清单视图：先归因再判矛盾 + 双侧证据视图
// 主题落地：每条核验发现先渲染方的归因文案（message），再渲染判定码徽章——"先归因再判矛盾"。
// 出处：张的字段级 provenance（quote + 页码 + block_id）挂在条目上，页面与命令行同源。
import { FIELD_TEXT } from "./results.js";
const SEV = {
  conflict: { text: "矛盾", cls: "sev-conflict" },
  error:    { text: "错误", cls: "sev-error" },
  review:   { text: "待复核", cls: "sev-review" },
  info:     { text: "提示", cls: "sev-info" }
};
function sevOf(s) { return SEV[s] || { text: s || "未知", cls: "sev-review" }; }

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/** 核验清单条目：归因文案（大）→ 判定码（小徽章）→ 字段 → 出处。 */
function findingItem(f) {
  const item = el("div", "vf-item" + (f.severity === "conflict" || f.severity === "error" ? " vf-item-bad" : ""));
  const main = el("div", "vf-main");
  main.append(el("span", "vf-message", "归因：" + (f.message || "（方侧未提供文案）")));
  const sev = sevOf(f.severity);
  main.append(el("span", "vf-badge " + sev.cls, sev.text));
  item.append(main);
  const sub = el("div", "vf-sub");
  sub.append(el("span", null, (f.holder || f.dataset) + (f.event_id ? " · " + f.event_id : "")));
  if (f.fields.length) sub.append(el("span", null, "涉及字段：" + f.fields.map(k => FIELD_TEXT[k] || k).join("、")));
  item.append(sub);
  if (f.provenance) {
    const p = f.provenance;
    item.append(el("div", "vf-prov",
      "原文 · 第 " + (p.page ?? "?") + " 页：「" + String(p.quote || "未提供原文") + "」"));
  }
  const details = el("details", "evidence-technical");
  details.append(el("summary", null, "判定与定位详情 ⌄"), el("p", null,
    ["判定码：" + f.code, "数据集：" + f.dataset, f.provenance?.block_id ? "块标识：" + f.provenance.block_id : ""].filter(Boolean).join(" · ")));
  item.append(details);
  return item;
}

/** 双侧证据视图条目——两种形态：
 *  ① 双侧 quote 对照（docs/quotes 各两条）：A|B 并排；
 *  ② 合计勾稽（kind=group_total_matches_sum）：汇总侧 + 分项清单（先归因文案"分项之和=合计"，再列数字）。 */
function corroborationRow(c) {
  const row = el("div", "corr-row");
  const head = el("div", "corr-head");
  if (c.kind === "group_total_matches_sum") {
    head.append(el("span", "corr-title",
      "合计勾稽 · " + (c.field || "—") + "：分项之和 = 合计 " + (c.aggregate && c.aggregate.value != null ? c.aggregate.value.toLocaleString("zh-CN") : "—")));
    head.append(el("span", "corr-verdict", "✓ 勾稽成立"));
    row.append(head);
    const agg = el("div", "corr-agg");
    agg.append(el("span", "corr-doc", "合计侧 " + (c.aggregate && c.aggregate.doc)));
    agg.append(el("span", "corr-quote", String(c.aggregate && c.aggregate.value != null ? c.aggregate.value.toLocaleString("zh-CN") : "—")));
    agg.append(el("span", "corr-ent", c.entity || ""));
    row.append(agg);
    const parts = el("div", "corr-parts");
    for (const p of c.parts || []) {
      const chip = el("span", "corr-part");
      chip.textContent = (p.entity || "?") + " @ " + p.doc + " = " + (p.value != null ? p.value.toLocaleString("zh-CN") : "—");
      parts.append(chip);
    }
    row.append(parts);
    return row;
  }
  head.append(el("span", "corr-title",
    (c.entity || "—") + " · " + (c.field || "—") + " = " + (c.value != null ? c.value.toLocaleString("zh-CN") : "—")));
  head.append(el("span", "corr-verdict", "✓ 双侧一致（互证）"));
  row.append(head);
  const cols = el("div", "corr-cols");
  for (let i = 0; i < 2; i++) {
    const col = el("div", "corr-col");
    const doc = (c.docs || [])[i] || "?";
    const quote = (c.quotes || [])[i] ?? "—";
    col.append(el("div", "corr-doc", (i === 0 ? "A侧 " : "B侧 ") + doc));
    col.append(el("div", "corr-quote", "「" + String(quote) + "」"));
    const pg = (c.pages || [])[i];
    if (pg && pg.page != null) col.append(el("div", "corr-page", pg.dataset + " · 第 " + pg.page + " 页" + (pg.block_id ? " · " + pg.block_id : "")));
    cols.append(col);
  }
  row.append(cols);
  return row;
}

export function renderVerify(container, data) {
  container.replaceChildren();
  const s = data.summary;

  // 汇总条
  const top = el("div", "verify-top");
  top.innerHTML =
    "<b>核验清单（先归因再判矛盾）</b>：" + s.datasets_checked + " 个数据集经方 equity_check_D5 核验 · " +
    "事件 <b>" + s.verified_events + "</b> 通过 / <b>" + s.review_events + "</b> 待复核 · " +
    "发现 <b class='sev-conflict-text'>" + (s.by_severity.conflict || 0) + "</b> 矛盾 / " +
    (s.by_severity.error || 0) + " 错误 / <b>" + (s.by_severity.review || 0) + "</b> 待复核 · " +
    "跨文档互证点 <b>" + s.corroboration_total + "</b> 个 / 数值矛盾 <b>" + s.pair_conflict_total + "</b> 处";
  container.append(top);
  if (s.sidecar_errors) container.append(el("div", "verify-warn", "⚠ " + s.sidecar_errors + " 个 sidecar 解析失败（已计数，未静默丢弃）"));

  // 区一：核验清单（按严重级排序：矛盾→错误→待复核→提示）
  const sec1 = el("div", "verify-section");
  sec1.append(el("h3", null, "核验发现 · " + data.findings.length + " 项"));
  if (!data.findings.length) sec1.append(el("div", "empty", "无发现（全部事件通过核验）"));
  for (const f of data.findings) sec1.append(findingItem(f));
  container.append(sec1);

  // 区二：双侧证据视图（互证点）
  const sec2 = el("div", "verify-section");
  sec2.append(el("h3", null, "双侧证据 · " + s.corroboration_total + " 个互证点"));
  for (const p of data.pairs) {
    if (!p.corroborations.length && !(p.conflicts || []).length) continue;
    const g = el("div", "corr-group");
    g.append(el("div", "corr-group-title", p.group_id + "（" + p.predicted_relation + "）"));
    for (const c of p.corroborations) g.append(corroborationRow(c));
    for (const c of p.conflicts || []) {
      const row = el("div", "corr-row corr-row-bad");
      row.append(el("div", "corr-head", el("span", "corr-title", JSON.stringify(c).slice(0, 120))));
      g.append(row);
    }
    sec2.append(g);
  }
  container.append(sec2);

  // 口径说明
  const note = el("div", "verify-note");
  note.innerHTML =
    "口径：归因文案 = 方 equity_check_D5 findings.message（原样上屏，不改写）；判定码与严重级同源 sidecar；" +
    "出处 = 张的 provenance（quote/页码/block_id），与单文档视图同源；互证点 = 魏 B 引擎 consistency.corroborations（双侧 quote 逐字对照）。" +
    "缺出处或缺文案的条目显式标注，不虚构补齐。";
  container.append(note);
}

export function clearVerify(container) {
  container.replaceChildren();
  container.append(el("div", "empty", "核验视图未加载"));
}
