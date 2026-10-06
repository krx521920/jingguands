// app.js —— 装配入口：模式横幅 → 数据集选择 → 三栏渲染
import { fetchDatasets, fetchResult } from "./adapter.js";
import { initUpload, uploadBatch, renderBatchReport, renderPendingFiles, renderProgress, renderSourceFile, clearUpload } from "./render/upload.js";
import { renderResults, clearResults } from "./render/results.js";
import { renderEvidences, focusEvidence, clearEvidences } from "./render/evidences.js";
import { renderPairs, clearPairs } from "./render/pairs.js";
import { renderVerify, clearVerify } from "./render/verify.js";
import { renderIntegration, clearIntegration } from "./render/integration.js";

const $ = id => document.getElementById(id);

function setMode(data) {
  const sim = data.data_mode === "simulated";
  $("simBanner").classList.toggle("show", sim);
  const mb = $("modeBadge");
  mb.textContent = sim ? "模拟数据" : "真实数据";
  mb.classList.toggle("real", !sim);
  $("runMeta").textContent =
    `run_id: ${data.run_id} · schema v${data.schema_version} · 来源: ${data.source_file.filename}`;
}

let currentDataset = null;   // 当前数据集名（导出按钮用）

function exportDataset(format) {
  if (!currentDataset) { alert("请先加载数据集"); return; }
  const a = document.createElement("a");
  a.href = `/api/export?dataset=${encodeURIComponent(currentDataset)}&format=${format}`;
  a.download = "";
  document.body.append(a);
  a.click();
  a.remove();
}

async function loadDataset(name) {
  try {
    currentDataset = name;
    const data = await fetchResult(name);
    setMode(data);
    renderSourceFile($("fileList"), data.source_file);
    renderResults($("results"), data, focusEvidence);
    renderEvidences($("evidences"), data);
  } catch (e) {
    alert("加载失败：" + e.message);
  }
}

function resetAll() {
  $("simBanner").classList.remove("show");
  $("modeBadge").textContent = "未加载";
  $("modeBadge").classList.remove("real");
  $("runMeta").textContent = "D1 骨架 · 独立本地原型";
  clearUpload();
  clearResults($("results"));
  clearEvidences($("evidences"));
}

async function boot() {
  // 数据集下拉（由 server 的 /api/datasets 动态列举 data/*.json）
  try {
    await refreshDatasets();
    $("datasetSel").addEventListener("change", () => loadDataset($("datasetSel").value));
    if ($("datasetSel").options.length) await loadDataset($("datasetSel").value);   // 启动即加载首个数据集
  } catch (e) {
    console.error("boot failed:", e);
  }

  // D8/D9/D10：四个视图互斥切换（单文档 / 配对 / 核验 / 集成），首进才拉对应接口，内容缓存
  let pairsLoaded = false, verifyLoaded = false;
  const VIEW_LABEL = { main: "« 返回单文档", pairs: "跨文档配对 D8", verify: "核验清单 D9", integration: "多公告集成 D10" };
  const showView = name => {
    $("pairsView").hidden = name !== "pairs";
    $("verifyView").hidden = name !== "verify";
    $("integrationView").hidden = name !== "integration";
    document.querySelector("main").style.display = name === "main" ? "" : "none";
    for (const [btn, view] of [["pairsBtn", "pairs"], ["verifyBtn", "verify"], ["integrationBtn", "integration"]]) {
      $(btn).textContent = name === view ? VIEW_LABEL.main : VIEW_LABEL[view];
    }
  };
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
  $("pairsBtn").addEventListener("click", async () => {
    const target = $("pairsView").hidden ? "pairs" : "main";
    showView(target);
    if (target === "pairs") await loadInto("pairsBtn", "pairsList", "/api/pairs", renderPairs, clearPairs, pairsFlag);
  });
  $("verifyBtn").addEventListener("click", async () => {
    const target = $("verifyView").hidden ? "verify" : "main";
    showView(target);
    if (target === "verify") await loadInto("verifyBtn", "verifyList", "/api/verify", renderVerify, clearVerify, verifyFlag);
  });
  $("integrationBtn").addEventListener("click", async () => {
    const target = $("integrationView").hidden ? "integration" : "main";
    showView(target);
    if (target === "integration") await loadInto("integrationBtn", "integrationList", "/api/integration", renderIntegration, clearIntegration, integrationFlag);
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
    opt.value = d; opt.textContent = d;
    sel.append(opt);
  }
  if (prev && datasets.includes(prev)) sel.value = prev;
}

boot();
