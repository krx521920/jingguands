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
 * ★ D12 新增：指标注册表面板。
 *
 * 存在的理由：旧图表页把准确率/覆盖率/出处命中率混在一堆卡片里，
 * 分母不同的数字并排显示，读者（和写材料的人）极易把它们当成同一量纲比较。
 * 本面板按 bridge/metrics_registry.js 的三类分列渲染，并把「未测」项
 * 集中显式列出——未测项在旧版里是空白格子，空白最容易被当成"没问题"。
 */
export function renderRegistry(root, reg) {
  root.textContent = "";

  // ---- 口径纪律 ----
  const disc = el("div", "mx-caliber");
  disc.appendChild(el("div", "mx-caliber-title", "指标口径纪律 · 单一真源"));
  const ul = el("ul");
  (reg.discipline || []).forEach((t) => ul.appendChild(el("li", null, t)));
  disc.appendChild(ul);
  const fp = reg.fingerprint || {};
  disc.appendChild(el("div", "mx-stamp",
    "输入指纹 page_data=" + String(fp.primary || "").slice(0, 16) + "…（" +
    ((fp.inputs && fp.inputs.page_data && fp.inputs.page_data.files) || 0) + " 份）／ unified=" +
    String((fp.inputs && fp.inputs.unified_batch && fp.inputs.unified_batch.sha256) || "").slice(0, 16) +
    "…（" + ((fp.inputs && fp.inputs.unified_batch && fp.inputs.unified_batch.files) || 0) +
    " 份）　★ 换批即失效，图表与材料必须同步重跑"));
  root.appendChild(disc);

  const cov = reg.coverage_statement || {};
  const sum = el("div", "mx-reg-sum");
  sum.appendChild(el("span", "mx-reg-sum-t", "共 " + cov.total + " 项："));
  sum.appendChild(el("span", "mx-badge st-measured", "已实测 " + cov.measured));
  sum.appendChild(el("span", "mx-badge st-unverified", "不可核 " + cov.unverified));
  sum.appendChild(el("span", "mx-badge st-not_covered", "未测 " + cov.not_covered));
  root.appendChild(sum);

  // ---- 三类分列表格 ----
  const cats = reg.categories || {};
  const metrics = reg.metrics || [];
  for (const cat of ["accuracy", "coverage", "evidence", "compliance"]) {
    const c = cats[cat];
    if (!c) continue;
    const rows = metrics.filter((m) => m.category === cat);
    if (!rows.length) continue;

    const sec = el("section", "mx-sec mx-reg-cat cat-" + cat);
    const h = el("h3", null, c.name + "　——　" + c.question);
    sec.appendChild(h);
    sec.appendChild(el("div", "mx-hint", "分母规则：" + c.denominator_rule));
    sec.appendChild(el("div", "mx-warn-line", c.must_not_mix));

    const tb = el("table", "mx-table mx-reg-table");
    const thead = el("thead");
    const trh = el("tr");
    ["指标", "数值", "分子/分母", "目标", "状态", "证据类型", "口径说明"].forEach((x) =>
      trh.appendChild(el("th", null, x)));
    thead.appendChild(trh);
    tb.appendChild(thead);
    const tbody = el("tbody");
    rows.forEach((m) => {
      const tr = el("tr", m.status === "not_covered" ? "row-nc" : null);
      tr.appendChild(el("td", null, m.name));
      // ★ 未测项数值列写"未测"而不是留空或填目标值
      const vtd = el("td", m.status === "not_covered" ? "nc-txt mono" : "mono",
        m.value === null ? "未测" : m.value + (m.unit === "%" ? "%" : " " + (m.unit || "")));
      tr.appendChild(vtd);
      tr.appendChild(el("td", "mono", m.num === null ? "—" : m.num + " / " + m.den));
      tr.appendChild(el("td", "mono", m.target == null ? "—" : String(m.target)));
      const std = el("td");
      std.appendChild(el("span", "mx-badge st-" + m.status, m.status_label));
      tr.appendChild(std);
      tr.appendChild(el("td", "mono small", m.evidence_kind || "—"));
      const note = el("td", "small", m.evidence_note || m.caliber || "");
      if (m.blocked_by) {
        note.appendChild(el("div", "nc-txt small", "阻塞：" + m.blocked_by));
      }
      tr.appendChild(note);
      tbody.appendChild(tr);
    });
    tb.appendChild(tbody);
    const wrap = el("div", "mx-table-wrap");
    wrap.appendChild(tb);
    sec.appendChild(wrap);
    root.appendChild(sec);
  }

  // ---- 未测项集中清单 ----
  const nc = reg.not_covered || [];
  if (nc.length) {
    const sec = el("section", "mx-sec mx-sec-alert");
    sec.appendChild(el("h3", null, "未测项清单（" + nc.length + " 项）——空白不等于达标"));
    const ul2 = el("ul", "mx-list");
    nc.forEach((m) => {
      const li = el("li");
      li.appendChild(el("span", "mono", "[" + m.category + "] "));
      li.appendChild(el("b", null, m.name));
      li.appendChild(document.createTextNode("：" + (m.blocked_by ? "阻塞于 " + m.blocked_by : "缺分母/缺数据")));
      ul2.appendChild(li);
    });
    sec.appendChild(ul2);
    root.appendChild(sec);
  }
}

/**
 * ★ D12 新增：实际对照三层面板（L1 哈希 / L2 跨批逐字段 / L3 导出字节）。
 *
 * 为什么必须有：demo/_parity_real.js 已把对照跑完，结论躺在 JSON 里。
 * **页面上看不到 = 读者无从判断，等于没做**——这正是 D10 `web_cli_same_result`
 * 的翻版。本次补的正是"产物可见"这一环。
 *
 * 措辞纪律：每层都印「证明了什么 / 不能证明什么」。少后一句，读者就会把
 * L3 的幂等性读成 Web/CLI 一致性——那正是我们这次要消灭的混用。
 */
export function renderParityReport(root, rep) {
  root.textContent = "";

  const sec = el("section", "mx-sec mx-parity-sec");
  sec.appendChild(el("h3", null, "实际对照三层（页面可见 · 报告可复跑）"));

  if (!rep.available) {
    sec.appendChild(el("div", "mx-warn-line", "★ " + (rep.reason || "对照报告不可用")));
    if (rep.how_to_generate) {
      sec.appendChild(el("div", "mx-hint", "生成命令：node " + rep.how_to_generate));
    }
    root.appendChild(sec);
    return;
  }

  if (rep.headline) sec.appendChild(el("div", "mx-hint mono", rep.headline));
  sec.appendChild(el("div", "mx-stamp",
    "报告生成于 " + (rep.generated_at || "—") +
    "　★ 报告是快照：数据源换批后须重跑 node demo/_parity_real.js，否则以下数字是旧的"));

  const wrap = el("div", "mx-parity-grid");
  for (const L of rep.layers || []) {
    const tone = L.badge ? L.badge.tone : "neutral";
    const card = el("div", "mx-parity-card tone-" + tone);
    const head = el("div", "mx-parity-head");
    head.appendChild(el("span", "mx-parity-key", L.key));
    head.appendChild(el("span", "mx-parity-title", L.title || ""));
    card.appendChild(head);

    // ★ 三态徽标：已测通过 / 已测有差异 / 未测。不允许二分
    const stCls = tone === "ok" ? "measured" : tone === "bad" ? "unverified" : "not_covered";
    card.appendChild(el("span", "mx-badge st-" + stCls,
      (L.badge ? L.badge.mark + " " + L.badge.label : "未测")));

    if (L.question) card.appendChild(el("div", "mx-parity-q", L.question));
    if (L.reason) card.appendChild(el("div", "mx-parity-reason", L.reason));
    if (L.unpaired_note) card.appendChild(el("div", "mx-warn-line", L.unpaired_note));

    if ((L.numbers || []).length) {
      const ul = el("div", "mx-parity-nums");
      for (const kv of L.numbers) {
        const s = el("span", "mx-parity-num");
        s.appendChild(el("span", "k", kv[0]));
        s.appendChild(el("span", "v mono", kv[1]));
        ul.appendChild(s);
      }
      card.appendChild(ul);
    }

    // ★ 证明 / 不证明 —— 两句都印，缺一句就会重新产生口径混用
    const pr = el("div", "mx-parity-scope");
    pr.appendChild(el("div", "ok", "证明：" + (L.proves || "—")));
    pr.appendChild(el("div", "no", "不证明：" + (L.not_proves || "—")));
    card.appendChild(pr);
    wrap.appendChild(card);
  }
  sec.appendChild(wrap);

  // ---- 仍未测项：把"没测的"和"测出差异的"分开陈述 ----
  const snc = rep.still_not_covered;
  if (snc) {
    const box = el("div", "mx-parity-snc");
    box.appendChild(el("div", "mx-parity-snc-h", "仍未测：" + snc.claim));
    if (snc.why) box.appendChild(el("div", "mx-hint", snc.why));
    if ((snc.blockers || []).length) {
      const ul = el("ul", "mx-list");
      snc.blockers.forEach((b) => {
        const li = el("li");
        // ★ b 可能是对象 {owner,need} 或裸字符串；直接字符串化会渲染成 [object HTMLIElement]
        if (b && typeof b === "object") {
          li.appendChild(el("b", null, b.owner || "未指派"));
          li.appendChild(document.createTextNode("：" + (b.need || "")));
        } else {
          li.appendChild(document.createTextNode(String(b)));
        }
        ul.appendChild(li);
      });
      box.appendChild(ul);
    }
    if (snc.how_to_close) box.appendChild(el("div", "mx-hint mono", "关闭方式：" + snc.how_to_close));
    sec.appendChild(box);
  }

  root.appendChild(sec);
}

/**
 * 主渲染：把 /api/metrics 响应画成图表页
 */
export function renderMetrics(root, data) {
  root.textContent = "";

  // ---- ★ D12：注册表面板置顶（口径先于数字）----
  if (data.registry) {
    const holder = el("div", "mx-reg-holder");
    holder.id = "mxRegistry";
    root.appendChild(holder);
    renderRegistry(holder, data.registry);
    root.appendChild(el("hr", "mx-sep"));
    root.appendChild(el("div", "mx-sec-title", "以下为 D11 图表页原始视图（保留以便对照）"));
  }

  // ---- ★ D12：实际对照三层紧随其后（"这些数字凭什么"）----
  {
    const ph = el("div", "mx-parity-holder");
    ph.id = "mxParity";
    ph.appendChild(el("div", "mx-hint", "正在读对照报告…"));
    root.appendChild(ph);
    root.appendChild(el("hr", "mx-sep"));
    fetch("/api/parity/real")
      .then((r) => r.json())
      .then((rep) => renderParityReport(ph, rep))
      .catch((e) => {
        ph.textContent = "";
        ph.appendChild(el("div", "mx-warn-line", "对照报告请求失败：" + e.message));
      });
  }

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