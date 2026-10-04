// render/pairs.js —— D8 跨文档配对视图：双栏成员对比 + 三态判定
// 质疑①修复：每组双侧 issuer_code / notice_number 显式上屏（含 null 与"正文引用编号"口径说明）——双侧文件版本可追踪。
// 质疑②修复：predicted_relation=unknown 一律渲染"证据不足 · 无法判定"（黄），绝不落入"不同事件"（灰）。

const REL = {
  related:      { text: "同事件互证",          cls: "rel-related" },
  unrelated:    { text: "不同事件",            cls: "rel-unrelated" },
  insufficient: { text: "证据不足",            cls: "rel-unknown" },
  unknown:      { text: "证据不足 · 无法判定", cls: "rel-unknown" }   // 魏 B 输出的是 unknown
};

// 三态同色类：expected=insufficient 与 predicted=unknown 属同一态（不误判为不一致）
function clsOf(rel) { return (REL[rel] || {}).cls || "rel-unknown"; }
function textOf(rel) { return (REL[rel] || {}).text || rel; }

const REASON_TEXT = {
  SHARED_ENTITIES_AND_ANCHORS: "共享主体 + 共享数字锚点",
  REVERSE_MATCH: "反向勾稽（增减互补）",
  NO_SHARED_ENTITY: "无共享主体",
  NO_SHARED_ANCHOR: "无共享数字锚点",
  INSUFFICIENT_SIGNALS: "可用信号不足 → 不下结论",
  MEMBER_NO_USABLE_FIELDS: "一侧 0 可用字段（扫描降级）"
};
function reasonChip(r) {
  const [code, arg] = String(r).split(":");
  const span = document.createElement("span");
  span.className = "reason-chip";
  span.textContent = (REASON_TEXT[code] || code) + (arg ? "：" + arg : "");
  return span;
}

function kv(label, value, cls) {
  const row = document.createElement("div");
  row.className = "pm-row" + (cls ? " " + cls : "");
  const l = document.createElement("span");
  l.className = "pm-label";
  l.textContent = label;
  const v = document.createElement("span");
  v.className = "pm-value";
  v.textContent = value;
  row.append(l, v);
  return row;
}

/** 成员栏：元数据（代码/编号/哈希）+ 本地原文锚点。 */
function memberCol(m, side) {
  const col = document.createElement("div");
  col.className = "member-col";
  col.append(
    kv(side + " · 事件信封", m.case_id, "pm-strong"),
    kv("主体", m.issuer_name || "—"),
    kv("证券代码", m.issuer_code || "—（清单未登记）", m.issuer_code ? "pm-code" : "pm-missing"),
    kv("公告编号", m.notice_number || "—（首页无本文件编号）", m.notice_number ? "pm-code" : "pm-missing")
  );
  // v0.2 口径：编号 null 不是缺数据，是"只取首页"的诚实口径——把引用编号与说明带出来，防止被当成漏显示
  if (!m.notice_number && (m.referenced_notice_numbers || []).length) {
    col.append(kv("正文引用编号", m.referenced_notice_numbers.join("、") + "（非本文件编号）", "pm-note"));
  }
  if (m.notice_note) col.append(kv("编号说明", m.notice_note, "pm-note"));
  if (m.raw_sha256) col.append(kv("raw 哈希", String(m.raw_sha256).slice(0, 12) + "…", "pm-hash"));
  if (m.gold_sha256) col.append(kv("gold 哈希", String(m.gold_sha256).slice(0, 12) + "…", "pm-hash"));

  if (m.local && m.local.quote) {
    const q = document.createElement("div");
    q.className = "pm-quote";
    q.textContent = "原文（" + m.local.dataset + " · " + (m.local.event_id || "?") + " · 字段 " + (m.local.field || "?") + " · 第 " + (m.local.page ?? "?") + " 页）：「" + String(m.local.quote).slice(0, 60) + "」";
    col.append(q);
  } else if (m.local && m.local.dataset) {
    const q = document.createElement("div");
    q.className = "pm-quote pm-quote-miss";
    q.textContent = "本地信封 " + m.local.dataset + " 存在，但无可引用字段出处";
    col.append(q);
  } else {
    const q = document.createElement("div");
    q.className = "pm-quote pm-quote-miss";
    q.textContent = "本地无此信封（仅清单元数据）";
    col.append(q);
  }
  return col;
}

function groupCard(g) {
  const card = document.createElement("div");
  card.className = "pair-card";
  if (g.group_id === "D8-PAIR-013") card.classList.add("pair-card-unknown");   // 三态样例组高亮

  // 头部：组号 + 目的 + 双徽章（预期 → 实判）
  const head = document.createElement("div");
  head.className = "pair-head";
  const title = document.createElement("span");
  title.className = "pair-title";
  title.textContent = g.group_id + " · " + (g.test_purpose || "");
  head.append(title);

  const badgeWrap = document.createElement("span");
  badgeWrap.className = "pair-badges";
  const be = document.createElement("span");
  be.className = "rel-badge " + clsOf(g.expected_relation);
  be.textContent = "预期：" + textOf(g.expected_relation);
  const arrow = document.createElement("span");
  arrow.className = "pair-arrow";
  arrow.textContent = "→";
  badgeWrap.append(be, arrow);
  if (g.b) {
    const bp = document.createElement("span");
    bp.className = "rel-badge " + clsOf(g.b.predicted_relation);
    bp.textContent = "魏B实判：" + textOf(g.b.predicted_relation);
    badgeWrap.append(bp);
    // 一致性指示：insufficient/unknown 同态视为一致
    const match = clsOf(g.expected_relation) === clsOf(g.b.predicted_relation);
    const mi = document.createElement("span");
    mi.className = "pair-match " + (match ? "ok" : "bad");
    mi.textContent = match ? "✓ 与预期一致" : "✗ 与预期不一致";
    badgeWrap.append(mi);
  } else {
    const np = document.createElement("span");
    np.className = "pair-match bad";
    np.textContent = "魏B 无该组结果（not_run）";
    badgeWrap.append(np);
  }
  head.append(badgeWrap);
  card.append(head);

  // 双栏成员对比（质疑①核心：双侧 issuer_code / notice_number 并排）
  const cols = document.createElement("div");
  cols.className = "pair-cols";
  cols.append(memberCol(g.members[0], "A侧"), memberCol(g.members[1] || { case_id: "—" }, "B侧"));
  card.append(cols);

  // 判定依据行
  if (g.relation_basis) {
    const basis = document.createElement("div");
    basis.className = "pair-basis";
    basis.textContent = "判定依据：" + g.relation_basis;
    card.append(basis);
  }
  if (g.b) {
    const foot = document.createElement("div");
    foot.className = "pair-foot";
    for (const r of g.b.reasons || []) foot.append(reasonChip(r));
    if (g.b.corroborations_total != null) {
      const c = document.createElement("span");
      c.className = "reason-chip reason-ok";
      c.textContent = "互证点 " + g.b.corroborations_total + " 个";
      foot.append(c);
    }
    if (g.b.conflicts_total != null && g.b.conflicts_total > 0) {
      const c = document.createElement("span");
      c.className = "reason-chip reason-bad";
      c.textContent = "⚠ 数值矛盾 " + g.b.conflicts_total + " 处";
      foot.append(c);
    }
    card.append(foot);
    // 魏 B 运行链路（版本可追踪）
    const links = (g.b.a_run_links || []).map(l => l.case_id + " @ " + l.a_run_id + " (v" + l.code_version + (l.is_mock ? ", mock" : ", 真实") + ")");
    if (links.length) {
      const rl = document.createElement("div");
      rl.className = "pair-runlinks";
      rl.textContent = "A-run 链路：" + links.join(" ｜ ");
      card.append(rl);
    }
    // 质疑②核心解释：unknown 时的显式说明（绝不写成"不同事件"）
    if (g.b.predicted_relation === "unknown") {
      const warn = document.createElement("div");
      warn.className = "pair-unknown-note";
      warn.innerHTML = "⚠ 本组判定为<b>「证据不足 · 无法判定」</b>——一侧信封 0 可用字段，信号不足时不允许下「不同事件」的结论（口径：INSUFFICIENT_SIGNALS）。";
      card.append(warn);
    }
  }
  return card;
}

export function renderPairs(container, data) {
  container.replaceChildren();

  // 顶部：诚实边界 + 评分摘要
  const top = document.createElement("div");
  top.className = "pairs-top";
  const s = data.summary;
  top.innerHTML =
    "<b>" + data.total + " 组公开开发配对</b>（4 同事件 + 8 不同事件 + 1 证据不足）" +
    (s ? " ｜ 魏B 全量 " + s.groups_checked + "/" + s.groups_total + "：related " + s.related_hit + " · unrelated clean " + s.unrelated_clean + " · 证据不足 " + s.insufficient_signalled + "（run " + (s.b_run || "?") + "）" : "") +
    "<div class='pairs-ceiling'>诚实边界：" + ((data.corpus_ceiling || {}).note || "") + "</div>";
  container.append(top);

  for (const g of data.groups) container.append(groupCard(g));

  const note = document.createElement("div");
  note.className = "pairs-guarantee";
  note.innerHTML =
    "口径说明：三态判定——<b>同事件互证</b>（共享主体+数字锚点/反向勾稽）、<b>不同事件</b>（无共享主体且无共享锚点，且两侧均有足够可用字段）、" +
    "<b>证据不足</b>（一侧 0 可用字段或信号不足 → 输出 unknown，不下结论）。" +
    "预期三态来自宗封存清单（expectation_values: related/unrelated/insufficient），实判来自魏 B 引擎报告；评分 13/13 PASS 见 evaluation/D8。";
  container.append(note);
}

export function clearPairs(container) {
  container.replaceChildren();
  const empty = document.createElement("div");
  empty.className = "empty";
  empty.textContent = "配对视图未加载";
  container.append(empty);
}
