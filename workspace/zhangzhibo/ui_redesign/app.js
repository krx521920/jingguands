// app.js —— FinStruct 信析 · 数据层与渲染（v4：接真实 /api，经 server.js 代理到 page_prototype）
"use strict";

/* ═══ 深浅色模式：浅色默认，记忆用户选择 ═══ */
const themeBtn = document.getElementById("themeBtn");
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  themeBtn.textContent = t === "dark" ? "☀" : "☾";
  try { localStorage.setItem("fs-theme", t); } catch (e) {}
}
let savedTheme = "light";
try { if (localStorage.getItem("fs-theme") === "dark") savedTheme = "dark"; } catch (e) {}
applyTheme(savedTheme);
themeBtn.addEventListener("click", () =>
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));

/* ═══════════ 常量：事件/字段/状态（口径与 page_prototype 的 status.js、results.js 同源） ═══════════ */
const EVENT_TYPE_TEXT = {
  pledge: "股份质押", equity_change: "股权变动", award_contract: "中标·合同签署",
  guarantee: "担保", release: "解除质押"
};
const FIELD_TEXT = {
  pledgor: "出质人", pledgee: "质权人", announce_date: "公告日期",
  share_count: "质押股数", pledge_ratio: "质押比例",
  amount: "交易金额", share_change: "变动股数",
  pledged_shares_this_time: "本次质押股数", pledged_shares_cumulative: "累计质押股数",
  pledged_ratio_this_time_of_held: "本次质押占其所持股份比例", pledged_ratio_this_time_of_total: "本次质押占公司总股本比例",
  pledged_ratio_cumulative_of_held: "累计质押占其所持股份比例", pledged_ratio_cumulative_of_total: "累计质押占公司总股本比例",
  pledge_amount: "质押金额", start_date: "质押起始日", end_date: "质押到期日", purpose: "资金用途",
  announcement_date: "公告日期", direction: "业务方向",
  holder: "变动股东", shares_before: "变动前持股", shares_after: "变动后持股",
  ratio_before: "变动前比例", ratio_after: "变动后比例", change_shares: "变动股数", method: "变动方式",
  change_date: "变动完成日",
  bidder: "中标人", tenderer: "招标人", project_name: "项目名称", bid_amount: "中标金额",
  currency: "币种", tax_included: "是否含税", duration: "工期",
  consortium_members: "联合体成员名单", consortium_shares: "联合体份额",
  consortium: "联合体及份额", bid_date: "中标/公告日期",
  contract_signed: "是否已签署合同", formal_award_notice_received: "是否收到正式中标通知书",
  price_adjustment_status: "调价条款状态", recognized_revenue: "当期确认收入",
  guarantor: "担保人", beneficiary: "受益人", guarantee_method: "担保方式", guarantee_period: "保证期间"
};
const STATUS = {
  success: ["成功", "ok"], failed: ["失败", "bad"], unreadable: ["无法读取", "bad"],
  pending_review: ["待复核", "warn"], simulated: ["模拟", "gray"],
  not_disclosed: ["未披露", "gray"], not_applicable: ["不适用", "gray"], not_mentioned: ["未提及", "gray"]
};
const DENOM_TEXT = { holder_shares: "所持股份", total_share_capital: "总股本", net_assets: "净资产", other: "其他" };
const REL_TEXT = { related: ["同一事件", "same"], unrelated: ["不同事件", "diff"], unknown: ["证据不足", "unknown"] };
const SEV_TEXT = { conflict: ["冲突", "bad"], error: ["错误", "bad"], review: ["待复核", "warn"], info: ["提示", "ok"] };

/* ═══════════ 工具 ═══════════ */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const numish = v => typeof v === "number" || /^[\d,，.\s%¥+-]+$/.test(String(v ?? ""));
const digits = v => { const m = String(v ?? "").replace(/,/g, "").match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };

function fmtValue(f) {
  if (f.value == null) return null;
  let v = typeof f.value === "number" ? f.value.toLocaleString("zh-CN") : String(f.value);
  if (f.unit && !v.includes(f.unit)) v += " " + f.unit;
  return v;
}
function fmtMarks(f) {
  const parts = [];
  if (f.qualifier === "approx") parts.push("约");
  if (f.qualifier === "at_most") parts.push("不超过");
  if (f.scope === "single") parts.push("单次");
  if (f.scope === "cumulative") parts.push("累计");
  if (f.denominator) parts.push(`分母 · ${f.denominator.kind_text || DENOM_TEXT[f.denominator.kind] || f.denominator.kind}`);
  return parts.length ? `<span class="denom">（${parts.join(" · ")}）</span>` : "";
}
const fieldStatus = f => f.status_override || (f.status_raw === "needs_review" ? "pending_review" : (f.value == null && f.status_raw && f.status_raw !== "extracted" ? f.status_raw : "success"));
const evIds = f => (f.evidence_ids || (f.evidence_id ? [f.evidence_id] : [])).filter(Boolean);
const blockShort = b => (b || "").split("_").pop();
/* 统计数字 count-up：首个纯数字文本节点 0→值，650ms ease-out；不可见/减动效时跳过 */
function countUps(root) {
  if (!root || !root.offsetParent) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  root.querySelectorAll(".stat .n").forEach(el => {
    const first = el.firstChild;
    if (!first || first.nodeType !== 3) return;
    const raw = String(first.textContent).trim();
    if (!/^\d+(\.\d+)?$/.test(raw)) return;
    const target = parseFloat(raw), dec = (raw.split(".")[1] || "").length;
    const t0 = performance.now(), dur = 650;
    const step = now => {
      const p = Math.min((now - t0) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      first.textContent = (target * e).toFixed(dec);
      if (p < 1) requestAnimationFrame(step); else first.textContent = raw;
    };
    requestAnimationFrame(step);
  });
}

const toastShow = (() => {
  let t;
  return msg => {
    $("#toastMsg").textContent = msg;
    $("#toast").classList.add("show");
    clearTimeout(t); t = setTimeout(() => $("#toast").classList.remove("show"), 2600);
  };
})();
let snapshotNotified = false;
function snapshotFor(url) {
  const s = window.__FS_SNAPSHOT;
  if (!s) return null;
  if (!snapshotNotified) {
    snapshotNotified = true;
    setTimeout(() => toastShow("静态快照模式 —— 完整上传/导出功能需本地服务"), 1200);
  }
  if (url === "/api/datasets") return s.datasets;
  if (url === "/api/pairs") return s.pairs;
  if (url === "/api/verify") return s.verify;
  if (url === "/api/integration") return s.integration;
  if (url === "/api/metrics") return s.metrics;
  const m = url.match(/^\/api\/result\?dataset=([^&]+)/);
  if (m) return s.results[decodeURIComponent(m[1])] || null;
  return null;
}
async function getJSON(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url} → ${r.status}`);
    return await r.json();
  } catch (e) {
    // 本地服务失败须明确报错；仅直接打开静态文件时展示快照。
    const snap = location.protocol === 'file:' ? snapshotFor(url) : null;
    if (snap) return snap;
    throw e;
  }
}
const isSnapshotMode = () => !!window.__FS_SNAPSHOT && !window.__LIVE_API;
const errHTML = e => `<div class="err">加载失败 —— ${esc(e.message || e)}<br><span style="font-size:11px">请确认 page_prototype 服务已在 8642 运行（node server.js），本页经代理访问其 /api。</span></div>`;

/* ═══════════ 章节切换（含 hash 深链 + 懒加载） ═══════════ */
const links = document.querySelectorAll(".nl");
const ensure = {};
function activate(view) {
  links.forEach(x => x.classList.toggle("active", x.dataset.view === view));
  document.querySelectorAll(".chapter").forEach(c => c.classList.toggle("active", c.id === "view-" + view));
  window.scrollTo({ top: 0 });
  history.replaceState(null, "", "#" + view);
  if (ensure[view]) { const f = ensure[view]; ensure[view] = null; f(); }
}
links.forEach(l => l.addEventListener("click", () => activate(l.dataset.view)));
const h0 = location.hash.slice(1);
if (h0 && document.getElementById("view-" + h0) && h0 !== "home") activate(h0);
window.addEventListener("hashchange", () => {
  const v = location.hash.slice(1);
  if (document.getElementById("view-" + v)) activate(v);
});

/* ═══════════ 二层工作台：开合 ═══════════ */
const wsEl = $("#ws"), scrimEl = $("#scrim");
function wsOpen(e) { if (e) e.preventDefault(); wsEl.classList.add("show"); scrimEl.classList.add("show"); document.body.style.overflow = "hidden"; }
function wsClose() { wsEl.classList.remove("show"); scrimEl.classList.remove("show"); document.body.style.overflow = ""; }
$("#wsOpenBtn").addEventListener("click", () => wsOpen());
$("#wsCloseBtn").addEventListener("click", wsClose);
scrimEl.addEventListener("click", wsClose);
document.addEventListener("keydown", e => { if (e.key === "Escape") wsClose(); });
document.querySelectorAll(".ws-link").forEach(a => a.addEventListener("click", wsOpen));
$("#heroWsBtn").addEventListener("click", () => wsOpen());

/* ═══ 紫金封面：点击 / 回车 / 滚轮 进入 ═══ */
const cover = document.getElementById("cover");
document.body.classList.add("cover-lock");
function coverUp() {
  if (!cover || cover.classList.contains("up")) return;
  cover.classList.add("up");
  document.body.classList.remove("cover-lock");
  activate("home");   // 封面掀开永远落在总览，不被残留 hash 带去其他章节
  countUps(document.getElementById("homeStats"));
}
document.getElementById("coverEnter").addEventListener("click", coverUp);
document.addEventListener("keydown", e => { if (e.key === "Enter") coverUp(); });
window.addEventListener("wheel", e => { if (Math.abs(e.deltaY) > 8) coverUp(); }, { passive: true });

/* ═══════════ 数据集：列表 + 加载 ═══════════ */
let curDataset = null;

async function refreshDatasets(prefer) {
  const d = await getJSON("/api/datasets");
  try { await fetch("/api/datasets").then(r => { if (r.ok) window.__LIVE_API = true; }); } catch (e) {}
  const list = d.datasets || [];
  const sel = $("#wsSel");
  const sources = new Map((d.sources || []).map(s => [s.name, s]));
  sel.innerHTML = list.map(n => {
    const source = sources.get(n);
    const label = source?.is_mock === true ? '模拟' : source?.is_mock === false ? '真实数据' : '来源未标注';
    return `<option value="${esc(n)}">${esc(n)}（${label}）</option>`;
  }).join("");
  const pick = prefer && list.includes(prefer) ? prefer : (list.includes('D4-PLD-001') ? 'D4-PLD-001' : list[0]);
  if (pick) { sel.value = pick; await loadDataset(pick); }
  return list;
}

async function loadDataset(name) {
  try {
    $("#ledger").innerHTML = `<div class="skel">${"<i></i>".repeat(6)}</div>`;
    const r = await getJSON("/api/result?dataset=" + encodeURIComponent(name));
    curDataset = name;
    renderResult(r);
    if (isSnapshotMode()) {
      $("#expCsv").onclick = e => { e.preventDefault(); toastShow("静态快照模式不支持导出 —— 完整功能请运行本地服务"); };
      $("#expJson").onclick = e => { e.preventDefault(); toastShow("静态快照模式不支持导出 —— 完整功能请运行本地服务"); };
    } else {
      $("#expCsv").href = `/api/export?dataset=${encodeURIComponent(name)}&format=csv`;
      $("#expJson").href = `/api/export?dataset=${encodeURIComponent(name)}&format=json`;
    }
    return r;
  } catch (e) {
    $("#ledger").innerHTML = errHTML(e);
  }
}

/* ═══════════ 01 单文档解析：台账 + 边注 ═══════════ */
function renderResult(r) {
  const sim = r.data_mode === "simulated";
  const badge = $("#modeBadge");
  badge.textContent = sim ? "模拟数据" : "真实数据";
  badge.classList.toggle("sim", sim);
  $("#simBanner").classList.toggle("show", sim);

  const sf = r.source_file || {};
  const pm = sf.parse_meta || {};
  const rm = r.run_meta || {};
  const fileLabel = sf.filename || curDataset;

  // 完整性检查条
  const it = r.integrity;
  $("#integrityBar").innerHTML = it && it.issues && it.issues.length
    ? `<div class="integrity ${it.ok ? "warnonly" : ""}">${it.ok ? "完整性提示" : "完整性断链"}：${it.issues.map(i => esc(i.what || i.where)).slice(0, 3).join("；")}${it.issues.length > 3 ? " …" : ""}</div>`
    : "";

  // 证据编号映射 + evidence_id → 关联字段值（用于引文高亮）
  const evNo = {}, evVals = {};
  (r.evidences || []).forEach((e, i) => { evNo[e.evidence_id] = i + 1; });
  (r.events || []).forEach(ev => Object.entries(ev.fields || {}).forEach(([fn, f]) =>
    evIds(f).forEach(id => { if (!evVals[id]) evVals[id] = []; if (f.value != null) evVals[id].push(String(f.value)); })));

  const events = r.events || [];
  let fieldTotal = 0, rowSeq = 0;
  const rowStep = events.length ? Math.min(40, 640 / Math.max(events.reduce((n, ev) => n + Object.keys(ev.fields || {}).length, 0), 1)) : 40;
  const anomalies = {};
  const rows = events.map(ev => {
    const type = ev.event_type;
    const dirF = (ev.fields || {}).direction;
    const dirTxt = dirF ? (dirF.normalized || dirF.value) : null;
    const fields = Object.entries(ev.fields || {});
    fieldTotal += fields.length;
    const trs = fields.map(([fn, f]) => {
      const st = fieldStatus(f);
      if (st !== "success") anomalies[st] = (anomalies[st] || 0) + 1;
      const ids = evIds(f);
      const val = fmtValue(f);
      const valHTML = val == null
        ? `<span class="null">null —— ${esc((STATUS[st] || [st])[0])}</span>`
        : `${numish(f.value) ? `<span class="num">${esc(val)}</span>` : esc(val)}${f.unit && numish(f.value) ? "" : ""}${fmtMarks(f)}`;
      const anchorHTML = ids.length
        ? ids.map(id => `<span class="anchor" data-ev="${esc(id)}">${blockShort((r.evidences || []).find(e => e.evidence_id === id)?.block_id)}</span><sup>${evNo[id] || ""}</sup>`).join(" ")
        : `<span style="font-size:11px;color:var(--ink-3)">—</span>`;
      const delay = Math.round(Math.min(rowSeq++ * rowStep, 700));
      return `<tr class="frow${st !== "success" ? " abn" : ""}" data-st="${st}" data-fn="${esc(fn)}" data-event="${esc(ev.event_id)}" data-ev="${esc(ids[0] || "")}" style="animation-delay:${delay}ms">
        <td class="fn">${esc(FIELD_TEXT[fn] || fn)}</td>
        <td class="fv">${valHTML}</td>
        <td><span class="state ${(STATUS[st] || [, "gray"])[1]}">${(STATUS[st] || [st])[0]}</span></td>
        <td class="fa">${anchorHTML}</td>
      </tr>`;
    }).join("");
    // 股权变动：前后对比块
    let cmp = "";
    const fB = (ev.fields || {}).shares_before, fA = (ev.fields || {}).shares_after;
    if (fB && fA && fB.value != null && fA.value != null) {
      const dB = digits(fB.normalized ?? fB.value), dA = digits(fA.normalized ?? fA.value);
      cmp = `<div class="cmp"><div class="r"><span class="l">持股</span><span class="v">${esc(fmtValue(fB))}</span><span class="v a2">${esc(fmtValue(fA))}</span><span class="d">${dB != null && dA != null ? "Δ " + (dA - dB >= 0 ? "+" : "") + (dA - dB).toLocaleString("zh-CN") : ""}</span></div></div>`;
    }
    return `<div class="ev">
      <div class="ev-head"><span class="id">${esc(ev.event_id)}</span><span class="t">${esc(EVENT_TYPE_TEXT[type] || type)}</span>${dirTxt ? `<span class="dir">direction · ${esc(dirTxt)}</span>` : ""}</div>
      <table class="fields">${trs ? `<thead><tr><th style="width:30%">字段</th><th>值</th><th style="width:15%">状态</th><th style="width:17%">出处</th></tr></thead><tbody>${trs}</tbody>` : ""}</table>
      ${cmp}
    </div>`;
  }).join("");
  $("#ledgerMeta").textContent = `${events.length} event${events.length > 1 ? "s" : ""} · ${fieldTotal} fields`;
  $("#ledger").innerHTML = rows || `<div class="err" style="color:var(--ink-3)">该数据集无事件</div>`;

  // 异常汇总条
  const chips = Object.entries(anomalies).map(([st, n]) => {
    const [txt, cls] = STATUS[st] || [st, "gray"];
    const chipCls = cls === "bad" ? "bad" : cls === "warn" ? "warn" : "";
    return `<button class="zchip ${chipCls}" data-st="${st}">${txt} ${n}</button>`;
  }).join("");
  $("#anomalyBar").innerHTML = chips
    ? `<span class="lab">异常</span>${chips}`
    : `<span class="lab">异常</span><span style="font-size:11.5px;color:var(--ok)">无 —— 全部字段正常</span>`;

  // 边注
  const notes = (r.evidences || []).map(e => {
    const vals = (evVals[e.evidence_id] || []).filter(Boolean);
    let q = e.quote || "";
    let qHTML;
    if (!q) qHTML = `<span style="color:var(--ink-3);font-style:italic">（无文本层 · 扫描降级块，有坐标）</span>`;
    else {
      const hit = vals.find(v => v && q.includes(v.replace(/,/g, "").slice(0, 4))) || vals.find(v => v && q.includes(v));
      qHTML = hit ? `「${esc(q).replace(esc(hit), `<mark>${esc(hit)}</mark>`)}」` : `「${esc(q)}」`;
    }
    const loc = `p${e.page ?? "?"} · ${blockShort(e.block_id)}${e.table_id ? " · " + blockShort(e.table_id) + " " + (e.cell_ref || "") : ""}`;
    const weak = e.degraded ? `<div class="weak">⚠ 降级块：${esc(e.missing_reason || "扫描页未识别")}（坐标仍在）</div>` : "";
    const nd = Math.round(Math.min(320 + (evNo[e.evidence_id] - 1) * Math.min(45, 480 / Math.max((r.evidences || []).length, 1)), 1150));
    return `<div class="note" data-ev="${esc(e.evidence_id)}" style="animation-delay:${nd}ms">
      <div class="top"><span class="no">${evNo[e.evidence_id]}</span><span class="loc">${esc(loc)}</span></div>
      <div class="q">${qHTML}</div>${weak}
    </div>`;
  }).join("");
  $("#notesMeta").textContent = `${(r.evidences || []).length} evidences`;
  $("#notes").innerHTML = notes || `<div style="font-size:12px;color:var(--ink-3);padding:12px 0">该数据集无证据条目</div>`;

  // 交互绑定：字段行 ↔ 边注 双向亮起
  document.querySelectorAll("tr.frow, .note").forEach(node => {
    const ev = node.dataset.ev;
    if (!ev) return;
    node.addEventListener("mouseenter", () => document.querySelectorAll(`[data-ev="${ev}"]`).forEach(x => x.classList.add("hl")));
    node.addEventListener("mouseleave", () => document.querySelectorAll(`[data-ev="${ev}"]`).forEach(x => x.classList.remove("hl")));
  });
  // 异常芯片 → 定位
  document.querySelectorAll(".zchip[data-st]").forEach(chip => chip.addEventListener("click", () => {
    const row = document.querySelector(`tr.frow[data-st="${chip.dataset.st}"]`);
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.classList.add("hl"); setTimeout(() => row.classList.remove("hl"), 1200);
  }));

  // 工作台「当前源」
  $("#wsSrc").innerHTML = `
    <div class="n">${esc(fileLabel)}</div>
    <div class="kv"><b>run_id</b><span>${esc(r.run_id)}</span></div>
    <div class="kv"><b>sha256</b><span>${esc((sf.sha256 || sf.file_id || "—").replace(/^sha256:/, "").slice(0, 12) + "…")}</span></div>
    <div class="kv"><b>契约</b><span>envelope ${esc(r.schema_version)} · ${esc(pm.parser_version || "")}</span></div>
    <div class="kv"><b>引擎</b><span>${esc(rm.model || "—")}${rm.duration_ms ? " · " + rm.duration_ms + "ms" : ""} · ${esc(r.extraction_engine?.provider || "file")}</span></div>`;

  const th = document.getElementById("theater");
  if (th) { th.style.animation = "none"; void th.offsetHeight; th.style.animation = ""; }
  renderFingerprint(r);
  toastShow(`已加载 ${name0(r)} · ${events.length} 事件 · ${(r.evidences || []).length} 证据`);
  demoLinkOnce();
}
const name0 = r => (r.source_file && r.source_file.filename) || curDataset;

/* ═══ 数据指纹：字段（经线）× 证据坐标（纬线）× 鎏金交汇 + run_id 条码 ═══ */
function buildWeave(r, H) {
  const W = 800, pad = 14, barH = 24;
  const fields = [];
  (r.events || []).forEach(ev => Object.entries(ev.fields || {}).forEach(([fn, f]) =>
    fields.push({ fn, st: fieldStatus(f), evs: evIds(f) })));
  const evidences = r.evidences || [];
  const pos = e => (e.page || 1) * 900 + ((e.bbox && e.bbox[1]) || 0);
  const maxPos = Math.max(...evidences.map(pos), 1);
  const evY = {};
  evidences.forEach(e => { evY[e.evidence_id] = pad + 4 + (pos(e) / maxPos) * (H - 2 * pad - barH - 8); });
  const n = Math.max(fields.length, 1);
  const x = i => pad + (i + 0.5) * (W - 2 * pad) / n;
  const tStep = Math.min(38, 520 / Math.max(n, 1));
  let svg = "";
  const wStep = Math.min(22, 260 / Math.max(evidences.length, 1));
  evidences.forEach((e, ei) => {
    const y = evY[e.evidence_id];
    svg += `<line class="fp-weft" style="animation-delay:${Math.round(ei * wStep)}ms;stroke:${e.degraded ? "#C9A227" : "var(--weft)"}" x1="${pad}" y1="${y.toFixed(1)}" x2="${W - pad}" y2="${y.toFixed(1)}"${e.degraded ? ' stroke-dasharray="3 3"' : ""} stroke-width="1"/>`;
  });
  fields.forEach((f, i) => {
    const stroke = { success: "var(--act)", pending_review: "var(--warn)", unreadable: "var(--bad)", failed: "var(--bad)" }[f.st] || "var(--thread-dim)";
    const dash = f.st === "success" ? "" : ' stroke-dasharray="2 4"';
    svg += `<line class="fp-th" style="animation-delay:${Math.round(180 + i * tStep)}ms;stroke:${stroke}" data-fn="${esc(f.fn)}" data-ev="${esc(f.evs[0] || "")}" x1="${x(i).toFixed(1)}" y1="${pad}" x2="${x(i).toFixed(1)}" y2="${H - pad - barH}"${dash} stroke-width="1.4"/>`;
  });
  fields.forEach((f, i) => f.evs.forEach(id => {
    const y = evY[id]; if (y == null) return;
    svg += `<circle style="animation-delay:${Math.round(400 + i * tStep)}ms" cx="${x(i).toFixed(1)}" cy="${y.toFixed(1)}" r="2.4" fill="#C9A227"/>`;
  }));
  const rid = r.run_id || "";
  const bw = (W - 2 * pad) / Math.max(rid.length, 1);
  for (let k = 0; k < rid.length; k++) {
    const h = ((rid.charCodeAt(k) % 7) + 1.5) / 8.5 * barH;
    svg += `<rect style="fill:var(--ink)" x="${(pad + k * bw).toFixed(1)}" y="${(H - pad - h).toFixed(1)}" width="${Math.max(bw * .45, .8).toFixed(1)}" height="${h.toFixed(1)}" opacity=".85"/>`;
  }
  const sha = String((r.source_file && (r.source_file.sha256 || r.source_file.file_id)) || "").replace("sha256:", "");
  const goldX = pad + (((sha.charCodeAt(0) || 48) % 120) / 120) * (W - 2 * pad);
  svg += `<rect x="${goldX.toFixed(1)}" y="${H - pad - barH}" width="1.8" height="${barH}" fill="#C9A227"/>`;
  return svg;
}

function renderFingerprint(r) {
  const H = 240;
  const svgEl = document.getElementById("fpSvg");
  svgEl.setAttribute("viewBox", `0 0 800 ${H}`);
  svgEl.innerHTML = buildWeave(r, H) + `<g id="fpCross" style="display:none;pointer-events:none"><line id="fpxV" y1="0" y2="${H}"/><line id="fpxH" x1="0" x2="800"/><text id="fpxT"></text></g>`;
  const hfp = document.getElementById("homeFpSvg");
  if (hfp) { hfp.setAttribute("viewBox", "0 0 800 200"); hfp.innerHTML = buildWeave(r, 200); }
}
/* 测绘光标：十字线 + 实时坐标跟随 */
const fpSvgEl = document.getElementById("fpSvg");
fpSvgEl.addEventListener("mousemove", e => {
  const cross = document.getElementById("fpCross"); if (!cross) return;
  const rect = fpSvgEl.getBoundingClientRect();
  const VH = fpSvgEl.viewBox.baseVal.height || 240;
  const vx = (e.clientX - rect.left) / rect.width * 800;
  const vy = (e.clientY - rect.top) / rect.height * VH;
  cross.style.display = "";
  const v = document.getElementById("fpxV"), h2 = document.getElementById("fpxH");
  v.setAttribute("x1", vx); v.setAttribute("x2", vx);
  h2.setAttribute("y1", vy); h2.setAttribute("y2", vy);
  const t = document.getElementById("fpxT");
  t.setAttribute("x", vx > 640 ? vx - 8 : vx + 8);
  t.setAttribute("y", vy < 20 ? vy + 16 : vy - 8);
  t.setAttribute("text-anchor", vx > 640 ? "end" : "start");
  t.textContent = `${Math.round(vx)} · ${Math.round(vy)}`;
});
fpSvgEl.addEventListener("mouseleave", () => { const c = document.getElementById("fpCross"); if (c) c.style.display = "none"; });
/* 指纹经线悬停 → 字段行 + 证据边注 同步点亮 */
$("#fpSvg").addEventListener("mouseover", e => {
  const th = e.target.closest(".fp-th"); if (!th) return;
  document.querySelectorAll(`tr.frow[data-fn="${th.dataset.fn}"]`).forEach(x => x.classList.add("hl"));
  if (th.dataset.ev) document.querySelectorAll(`[data-ev="${th.dataset.ev}"]`).forEach(x => x.classList.add("hl"));
});
$("#fpSvg").addEventListener("mouseout", e => {
  const th = e.target.closest(".fp-th"); if (!th) return;
  document.querySelectorAll(`tr.frow[data-fn="${th.dataset.fn}"]`).forEach(x => x.classList.remove("hl"));
  if (th.dataset.ev) document.querySelectorAll(`[data-ev="${th.dataset.ev}"]`).forEach(x => x.classList.remove("hl"));
});

/* 首次成功加载后，自动闪一次「字段行 ↔ 边注」联动，让交互可见 */
let linkDemoShown = false;
function demoLinkOnce() {
  if (linkDemoShown) return;
  linkDemoShown = true;
  setTimeout(() => {
    const row = document.querySelector('#ledger tr.frow[data-ev]:nth-child(3)')
      || document.querySelector('#ledger tr.frow[data-ev]');
    if (!row) return;
    const ev = row.dataset.ev;
    const hits = document.querySelectorAll(`[data-ev="${ev}"]`);
    hits.forEach(x => x.classList.add("hl"));
    setTimeout(() => hits.forEach(x => x.classList.remove("hl")), 1500);
  }, 700);
}

$("#wsSel").addEventListener("change", () => loadDataset($("#wsSel").value));
$("#loadBtn").addEventListener("click", () => loadDataset($("#wsSel").value));
$("#wsClear").addEventListener("click", e => {
  e.preventDefault();
  curDataset = null;
  $("#ledger").innerHTML = `<div class="err" style="color:var(--ink-3)">已清空 —— 在工作台选择数据集加载</div>`;
  $("#notes").innerHTML = ""; $("#anomalyBar").innerHTML = ""; $("#integrityBar").innerHTML = "";
  $("#ledgerMeta").textContent = "—"; $("#notesMeta").textContent = "—";
  $("#wsSrc").innerHTML = `<div class="n">尚未加载</div>`;
  $("#modeBadge").textContent = "未加载"; $("#modeBadge").classList.remove("sim");
  $("#simBanner").classList.remove("show");
  toastShow("已清空当前展示");
});

/* ═══════════ 工作台：真实上传 ═══════════ */
const fileInput = $("#wsFile");
$("#liveSample").addEventListener('change', () => { $("#liveCustom").hidden = $("#liveSample").value !== 'custom'; });
async function checkLive() {
  try {
    const response = await fetch('/api/live/health');
    const health = await response.json();
    $("#liveHealth").textContent = health.ready ? '真实抽取服务就绪 · 禁用缓存' : health.reason || '抽取服务未就绪';
  } catch { $("#liveHealth").textContent = '抽取服务不可达，请运行启动脚本。'; }
}
checkLive();
$("#liveForm").addEventListener('submit', async e => {
  e.preventDefault();
  const button = $("#liveRun"), status = $("#liveStatus"), log = $("#liveLog");
  button.disabled = true; log.hidden = true;
  status.textContent = '正在独立抽取，通常需要 10–90 秒，请勿重复提交…';
  try {
    let body;
    if ($("#liveSample").value !== 'custom') body = { sample: $("#liveSample").value };
    else {
      const file = $("#liveParse").files[0], text = $("#liveText").value.trim();
      if (file && text) throw new Error('解析 JSON 与公告全文请只选择一种。');
      body = { event_type: $("#liveType").value };
      if (file) { if (file.size > 40 * 1024 * 1024) throw new Error('解析文件超过 40 MiB'); body.parse = JSON.parse(await file.text()); }
      else body.text = text;
    }
    const response = await fetch('/api/live/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json();
    if (result.log_url) { log.href = result.log_url; log.hidden = false; }
    if (!response.ok || !result.ok) throw new Error(result.error || '抽取失败');
    await refreshDatasets(result.dataset);
    activate('doc');
    status.textContent = `抽取完成 · ${result.run_id} · 未使用缓存${result.errors.length ? ` · ${result.errors.length} 项需复核，请查看结果及日志` : ''}`;
    toastShow('已加载新结果，可查看证据、导出 JSON / CSV');
  } catch (error) { status.textContent = '抽取失败：' + error.message; }
  finally { button.disabled = false; }
});
async function uploadFiles(files) {
  if (!files || !files.length) return;
  if (isSnapshotMode()) { toastShow("静态快照模式不支持上传 —— 完整功能请运行本地服务"); return; }
  const fd = new FormData();
  [...files].forEach(f => fd.append("files[]", f, f.name));
  toastShow(`上传 ${files.length} 个文件中…`);
  try {
    const r = await fetch("/api/upload", { method: "POST", body: fd });
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    $("#wsFiles").innerHTML = d.results.map(x => `<div class="f"><span class="n">${esc(x.filename)}</span><span class="s ${x.ok ? "ok" : "bad"}">${x.ok ? "✓ 入库成功" : "✗ " + esc((x.error || "失败").slice(0, 40))}</span></div>`).join("");
    toastShow(`上传完成：${d.ok} 成功 · ${d.failed} 失败${d.failed ? "（失败文件在列表与日志中，不消失）" : ""}`);
    if (d.ok) refreshDatasets(curDataset).catch(() => {});   // 有效信封入库后出现在下拉
  } catch (e) {
    toastShow("上传失败：" + (e.message || e));
  }
}
fileInput.addEventListener("change", () => { uploadFiles(fileInput.files); fileInput.value = ""; });
$("#drop").addEventListener("click", () => fileInput.click());
["dragover", "dragenter"].forEach(t => $("#drop").addEventListener(t, e => { e.preventDefault(); $("#drop").style.borderColor = "var(--act)"; }));
["dragleave", "drop"].forEach(t => $("#drop").addEventListener(t, e => { e.preventDefault(); $("#drop").style.borderColor = ""; }));
$("#drop").addEventListener("drop", e => uploadFiles(e.dataTransfer.files));

/* ═══════════ 02 配对 ═══════════ */
function renderPairs(d) {
  $("#pairsList").innerHTML = ReviewView.pairs(d);
}
function renderVerify(d) {
  $("#verifyList").innerHTML = ReviewView.verify(d, FIELD_TEXT);
}

/* ═══════════ 04 集成 ═══════════ */
function renderIntegration(d) {
  const s = d.summary || {};
  const match = typeof s.expected_match === "number" ? `${s.expected_match}/${s.cases ?? d.cases.length}` : (s.expected_match ?? "—");
  const cacheStates = (s.cache && s.cache.states) || {};
  const cacheGold = Object.values(cacheStates)[0]?.gold || "—";
  $("#intStats").innerHTML = `
    <div class="stat"><div class="n">${s.cases ?? (d.cases || []).length}<span class="u">组</span></div><div class="l">集成案例（宗 清单）</div></div>
    <div class="stat"><div class="n">${esc(match)}</div><div class="l">预期 = 实判 一致</div></div>
    <div class="stat"><div class="n">${esc(cacheGold.split("/")[0])}<span class="u">/${esc(cacheGold.split("/")[1] || "")}</span></div><div class="l">缓存勾稽 gold 字段</div></div>
    <div class="stat"><div class="n">${s.corroborations_total ?? "—"}<span class="u"> / ${s.conflicts_total ?? 0}</span></div><div class="l">跨文档互证点 / 冲突</div></div>`;

  const CN_STATE = { cold1: "冷启动", replay: "重放（同缓存）", cold2: "清缓存重跑" };
  const cacheRows = Object.entries(cacheStates).map(([k, v]) => {
    const isHit = /replay|hit/i.test(k) || /hit/.test(String(v.gold));
    return `<div class="row"><span class="nm">${CN_STATE[k] || esc(k)}</span><div class="bar"><i style="width:${isHit ? 100 : 5}%;${isHit ? "" : "opacity:.35"}"></i></div><span class="v">${esc(v.gold || v.batch || "")}</span></div>`;
  }).join("");
  const cacheSec = `
    <hr class="sect-line"><div class="sect-title">缓存三态实测<span class="meta">${esc(s.cache?.checked_on || "")}</span></div>
    <div class="cache">${cacheRows || `<div class="note-txt">缓存数据缺失</div>`}
    <div class="note-txt">冷启 / 重放 / 清缓存三态同源重跑，gold 勾稽一致。</div></div>`;

  const caseRows = (d.cases || []).map(c => {
    const m = c.relation_match;
    const rst = m === true ? `<span class="rst ok">一致</span>` : m === false ? `<span class="rst warn">不一致</span>` : `<span class="rst" style="color:var(--ink-3)">不可验</span>`;
    return `<tr><td class="mono">${esc(c.case_id)}</td><td>${esc(c.title || "")}</td><td>${esc((REL_TEXT[c.expected_relation] || [c.expected_relation || "—"])[0])}</td><td>${esc((REL_TEXT[c.actual_relation] || [c.actual_relation || "—"])[0])}</td><td>${rst}</td></tr>`;
  }).join("");
  const casesSec = `
    <hr class="sect-line"><div class="sect-title">十组案例 · 预期 → 实判<span class="meta">${esc(d.meta?.code_version || "")}</span></div>
    <table class="cases"><thead><tr><th style="width:13%">案例</th><th>标题</th><th>预期（宗）</th><th>实判（魏）</th><th style="width:12%">判定</th></tr></thead><tbody>${caseRows}</tbody></table>`;

  const diffCases = (d.cases || []).filter(c => (c.diff_list && c.diff_list.length) || c.attribution);
  const rpt = `
    <hr class="sect-line"><div class="sect-title">差异与归因 · 核验报告<span class="meta">${esc(s.fang?.code_version || "")}</span></div>
    ${diffCases.length ? diffCases.slice(0, 5).map(c => `<details class="rpt"><summary>${esc(c.case_id)} · ${esc(c.title || "")}</summary><div class="bd">${(c.diff_list || []).slice(0, 4).map(x => `• ${esc(typeof x === "string" ? x : JSON.stringify(x))}`).join("<br>")}${c.attribution ? `<br><b>归因：</b>${esc(typeof c.attribution === "string" ? c.attribution : JSON.stringify(c.attribution).slice(0, 200))}</b>` : ""}</div></details>`).join("") : `<div class="err" style="color:var(--ink-3);padding:12px 0">十组案例无差异项</div>`}`;
  $("#intBody").innerHTML = cacheSec + casesSec + rpt;
  countUps(document.getElementById("intStats"));
}

/* ═══════════ 05 图表 ═══════════ */
function renderMetrics(d) {
  const view = MetricsView.render(d);
  $("#mStats").innerHTML = view.stats;
  $("#mBody").innerHTML = view.body;
}

/* ═══════════ 序章数字（真实接口） ═══════════ */
function renderMarquee(real, l3pct) {
  const items = [
    "<b>质押</b>", "<b>股权变动</b>", "<b>中标合同</b>", "担保",
    `<b>${real ?? "—"}</b> 份冻结批文档`, "每个字段挂 evidence_id",
    `<b>三态判定</b> · 绝不臆断`, "出处坐标可回原文",
    "严格命中与空白归一辅助口径分列", "页面所见即导出所得",
  ];
  const half = items.map(t => `<span>${t}</span>`).join("");
  document.getElementById("mqTrack").innerHTML = `<div class="mq-half">${half}</div><div class="mq-half">${half}</div>`;
}

async function renderHomeStats() {
  try {
    const m = await getJSON("/api/metrics");
    const sheet = m.delivery_metrics;
    if (!sheet || sheet.error) throw new Error(sheet?.error || "交付成绩单未生成");
    const keys = ["field_coverage", "evidence_hit_strict", "evidence_hit", "web_cli_independent"];
    $("#homeStats").innerHTML = keys.map(key => sheet.scores.find(s => s.key === key)).filter(Boolean).map(MetricsView.summary).join("");
    renderMarquee(sheet.batch.docs, null);
  } catch (e) {
    $("#homeStats").innerHTML = `<div class="stat"><div class="n">—</div><div class="l">成绩单不可用：${esc(e.message || e)}</div></div>`;
    renderMarquee(null, null);
  }
}

/* ═══════════ 懒加载注册 + 启动 ═══════════ */
ensure.pairs = () => getJSON("/api/pairs").then(renderPairs).catch(e => { $("#pairsList").innerHTML = errHTML(e); });
ensure.verify = () => getJSON("/api/verify").then(renderVerify).catch(e => { $("#verifyList").innerHTML = errHTML(e); });
ensure.integration = () => getJSON("/api/integration").then(renderIntegration).catch(e => { $("#intBody").innerHTML = errHTML(e); });
ensure.metrics = () => getJSON("/api/metrics").then(renderMetrics).catch(e => { $("#mBody").innerHTML = errHTML(e); });
ensure.pairs();   // 预热配对章

$("#ledger").innerHTML = `<div class="err" style="color:var(--ink-3)">连接真实接口…</div>`;
refreshDatasets().catch(e => { $("#ledger").innerHTML = errHTML(e); });
renderHomeStats();

/** Follow the selected source to its exact event/field, refusing stale or mismatched evidence. */
async function openSourceField(source) {
  if (!source?.source_verified || !/^[a-z0-9_-]+$/i.test(source.dataset || "")) return toastShow("出处不可定位");
  wsClose();
  const result = await loadDataset(source.dataset);
  if (!result) return toastShow("数据集加载失败，未跳转到旧数据");
  const event = (result.events || []).find(e => e.event_id === source.event_id);
  const field = event?.fields?.[source.field];
  const evidence = (result.evidences || []).find(e => evIds(field || {}).includes(e.evidence_id) && e.block_id === source.block_id && e.quote === source.quote && e.page === source.page);
  if (!field || !evidence) return toastShow("该字段出处与当前数据不一致，请重新核验");
  $("#wsSel").value = source.dataset;
  activate("doc");
  const row = [...document.querySelectorAll("tr.frow")].find(n => n.dataset.event === source.event_id && n.dataset.fn === source.field);
  document.querySelectorAll(".source-selected").forEach(n => n.classList.remove("source-selected"));
  if (row) { row.classList.add("source-selected"); row.scrollIntoView({ block: "center", behavior: "smooth" }); }
  document.querySelectorAll(".note").forEach(n => n.classList.toggle("hl", n.dataset.ev === evidence.evidence_id));
}
ReviewView.bind(document, openSourceField);
