// adapter.js —— 数据源适配层（页面只认数据契约 v0.1，不关心数据来自 mock 还是真实接口）
// 切换真实接口：server 侧设 DATA_SOURCE=remote + REMOTE_API_URL，前端零改动。
export async function fetchDatasets() {
  const r = await fetch("/api/datasets");
  if (!r.ok) throw new Error("datasets fetch failed: " + r.status);
  return r.json();
}

export async function fetchResult(dataset) {
  const r = await fetch("/api/result?dataset=" + encodeURIComponent(dataset));
  if (!r.ok) {
    let msg = "result fetch failed: " + r.status;
    try { msg = (await r.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  return r.json();
}
