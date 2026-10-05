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
  holder: "变动股东", direction: "业务方向", shares_before: "变动前持股", shares_after: "变动后持股",
  ratio_before: "变动前比例", ratio_after: "变动后比例", change_shares: "变动股数", method: "变动方式",
  change_date: "变动完成日",
  // —— award_contract 中标/合同签署（14 字段：10 必选＋4 专业边界可选，v0.3c 权威清单）——
  // 专业边界语义：bid_amount（合同金额）≠ recognized_revenue（当期收入）；调价 not_disclosed ≠ 固定价格
  bidder: "中标人", tenderer: "招标人", project_name: "项目名称", bid_amount: "中标金额",
  currency: "币种", tax_included: "是否含税", duration: "工期",
  consortium_members: "联合体成员名单", consortium_shares: "联合体份额",
  consortium: "联合体及份额",   // v0.3b 前旧字段名（consortium 拆分前的历史数据兼容）
  bid_date: "中标/公告日期",
  contract_signed: "是否已签署合同", formal_award_notice_received: "是否收到正式中标通知书",
  price_adjustment_status: "调价条款状态", recognized_revenue: "当期确认收入"
};

// D2 转接口附带的口径标记（qualifier/scope → 中文；分母；标准化值）
const QUALIFIER_TEXT = { approx: "约", at_most: "不超过" };
const SCOPE_TEXT = { single: "单次", cumulative: "累计" };

export function fmtValue(f) {
  let v = f.value;
  if (typeof v === "number") v = v.toLocaleString("zh-CN");
  // 原文已含单位符号时不再追加（避免 "8.5% %" 这类重复；D5 演示发现）
  if (f.unit && !(typeof v === "string" && v.includes(f.unit))) v += " " + f.unit;
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

// v0.4 D4：direction 业务方向（宗 17:30 裁决：pledge/release，同组合先押后解为两个事件）
// D5/D6 增补：equity_change 方向 increase/decrease（增持/减持，徽章配色遵循中式涨红跌绿）
export const DIRECTION_TEXT = {
  pledge: "质押", release: "解除质押",
  increase: "增持", decrease: "减持"
};

// 方向徽章配色类（缺省用中性绿底，release/increase/decrease 各自着色）
const DIR_BADGE_CLASS = { release: "dir-release", increase: "dir-increase", decrease: "dir-decrease" };

// D4 异常状态汇总：字段级异常态 → 汇总条 chip（顺序即显示顺序）
const ABNORMAL_STATES = [
  { key: "pending_review",  label: "待复核" },
  { key: "unreadable",      label: "无法读取" },
  { key: "not_mentioned",   label: "未提及" },
  { key: "not_disclosed",   label: "未披露" },
  { key: "not_applicable",  label: "不适用" },
  { key: "_no_evidence",    label: "有值无出处" }
];

/** 扫描全量字段，返回异常清单 [{key, eventId, fieldName, rowId}] 供汇总条与行高亮。 */
function collectAbnormal(data) {
  const items = [];
  for (const ev of data.events || []) {
    for (const [name, f] of Object.entries(ev.fields || {})) {
      const st = f.status_override;
      const hasValue = f.normalized != null || f.value != null;
      let key = null;
      if (st && st !== "success") key = st;
      else if (hasValue && !f.evidence_id) key = "_no_evidence";
      if (key) items.push({ key, eventId: ev.event_id, fieldName: name, rowId: `row-${ev.event_id}-${name}` });
    }
  }
  return items;
}

/** D4 异常状态汇总条：chip 计数 + 点击循环定位到对应字段行。 */
function renderAnomalyBar(container, abnormal) {
  if (!abnormal.length) return;
  const bar = document.createElement("div");
  bar.className = "anomaly-bar";
  bar.append(Object.assign(document.createElement("span"), { textContent: "异常状态：" }));
  const cursor = {};   // key → 已定位到第几条（点击循环）
  for (const s of ABNORMAL_STATES) {
    const list = abnormal.filter(a => a.key === s.key);
    if (!list.length) continue;
    const chip = document.createElement("button");
    chip.className = "anomaly-chip " + s.key;
    chip.textContent = `${s.label} ${list.length}`;
    chip.title = list.map(a => `${a.eventId}.${a.fieldName}`).join("；");
    chip.addEventListener("click", () => {
      const i = (cursor[s.key] || 0) % list.length;
      cursor[s.key] = i + 1;
      const target = document.getElementById(list[i].rowId);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.classList.remove("flash");
        void target.offsetWidth;   // 重启动画
        target.classList.add("flash");
      }
    });
    bar.append(chip);
  }
  container.append(bar);
}

// ---- D5/D6：equity_change 前后对比块 ----

/** 从字段取数值：normalized 优先，兼容十进制字符串/带单位文本；降级态（status_override）不进对比。 */
function cmpNum(f) {
  if (!f || f.status_override) return null;
  for (const c of [f.normalized, f.value]) {
    if (c == null) continue;
    const n = Number(String(c).replace(/[,\s％%股]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** 对比块取值显示：优先原文口径字符串（自带单位），否则格式化数值+单位。 */
function cmpText(f, n, suffix) {
  if (f && typeof f.value === "string" && f.value.trim()) return f.value.trim();
  if (n != null) return n.toLocaleString("zh-CN") + suffix;
  return "—";
}

function cmpPair(label, fB, fA, suffix) {
  const b = cmpNum(fB), a = cmpNum(fA);
  if (b == null && a == null) return null;
  const row = document.createElement("div");
  row.className = "cmp-row";
  const name = document.createElement("span");
  name.className = "cmp-label";
  name.textContent = label;
  const vb = document.createElement("span");
  vb.className = "cmp-val before";
  vb.textContent = cmpText(fB, b, suffix);
  const arrow = document.createElement("span");
  arrow.className = "cmp-arrow";
  arrow.textContent = "→";
  const va = document.createElement("span");
  va.className = "cmp-val after";
  va.textContent = cmpText(fA, a, suffix);
  row.append(name, vb, arrow, va);
  if (b != null && a != null) {
    const d = document.createElement("span");
    d.className = "cmp-delta";
    const diff = a - b;
    d.textContent = (diff > 0 ? "+" : "") + diff.toLocaleString("zh-CN") + suffix;
  }
  return row;
}

/** equity_change 专属：前后股数/前后比例并排展示 + 分母口径提示 + 冲突提示。
 *  冲突码口径对齐方轩诚 equity_check_D5 v0.5.0（CHANGE_SHARES_MISMATCH / DIRECTION_MISMATCH /
 *  RATIO_DIRECTION_CONFLICT / RATIO_BASIS_MISMATCH）；若有方核验报告（ev.checks）则原样展示，本地检查退位。 */
export function renderComparison(container, ev) {
  if (ev.event_type !== "equity_change") return;
  const F = ev.fields || {};
  const block = document.createElement("div");
  block.className = "cmp-block";

  const pairShares = cmpPair("股数", F.shares_before, F.shares_after, "股");
  const pairRatio = cmpPair("比例", F.ratio_before, F.ratio_after, "%");
  if (pairShares) block.append(pairShares);
  if (pairRatio) block.append(pairRatio);

  // 分母口径提示（口径字典 §3：比例分母必须显式，不默认总股本）
  if (pairRatio) {
    const dk = f => (f && f.denominator && f.denominator.kind) || null;
    const d1 = dk(F.ratio_before), d2 = dk(F.ratio_after);
    const hint = document.createElement("div");
    hint.className = "cmp-denominator";
    if (d1 && d1 === d2) hint.textContent = "分母口径：" + (F.ratio_before.denominator.kind_text || d1);
    else if (d1 || d2) hint.textContent = "⚠ 分母口径不一致（" + (d1 || "未声明") + " vs " + (d2 || "未声明") + "），比例不相减";
    else hint.textContent = "⚠ 分母口径未声明（不默认总股本）";
    block.append(hint);
  }

  if (!pairShares && !pairRatio && !ev.checks) return;

  // 方核验报告优先（sidecar check_report → ev.checks）；无报告时页面本地兜底检查（同码口径）
  const conflicts = ev.checks
    ? ev.checks.map(c => ({ code: c.code, severity: c.severity, message: c.message }))
    : localEquityChecks(F);

  const conflictsBox = document.createElement("div");
  conflictsBox.className = "cmp-conflicts";
  const sevText = { error: "错误", conflict: "冲突", review: "复核" };
  for (const c of conflicts) {
    const line = document.createElement("div");
    line.className = "cmp-conflict sev-" + (c.severity || "review");
    const code = document.createElement("span");
    code.className = "cmp-code";
    code.textContent = c.code;
    line.append(code, document.createTextNode((sevText[c.severity] || c.severity || "") + "：" + (c.message || "")));
    if (c.fields && c.fields.length) {
      const fl = document.createElement("span");
      fl.className = "cmp-fields";
      fl.textContent = " [" + c.fields.join(", ") + "]";
      line.append(fl);
    }
    conflictsBox.append(line);
  }
  if (conflictsBox.children.length) {
    const label = document.createElement("div");
    label.className = "cmp-conflicts-label";
    label.textContent = ev.checks ? "方 equity_check_D5 核验结果：" : "页面侧冲突检查（对齐方 equity_check_D5 v0.5.0 码表）：";
    block.append(label, conflictsBox);
  }
  container.append(block);
}

/** 页面本地兜底检查（仅在无方核验报告时使用）。码值/语义对齐 equity_check_D5 v0.5.0，只比页面自有字段。 */
function localEquityChecks(F) {
  const out = [];
  const sb = cmpNum(F.shares_before), sa = cmpNum(F.shares_after);
  const rb = cmpNum(F.ratio_before), ra = cmpNum(F.ratio_after);
  const cs = cmpNum(F.change_shares);
  // CHANGE_SHARES_MISMATCH：披露变动绝对量与 |后股数−前股数| 不符
  if (sb != null && sa != null && cs != null && Math.abs(Math.abs(sa - sb) - cs) > 0.5) {
    out.push({ code: "CHANGE_SHARES_MISMATCH", severity: "conflict",
      message: `披露变动绝对量与 |后股数−前股数| 不符：Δ=${(sa - sb).toLocaleString("zh-CN")} 股，变动股数=${cs.toLocaleString("zh-CN")} 股`,
      fields: ["shares_before", "shares_after", "change_shares"] });
  }
  // DIRECTION_MISMATCH：前后股数与披露方向反转
  const dF = F.direction;
  const dirKey = dF && (DIRECTION_TEXT[dF.normalized] ? dF.normalized : (DIRECTION_TEXT[dF.value] ? dF.value : null));
  if (dirKey === "increase" && sb != null && sa != null && sa < sb) {
    out.push({ code: "DIRECTION_MISMATCH", severity: "conflict", message: "前后股数与披露方向反转（方向=增持 但 变动后 < 变动前），保留原值供核对",
      fields: ["shares_before", "shares_after", "direction"] });
  }
  if (dirKey === "decrease" && sb != null && sa != null && sa > sb) {
    out.push({ code: "DIRECTION_MISMATCH", severity: "conflict", message: "前后股数与披露方向反转（方向=减持 但 变动后 > 变动前），保留原值供核对",
      fields: ["shares_before", "shares_after", "direction"] });
  }
  // RATIO_BASIS_MISMATCH / RATIO_DIRECTION_CONFLICT：分母一致才相减比较
  const d1 = F.ratio_before && F.ratio_before.denominator && F.ratio_before.denominator.kind;
  const d2 = F.ratio_after && F.ratio_after.denominator && F.ratio_after.denominator.kind;
  if (rb != null && ra != null) {
    if (d1 !== d2 || !["total_share_capital", "holder_shares"].includes(d1)) {
      if (d1 || d2) out.push({ code: "RATIO_BASIS_MISMATCH", severity: "review",
        message: "比例分母种类不同或不属于支持的股份分母，不相减", fields: ["ratio_before", "ratio_after"] });
    } else if (sb != null && sa != null) {
      const sSign = Math.sign(sa - sb), rSign = Math.sign(ra - rb);
      if (sSign !== 0 && rSign !== 0 && sSign !== rSign) {
        out.push({ code: "RATIO_DIRECTION_CONFLICT", severity: "review",
          message: "股数与披露比例反向变化，需核对分母变动；不自动推翻股数方向",
          fields: ["shares_before", "shares_after", "ratio_before", "ratio_after"] });
      }
    }
  }
  return out;
}

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

  // D4 异常状态汇总条（缺失字段 + 降级态一屏可见，点击定位）
  const abnormal = collectAbnormal(data);
  renderAnomalyBar(container, abnormal);

  for (const ev of data.events) {
    const card = document.createElement("div");
    card.className = "event-card";

    const head = document.createElement("div");
    head.className = "head";
    const title = document.createElement("strong");
    title.textContent = `事件 ${ev.event_id} · ${EVENT_TYPE_TEXT[ev.event_type] || ev.event_type}`;
    head.append(title, badge(ev.status));   // D5：去掉右侧重复的 eid（标题已含 id）
    // v0.4 D4：direction=release（解除质押）独立事件，卡片标题区显式区分（默认 pledge 不加噪音）
    // 枚举键在 normalized（raw_value 是中文原文），两者都兜底
    const dF = ev.fields.direction;
    const dirKey = dF && (DIRECTION_TEXT[dF.normalized] ? dF.normalized : (DIRECTION_TEXT[dF.value] ? dF.value : null));
    if (dirKey) {
      const dir = document.createElement("span");
      dir.className = "dir-badge" + (DIR_BADGE_CLASS[dirKey] ? " " + DIR_BADGE_CLASS[dirKey] : "");
      dir.textContent = DIRECTION_TEXT[dirKey];
      head.append(dir);
    }
    card.append(head);

    // D5/D6：equity_change 前后对比块（前后股数/前后比例并排 + 冲突提示）
    renderComparison(card, ev);

    const table = document.createElement("table");
    table.className = "fields";
    for (const [key, f] of Object.entries(ev.fields)) {
      const tr = document.createElement("tr");
      tr.id = `row-${ev.event_id}-${key}`;   // D4：异常汇总条定位锚点
      const st = f.status_override;
      const hasValue = f.normalized != null || f.value != null;
      if ((st && st !== "success") || (hasValue && !f.evidence_id)) tr.classList.add("row-abnormal");   // D4：降级行高亮
      const tdK = document.createElement("td");
      tdK.className = "k";
      tdK.textContent = FIELD_TEXT[key] || key;
      const tdV = document.createElement("td");
      tdV.className = "v";
      // direction 字段显示中文（枚举键 normalized 优先，原文兜底），其余走通用格式化
      tdV.append(key === "direction" ? (DIRECTION_TEXT[f.normalized] || DIRECTION_TEXT[f.value] || f.value || "—") : fmtValue(f),
                 badge(f.status_override || "success"));   // D3：字段级状态（不再继承事件级待复核，修错位）
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
