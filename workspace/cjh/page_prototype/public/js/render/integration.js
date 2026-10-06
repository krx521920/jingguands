// render/integration.js —— D10 多公告集成视图：10 组集成案例 + 缓存三态一致性 + 出处链检查
// 主题落地（三条，都对着 D10 的共同完成标准）：
//   ① 多公告一起跑不崩：10 组案例并排显示"预期（宗）→ 实判（魏）"，不一致/不可验一律显式标出，不粉饰；
//   ② 缓存三项一致性：冷启 → 重放 → 清缓存重跑三态并排，业务字段逐字节一致才打勾；
//   ③ 出处链可追溯：张的四段链检（文件哈希 / doc_id 派生 / 页码区域 / 原文片段）＋ 同名串证据风险（重复文字组）。
// 诚实纪律：宗 expected 是自然语言，页面并排显示原文；我方把它抽成三态词做徽章比对，抽不出的显示"—（预期未含三态词）"，
//           绝不把"抽不出"当成"一致"；张侧链检 ✘ 只表示"该成员本地无解析包"，不等于链检失败，原因同屏标注。
const REL = {
  related:   { text: "同事件互证", cls: "rel-related" },
  unrelated: { text: "不同事件",   cls: "rel-unrelated" },
  unknown:   { text: "证据不足 · 无法判定", cls: "rel-unknown" }
};
function relBadge(rel) {
  const r = REL[rel] || { text: rel || "—", cls: "" };
  return el("span", "rel-badge " + r.cls, r.text);
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function kv(label, value, cls) {
  const row = el("div", "pm-row");
  row.append(el("span", "pm-label", label));
  row.append(el("span", cls || "pm-value", value));
  return row;
}
function num(n) { return n == null ? "—" : n.toLocaleString("zh-CN"); }
/** 大数字加千分位（计算段 operands/result 与观察值统一口径，便于人工核对合计勾稽）。 */
function fmt(v) {
  if (v == null) return "—";
  const s = String(v);
  return /^\d+$/.test(s) ? Number(s).toLocaleString("zh-CN") : s;
}

/** 顶部汇总条：一屏看清 D10 全貌。 */
function topSummary(d) {
  const s = d.summary, rc = s.relation_counts;
  const box = el("div", "pairs-top int-top");
  box.append(el("div", "pairs-ceiling",
    `D10 多公告集成：${s.cases} 组案例（宗 10 组） · 三态分布 related ${rc.related} / unrelated ${rc.unrelated} / unknown ${rc.unknown}` +
    ` · 预期一致 ${s.expected_match}/${s.cases}` + (s.expected_unverifiable ? `（另有 ${s.expected_unverifiable} 组预期未含三态词，不可验）` : "")));
  const bar = el("div", "int-chips");
  bar.append(el("span", "up-badge up-badge-ok", `必填七项零缺失（缺项合计 ${s.required_failed}）`));
  bar.append(el("span", "up-badge " + (s.conflicts_total ? "up-badge-fail" : "up-badge-ok"), `组级冲突 ${s.conflicts_total}`));
  bar.append(el("span", "up-badge up-badge-ok", `互证 ${s.corroborations_total} · 补充 ${s.complementaries_total}`));
  if (s.chain_summary) {
    bar.append(el("span", "up-badge " + (s.chain_summary.input_sha256_complete_cases === s.chain_summary.cases ? "up-badge-ok" : ""),
      `出处链齐全 ${s.chain_summary.input_sha256_complete_cases}/${s.chain_summary.cases} 组（${s.chain_summary.members} 成员）`));
    bar.append(el("span", "up-badge", `重复文字组内块 ${num(s.chain_summary.blocks_in_duplicate_groups)}（同名串证据风险，需带 block_id）`));
  }
  box.append(bar);
  if (d.meta) {
    box.append(el("div", "verify-note",
      `bundle 构建 ${d.meta.built_at || "—"} · ${d.meta.built_by || "—"} · code_version ${d.meta.code_version || "—"}` +
      ` · 宗目标：${d.meta.goal || "—"}`));
  }
  return box;
}

/** 缓存三态面板：冷启 → 缓存重放 → 清缓存重跑。 */
function cachePanel(c) {
  if (!c) return null;
  const box = el("div", "verify-section int-cache");
  box.append(el("h3", null, "缓存一致性三态（共同完成标准的三项断言）"));
  const grid = el("div", "int-states");
  const state = (name, label, desc) => {
    const st = c.states && c.states[name];
    const cell = el("div", "int-state");
    cell.append(el("div", "int-state-name", label));
    if (!st) { cell.append(el("div", "int-state-val", "（无数据）")); return cell; }
    cell.append(el("div", "int-state-val", `命中 ${st.cache_hits} / 未命中 ${st.cache_misses}`));
    cell.append(el("div", "int-state-sub", `gold ${st.gold} · ${String(st.batch).replace("runs/", "")}`));
    if (desc) cell.append(el("div", "int-state-sub", desc));
    return cell;
  };
  grid.append(state("cold1", "① 冷启动", "真实模型调用"));
  grid.append(state("replay", "② 缓存重放", "同 key 直接复用"));
  grid.append(state("cold2", "③ 清缓存重跑", "全新调用日志"));
  box.append(grid);

  const asserts = el("div", "int-asserts");
  const A = [
    ["replay_business_fields_identical", "缓存重放：业务字段逐字节一致"],
    ["cold_cache_new_call_log", "清缓存重跑：产生全新调用日志"],
    ["web_cli_same_result", "Web/CLI：同次结果一致（信封 JSON 唯一事实源）"]
  ];
  for (const [k, label] of A) {
    const ok = c[k] === true;
    const chip = el("div", "int-assert" + (ok ? " ok" : " bad"));
    chip.append(el("span", "int-assert-mark", ok ? "✓" : "✗"));
    chip.append(el("span", null, label));
    asserts.append(chip);
  }
  box.append(asserts);
  if (c.web_cli_definition) box.append(el("div", "verify-note", "口径：" + c.web_cli_definition));
  if (c.known_boundary) box.append(el("div", "verify-warn", "已知边界：" + c.known_boundary));
  return box;
}

/** 出处链检查面板（张）：四段链检 + 覆盖缺口。 */
function chainPanel(d) {
  const s = d.summary;
  if (!s.chain_summary) return null;
  const box = el("div", "verify-section");
  box.append(el("h3", null, "出处链检查（张 · evidence/" + (d.meta.chain_schema || "0.9") + "）"));
  if (d.meta.chain_purpose) box.append(el("div", "verify-note", "口径：" + d.meta.chain_purpose + (d.meta.chain_note ? "　——　" + d.meta.chain_note : "")));
  const bar = el("div", "int-chips");
  bar.append(el("span", "up-badge", `案例 ${s.chain_summary.cases} · 成员 ${s.chain_summary.members}`));
  bar.append(el("span", "up-badge", `input_sha256 齐全 ${s.chain_summary.input_sha256_complete_cases}/${s.chain_summary.cases} 组`));
  bar.append(el("span", "up-badge", `重复文字组内块 ${num(s.chain_summary.blocks_in_duplicate_groups)}`));
  box.append(bar);
  if ((s.chain_missing || []).length) {
    const miss = el("div", "int-missing");
    miss.append(el("div", "int-missing-head", `覆盖缺口 ${s.chain_missing.length} 条（如实上屏：张侧本地无解析包，非链检失败）`));
    for (const m of s.chain_missing) {
      miss.append(el("div", "int-missing-row", `${m.case_id} · ${m.member} —— ${m.reason}`));
    }
    box.append(miss);
  }
  return box;
}

/** 成员表：sha / run_id / 事件数 / 缓存命中 / 链检五段 / 重复组。 */
function memberTable(c) {
  const t = el("div", "pm-row");
  t.append(el("span", "pm-label", "成员（" + c.members.length + "）"));
  const box = el("div", "int-members");
  for (const m of c.members) {
    const card = el("div", "int-member");
    const head = el("div", "int-member-head");
    head.append(el("span", "pm-strong", m.case_id));
    head.append(el("span", "pm-hash", m.sha12 || "无 sha"));
    if (m.is_mock === false) head.append(el("span", "up-badge up-badge-ok", "真实"));
    if (m.cache) head.append(el("span", "up-badge " + (m.cache.hit === false ? "" : "up-badge-ok"), m.cache.hit === null ? `缓存 ${m.cache.hits} 命中/复用` : (m.cache.hit ? "缓存命中" : "缓存未命中")));
    card.append(head);
    const meta = el("div", "pm-row");
    meta.append(el("span", "pm-label", "run_id"));
    meta.append(el("span", "pm-code", m.run_id || "—"));
    meta.append(el("span", "pm-label", "事件"));
    meta.append(el("span", "pm-value", m.events == null ? "—" : String(m.events)));
    card.append(meta);
    if (m.chain) {
      const ch = el("div", "int-chain");
      const items = [["哈希", m.chain.file_hash_matches_actual], ["doc_id", m.chain.doc_id_matches_hash],
                     ["页码", m.chain.page_consistent], ["区域", m.chain.region_valid], ["原文", m.chain.text_raw_present]];
      for (const [label, ok] of items) ch.append(el("span", "int-chk" + (ok ? " ok" : " bad"), (ok ? "✓" : "✗") + label));
      ch.append(el("span", "int-chk info", `重复组 ${m.chain.duplicate_groups}（跨页 ${m.chain.cross_page_groups}）`));
      card.append(ch);
      for (const g of m.chain.duplicate_top || []) {
        const d = el("div", "int-dup");
        d.textContent = `「${String(g.text).slice(0, 24)}」× ${g.n_blocks} 块 · 页 ${(g.pages || []).join(",")}${g.cross_page ? " · 跨页" : ""}`;
        card.append(d);
      }
    } else {
      card.append(el("div", "int-dup", "张侧无该成员解析包 → 本次不做链检（如实留空，不代填）"));
    }
    box.append(card);
  }
  t.append(box);
  return t;
}

/** 方 D10 报告面板：五段（事件/差异/归因/计算/边界）+ 逐成员缓存核对。
 *  与魏 bundle 的口径差异并列显示，不合并：方给规则级明细 items + upstream_counts（引擎级计数），
 *  魏给组级 diff_list（本次全空）；requires_review 是方侧的内容复核结论，宗 --strict 只校验必填完整性。 */
function fangPanel(d) {
  const f = d.summary.fang;
  if (!f) return null;
  const box = el("div", "verify-section");
  box.append(el("h3", null, "方 D10 核验报告（五段 · 差异明细 / 计算 / 边界）"));
  const bar = el("div", "int-chips");
  bar.append(el("span", "up-badge", `code ${f.code_version || "—"} · schema ${f.schema_version || "—"}`));
  bar.append(el("span", "up-badge " + (f.requires_review_cases.length ? "" : "up-badge-ok"),
    `需人工复核 ${f.requires_review_cases.length}/${f.present_cases} 组${f.requires_review_cases.length ? "（" + f.requires_review_cases.join("、") + "）" : ""}`));
  bar.append(el("span", "up-badge", `差异明细 ${f.diff_items_total} 条`));
  bar.append(el("span", "up-badge", `计算 ${f.calculations_total} 条`));
  bar.append(el("span", "up-badge", `边界声明 ${f.boundaries_total} 条`));
  bar.append(el("span", "up-badge", `离线重放（model_called=false）`));
  box.append(bar);
  if (f.source_versions) {
    const sv = f.source_versions;
    box.append(el("div", "verify-note",
      `来源版本（方侧钉住）：魏 ${String(sv.weiwenyu || "").slice(0, 8)} · 宗 ${String(sv.zongbowen || "").slice(0, 8)} · 张 ${String(sv.zhangzhibo || "").slice(0, 8)} · 陈 ${String(sv["cjh-workspace"] || "").slice(0, 8)}`));
  }
  for (const msg of f.cache_runtime_boundary || []) {
    box.append(el("div", "verify-warn", "方侧边界声明（直接约束本页口径）：" + msg));
  }
  return box;
}

/** 方报告单组折叠区。 */
function fangCaseBlock(fc) {
  if (!fc) return null;
  const wrap = el("details", "ev-guarantee");
  const sum = el("summary", null,
    `方报告五段：差异明细 ${fc.diff_item_count} · 计算 ${fc.calculations.length} · 边界 ${fc.boundaries.length}` +
    (fc.requires_review ? "　⚠ 本组需人工复核" : ""));
  wrap.append(sum);

  if (fc.diff_item_count) {
    const t = el("div", "int-fang-items");
    for (const it of fc.diff_items) {
      const row = el("div", "int-fang-item");
      const head = el("div", "int-fang-head");
      head.append(el("span", "pm-strong", it.kind));
      head.append(el("span", "int-chk " + (it.verdict === "corroborated" ? "ok" : (it.verdict === "conflict" ? "bad" : "info")), it.verdict));
      head.append(el("span", "pm-code", it.diff_id));
      if (it.comparison_performed === false) head.append(el("span", "int-chk info", "未做数值比较"));
      if (it.requires_review) head.append(el("span", "int-chk bad", "需复核"));
      row.append(head);
      row.append(el("div", "int-dup", "字段 " + (it.fields.join("、") || "—") + " · 成员 " + (it.members.join(" / ") || "—")));
      for (const o of it.observations || []) {
        row.append(el("div", "int-obs", `${o.member_id} · ${o.entity || "—"} · ${o.field} = ${fmt(o.value)}${o.unit ? " " + o.unit : ""}`));
      }
      t.append(row);
    }
    wrap.append(t);
  } else {
    wrap.append(el("div", "verify-note", "本组无规则级差异明细"));
  }

  for (const c of fc.calculations) {
    const box = el("div", "int-calc");
    const ops = (c.operands || []).map(o => `${o.entity || "?"} ${fmt(o.value)}`).join(" ＋ ");
    box.append(el("div", "int-calc-title", `${c.operation}：${ops} ＝ ${fmt(c.result)}${c.unit ? " " + c.unit : ""}`));
    box.append(el("div", "int-dup", `${c.calculation_id} · status=${c.status}${c.attribution_id ? " · 归因 " + c.attribution_id : ""}`));
    wrap.append(box);
  }

  if (fc.boundaries.length) {
    const bd = el("div", "int-bound");
    for (const b of fc.boundaries) bd.append(el("div", "int-bound-row", "· " + b));
    wrap.append(bd);
  }

  if ((fc.cache_check || []).length) {
    const cc = el("div", "int-asserts");
    for (const c of fc.cache_check) {
      const chip = el("div", "int-assert" + (c.replay_business_fields_identical && c.cold_rerun_business_identical ? " ok" : " bad"));
      chip.append(el("span", "int-assert-mark", c.replay_business_fields_identical && c.cold_rerun_business_identical ? "✓" : "✗"));
      chip.append(el("span", null,
        `${c.member_id} 重放一致${c.replay_business_fields_identical ? "✔" : "✗"} · 冷重跑一致${c.cold_rerun_business_identical ? "✔" : "✗"} · 新 run_id${c.new_rerun_run_id ? "✔" : "✗"}` +
        (c.changed_business_fields && c.changed_business_fields.length ? ` · 变化字段 ${c.changed_business_fields.join("、")}` : "")));
      cc.append(chip);
    }
    wrap.append(cc);
  }

  if (fc.trace) {
    wrap.append(el("div", "int-dup",
      `trace：model_called=${fc.trace.model_called} · input_mutated=${fc.trace.input_mutated} · expected_labels_used=${fc.trace.expected_labels_used} · b_run_id=${fc.trace.b_run_id || "—"}`));
  }
  return wrap;
}

/** 单个案例卡片：预期 → 实判 → 归因 → 边界 → 必填自检 → 成员。 */
function caseCard(c) {
  const card = el("div", "pair-card" + (c.actual_relation === "unknown" ? " pair-card-unknown" : ""));
  const head = el("div", "pair-head");
  const title = el("div", "pair-title");
  title.append(el("span", null, `${c.case_id}　${c.title || ""}`));
  head.append(title);
  const badges = el("div", "pair-badges");
  badges.append(el("span", "pm-label", "预期（宗）"));
  badges.append(el("span", "pair-basis", c.expected_text || "—"));
  badges.append(relBadge(c.expected_relation));
  badges.append(el("span", "pair-arrow", "→"));
  badges.append(el("span", "pm-label", "实判（魏）"));
  badges.append(relBadge(c.actual_relation));
  if (c.relation_match === true) badges.append(el("span", "pair-match ok", "✔ 一致"));
  else if (c.relation_match === false) badges.append(el("span", "pair-match bad", "✘ 不一致"));
  else badges.append(el("span", "pair-unknown-note", "预期未含三态词，不可验（不计入不一致）"));
  head.append(badges);
  card.append(head);

  if (c.purpose) card.append(el("div", "pair-basis", "考察点：" + c.purpose));

  const d = c.diffs;
  const line = el("div", "pm-row");
  line.append(el("span", "pm-label", "判定明细"));
  line.append(el("span", "pm-value",
    `冲突 ${d.conflicts == null ? "—" : d.conflicts} · 互证 ${d.corroborations == null ? "—" : d.corroborations} · 补充 ${d.complementaries == null ? "—" : d.complementaries}`));
  card.append(line);
  if (/互证\s*\d/.test(c.expected_text || "")) {
    card.append(el("div", "verify-note",
      "口径对照：宗预期文本「" + c.expected_text + "」与实判互证数（" + num(d.corroborations) + "）并列显示，不做单方调和；差异请由魏/宗确认口径。"));
  }

  if (c.attribution) {
    const at = el("div", "int-attr");
    at.append(el("span", "pm-label", "归因"));
    at.append(el("span", "pm-value", c.attribution.note || ("冲突 " + (c.attribution.conflict_count ?? "—"))));
    for (const a of c.attribution.attributions || []) {
      at.append(el("div", "int-attr-row", typeof a === "string" ? a : JSON.stringify(a)));
    }
    card.append(at);
  }

  if ((c.boundaries || []).length) {
    const bd = el("div", "int-bound");
    bd.append(el("span", "pm-label", "边界声明"));
    for (const b of c.boundaries) bd.append(el("div", "int-bound-row", typeof b === "string" ? b : JSON.stringify(b)));
    card.append(bd);
  }

  card.append(el("div", "int-diff", c.diff_list && c.diff_list.length
    ? "差异清单 " + c.diff_list.length + " 条：" + c.diff_list.map(x => typeof x === "string" ? x : JSON.stringify(x)).join("；")
    : "差异清单：空（本组无组级冲突记录）"));

  const req = el("div", "int-req");
  req.append(el("span", "pm-label", "宗必填项"));
  for (const r of c.required_check) req.append(el("span", "int-chk" + (r.ok ? " ok" : " bad"), (r.ok ? "✓" : "✗") + r.name));
  card.append(req);

  card.append(memberTable(c));

  if ((c.chain_missing || []).length) {
    card.append(el("div", "verify-warn", "出处链覆盖缺口：" + c.chain_missing.map(m => `${m.member}（${m.reason}）`).join("；") + " —— 属张侧无解析包，非链检不通过"));
  }

  const fb = fangCaseBlock(c.fang);
  if (fb) card.append(fb);

  const cache = c.cache || {};
  const cch = el("div", "int-chips");
  cch.append(el("span", "up-badge " + (cache.replay_business_fields_identical ? "up-badge-ok" : "up-badge-fail"), "重放一致 " + (cache.replay_business_fields_identical ? "✔" : "✗")));
  cch.append(el("span", "up-badge " + (cache.cold_cache_new_call_log ? "up-badge-ok" : "up-badge-fail"), "清缓存新日志 " + (cache.cold_cache_new_call_log ? "✔" : "✗")));
  cch.append(el("span", "up-badge " + (cache.web_cli_same_result ? "up-badge-ok" : "up-badge-fail"), "Web/CLI 一致 " + (cache.web_cli_same_result ? "✔" : "✗")));
  card.append(cch);

  return card;
}

/** 渲染入口。 */
export function renderIntegration(root, data) {
  root.replaceChildren();
  if (data.error) { root.append(el("div", "empty", "⚠ " + data.error)); return; }
  root.append(topSummary(data));
  const cp = cachePanel(data.summary.cache);
  if (cp) root.append(cp);
  const fp = fangPanel(data);
  if (fp) root.append(fp);
  const chp = chainPanel(data);
  if (chp) root.append(chp);
  const sec = el("div", "verify-section");
  sec.append(el("h3", null, "10 组集成案例（预期 → 实判 → 归因 → 边界）"));
  for (const c of data.cases) sec.append(caseCard(c));
  root.append(sec);
  root.append(el("div", "verify-note",
    "口径声明：① 徽章列的「预期」来自宗 cases 原文，「三态词」是页面为便于比对而做的映射（explainable_difference 归入 unrelated 侧），原文一并显示，映射不替代原文；" +
    "② 预期未含三态词者显示「—（不可验）」，不计入不一致；③ 张侧链检 ✘ 仅表示该成员本地无解析包，与链检是否通过是两件事。"));
}

export function clearIntegration(root) {
  root.replaceChildren(el("div", "empty", "集成视图未加载"));
}
