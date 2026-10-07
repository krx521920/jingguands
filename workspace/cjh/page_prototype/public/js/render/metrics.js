/**
 * D11 结果图表渲染（零依赖，纯 DOM + 内联 SVG）
 *
 * 口径纪律：
 *  - 所有数值来自 /api/metrics（服务端实算），不在前端二次加工
 *  - "未核"用灰色斜纹单独标注，绝不并入命中率分母
 *  - 不达标指标显示红色实值 + 目标线，不做任何美化修饰
 */
const NS = "http://www.w3.org/2000/svg";

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = String(text);
  return n;
}
function svg(tag, attrs) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

function statusText(s) {
  return { pass: "达标", below: "未达标", unverified: "未核", none: "覆盖率" }[s] || s;
}

/** 横向条形图：目标线 + 实值 + 未核灰条 */
function barChart(rows, opts) {
  const o = Object.assign({ w: 640, rowH: 46, padL: 190, padR: 92, padT: 30, scaleMax: 100 }, opts);
  const h = o.padT + rows.length * o.rowH + 14;
  const s = svg("svg", { viewBox: `0 0 ${o.w} ${h}`, width: "100%", height: h,
    role: "img", "aria-label": o.title || "指标条形图" });
  const plotW = o.w - o.padL - o.padR;
  const X = (v) => (Math.min(v, o.scaleMax) / o.scaleMax) * plotW;

  // 图例（锚点图无判定语义，不画图例）
  if (o.legend !== false) {
    const g0 = svg("g");
    const legend = [
      ["var(--ok)", "达标"], ["var(--bad)", "未达标"], ["var(--gray)", "未核·不计入分母"],
    ];
    legend.forEach((lg, i) => {
      const r = svg("rect", { x: o.padL + i * 150, y: 8, width: 11, height: 11,
        fill: lg[0], opacity: 0.85, rx: 2 });
      const t = svg("text", { x: o.padL + i * 150 + 16, y: 18, "font-size": 11,
        fill: "var(--muted)" });
      t.textContent = lg[1];
      g0.appendChild(r); g0.appendChild(t);
    });
    s.appendChild(g0);
  }

  // 刻度（每 25% 一根浅色竖线，便于读数）
  for (let v = 0; v <= o.scaleMax; v += 25) {
    const x = o.padL + X(v);
    s.appendChild(svg("line", { x1: x, y1: o.padT - 4, x2: x, y2: o.padT + rows.length * o.rowH - 6,
      stroke: "var(--border)", "stroke-width": 1, opacity: 0.6 }));
    const tk = svg("text", { x, y: o.padT - 8, "font-size": 9.5, fill: "var(--muted)",
      "text-anchor": "middle" });
    tk.textContent = v + "%";
    s.appendChild(tk);
  }

  rows.forEach((r, i) => {
    const y = o.padT + i * o.rowH;
    const g = svg("g");

    const name = svg("text", { x: 0, y: y + 22, "font-size": 12.5, fill: "var(--text)" });
    name.textContent = r.name;
    g.appendChild(name);

    const sub = svg("text", { x: 0, y: y + 36, "font-size": 10.5, fill: "var(--muted)" });
    sub.textContent = r.sub || "";
    g.appendChild(sub);

    const unverified = r.value === null || r.value === undefined;
    const color = unverified ? "var(--gray)"
      : r.status === "pass" ? "var(--ok)"
      : r.status === "below" ? "var(--bad)" : "var(--warn)";

    if (unverified) {
      g.appendChild(svg("rect", { x: o.padL, y: y + 10, width: plotW, height: 18,
        fill: "url(#d11-hatch)", stroke: "var(--border)", "stroke-width": 1 }));
    }

    const w = unverified ? plotW : Math.max(2, X(r.value));
    g.appendChild(svg("rect", { x: o.padL, y: y + 10, width: w, height: 18,
      fill: color, opacity: unverified ? 0.28 : 0.85, rx: 2 }));

    if (!unverified && r.target !== null && r.target !== undefined) {
      const tx = o.padL + X(r.target);
      g.appendChild(svg("line", { x1: tx, y1: y + 5, x2: tx, y2: y + 33,
        stroke: "var(--text)", "stroke-width": 2, "stroke-dasharray": "4 2" }));
      const tl = svg("text", { x: tx, y: y + 2, "font-size": 10, fill: "var(--text)",
        "text-anchor": "middle" });
      tl.textContent = "目标 " + r.target + r.unit;
      g.appendChild(tl);
    }

    const val = svg("text", { x: o.padL + plotW + 8, y: y + 24, "font-size": 13,
      fill: color, "font-weight": 700 });
    val.textContent = unverified ? "未核" : r.value + r.unit;
    g.appendChild(val);

    const st = svg("text", { x: o.padL + plotW + 8, y: y + 37, "font-size": 10.5,
      fill: "var(--muted)" });
    // 锚点图不判定达标，只显示缺失占比
    st.textContent = r.raw && !unverified
      ? (r.value >= 100 ? "全部覆盖" : "缺 " + (100 - r.value).toFixed(2) + "%")
      : statusText(r.status);
    g.appendChild(st);

    s.appendChild(g);
  });

  const defs = svg("defs");
  const pat = svg("pattern", { id: "d11-hatch", width: 8, height: 8,
    patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
  pat.appendChild(svg("rect", { width: 8, height: 8, fill: "var(--gray-bg)" }));
  pat.appendChild(svg("line", { x1: 0, y1: 0, x2: 0, y2: 8, stroke: "var(--gray)",
    "stroke-width": 3, opacity: 0.5 }));
  defs.appendChild(pat);
  s.appendChild(defs);
  return s;
}

/** parser 版本命中对比（分组条形） */
function parserChart(groups) {
  const o = { w: 640, rowH: 54, padL: 210, padR: 70, padT: 40 };
  const h = o.padT + groups.length * o.rowH + 16;
  const s = svg("svg", { viewBox: `0 0 ${o.w} ${h}`, width: "100%", height: h,
    role: "img", "aria-label": "解析器版本出处命中率对比" });
  const plotW = o.w - o.padL - o.padR;

  const t = svg("text", { x: 0, y: 14, "font-size": 11.5, fill: "var(--muted)" });
  t.textContent = "同一文档（pledge.pdf / d44e95085）下两种解析器版本的溯源指向正确率";
  s.appendChild(t);

  groups.forEach((g, i) => {
    const y = o.padT + i * o.rowH;
    const wr = svg("g");
    const name = svg("text", { x: 0, y: y + 20, "font-size": 12.5, fill: "var(--text)" });
    name.textContent = g.parser;
    wr.appendChild(name);
    const sub = svg("text", { x: 0, y: y + 34, "font-size": 10.5, fill: "var(--muted)" });
    sub.textContent = g.datasets.join(", ") + "  （n=" + g.checked + "）";
    wr.appendChild(sub);

    // 目标线 95%
    const tx = o.padL + 0.95 * plotW;
    wr.appendChild(svg("line", { x1: tx, y1: y + 2, x2: tx, y2: y + 32,
      stroke: "var(--text)", "stroke-width": 2, "stroke-dasharray": "4 2" }));
    const tl = svg("text", { x: tx, y: y - 1, "font-size": 9.5, fill: "var(--text)",
      "text-anchor": "middle" });
    tl.textContent = "目标 95%";
    wr.appendChild(tl);

    const color = g.hit_rate_pct >= 95 ? "var(--ok)" : g.hit_rate_pct >= 60 ? "var(--warn)" : "var(--bad)";
    wr.appendChild(svg("rect", { x: o.padL, y: y + 8, width: Math.max(3, (g.hit_rate_pct / 100) * plotW),
      height: 20, fill: color, opacity: 0.85, rx: 2 }));

    // 命中/未命中分段计数
    const val = svg("text", { x: o.padL + plotW + 8, y: y + 24, "font-size": 12.5,
      fill: color, "font-weight": 700 });
    val.textContent = g.hit_rate_pct + "%";
    wr.appendChild(val);
    const cnt = svg("text", { x: 0, y: y + 48, "font-size": 10.5, fill: "var(--muted)" });
    cnt.textContent = "命中 " + g.hit + " / 实核 " + g.checked + " ＝ 未命中 " + (g.checked - g.hit);
    wr.appendChild(cnt);
    s.appendChild(wr);
  });
  return s;
}

/** 锚点完备性小条 —— 无目标值，不套用达标判定 */
function anchorBars(anchors) {
  const rows = anchors.map((a) => ({
    name: a.name, sub: "", value: a.value, target: null, unit: "%",
    // status 用 none 表示"不判定达标"，只按覆盖度着色
    status: a.value >= 99.99 ? "pass" : a.value >= 80 ? "none" : "below",
    raw: true,
  }));
  // padT 留足：图例 + 刻度标签不重叠（图例 y=8~18，刻度标签 y=padT-8）
  return barChart(rows, { title: "溯源锚点完备性", padL: 150, rowH: 32, padT: 52, legend: false });
}

/**
 * 主渲染：把 /api/metrics 响应画成图表页
 */
export function renderMetrics(root, data) {
  root.textContent = "";

  // ---- 顶部：口径声明（必须最显眼）----
  const cal = el("div", "mx-caliber");
  cal.appendChild(el("div", "mx-caliber-title", "口径声明 · 先看这里"));
  const calList = el("ul");
  (data.caliber_discipline || []).forEach((t) => calList.appendChild(el("li", null, t)));
  cal.appendChild(calList);
  const stamp = el("div", "mx-stamp",
    "统计时间 " + String(data.generated_at || "").replace("T", " ").slice(0, 19) +
    " ｜ 数据源 data/ 下 " + (data.summary && data.summary.datasets) + " 份真实数据集（服务端实算）");
  cal.appendChild(stamp);
  root.appendChild(cal);

  // ---- 指标卡三枚----
  const cards = el("div", "mx-cards");
  (data.cards || []).forEach((c) => {
    const card = el("div", "mx-card st-" + c.status);
    const hd = el("div", "mx-card-head");
    hd.appendChild(el("span", "mx-card-name", c.name));
    hd.appendChild(el("span", "mx-badge", statusText(c.status)));
    card.appendChild(hd);

    const big = el("div", "mx-card-value");
    big.appendChild(el("span", "mx-v", c.value === null ? "未核" : String(c.value)));
    if (c.value !== null) big.appendChild(el("span", "mx-u", c.unit));
    card.appendChild(big);

    const tg = el("div", "mx-card-target",
      c.value === null ? "无可核样本" : "目标 " + c.target + c.unit + "　差距 " +
      (c.gap > 0 ? "+" : "") + c.gap);
    card.appendChild(tg);
    card.appendChild(el("div", "mx-card-cal", c.caliber));
    if (c.coverage_note) card.appendChild(el("div", "mx-card-cov", "⚠ " + c.coverage_note));
    cards.appendChild(card);
  });
  root.appendChild(cards);

  // ---- 溯源存在率（L1）单列，避免与"字段抽取率"口径混淆 ----
  if (data.l1_provenance) {
    const l1 = data.l1_provenance;
    const w = el("div", "mx-l1");
    w.appendChild(el("span", "mx-l1-name", l1.name));
    const v = el("span", "mx-l1-value");
    v.appendChild(el("span", "mx-l1-v", l1.value + l1.unit));
    w.appendChild(v);
    w.appendChild(el("span", "mx-l1-sub",
      "＝ " + l1.with_provenance + " / " + l1.total_fields + " 字段"));
    w.appendChild(el("span", "mx-l1-note", "⚠ " + l1.note));
    root.appendChild(w);
  }

  // ---- 图1：指标 vs 目标 ----
  const sec1 = el("section", "mx-sec");
  sec1.appendChild(el("h3", null, "图 1　验收指标 vs 目标（实算，不修饰）"));
  sec1.appendChild(el("div", "mx-hint",
    "虚线为总规划验收目标；斜纹灰条表示该指标当前无可核样本，不计入任何分母。"));
  sec1.appendChild(barChart((data.cards || []).map((c) => ({
    name: c.name, value: c.value, target: c.target, unit: c.unit, status: c.status,
    sub: c.caliber,
  }))));
  root.appendChild(sec1);

  // ---- 图 2：parser 版本对比（D11 核心发现）----
  if ((data.parser_compare || []).length >= 1) {
    const sec2 = el("section", "mx-sec mx-sec-alert");
    sec2.appendChild(el("h3", null, "图 2　溯源指向正确率：解析器版本对比（D11 首测核心发现）"));
    sec2.appendChild(el("div", "mx-hint",
      "同一份 pledge.pdf 的两次解析，旧版（0.3.0）把字段溯源指向了错误的 block，" +
      "新版（0.7.0）全部命中。region 坐标两者一致——即坐标对、block 映射错。"));
    sec2.appendChild(parserChart(data.parser_compare));
    root.appendChild(sec2);
  }

  // ---- 图 3：溯源锚点完备性 ----
  const sec3 = el("section", "mx-sec");
  sec3.appendChild(el("h3", null, "图 3　溯源锚点完备性（n=" +
    (data.anchors && data.anchors[0] ? data.anchors[0].n : "?") + " 条 provenance）"));
  sec3.appendChild(el("div", "mx-hint",
    "块级锚点（block_id + region）决定能否回跳定位；仅页级锚点为合法降级（D4-PLD 口径）。"));
  sec3.appendChild(anchorBars(data.anchors || []));
  root.appendChild(sec3);

  // ---- 附：L3 未命中清单 ----
  const miss = (data.l3 && data.l3.miss_samples) || [];
  if (miss.length) {
    const sec4 = el("section", "mx-sec");
    sec4.appendChild(el("h3", null, "附　L3 未命中清单（" +
      (data.l3.miss) + " 条，节选 " + miss.length + " 条）"));
    const tb = el("table", "mx-table");
    const thead = el("thead");
    const trh = el("tr");
    ["数据集", "事件.字段", "指向 block", "quote", "核验结果"].forEach((h) =>
      trh.appendChild(el("th", null, h)));
    thead.appendChild(trh);
    tb.appendChild(thead);
    const tbody = el("tbody");
    miss.forEach((m) => {
      const tr = el("tr");
      tr.appendChild(el("td", "mono", m.dataset));
      tr.appendChild(el("td", "mono", (m.event_id || "?") + "." + m.field));
      tr.appendChild(el("td", "mono", m.block_id));
      tr.appendChild(el("td", "quote", "「" + (m.quote || "") + "」"));
      tr.appendChild(el("td", "bad-txt", m.reason));
      tbody.appendChild(tr);
    });
    tb.appendChild(tbody);
    const wrap = el("div", "mx-table-wrap");
    wrap.appendChild(tb);
    sec4.appendChild(wrap);
    root.appendChild(sec4);
  }

  // ---- 附：覆盖范围声明 ----
  const cov = el("section", "mx-sec");
  cov.appendChild(el("h3", null, "附　覆盖范围与不可核项（如实声明）"));
  const l3 = data.l3 || {};
  const covList = el("ul", "mx-list");
  covList.appendChild(el("li", null,
    "L3 原文命中可核数据集：" + ((l3.datasets_checkable || []).join("、") || "无") +
    "（共 " + (l3.checked || 0) + " 条证据）"));
  covList.appendChild(el("li", null,
    "无原始解析快照因而未核的数据集：" + (l3.datasets_unverifiable || 0) +
    " 份 —— 未核不等于命中，不计入任何命中率分母"));
  covList.appendChild(el("li", null,
    "本次统计不含矛盾召回 / 矛盾误报 / 重复一致率 / 20 页 ≤90 秒 —— " +
    "这三项需封存集与引擎侧运行数据，封存资产由宗博文保管，首测前不交开发"));
  if (l3.snapshot) {
    covList.appendChild(el("li", null,
      "解析快照：" + l3.snapshot.doc_name + "（doc_id=" + l3.snapshot.doc_id +
      "，" + l3.snapshot.page_count + " 页 " + l3.snapshot.block_count + " blocks）"));
  }
  cov.appendChild(covList);
  root.appendChild(cov);
}

export function clearMetrics(root) {
  root.textContent = "";
  const d = el("div", "empty", "结果图表未加载");
  root.appendChild(d);
}