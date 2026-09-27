// render/upload.js —— 栏一：上传（D1 仅入口与状态占位；真实解析属 D2）
export function initUpload(onFilePicked) {
  const drop = document.getElementById("drop");
  const input = document.getElementById("fileInput");
  const list = document.getElementById("fileList");

  function showFile(name) {
    list.replaceChildren();
    const item = document.createElement("div");
    item.className = "file-item";
    item.append("📄 " + name);
    import("../status.js").then(({ badge }) => {
      item.append(badge("pending_review"));
      const hint = document.createElement("span");
      hint.className = "meta";
      hint.textContent = "等待解析（D2 接入）";
      item.append(hint);
    });
    list.append(item);
  }

  drop.addEventListener("click", () => input.click());
  input.addEventListener("change", e => {
    const f = e.target.files[0];
    if (f) { showFile(f.name); onFilePicked(f); }
  });
  drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", e => {
    e.preventDefault(); drop.classList.remove("over");
    const f = e.dataTransfer.files[0];
    if (f) { showFile(f.name); onFilePicked(f); }
  });
}

export function renderSourceFile(container, sourceFile) {
  container.replaceChildren();
  const item = document.createElement("div");
  item.className = "file-item";
  item.append("📄 " + sourceFile.filename);
  import("../status.js").then(({ badge }) => item.append(badge(sourceFile.parse_status)));
  container.append(item);
}

export function clearUpload() {
  document.getElementById("fileList").replaceChildren();
}
