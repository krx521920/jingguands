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
