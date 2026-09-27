// app.js —— 装配入口：模式横幅 → 数据集选择 → 三栏渲染
import { fetchDatasets, fetchResult } from "./adapter.js";
import { initUpload, renderSourceFile, clearUpload } from "./render/upload.js";
import { renderResults, clearResults } from "./render/results.js";
import { renderEvidences, focusEvidence, clearEvidences } from "./render/evidences.js";

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

async function loadDataset(name) {
  try {
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
    const { datasets } = await fetchDatasets();
    const sel = $("datasetSel");
    for (const d of datasets) {
      const opt = document.createElement("option");
      opt.value = d; opt.textContent = d;
      sel.append(opt);
    }
    sel.addEventListener("change", () => loadDataset(sel.value));
    if (datasets.length) await loadDataset(datasets[0]);   // 启动即加载首个数据集
  } catch (e) {
    console.error("boot failed:", e);
  }

  $("loadBtn").addEventListener("click", () => loadDataset($("datasetSel").value));
  $("resetBtn").addEventListener("click", resetAll);

  // 本地文件上传：D1 只读文本内容做长度占位，真实解析走 D2（对接张的解析结果）
  initUpload(async f => {
    if (f.name.endsWith(".txt")) {
      const text = await f.text();
      console.log(`[D1 占位] 本地读取 ${f.name}：${text.length} 字符（真实解析属 D2）`);
    }
  });
}

boot();
