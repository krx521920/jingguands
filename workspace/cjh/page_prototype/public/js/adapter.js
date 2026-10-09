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
    try { const j = await r.json(); msg = j.error || msg; } catch {}
    throw new Error(msg);
  }
  return r.json();
}

/** D12：抽取引擎清单。用于页头显示"当前数据来自预生成信封还是独立抽取"。 */
export async function fetchEngines() {
  const r = await fetch("/api/engines");
  if (!r.ok) throw new Error("engines fetch failed: " + r.status);
  return r.json();
}

/** D12：指标注册表（单一真源）。图表页、材料表格、缺陷表共用这一份口径。
 *  为什么不自己算：前端二次加工数是"同一指标在两处对不上"的根源。 */
export async function fetchMetricRegistry() {
  const r = await fetch("/api/metrics/registry");
  if (!r.ok) throw new Error("metrics registry fetch failed: " + r.status);
  return r.json();
}
