/**
 * 出处结构语义检查——与字段注册表无关的信封级断言，runner 与共同校验器共用。
 * 宗博文 D2 复核问题 3：region 若翻转（left≥right / top≥bottom）或为负，
 * 下游高亮会直接画错且不报错，故在契约校验层拦截。
 */

/** region 基线断言：[left, top, right, bottom] 必须 left<right、top<bottom、均≥0。 */
export function checkProvenance(envelope) {
  const issues = []
  ;(envelope.events ?? []).forEach((event, i) => {
    for (const [name, fv] of Object.entries(event.fields ?? {})) {
      fv.provenance?.forEach((p, j) => {
        if (p.region === null || p.region === undefined) return
        const [left, top, right, bottom] = p.region
        const where = `events[${i}].fields.${name}.provenance[${j}].region`
        if ([left, top, right, bottom].some((v) => typeof v !== 'number' || Number.isNaN(v))) {
          issues.push(`[语义] ${where}: 含非数值 ${JSON.stringify(p.region)}`)
          return
        }
        if (left < 0 || top < 0) issues.push(`[语义] ${where}: 坐标为负 ${JSON.stringify(p.region)}`)
        if (left >= right) issues.push(`[语义] ${where}: left(${left}) ≥ right(${right})`)
        if (top >= bottom) issues.push(`[语义] ${where}: top(${top}) ≥ bottom(${bottom})`)
      })
    }
  })
  return issues
}

/** 解析块模式的页面越界断言：region 不得超出所在页 width×height（纯文本模式无尺寸，跳过）。 */
export function checkPageBounds(envelope, pageDims) {
  if (pageDims === undefined) return []
  const issues = []
  ;(envelope.events ?? []).forEach((event, i) => {
    for (const [name, fv] of Object.entries(event.fields ?? {})) {
      fv.provenance?.forEach((p, j) => {
        const dims = pageDims.get(p.page)
        if (dims === undefined || p.region === null || p.region === undefined) return
        const [left, top, right, bottom] = p.region
        const where = `events[${i}].fields.${name}.provenance[${j}].region`
        if (right > dims.width + 0.5 || bottom > dims.height + 0.5 || left < -0.5 || top < -0.5) {
          issues.push(`[语义] ${where}: 越出第${p.page}页边界 ${JSON.stringify(p.region)}（页 ${dims.width}×${dims.height}）`)
        }
      })
    }
  })
  return issues
}

/** Gold 字段支撑性：quote 命中原文、值以原文形态出现、ISO 日期对应中文日期、
 * 或属于标准化形态（币种/布尔/英文枚举/纯数值——原文通常以其中文/万进制形态出现），
 * 四者其一即视为可支撑。仅剔除"值本身在原文无据"的项。 */
export function goldFieldSupported(fv, text) {
  if (typeof text !== 'string' || text.length === 0) return true // 无原文时不判，保守放行
  const quote = fv.provenance?.[0]?.quote ?? ''
  if (quote.length > 0 && text.includes(quote)) return true
  if (fv.value !== null && text.includes(String(fv.value))) return true
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fv.value))
  if (iso !== null && text.includes(`${Number(iso[1])}年${Number(iso[2])}月${Number(iso[3])}日`)) return true
  if (/^(CNY|true|false|increase|decrease)$/.test(String(fv.value))) return true
  if (typeof fv.value === 'number') return true // 数值标准化（万进制/去千分位）后的形态
  return false
}

/** 股权变动方向一致性断言（D5 完成标准："前后方向不得默默反转"）：
 * shares_before > shares_after → direction 必须 decrease；
 * shares_before < shares_after → direction 必须 increase；
 * 变动股数 change_shares 的正负号不参与判定（模型可能输出绝对值）。
 * 比例对（ratio_before/after）不用于判定（分母可能变）。
 */
export function checkEquityDirection(envelope) {
  const issues = []
  ;(envelope.events ?? []).forEach((event, i) => {
    if (event.event_type !== 'equity_change') return
    const f = event.fields ?? {}
    const before = f.shares_before
    const after = f.shares_after
    const direction = f.direction
    const where = `events[${i}]`
    if (before?.status !== 'extracted' || after?.status !== 'extracted') return
    if (direction?.status !== 'extracted') return
    const b = Number(before.value)
    const a = Number(after.value)
    const d = String(direction.value)
    if (!Number.isFinite(b) || !Number.isFinite(a)) return
    if (b > a && d !== 'decrease') {
      issues.push(`[语义] ${where}: 持股从 ${b} 降至 ${a} 但 direction="${d}"——前后方向反转（应为 decrease）`)
    }
    if (b < a && d !== 'increase') {
      issues.push(`[语义] ${where}: 持股从 ${b} 升至 ${a} 但 direction="${d}"——前后方向反转（应为 increase）`)
    }
  })
  return issues
}
