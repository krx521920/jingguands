// render/upload.js —— 栏一：批量上传（D6 闭环版）
// 批量上传 + 总进度条 + 逐文件状态 + 失败列表 + 日志下载。
// 口径：坏文件（非 JSON / 缺 events / 过桥失败）必须显示在失败列表里，绝不从报告中消失。
export function initUpload(onFilesPicked) {
  const drop = document.getElementById("drop");
  const input = document.getElementById("fileInput");
  const list = document.getElementById("fileList");

  drop.addEventListener("click", () => input.click());
  input.addEventListener("change", e => {
    if (e.target.files.length) onFilesPicked([...e.target.files]);
    input.value = "";   // 允许重复选同一批文件
  });
  drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", e => {
    e.preventDefault(); drop.classList.remove("over");
    if (e.dataTransfer.files.length) onFilesPicked([...e.dataTransfer.files]);
  });
}

/**
 * 批量上传执行器（由 app.js 调用）：XHR 上传 → 进度回调 → 批次报告渲染。
 * @param {File[]} files 文件数组
 * @param {(pct:number)=>void} onProgress 总进度回调（0-100）
 * @returns {Promise<object>} 服务端批次报告 {total, ok, failed, results[]}
 */
export function uploadBatch(files, onProgress) {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    for (const f of files) fd.append("files", f, f.name);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    // 上传进度：浏览器 → 服务器阶段（真实字节级进度条）
    xhr.upload.addEventListener("progress", e => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener("load", () => {
      try { resolve(JSON.parse(xhr.responseText)); }
      catch { reject(new Error("服务端响应非 JSON（HTTP " + xhr.status + "）")); }
    });
    xhr.addEventListener("error", () => reject(new Error("网络错误")));
    xhr.send(fd);
  });
}

/** 渲染批次报告：逐文件状态行 + 失败列表（红色）+ 日志下载入口。 */
export function renderBatchReport(container, report) {
  container.replaceChildren();

  const summary = document.createElement("div");
  summary.className = "up-summary";
  const sBadge = document.createElement("span");
  sBadge.className = report.failed ? "up-badge up-badge-fail" : "up-badge up-badge-ok";
  sBadge.textContent = report.failed
    ? `批次 ${report.batch_id}：${report.ok}/${report.total} 成功，${report.failed} 失败`
    : `批次 ${report.batch_id}：${report.total}/${report.total} 全部成功`;
  summary.append(sBadge);
  container.append(summary);

  // 失败列表置顶（修复项 1 口径：坏文件永远可见）
  const failures = report.results.filter(r => !r.ok);
  if (failures.length) {
    const box = document.createElement("div");
    box.className = "up-failures";
    const head = document.createElement("div");
    head.className = "up-failures-head";
    head.textContent = `⚠ 失败列表（${failures.length}）——坏文件已拦截，未进入数据集`;
    box.append(head);
    for (const f of failures) {
      const row = document.createElement("div");
      row.className = "up-fail-row";
      row.append("📄 " + f.filename + "（" + fmtSize(f.size) + "）→ " + f.error);
      box.append(row);
    }
    container.append(box);
  }

  // 成功清单
  for (const r of report.results) {
    if (!r.ok) continue;
    const row = document.createElement("div");
    row.className = "file-item";
    row.append("📄 " + r.filename + " → 数据集 " + r.dataset + "（" + r.events + " 事件）");
    import("../status.js").then(({ badge }) => row.append(badge("success")));
    container.append(row);
  }

  // 日志下载入口
  const logRow = document.createElement("div");
  logRow.className = "up-log-row";
  const a = document.createElement("a");
  a.href = report.log || "/api/upload/log";
  a.download = "upload_log.jsonl";
  a.textContent = "⬇ 下载上传日志（JSONL，含失败原因）";
  logRow.append(a);
  container.append(logRow);
}

/** 上传中的逐文件占位行（上传前先列出全部文件，避免"黑盒等待"）。 */
export function renderPendingFiles(container, files) {
  container.replaceChildren();
  for (const f of files) {
    const item = document.createElement("div");
    item.className = "file-item";
    item.append("📄 " + f.name + "（" + fmtSize(f.size) + "）");
    import("../status.js").then(({ badge }) => {
      item.append(badge("pending_review"));
      const hint = document.createElement("span");
      hint.className = "meta";
      hint.textContent = "等待上传";
      item.append(hint);
    });
    container.append(item);
  }
}

/** 总进度条（0-100），随 XHR upload.onprogress 实时刷新。 */
export function renderProgress(container, pct) {
  let bar = container.querySelector(".up-progress");
  if (!bar) {
    bar = document.createElement("div");
    bar.className = "up-progress";
    const inner = document.createElement("div");
    inner.className = "up-progress-inner";
    bar.append(inner);
    container.prepend(bar);
  }
  bar.querySelector(".up-progress-inner").style.width = pct + "%";
  bar.title = "上传进度 " + pct + "%";
}

export function renderSourceFile(container, sourceFile) {
  container.replaceChildren();
  const item = document.createElement("div");
  item.className = "file-item";
  item.append("当前文档 / " + sourceFile.filename);
  import("../status.js").then(({ badge }) => item.append(badge(sourceFile.parse_status)));
  container.append(item);
}

export function clearUpload() {
  document.getElementById("fileList").replaceChildren();
}

function fmtSize(n) {
  if (n == null) return "";
  return n >= 1048576 ? (n / 1048576).toFixed(1) + "MB" : (n / 1024).toFixed(1) + "KB";
}
