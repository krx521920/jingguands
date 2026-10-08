// app.js —— 装配入口：模式横幅 → 数据集选择 → 三栏渲染
import { fetchDatasets, fetchResult, fetchEngines } from "./adapter.js";
import { initUpload, uploadBatch, renderBatchReport, renderPendingFiles, renderProgress, renderSourceFile, clearUpload } from "./render/upload.js";
import { renderResults, clearResults } from "./render/results.js";
import { renderEvidences, focusEvidence, clearEvidences } from "./render/evidences.js";
import { renderPairs, clearPairs } from "./render/pairs.js";
import { renderVerify, clearVerify } from "./render/verify.js";
import { renderIntegration, clearIntegration } from "./render/integration.js";
import { renderMetrics, clearMetrics } from "./render/metrics.js";   // D11：真实结果图表

const $ = id => document.getElementById(id);

function setMode(data) {
  const sim = data.data_mode === "simulated";
  $("simBanner").classList.toggle("show", sim);
  const mb = $("modeBadge");
  mb.textContent = sim ? "模拟数据" : "真实数据";
  mb.classList.toggle("real", !sim);
  $("runMeta").textContent =
    `run_id: ${data.run_id} · schema v${data.schema_version} · 来源: ${data.source_file.filename}`;
  setEngineMeta(data);
}

/** D12：把"这份数据是怎么来的"显式写在页头——预生成信封 ≠ 独立抽取 */
function setEngineMeta(data) {
  // （页头空间有限，只放短标签，完整口径进 title，避免把标题挤成竖排）
  const em = data.extraction_engine;
  if (!em) return;
  const box = $("engineMeta");
  box.textContent = em.reruns_extraction ? "引擎 独立抽取" : "抽取方式：预生成结果（未重新抽取）";
  box.title = `${em.engine}：${em.engine_owner || ""}\n`
    + `抽取方式：${em.reruns_extraction ? "独立跑抽取管线" : "读预生成信封，未重新抽取"}\n`
    + `来源：${em.source_path || "—"}\n`
    + `code_version：${em.code_version || "—"}\n`
    + `契约版本：v${em.contract_version}`;
  box.style.color = em.reruns_extraction ? "var(--ok)" : "var(--warn)";
}

/** D12：启动时拉引擎清单，把"能否独立重跑抽取"明示在页头（无live 引擎 ⇒ Web/CLI 对照只能标未覆盖）。 */
async function loadEngineMeta() {
  try {
    const e = await fetchEngines();
    const box = $("engineMeta");
    const pending = e.engines.filter(x => !x.available);
    if (e.can_rerun_extraction) {
      box.textContent = "引擎 可独立抽取";
      box.title = "已接通 live 引擎，可跑 Web/CLI 独立对照：\n"
        + e.engines.map(x => `· ${x.id}（${x.owner}）：${x.available ? "就绪 — " + x.reason : "未接通 — " + x.reason}`).join("\n");
      box.style.color = "var(--ok)";
    } else {
      box.textContent = "抽取方式：预生成结果（在线抽取未接通）";
      box.title = "⚠ 未接通独立抽取引擎 ⇒ Web/CLI 对照只能判「未覆盖」（同源消费不构成对照）\n"
        + "预留入口（待魏文宇提供）：\n"
        + (pending.length ? pending.map(x => `· ${x.id}（${x.owner}）：${x.reason}`).join("\n") : "—")
        + "\n接通后仅需设环境变量，页面与接口零改动。";
      box.style.color = "var(--warn)";
    }
  } catch (err) {
    $("engineMeta").textContent = "引擎 未知";
  }
}

let loadRequest = 0;
let currentMethod = "预生成结果 · 可追溯";
let currentDataset = null;   // 当前数据集名（导出按钮用）

function exportDataset(format) {
  if (!currentDataset) { alert("请先加载数据集"); return; }
  document.querySelector(".export-menu").open = false;
  const a = document.createElement("a");
  a.href = `/api/export?dataset=${encodeURIComponent(currentDataset)}&format=${format}`;
  a.download = "";
  document.body.append(a);
  a.click();
  a.remove();
}

async function loadDataset(name) {
  const request = ++loadRequest;
  try {
    $("loadBtn").disabled = true;
    const data = await fetchResult(name);
    if (request !== loadRequest) return;
    currentDataset = name;
    setMode(data);
    renderSourceFile($("fileList"), data.source_file);
    renderResults($("results"), data, focusEvidence);
    renderEvidences($("evidences"), data);
    updateOverview(data);
  } catch (e) {
    if (request === loadRequest) alert("加载失败：" + e.message);
  } finally { if (request === loadRequest) $("loadBtn").disabled = false; }
}

function updateOverview(data) {
  const fields = (data.events || []).flatMap(event => Object.values(event.fields || {}));
  const review = fields.filter(f => ["pending_review", "unreadable"].includes(f.status_override) || ((f.value != null || f.normalized != null) && !f.evidence_id)).length;
  $("summaryEvents").textContent = String(data.events.length).padStart(2, "0");
  $("summaryEvidence").textContent = String(data.evidences.length).padStart(2, "0");
  $("summaryReview").textContent = String(review).padStart(2, "0");
  currentMethod = data.extraction_engine?.reruns_extraction ? "独立抽取结果 · 可追溯" : "预生成结果 · 可追溯";
  $("dataMethod").textContent = currentMethod;
}

function resetAll() {
  ++loadRequest;
  currentDataset = null;
  $("loadBtn").disabled = false;
  currentMethod = "选择数据集开始研读";
  $("dataMethod").textContent = currentMethod;
  for (const id of ["summaryEvents", "summaryEvidence", "summaryReview"]) $(id).textContent = "—";
  $("simBanner").classList.remove("show");
  $("modeBadge").textContent = "未加载";
  $("modeBadge").classList.remove("real");
  $("runMeta").textContent = "尚未加载数据";
  clearUpload();
  clearResults($("results"));
  clearEvidences($("evidences"));
}

async function boot() {
  // D12：抽取引擎状态（与数据集加载并行，互不阻塞）
  loadEngineMeta();

  // 数据集下拉（由 server 的 /api/datasets 动态列举 data/*.json）
  try {
    await refreshDatasets();
    $("datasetSel").addEventListener("change", () => loadDataset($("datasetSel").value));
    if ($("datasetSel").options.length) await loadDataset($("datasetSel").value);   // 启动即加载首个数据集
  } catch (e) {
    console.error("boot failed:", e);
  }

  // D8/D9/D10/D11：五个视图互斥切换（单文档 / 配对 / 核验 / 集成 / 图表），首进才拉对应接口，内容缓存
  let pairsLoaded = false, verifyLoaded = false;
  const VIEW_LABEL = { main: "公告研读", pairs: "跨文档比对", verify: "核验清单", integration: "综合核验", metrics: "质量报告" };
  const VIEW_DESC = { main: "从结构化事件出发，回到原文核对每一条证据。", pairs: "并排阅读关联公告，核对同一事件的前后变化。", verify: "先理解差异的原因，再判断是否构成矛盾。", integration: "汇集多份公告与核验报告，检查事件之间的完整关系。", metrics: "按独立口径查看已测结果、覆盖范围与待完成项。" };
  const showView = name => {
    for (const view of ["pairs", "verify", "integration", "metrics"]) $(view + "View").hidden = name !== view;
    document.querySelector("main").style.display = name === "main" ? "" : "none";
    document.querySelectorAll(".nav-item").forEach(btn => {
      const active = btn.id === name + "Btn";
      btn.classList.toggle("active", active);
      if (active) btn.setAttribute("aria-current", "page"); else btn.removeAttribute("aria-current");
    });
    const dot = document.createElement("span");
    dot.className = "title-dot";
    dot.textContent = ".";
    $("pageTitle").replaceChildren(VIEW_LABEL[name], dot);
    $("breadcrumbTitle").textContent = VIEW_LABEL[name];
    $("pageDescription").textContent = VIEW_DESC[name];
    $("modeBadge").hidden = name !== "main";
    $("dataMethod").textContent = name === "main" ? currentMethod : "仓库报告 · 非实时评测";
    $("simBanner").hidden = name !== "main";
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  $("mainBtn").addEventListener("click", () => showView("main"));
  const loadInto = async (btn, listId, url, renderFn, clearFn, loadedFlag) => {
    if (loadedFlag.v) return true;
    try {
      const data = await (await fetch(url)).json();
      if (data.error) throw new Error(data.error);
      renderFn($(listId), data);
      loadedFlag.v = true;
      return true;
    } catch (e) {
      clearFn($(listId));
      $(listId).innerHTML = "<div class='empty'>⚠ 加载失败：" + e.message + "</div>";
      return false;
    }
  };
  const pairsFlag = { v: false }, verifyFlag = { v: false }, integrationFlag = { v: false };
  const metricsFlag = { v: false };   // D11：图表数据随数据变化，加"刷新"入口而非永久缓存
  $("pairsBtn").addEventListener("click", async () => {
    const target = "pairs";
    showView(target);
    if (target === "pairs") await loadInto("pairsBtn", "pairsList", "/api/pairs", renderPairs, clearPairs, pairsFlag);
  });
  $("verifyBtn").addEventListener("click", async () => {
    const target = "verify";
    showView(target);
    if (target === "verify") await loadInto("verifyBtn", "verifyList", "/api/verify", renderVerify, clearVerify, verifyFlag);
  });
  $("integrationBtn").addEventListener("click", async () => {
    const target = "integration";
    showView(target);
    if (target === "integration") await loadInto("integrationBtn", "integrationList", "/api/integration", renderIntegration, clearIntegration, integrationFlag);
  });
  $("metricsBtn").addEventListener("click", async () => {
    const target = "metrics";
    showView(target);
    // 每次进入都重算：数据可能被上传/替换，缓存会显示过期数字（首测口径禁止）
    metricsFlag.v = false;
    if (target === "metrics") await loadInto("metricsBtn", "metricsList", "/api/metrics", renderMetrics, clearMetrics, metricsFlag);
  });

  $("loadBtn").addEventListener("click", () => loadDataset($("datasetSel").value));
  $("resetBtn").addEventListener("click", resetAll);
  $("exportCsvBtn").addEventListener("click", () => exportDataset("csv"));     // D3：导出
  $("exportJsonBtn").addEventListener("click", () => exportDataset("json"));

  // D6 批量上传闭环：选文件 → 进度条 → 服务端校验/过桥/落数据集 → 失败列表 → 自动加载首个成功数据集
  initUpload(async files => {
    const list = $("fileList");
    renderPendingFiles(list, files);
    try {
      const report = await uploadBatch(files, pct => renderProgress(list, pct));
      renderBatchReport(list, report);
      await refreshDatasets();                       // 新数据集进下拉
      const firstOk = report.results.find(r => r.ok);
      if (firstOk) {                                 // 真实闭环：上传成功即展示（结果/证据/对比同源生效）
        $("datasetSel").value = firstOk.dataset;
        await loadDataset(firstOk.dataset);
      }
    } catch (e) {
      list.replaceChildren();
      const err = document.createElement("div");
      err.className = "up-failures";
      err.textContent = "⚠ 上传失败：" + e.message;
      list.append(err);
    }
  });
}

/** 重建数据集下拉（保留当前选中项）。 */
async function refreshDatasets() {
  const { datasets } = await fetchDatasets();
  const sel = $("datasetSel");
  const prev = sel.value;
  sel.replaceChildren();
  for (const d of datasets) {
    const opt = document.createElement("option");
    opt.value = d;
    const kind = d.includes("awd") ? "中标合同" : d.includes("eqc") ? "股权变动" : /pledge|PLD/.test(d) ? "股份质押" : null;
    opt.textContent = kind ? kind + " · " + d.replace(/^wei_real_/, "") : d;
    sel.append(opt);
  }
  if (prev && datasets.includes(prev)) sel.value = prev;
  else if (datasets.includes("wei_real_awd_001")) sel.value = "wei_real_awd_001";
}

boot();
