// Source-aware review cards, shared by the browser and keyless rendering tests.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ReviewView = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const number = value => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('zh-CN') : '未提供';
  const unit = value => value === 'shares' ? '股' : value || '';
  const goodSource = s => s?.source_verified === true && typeof s.quote === 'string' && s.quote.trim() && typeof s.block_text === 'string' && s.block_text.includes(s.quote);
  function sourceCard(s, label) {
    const ok = goodSource(s);
    return `<div class="review-source"><span class="side">${esc(label)} · ${esc(s?.case_id || '来源未提供')}</span>
      <p>${esc(s?.entity || '')} ${esc(s?.field || '')}</p>
      <blockquote>${s?.quote?.trim() ? esc(s.quote) : '未提供原文引文'}</blockquote>
      ${s?.page ? `<p>第 ${esc(s.page)} 页 · ${esc(s.block_id)}${s.cell_ref ? ' · ' + esc(s.cell_ref) : ''}</p>` : ''}
      ${ok ? `<button type="button" class="source-open" data-source="${esc(encodeURIComponent(JSON.stringify(s)))}">查看解析原文</button>` : `<p class="review-warning">${esc(s?.issue || '证据待复核')}</p>`}
      ${s?.purpose ? `<p class="source-purpose">${esc(s.purpose)}</p>` : ''}</div>`;
  }
  function corroboration(c, groupId, fields) {
    const aggregate = c.kind === 'group_total_matches_sum';
    const sides = aggregate ? [...(c.parts || []).map(p => p.source), c.aggregate?.source] : c.sources || [];
    const complete = c.evidence_complete === true && sides.length >= 2 && sides.every(goodSource);
    const title = complete ? aggregate ? '合计勾稽一致' : '字段值一致' : '证据待复核';
    const calculation = aggregate ? `${(c.parts || []).map(p => number(p.value)).join(' + ')} ${complete ? '=' : '；报告合计'} ${number(c.aggregate?.value)} 股` : `${number(c.value)} ${unit(sides[0]?.unit)}`;
    return `<article class="review-card" data-group="${esc(groupId)}"><header><span class="pid">${esc(groupId)}</span><span class="state ${complete ? 'ok' : 'warn'}">${title}</span></header>
      <h3>${esc(c.entity)} · ${esc(fields[c.field] || c.field)}</h3><p class="review-equation">${esc(calculation)}</p>
      <p class="source-purpose">${aggregate ? '按各出让方变动股数的绝对值求和；原文负号保留，合计不重复计入明细。' : '比较字段值；引文、页码和主体分别核对。'}</p>
      <div class="review-sources">${sides.length ? sides.map((s, i) => sourceCard(s, aggregate ? i === sides.length - 1 ? '合计' : '明细 ' + (i + 1) : ['A 侧', 'B 侧'][i])).join('') : sourceCard(null, '缺失来源')}</div></article>`;
  }
  function pairs(data) {
    const relations = { related: ['同一事件', 'same'], unrelated: ['不同事件', 'diff'], unknown: ['证据不足', 'unknown'] };
    const rank = g => ({ unknown: 2, related: 1, unrelated: 0 }[g.b?.predicted_relation] ?? 2);
    return `<p class="review-intro">公开开发配对 · 已有结果回放 · ${(data.groups || []).length} 组；页面读取保存报告。</p>` + [...(data.groups || [])].sort((a, b) => rank(b) - rank(a)).map(g => {
      const relation = g.b?.predicted_relation || 'unknown';
      const [label, cls] = relations[relation] || relations.unknown;
      return `<article class="pair" data-group="${esc(g.group_id)}"><div class="pair-head"><span class="pid">${esc(g.group_id)}</span><span class="t">${esc(g.test_purpose)}</span><span class="verdict ${cls}">${label}</span></div>
        <div class="pair-cols">${(g.members || []).map((m, i) => `<div class="m"><h3>${['A 侧', 'B 侧'][i] || '成员'} · ${esc(m.case_id)}</h3><p>${esc(m.issuer_name || '主体未提供')} · ${esc(m.issuer_code || '证券代码未提供')}</p><p>公告编号：${esc(m.notice_number || '未提供')}</p>
          ${(m.sources || []).length ? m.sources.map(s => sourceCard(s, '字段出处')).join('') : '<p class="review-warning">没有可定位的字段证据；不补造引文或页码。</p>'}</div>`).join('')}</div>
        <div class="basis">${esc((g.b?.reasons || []).join(' · '))}${g.relation_basis ? '<br>' + esc(g.relation_basis) : ''}</div>
        ${relation === 'unknown' ? '<div class="redline">证据不足；补齐证据并重新运行后复核。</div>' : ''}</article>`;
    }).join('');
  }
  function controlled(c) {
    return `<article class="review-card controlled" data-case="${esc(c.case_id)}"><header><span class="pid">${esc(c.case_id)}</span><span class="state warn">受控构造 · ${c.verdict === 'conflict' ? '数值冲突' : '待复核'}</span></header>
      <h3>受控矛盾案例</h3><p>${esc(c.premise)}</p><p class="review-equation">${(c.sides || []).map(s => number(s.value)).join(' ↔ ')} 股 · 差 ${number(c.difference)} 股</p>
      <div class="review-sources">${(c.sides || []).map((s, i) => `<div class="review-source"><span class="side">${i === 0 ? 'A 侧' : 'B 侧'} · ${esc(s.case_id)}</span><p>${esc(s.entity)} · ${esc(s.field)}</p><blockquote>${esc(s.quote)}</blockquote><p>夹具锚点 ${esc(s.block_id)} · 无真实 PDF 页码</p></div>`).join('')}</div><p class="source-purpose">${esc(c.source)}；独立于 13 组公开配对，不计入真实公告配对统计。</p></article>`;
  }
  function verify(data, fields = {}) {
    const stats = data.summary || {};
    const cards = (data.pairs || []).flatMap(p => (p.corroborations || []).map(c => corroboration(c, p.group_id, fields))).join('');
    const conflicts = (data.pairs || []).flatMap(p => (p.conflicts || []).map(c => `<article class="review-card"><header>${esc(p.group_id)} · 冲突记录</header><p>${esc(c.entity)} · ${esc(fields[c.field] || c.field)}</p><p class="review-warning">${esc(c.reason || c.message || '待复核双侧出处')}</p></article>`)).join('');
    const findings = (data.findings || []).map(f => `<details class="review-finding"><summary>${esc(f.message || f.code)}</summary><p>${esc(f.dataset)} · ${esc(f.event_id)} · ${esc((f.fields || []).join(', '))}</p></details>`).join('');
    return `<p class="review-intro">已有结果回放 · ${esc(stats.datasets_checked ?? 0)} 份数据集核验；下列来源来自冻结解析文本块。</p>
      ${(data.controlled_cases || []).map(controlled).join('')}${data.controlled_error ? `<p class="err">受控案例不可用：${esc(data.controlled_error)}</p>` : ''}
      <h3 class="review-heading">跨文档字段与合计核验</h3>${cards || '<p>暂无互证点</p>'}${conflicts}
      <details class="review-findings"><summary>单文档检查记录 · ${(data.findings || []).length} 条</summary>${findings}</details>`;
  }
  function sourceDetail(s) {
    if (!goodSource(s)) return '<p class="review-warning">证据未通过核对，无法定位原文。</p>';
    const at = s.block_text.indexOf(s.quote);
    const marked = esc(s.block_text.slice(0, at)) + '<mark>' + esc(s.quote) + '</mark>' + esc(s.block_text.slice(at + s.quote.length));
    return `<p>${esc(s.case_id)} · ${esc(s.entity)} · ${esc(s.field)} · 第 ${esc(s.page)} 页</p><p class="source-purpose">${esc(s.block_id)}${s.table_id ? ' · ' + esc(s.table_id) : ''}${s.cell_ref ? ' · ' + esc(s.cell_ref) : ''}</p><pre>${marked}</pre><p class="source-purpose">冻结解析文本块；高亮对应引文，此处不展示 PDF 图像。</p>`;
  }
  function bind(doc, onField) {
    const dialog = doc.createElement('dialog');
    dialog.className = 'source-dialog';
    dialog.setAttribute('aria-labelledby', 'sourceTitle');
    dialog.innerHTML = '<form method="dialog"><button aria-label="关闭原文" class="source-close">关闭</button></form><h2 id="sourceTitle">解析原文</h2><div class="source-detail"></div><button class="source-field" type="button">定位该字段</button>';
    doc.body.append(dialog);
    let selected;
    doc.addEventListener('click', event => {
      const button = event.target.closest('[data-source]');
      if (!button) return;
      try { selected = JSON.parse(decodeURIComponent(button.dataset.source)); }
      catch (error) { selected = null; }
      dialog.querySelector('.source-detail').innerHTML = sourceDetail(selected);
      dialog.querySelector('.source-field').hidden = !goodSource(selected);
      dialog.showModal();
    });
    dialog.querySelector('.source-field').addEventListener('click', async () => {
      dialog.close(); await onField(selected);
    });
  }
  return { pairs, verify, sourceCard, sourceDetail, bind };
});
