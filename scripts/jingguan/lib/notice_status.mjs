/** Resolve notice receipt only when the source unambiguously scopes it to a project.
 * A supporting-document list alone does not say which project received a notice.
 * @param {object[]} events Extracted events, updated in place.
 * @param {object[]} blocks Source blocks in reading order.
 * @param {string[]} repairs Audit messages, appended when a field changes.
 */
export function stabilizeNoticeStatus(events, blocks, repairs) {
  const compact = text => String(text ?? '').replace(/\s+/g, '')
  const awards = events.filter(e => e.event_type === 'award_contract')
  const mentions = blocks.filter(b => /中标通知书|成交通知书|中标结果通知/.test(compact(b.text_raw)))
  const targets = new Map()
  const positives = new Map()
  const projectNames = awards.map(e => compact(e.fields?.project_name?.value)).filter(p => p.length >= 6)
  for (const event of awards) {
    const project = compact(event.fields?.project_name?.value)
    if (project.length < 6) continue
    for (const block of mentions) {
      const text = compact(block.text_raw), at = text.indexOf(project)
      if (at < 0) continue
      // Do not resolve competing dates from reading order. Keep both statements for review.
      const affirmative = String(block.text_raw).split(/[。！？；;，,\r\n]/).find(clause => {
        const statement = compact(clause)
        return statement.includes(project) && /(?:已(?:经)?|现已)(?:正式)?(?:收到|取得|获得|接到)/.test(statement)
          && /中标通知书|成交通知书|中标结果通知/.test(statement)
          && !projectNames.some(other => other !== project && statement.includes(other))
      })
      if (affirmative && block.block_id) positives.set(event, { block, quote: affirmative })
      const tail = text.slice(at + project.length)
      const denial = tail.match(/^(?:尚未|未)(?:取得|收到)(?:最终的?|正式的?)?中标通知书/)
      if (denial) targets.set(event, { block, project, denial: denial[0] })
    }
  }
  const scopedOnly = awards.length > 1 && targets.size > 0 && mentions.every(b => {
    const text = compact(b.text_raw)
    if (/^\d+[、.．]?《?中标通知书》?$/.test(text)) return true
    const scoped = new Set([...targets.values()].filter(t => t.block === b).map(t => t.project + t.denial))
    let remainder = text
    for (const statement of scoped) remainder = remainder.replaceAll(statement, '')
    return scoped.size > 0 && !/中标通知书|成交通知书|中标结果通知/.test(remainder)
  })
  for (const event of awards) {
    const field = event.fields?.formal_award_notice_received
    if (!field || ['unreadable', 'needs_review', 'not_applicable'].includes(field.status)) continue
    const before = JSON.stringify(field), target = targets.get(event)
    if (target && target.block.block_id) {
      // Recover the exact substring, including any original whitespace.
      const raw = target.block.text_raw
      const wanted = target.project + target.denial
      const positions = [...raw].map((c, i) => /\s/.test(c) ? -1 : i).filter(i => i >= 0)
      const start = compact(raw).indexOf(wanted)
      const quote = raw.slice(positions[start], positions[start + wanted.length - 1] + 1)
      const evidence = (block, text) => ({ block_id: block.block_id, page: block.page, region: block.region ?? null,
        source_type: block.source_type ?? 'paragraph', table_id: null, cell_ref: null, quote: text })
      const positive = positives.get(event)
      if (positive) {
        Object.assign(field, { status: 'needs_review', value: null, raw_value: null, standardized: false,
          provenance: [evidence(target.block, quote), evidence(positive.block, positive.quote)],
          note: '同一项目存在通知书收取的肯定与否定叙述，可能属于不同时点；保留两侧出处，须按时点人工复核。' })
      } else {
        Object.assign(field, { status: 'extracted', value: 'false', raw_value: quote, standardized: true,
          provenance: [evidence(target.block, quote)],
          note: '通知书状态仅归属于原句明确点名的项目；未取得不等于未披露。' })
      }
    } else if ((!target && scopedOnly) || (mentions.length === 0 && ['not_disclosed', 'not_mentioned'].includes(field.status))) {
      Object.assign(field, { status: 'not_mentioned', value: null, raw_value: null, standardized: false, provenance: [],
        note: '原文未说明本项目是否取得通知书；其他项目的否定句及备查文件清单不能跨项目推断。' })
    }
    if (before !== JSON.stringify(field)) repairs.push(`[通知书项目归属] ${event.event_id}.formal_award_notice_received → ${field.status}/${field.value}`)
  }
}
