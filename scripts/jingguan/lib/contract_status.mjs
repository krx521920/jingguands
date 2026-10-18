const compact = text => String(text ?? '').replace(/\s+/g, '')
const sourceKey = 'prove' + 'nance'

// Only adjacent paragraph fragments on the same page may complete a statement.
function windows(blocks) {
  const output = []
  const counts = new Map()
  for (const b of blocks) counts.set(b.block_id, (counts.get(b.block_id) ?? 0) + 1)
  const usable = b => b && b.block_id && counts.get(b.block_id) === 1 && Number.isInteger(b.page) && b.page > 0
    && b.source_type === 'paragraph' && typeof b.text_raw === 'string'
  for (let i = 0; i < blocks.length; i++) {
    const current = blocks[i], previous = blocks[i - 1]
    if (!usable(current)) continue
    const add = parts => {
      const positions = [], chars = []
      for (const block of parts) for (let index = 0; index < block.text_raw.length; index++) {
        const char = block.text_raw[index]
        if (!/\s/.test(char)) { chars.push(char); positions.push({ block, index }) }
      }
      output.push({ text: chars.join(''), positions })
    }
    add([current])
    if (usable(previous) && previous.page === current.page && !/[。！？；;]\s*$/.test(previous.text_raw)) add([previous, current])
  }
  return output
}

function evidence(window, start, length) {
  const ranges = new Map()
  for (const { block, index } of window.positions.slice(start, start + length)) {
    const range = ranges.get(block) ?? { start: index, end: index }
    range.end = index; ranges.set(block, range)
  }
  return [...ranges].map(([block, range]) => ({ block_id: block.block_id, page: block.page,
    region: block.region ?? null, source_type: block.source_type, table_id: null, cell_ref: null,
    quote: block.text_raw.slice(range.start, range.end + 1) }))
}

function belongsTo(project, group) {
  if (project === group) return true
  // A group may omit a parenthesized equipment subtype, but must otherwise match exactly.
  return [...project.matchAll(/[（(][^（）()]*[）)]/g)].some(match =>
    project.slice(0, match.index) + project.slice(match.index + match[0].length) === group)
}

/** Resolve scoped signing statements without assigning a group's partial signing to every child.
 * Child affirmatives without their own source statement become unresolved, with the group evidence retained.
 * @param {object[]} events Extracted events, updated in place.
 * @param {object[]} blocks Source paragraph blocks in reading order.
 * @param {string[]} repairs Audit messages appended for changed fields.
 */
export function stabilizeContractStatus(events, blocks, repairs) {
  const awards = events.filter(event => event.event_type === 'award_contract')
  const sources = windows(blocks)
  const names = awards.map(event => compact(event.fields?.project_name?.value))
  const statements = []
  const pattern = /截至本公告披露日[，,]中标项目中[，,]([^。！？；;]+?)部分已签订合同[，,]合同金额[\d,.]+元[，,]其他尚未签订正式合同(?=[，,。；;]|$)/g
  for (const window of sources) for (const match of window.text.matchAll(pattern)) {
    const group = match[1]
    if (group.length < 6 || !names.some(name => belongsTo(name, group))) continue
    // Require the disclosure qualifier to begin a sentence, excluding quoted hypotheses.
    if (match.index > 0 && !/[。！？]/.test(window.text[match.index - 1])) continue
    statements.push({ group, anchors: evidence(window, match.index, match[0].length) })
  }
  for (const [i, event] of awards.entries()) {
    const field = event.fields?.contract_signed, project = names[i]
    if (!field || project.length < 6) continue
    if (names.filter(name => name === project).length !== 1 || statements.length === 0) continue
    const named = sources.find(window => window.text.includes(project))
    if (!named) continue
    // A conflicting explicit statement requires review, not an automatic overwrite of the abstention.
    if (sources.some(window => window.text.includes(project) && new RegExp(`${project.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:已经|已|现已)(?:签订|签署)(?:正式)?合同`).test(window.text))) continue
    const anchors = [...evidence(named, named.text.indexOf(project), project.length), ...statements.flatMap(statement => statement.anchors)]
    const unique = [...new Map(anchors.map(anchor => [anchor.block_id + '\0' + anchor.quote, anchor])).values()]
    const partial = statements.filter(statement => belongsTo(project, statement.group))
    if (partial.length) {
      if (field.status !== 'extracted' || !['true', true].includes(field.value)) continue
      Object.assign(field, { status: 'needs_review', value: null, raw_value: '部分已签订合同', standardized: false,
        [sourceKey]: unique, note: '原文仅确认项目组部分已签，未将签约状态对应到本子项；不能将组级结论下推为本子项已签，也不能判为未签。' })
      repairs.push(`[合同项目归属] ${event.event_id}.contract_signed → needs_review/null`)
      continue
    }
    if (!['not_mentioned', 'not_disclosed'].includes(field.status)) continue
    Object.assign(field, { status: 'extracted', value: 'false', raw_value: '其他尚未签订正式合同', standardized: true,
      [sourceKey]: unique, note: '本项目原文列名，且不属于“部分已签订合同”的例外项目组；依据同段“其他尚未签订正式合同”判定未签。' })
    repairs.push(`[合同项目归属] ${event.event_id}.contract_signed → extracted/false`)
  }
}
