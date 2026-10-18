/**
 * bridge/caliber.js —— 覆盖率口径的**单一真源**（2026-10-15 新增）
 *
 * 为什么有这个文件（方轩诚 2026-10-15 反馈 + 领导「动手修复并在页面侧落地」）：
 *   1. 旧的「字段抽取覆盖率」分母＝全部产出字段（606），把 169 个弃权字段
 *      （公告未提及/不适用/未披露/依据不足）也算作「未覆盖」——分母定义与
 *      「该抽的抽到了没有」这个问题不匹配。
 *   2. 按裁定新增「Gold 期望字段召回率」：**分母必须从 Gold 清单建期望全集**，
 *      绝不能只用引擎 status=extracted 反推分母（那等于拿答卷给自己出题，
 *      引擎少抽一个字段，分母就自己缩一格 ⇒ 永远 100%）。
 *   3. 两个数必须**分列并存**（页面权威槽位口径 606 ／ Gold 期望口径），
 *      所以本模块只算数、不决定谁上屏，展示口径由调用方按注册表纪律决定。
 *   4. **Gold v1.1 覆盖层**（2026-10-15 宗裁定，evaluation/2026-10-15-caliber/
 *      gold-corrections-v1.1.json）：按纪律**不改冻结 Gold 文件**，改为读 overlay
 *      应用（当前 1 项：D4-PLD-009 E03 end_date 由 needs_review 校正为
 *      not_mentioned）。overlay 缺失或损坏即标未测，不能退回旧金标的满分；
 *      overlay 与 Gold 现状不符（from 对不上）记 errors，绝不静默跳过。
 *
 * 纪律（与全项目一致）：
 *   · 口径只有一个真源：本文件。metrics.js（卡片）、metrics_registry（注册表）、
 *     demo/_retest_unified.js（重测）、demo/_evidence_check.js 一律调本模块，
 *     不得各自再算一遍（两处各算一次必然重演「同名两个值」）。
 *   · 分母为 0 / Gold 缺失 / 对齐歧义 ⇒ 返回 null 判「未测」，绝不按目标值填充。
 *   · 未裁定项（Gold needs_review / 状态分歧）单列 pending，**不得记成「正确弃权」**。
 *   · 禁止通过修改引擎 status 来缩小分母；本模块的分母只来自 Gold 文件内容。
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");                  // page_prototype/
const REPO = path.resolve(ROOT, "..", "..", "..");            // jingguands/
const EVAL = path.join(REPO, "evaluation");
const GOLD_CASES = ["D4", "D5", "D6"];
const metricSources = require("../../../../scripts/jingguan/lib/metric_sources.cjs");

/**
 * 口径语义标签（上屏文案与材料引用共用，防止同一个数被叫成两个名字）
 * ★ 2026-10-15：三个名字按宗《裁定-覆盖率分母口径-20261015.md》§二**法定命名**对齐——
 *   ①「契约字段全集槽位有值率」②「相对当前 Gold 的期望字段召回率」③「核心文本件槽位有值率」。
 *   裁定硬性要求：三数不得同名、不得互相替换、② 必须带「相对当前 Gold」字样。
 */
const LABELS = {
  slot_value_rate: "契约字段全集槽位有值率",
  expected_recall: "相对当前 Gold 的期望字段召回率",
  core_text_rate: "核心文本件槽位有值率",
  gold_value_match: "Gold 期望字段值一致率（当前 Gold 条件口径）",
  scope_31: "31 份冻结批槽位",
  scope_30: "30 份有 Gold 的核心文本件",
  scope_gold: "Gold 期望字段全集",
};

/** 限定语：② 号数（100%）**必须**带「相对当前 Gold」＋「本批为公开语料冻结回放，非未见样本」
 *  两句同行出现，缺一即为夸大（裁定 §二 硬性要求）。 */
const QUALIFIER = {
  conditional: "当前 Gold 条件口径",
  frozen_replay: "本批为公开语料冻结回放（非未见样本）",
  no_generalization: "不外推泛化",
  pending_note: "Gold 待复核 11 项单列 pending；v1.1 校正 D4-PLD-009 E03 end_date needs_review→not_mentioned；v1.3（2026-10-17 宗，取代 v1.2）校正 D6-AWD-002：E01 formal_award_notice_received false→not_mentioned（跨项目证据套用＝信封多填 1）、E01/E02 contract_signed not_disclosed→false（＝漏抽 2）——值一致 436/437＝99.77%，期望召回 436/438＝99.54%，两行并报",
};

/** Gold v1.1 覆盖层路径（status 层，C2 规则下本机私有检出，由 demo/_fetch_eval_scores.js 按 sha 取件） */
const GOLD_OVERLAY_REL = path.join("2026-10-15-caliber", "gold-corrections-v1.1.json");

/** Gold v1.3 算术层路径（2026-10-17 宗；supersede v1.2）：from/to 为值/状态混合形态，
 *  不经 applyGoldOverlay 的 status 断言，按收缩/扩张（shrink/grow）调整分母分子——
 *  与评测侧 build-scorecard.mjs 的 expectedTotal/matchedFilled 推导同构。 */
const GOLD_ARITH_REL = path.join("2026-10-17-gold-review", "gold-corrections-v1.3.json");
const NON_VALUED_STATUS_SET = new Set(["not_mentioned", "not_applicable", "not_disclosed", "needs_review", "unreadable"]);

/** 读 Gold v1.1 覆盖层；缺失/损坏 ⇒ available:false（相关成绩不可用） */
function readGoldOverlay() {
  try { metricSources.loadGoldEvidence(REPO); } catch (error) {
    return { available: false, why: error.message, applied: 0, errors: [error.message] };
  }
  const p = path.join(EVAL, GOLD_OVERLAY_REL);
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    if (!j || !Array.isArray(j.corrections)) return { available: false, why: "overlay 无 corrections 数组", applied: 0, errors: [] };
    return { available: true, version: j.version || null, issued_by: j.issued_by || null,
      path: GOLD_OVERLAY_REL, corrections: j.corrections, applied: 0, errors: [] };
  } catch (e) {
    return { available: false, why: "必需 overlay 缺失或不可解析——相关成绩未测", applied: 0, errors: [] };
  }
}

/** 读 Gold v1.3 算术层；返回 shrink（期望→无值）/grow（无值→期望）计数与明细。
 *  缺失 ⇒ available:false（相关成绩不可用，不回退旧分数）。 */
function readGoldArithmetic() {
  try {
    metricSources.loadGoldEvidence(REPO);
    const j = JSON.parse(fs.readFileSync(path.join(EVAL, GOLD_ARITH_REL), "utf8"));
    if (!j || !Array.isArray(j.corrections)) return { available: false, shrink: 0, grow: 0, corrections: [] };
    const isNV = s => NON_VALUED_STATUS_SET.has(String(s));
    const corrections = j.corrections;
    return { available: true, version: j.version || "v1.3", path: GOLD_ARITH_REL, corrections,
      shrink: corrections.filter(c => isNV(c.to) && !isNV(c.from)).length,
      grow: corrections.filter(c => isNV(c.from) && !isNV(c.to)).length };
  } catch (e) {
    return { available: false, shrink: 0, grow: 0, corrections: [] };
  }
}

/**
 * 把覆盖层应用到一个 Gold 信封对象（就地改 status，绝不新建/替换 Gold 文件）。
 * 每条 correction 断言 from 与现状一致；对不上记 error 不静默跳过。
 */
function applyGoldOverlay(gj, caseId, overlay) {
  if (!overlay || !overlay.available) return { applied: 0, errors: [] };
  let applied = 0;
  const errors = [];
  for (const c of overlay.corrections) {
    if (c.case_id !== caseId) continue;
    const ev = (gj.events || []).find(e => e.event_id === c.event_id);
    if (!ev) { errors.push(`${caseId} ${c.event_id}: Gold 无该事件，校正未应用`); continue; }
    const fv = ev.fields && ev.fields[c.field];
    if (!fv) { errors.push(`${caseId} ${c.event_id}.${c.field}: Gold 无该字段，校正未应用`); continue; }
    if (fv.status !== c.from) {
      errors.push(`${caseId} ${c.event_id}.${c.field}: 现状 ${fv.status} ≠ overlay.from ${c.from}，校正未应用`);
      continue;
    }
    fv.status = c.to;
    applied++;
  }
  overlay.applied += applied;
  overlay.errors.push(...errors);
  return { applied, errors };
}

/** Gold 目录（缺失即返回空数组——调用方据此判「未测」，绝不抛到页面 500） */
function goldDirs() {
  return GOLD_CASES
    .map(d => path.join(EVAL, d, "dev", "gold"))
    .filter(p => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } });
}

/**
 * 载入权威批入口径信封（名单单一真源＝bridge/data_source.js 的 counts_for_primary）。
 * 供注册表/脚本复用，避免各写一份「哪些份算数」的判断。
 */
function primaryEnvelopes() {
  const ds = require("./data_source.js");
  const out = [];
  for (const e of ds.primaryEntries().filter(x => x.counts_for_primary)) {
    try { out.push({ id: e.name, json: JSON.parse(fs.readFileSync(e.file, "utf8")) }); }
    catch (err) { /* 坏文件跳过：由 no_gold/unpairable 段显式记账，不静默 */ }
  }
  return out;
}

/** Gold 索引：按 source.file_id 配对（★不能用 file_name，Gold 沿用旧批次文件名）
 *  ★ 2026-10-15：读入后就地应用 Gold v1.1 覆盖层（overlay 与 Gold 现状不符记 error 不静默跳过）。 */
function loadGoldIndex() {
  try { return metricSources.loadGoldEvidence(REPO); }
  catch (error) {
    return { byFileId: new Map(), byCaseId: new Map(), bad: [{ why: error.message }],
      overlay: { available: false, applied: 0, errors: [error.message] } };
  }
}

// ---------- 归一（与 demo/_retest_unified.js 原实现一致，全项目只此一份） ----------
function norm(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  if (s === "true" || s === "TRUE") return true;
  if (s === "false" || s === "FALSE") return false;
  if (s === "" || s === "null" || s === "undefined") return null;
  const n = Number(s.replace(/,/g, ""));
  if (!Number.isNaN(n) && /^[-+]?[\d.,]+$/.test(s)) return n;
  return s;
}
function normRatio(v) {
  if (typeof v === "string" && v.includes("%")) { const n = Number(v.replace("%", "")); return Number.isNaN(n) ? v : n; }
  return norm(v);
}
/** ★ `/rate/` 会误命中 duration（du-rate）——必须用词边界 */
function isRatioField(f) { return /(^|_)(ratio|percent|rate)($|_)/.test(String(f)); }

function pickVal(field) {
  if (!field) return null;
  const v = field.value !== null && field.value !== undefined ? field.value : field.raw_value;
  return v === undefined ? null : v;
}
/** 「有效值」：0 与 false 是有效值（方轩诚 2026-10-15 明确），空串/空白/null 不是 */
function hasEffectiveValue(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === "string" && v.trim() === "") return false;
  return true;
}

/** 事件业务键（★禁按序号/event_id 配对） */
function evKey(ev, etype) {
  const f = (ev && ev.fields) || {};
  const pick = (...ks) => {
    for (const k of ks) {
      const x = f[k];
      if (x) { const v = pickVal(x); if (v !== null && v !== undefined && String(v).trim() !== "") return String(v).trim(); }
    }
    return null;
  };
  const t = etype || (ev && ev.event_type);
  if (t === "pledge") return ["pledge", pick("pledgor"), pick("pledgee"), pick("direction") || "pledge"].join("|");
  if (t === "equity_change") return ["equity_change", pick("holder"), pick("direction")].join("|");
  if (t === "award_contract") return ["award_contract", pick("bidder"), pick("project_name")].join("|");
  return ["other", pick("bidder"), pick("holder")].join("|");
}

/**
 * ★ Gold 期望全集 → 与信封逐字段对账。
 *
 * 与旧实现（demo/_retest_unified.js 第 176-205 行）的关键差别：
 *   ① **先建 Gold 期望全集**，信封侧只是被查对象；分母只由 Gold 决定。
 *   ② Gold 有事件而信封无对应事件 ⇒ 该事件**全部期望字段仍进分母**并记 miss
 *      （旧实现 `continue` 掉，连分母一起丢 ⇒ 漏抽被静默吞掉）。
 *   ③ 同键多事件按**组内序号**一一配对，不再只取 gList[0]/eList[0]
 *      （旧实现遇自然键碰撞会漏算后续事件）。
 */
function buildGoldExpected(envelopes, goldIndex) {
  const gi = goldIndex || loadGoldIndex();
  const out = {
    available: gi.byFileId.size > 0,
    pairs: 0,
    paired_datasets: 0,         // 与 Gold 成功配对的份数（范围事实，不是组数）
    expected_total: 0,          // Gold 期望字段全集（召回率分母）
    recall_num: 0,              // 引擎有效抽出（status=extracted 且有有效 value）且 Gold 也期望
    recall_miss: [],            // 期望字段但引擎没抽到（原文存在却抽不出 ⇒ miss 必须扣分）
    value_match_num: 0,
    value_mismatch: [],
    extra_candidates: [],       // Gold 判无值（未提及/不适用/未披露）而引擎却填了值 ⇒ 多抽候选
    miss_events: [],            // Gold 有事件、信封无该事件（旧实现丢分母的位置）
    pending_gold: 0,            // Gold 判 needs_review 的字段数（未裁定，单列）
    pending_engine: 0,          // 引擎判 needs_review 的字段数
    status_diff: [],            // 双方对同一字段状态判定不一致
    no_gold: [],                // 无 Gold 的份（不可核，单列，不进任何分母）
    no_gold_fields: 0,
    unpairable: [],             // 缺身份/对齐歧义 —— 阻断正式统计
    gold_bad: gi.bad || [],
    gold_dirs: goldDirs(),
    overlay: gi.overlay || { available: false, applied: 0, errors: [] },
    pair_key: "source.file_id（★不能用 file_name：Gold 沿用旧批次文件名）",
    event_key: "业务键（pledge: pledgor+pledgee+direction / equity_change: holder+direction / award_contract: bidder+project_name）",
  };

  for (const { id, json: j } of envelopes) {
    const fid = j.source && j.source.file_id;
    const hit = fid ? gi.byFileId.get(fid) : null;
    const evs = j.events || [];
    if (!fid) { out.unpairable.push({ dataset: id, why: "信封缺 source.file_id" }); continue; }
    if (!hit) {
      let n = 0;
      for (const ev of evs) for (const fv of Object.values((ev && ev.fields) || {})) { if (isField(fv)) n++; }
      out.no_gold.push({ dataset: id, fields: n, why: "该文档无 Gold（演示件/原文缺陷件），值层不可核" });
      out.no_gold_fields += n;
      continue;
    }

    const g = hit.gold;
    out.paired_datasets++;
    const gEvs = g.events || [];
    // 组内序号配对（同键多事件不丢）
    const group = (list) => {
      const m = new Map();
      for (const ev of list) {
        const k = evKey(ev, ev.event_type);
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(ev);
      }
      return m;
    };
    const eMap = group(evs), gMap = group(gEvs);

    for (const [k, gList] of gMap) {
      const eList = eMap.get(k) || [];
      for (let i = 0; i < gList.length; i++) {
        const gEv = gList[i];
        const eEv = eList[i] || null;
        if (!eEv) {
          out.miss_events.push({ dataset: id, gold_case: hit.gold_case_id, key: k, index: i,
            why: "Gold 有该事件、信封无对应事件（同键第 " + (i + 1) + " 个）——期望字段仍计入分母" });
        } else out.pairs++;

        for (const [fname, gfv] of Object.entries(gEv.fields || {})) {
          if (!isField(gfv)) continue;
          if (gfv.status === "needs_review") out.pending_gold++;
          if (gfv.status !== "extracted") continue;     // 期望全集＝Gold 判有值（含 0/false）
          out.expected_total++;

          const efv = eEv ? (eEv.fields || {})[fname] : null;
          if (!efv) {
            out.recall_miss.push(`${id}.${gEv.event_id || k}.${fname}: 信封无该字段（Gold 期望有值）`);
            continue;
          }
          const ev2 = pickVal(efv);
          const gv2 = pickVal(gfv);
          if (efv.status !== "extracted" || !hasEffectiveValue(ev2)) {
            out.recall_miss.push(`${id}.${gEv.event_id || k}.${fname}: status=${efv.status} value=${JSON.stringify(ev2)}（Gold 期望有值）`);
            continue;
          }
          out.recall_num++;

          const en = isRatioField(fname) ? normRatio(ev2) : norm(ev2);
          const gn = isRatioField(fname) ? normRatio(gv2) : norm(gv2);
          const unitOk = (gfv.unit == null || efv.unit == null) ? true : String(gfv.unit) === String(efv.unit);
          const denominatorOk = !isRatioField(fname) || (efv.denominator ?? null) === (gfv.denominator ?? null);
          if (String(en) === String(gn) && unitOk && denominatorOk) out.value_match_num++;
          else {
            out.value_mismatch.push(`${id}.${gEv.event_id || k}.${fname}: 信封=${JSON.stringify(en)}${unitOk ? "" : "(unit=" + efv.unit + ")"}${denominatorOk ? "" : "(denominator=" + efv.denominator + ")"} vs Gold=${JSON.stringify(gn)}${unitOk ? "" : "(unit=" + gfv.unit + ")"}${denominatorOk ? "" : "(denominator=" + gfv.denominator + ")"}`);
          }
        }

        // 多抽候选 + 状态分歧：以**引擎侧**字段为遍历对象
        if (eEv) {
          for (const [fname, efv] of Object.entries(eEv.fields || {})) {
            if (!isField(efv)) continue;
            const gfv = (gEv.fields || {})[fname];
            if (!gfv) continue;                                  // Gold 无此字段 ⇒ 字段集不一致，另见 unpairable
            if (gfv.status !== "extracted" && efv.status === "extracted" && hasEffectiveValue(pickVal(efv))) {
              out.extra_candidates.push(`${id}.${gEv.event_id || k}.${fname}: 引擎填值 ${JSON.stringify(pickVal(efv))} 而 Gold 判 ${gfv.status}（不得挪入分子）`);
            }
            if (efv.status !== "extracted" && gfv.status !== efv.status) {
              out.status_diff.push(`${id}.${gEv.event_id || k}.${fname}: 信封=${efv.status} vs Gold=${gfv.status}`);
            }
          }
        }
      }
    }
    // 引擎多出的事件（Gold 无）也记下来，不静默
    for (const [k, eList] of eMap) {
      const gList = gMap.get(k) || [];
      if (eList.length > gList.length) {
        out.extra_candidates.push(`${id} [${k}]: 引擎事件数 ${eList.length} > Gold ${gList.length}（多出 ${eList.length - gList.length} 个）`);
      }
    }
  }

  // 引擎侧 needs_review 字段数（未裁定 pending 的引擎侧计数；与 Gold 侧 pending_gold 并列，
  // 不得相加、不得记成「正确弃权」）
  for (const { json: j } of envelopes) {
    for (const ev of (j.events || [])) {
      for (const fv of Object.values((ev && ev.fields) || {})) {
        if (isField(fv) && fv.status === "needs_review") out.pending_engine++;
      }
    }
  }
  return out;
}

function isField(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  return v.status !== undefined || v.raw_value !== undefined || v.provenance !== undefined;
}

/**
 * 口径范围名单：**单一真源在 bridge/data_source.js**（SCOPE_FRAMES）。
 * 惰性 require 防循环依赖；取不到时退回同值内联默认（并保持名字与真源一致）。
 */
function defaultFrames() {
  try {
    const ds = require("./data_source.js");
    if (ds && ds.SCOPE_FRAMES) return ds.SCOPE_FRAMES;
  } catch (e) { /* 落到内联默认 */ }
  return {
    local_demo_datasets: ["DEMO-EQC-HL-0930"],
    scanned_degrade_datasets: ["pledge-scan-degrade"],
  };
}

/**
 * 槽位口径（历史口径）：分母＝全部产出字段。三档范围并列给出，互不替换：
 *   ① frozen_slot   31 份（含扫描降级件）＝ 606
 *   ② core_text     30 份有 Gold 的核心文本件 ＝ 606 − 扫描降级字段
 *   ③ gold_expected Gold 期望字段全集（由 Gold 决定，见 buildGoldExpected）
 * ★ 不删扫描件、不改冻结锚点来「美化」处理成功率——范围拆分展示，不是删数据。
 */
function slotScope(envelopes, frames) {
  const f = frames || defaultFrames();
  const scanned = new Set(f.scanned_degrade_datasets || []);
  const demo = new Set(f.local_demo_datasets || []);
  const by = {};
  const out = {
    datasets: envelopes.length,
    fields_total: 0, extracted: 0,
    by_status: {},
    core_text: { datasets: 0, fields_total: 0, extracted: 0 },
    scanned_degrade: { datasets: 0, fields_total: 0 },
    local_demo: { datasets: 0, fields_total: 0, present: false },
  };
  for (const { id, json: j } of envelopes) {
    const isScanned = scanned.has(id), isDemo = demo.has(id);
    if (isDemo) out.local_demo.present = true;
    let n = 0;
    for (const ev of (j.events || [])) {
      for (const fv of Object.values((ev && ev.fields) || {})) {
        if (!isField(fv)) continue;
        n++;
        out.fields_total++;
        const st = fv.status === undefined ? "(undefined)" : String(fv.status);
        out.by_status[st] = (out.by_status[st] || 0) + 1;
        by[st] = (by[st] || 0) + 1;
        if (st === "extracted") out.extracted++;
        if (isDemo) out.local_demo.fields_total++;
      }
    }
    if (isScanned) { out.scanned_degrade.datasets++; out.scanned_degrade.fields_total += n; }
    else if (!isDemo) {
      out.core_text.datasets++;
      out.core_text.fields_total += n;
      out.core_text.extracted += (() => {
        let e = 0;
        for (const ev of (j.events || [])) for (const fv of Object.values((ev && ev.fields) || {})) if (isField(fv) && fv.status === "extracted") e++;
        return e;
      })();
    }
  }
  return out;
}

/**
 * 一次性算出全部口径数（页面卡片 / 注册表 / 重测脚本共用）。
 * @param {Array<{id:string,json:object}>} envelopes 入口径信封（31 份）
 * @param {object} [opts] { frames, goldIndex }
 */
function computeCaliber(envelopes, opts) {
  const o = opts || {};
  const slot = slotScope(envelopes, o.frames);
  const goldIndex = o.goldIndex || loadGoldIndex();
  const gold = buildGoldExpected(envelopes, goldIndex);
  gold.pending_engine = slot.by_status["needs_review"] || 0;
  // Both overlays have already been applied to the in-memory Gold fields.
  gold.arithmetic = { available: gold.available, applied_to_fields: true };
  gold.extra_filled_v13 = gold.extra_candidates.length;
  gold.missed_expected_v13 = gold.recall_miss.length;

  const pct = (a, b) => (b ? +((a / b) * 100).toFixed(2) : null);
  const den = gold.expected_total;
  const recallPct = gold.available && den > 0 ? pct(gold.recall_num, den) : null;
  const matchPct = gold.available && den > 0 ? pct(gold.value_match_num, den) : null;

  return {
    generated_at: new Date().toISOString(),
    labels: LABELS,
    qualifier: QUALIFIER,
    slot: {
      datasets: slot.datasets,
      den: slot.fields_total,
      num: slot.extracted,
      pct: pct(slot.extracted, slot.fields_total),
      by_status: slot.by_status,
      note: "分母＝全部产出字段（含未提及/不适用/未披露/依据不足等弃权）——这是历史口径，不等于抽取准确率",
    },
    ranges: {
      frozen_slot: { datasets: slot.datasets, fields: slot.fields_total, extracted: slot.extracted },
      core_text: { datasets: slot.core_text.datasets, fields: slot.core_text.fields_total, extracted: slot.core_text.extracted },
      gold_expected: { datasets: gold.available ? gold.paired_datasets : null, fields: gold.available ? den : null,
        note: "Gold 期望字段全集：分母只由 Gold 清单决定，不由引擎 status 反推" },
      excluded_unknown_source: { datasets: slot.local_demo.present ? 1 : 0, fields: slot.local_demo.fields_total,
        note: "来源不清/演示件（不计入任何分母，仅警告）" },
      scanned_degrade: { datasets: slot.scanned_degrade.datasets, fields: slot.scanned_degrade.fields_total },
      local_demo: slot.local_demo,
    },
    gold: {
      available: gold.available,
      gold_dirs: gold.gold_dirs,
      // ★ Gold v1.1 覆盖层状态（应用条数/错误清单）——缺失即 available:false，pending 单列不补数
      overlay: gold.overlay,
      // ★ Gold v1.3 算术层（shrink/grow 已计入上面 expected/recall/value_match 各数）
      arithmetic: gold.arithmetic || { available: false },
      extra_filled_v13: gold.extra_filled_v13 || 0,
      missed_expected_v13: gold.missed_expected_v13 || 0,
      pair_key: gold.pair_key,
      event_key: gold.event_key,
      pairs: gold.pairs,
      expected_total: den,
      recall: { num: gold.recall_num, den, pct: recallPct,
        name: LABELS.expected_recall,
        caliber: "Gold 期望字段中，引擎 status=extracted 且有有效取值（0/false 亦算有值）的字段数 / Gold 期望字段全集。"
          + "分母只来自 Gold 清单，不由引擎 status 反推；原文存在却抽不出（miss）计入分母。" },
      filled_value_match: { num: gold.value_match_num, den: slot.extracted, pct: gold.available ? pct(gold.value_match_num, slot.extracted) : null },
      value_match: { num: gold.value_match_num, den, pct: matchPct,
        name: LABELS.gold_value_match,
        caliber: "Gold 期望字段中，值与单位都与 Gold 一致的字段数 / Gold 期望字段全集（分子条件与召回率不同，两者当前恰好同值，不得合并）" },
      recall_miss: gold.recall_miss,
      value_mismatch: gold.value_mismatch,
      extra_candidates: gold.extra_candidates,
      miss_events: gold.miss_events,
      pending: { gold: gold.pending_gold, engine: gold.pending_engine,
        note: "未裁定项单列：不得记「正确弃权」、不得记「通过」，也不得自动判失败" },
      status_diff: gold.status_diff,
      no_gold: gold.no_gold,
      no_gold_fields: gold.no_gold_fields,
      unpairable: gold.unpairable,
      gold_bad: gold.gold_bad,
      qualification: gold.available
        ? `${QUALIFIER.conditional}；${QUALIFIER.frozen_replay}；${QUALIFIER.no_generalization}；${QUALIFIER.pending_note}`
        : "Gold 不可用（本机无 evaluation/D4|D5|D6/dev/gold）⇒ 判未测，不得按 100% 或目标值填充",
      is_measured: gold.available && den > 0,
    },
  };
}

module.exports = {
  LABELS, QUALIFIER,
  ROOT, REPO, EVAL, GOLD_CASES, GOLD_OVERLAY_REL, GOLD_ARITH_REL,
  goldDirs, loadGoldIndex, defaultFrames, primaryEnvelopes,
  readGoldOverlay, readGoldArithmetic, applyGoldOverlay,
  norm, normRatio, isRatioField, hasEffectiveValue, pickVal,
  evKey, isField,
  buildGoldExpected, slotScope, computeCaliber,
};
