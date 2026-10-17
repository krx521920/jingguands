/* Shared metric presentation: unknown and descriptive values never imply failure. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MetricsView = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function state(metric) {
    if (metric.value == null || !Number.isFinite(metric.value)) return '未测';
    if (metric.target == null) return '实测值 · 不设达标线';
    return (metric.direction === 'lower' ? metric.value <= metric.target : metric.value >= metric.target) ? '达标' : '未达标';
  }
  function ratio(metric) {
    if (metric.unit === 's') return '历史性能实测';
    return Number.isFinite(metric.num) && Number.isFinite(metric.den) && metric.den > 0 ? `${metric.num}/${metric.den}` : '分母未建立';
  }
  function value(metric) { return metric.value == null ? '—' : esc(metric.value) + esc(metric.unit || ''); }
  function summary(metric) {
    return `<div class="stat"><div class="n">${value(metric)}</div><div class="l">${esc(metric.name)}<br>${esc(ratio(metric))} · ${esc(state(metric))}<br>${esc(metric.batch || metric.scope || '')}</div></div>`;
  }
  function details(metric) {
    const status = state(metric);
    const bar = metric.unit === '%' && metric.value != null ? `<div class="track"><div class="fill${status === '未达标' ? ' dim' : ''}" style="width:${Math.max(0, Math.min(metric.value, 100))}%"></div>${metric.target != null ? `<div class="goal" style="left:${Math.min(metric.target, 100)}%"></div>` : ''}</div>` : '';
    return `<div class="bg" data-metric="${esc(metric.key)}"><div class="bt"><span class="nm">${esc(metric.name)}</span><span class="num">${value(metric)} · ${esc(ratio(metric))}</span></div>${bar}<p class="metric-note">${esc(status)}${metric.target != null ? ' · 目标 ' + esc(metric.target) + esc(metric.unit || '') : ''}<br>${esc(metric.batch || metric.scope || '')}<br>${esc(metric.note || metric.caliber || '')}</p>${(metric.lines || []).map(line => `<p class="metric-note">${esc(line)}</p>`).join('')}<details class="rpt"><summary>计算依据</summary><div class="bd">${esc(metric.evidence || '见同批验收记录')}<br>${esc(metric.code_version || '')}</div></details></div>`;
  }
  function render(data) {
    const delivery = data.delivery_metrics;
    const metrics = delivery ? delivery.scores || [] : data.cards || [];
    const headline = ['field_accuracy', 'evidence_hit_strict', 'multi_doc_conflict', 'web_cli_independent'];
    const top = delivery ? headline.map(key => metrics.find(m => m.key === key)).filter(Boolean) : metrics;
    const groups = delivery ? [...new Set(metrics.map(m => m.group))] : ['指标'];
    return {
      stats: top.map(summary).join(''),
      body: (delivery?.error ? `<div class="err">成绩单不可用：${esc(delivery.error)}；相关指标未测。</div>` : '') + groups.map(group => `<h2 class="sect-title">${esc(group || '指标')}</h2><div class="charts">${metrics.filter(m => !delivery || m.group === group).map(details).join('')}</div>`).join('') + `<div class="coverage">${esc(delivery?.limitations || data.registry?.coverage_statement?.statement || '每项指标以所列批次和分母为准。')}</div>`
    };
  }
  return { state, ratio, render, summary };
});
