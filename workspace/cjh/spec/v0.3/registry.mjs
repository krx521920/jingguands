/**
 * 字段注册表——v0.3 契约的 JavaScript 单一真源。
 * runner、共同校验器都从这里读；packages/jingguan/core/src/index.ts 是它的 TS 镜像，
 * 两处修改必须同步（契约变更流程见 interface/README.md 第八节）。
 */

/** 事件类型（v0.2 冻结）。 */
export const EVENT_TYPES = ['pledge', 'equity_change', 'award_contract']

/** 字段值状态（v0.2，6 个）。 */
export const STATUSES = ['extracted', 'not_disclosed', 'not_applicable', 'not_mentioned', 'unreadable', 'needs_review']

/**
 * 字段注册表：unit 为契约枚举；fixedDenominator 表示分母由字段名固定；
 * requiresDenominator 表示分母按原文判定、有值时必填。
 */
export const FIELD_REGISTRY = {
  pledge: {
    direction: { unit: 'text', label: '业务方向（pledge=质押/release=解除质押，v0.4 宗裁决；质押业务默认 pledge）' },
    pledgor: { unit: 'text', label: '质押人' },
    pledgee: { unit: 'text', label: '质权人' },
    pledged_shares_this_time: { unit: 'shares', label: '本次质押股数' },
    pledged_shares_cumulative: { unit: 'shares', label: '累计质押股数' },
    pledged_ratio_this_time_of_held: { unit: 'percent', label: '本次质押占其所持股份比例', fixedDenominator: 'holder_shares' },
    pledged_ratio_this_time_of_total: { unit: 'percent', label: '本次质押占公司总股本比例', fixedDenominator: 'total_share_capital' },
    pledged_ratio_cumulative_of_held: { unit: 'percent', label: '累计质押占其所持股份比例', fixedDenominator: 'holder_shares' },
    pledged_ratio_cumulative_of_total: { unit: 'percent', label: '累计质押占公司总股本比例', fixedDenominator: 'total_share_capital' },
    pledge_amount: { unit: 'cny', label: '质押金额' },
    start_date: { unit: 'date', label: '质押起始日' },
    end_date: { unit: 'date', label: '质押到期日' },
    purpose: { unit: 'text', label: '资金用途' },
    announcement_date: { unit: 'date', label: '公告日期' },
  },
  equity_change: {
    holder: { unit: 'text', label: '变动股东' },
    direction: { unit: 'text', label: '变动方向（必须填英文枚举 increase 或 decrease，禁止中文）' },
    shares_before: { unit: 'shares', label: '变动前持股' },
    shares_after: { unit: 'shares', label: '变动后持股' },
    ratio_before: { unit: 'percent', label: '变动前比例', requiresDenominator: true },
    ratio_after: { unit: 'percent', label: '变动后比例', requiresDenominator: true },
    change_shares: { unit: 'shares', label: '变动股数' },
    method: { unit: 'text', label: '变动方式' },
    change_date: { unit: 'date_range', label: '变动期间（ISO区间 start/end）' },
  },
  award_contract: {
    bidder: { unit: 'text', label: '中标人' },
    tenderer: { unit: 'text', label: '招标人' },
    project_name: { unit: 'text', label: '项目名称' },
    bid_amount: { unit: 'cny', label: '中标金额' },
    currency: { unit: 'text', label: '币种' },
    tax_included: { unit: 'text', label: '是否含税' },
    duration: { unit: 'text', label: '工期' },
    consortium_members: { unit: 'text', label: '联合体成员名单' },
    consortium_shares: { unit: 'text', label: '联合体份额' },
    bid_date: { unit: 'date', label: '中标日期' },
    contract_signed: { unit: 'text', label: '是否已签署合同（true/false/not_disclosed）' },
    formal_award_notice_received: { unit: 'text', label: '是否收到正式中标通知书（true/false/not_disclosed）' },
    price_adjustment_status: { unit: 'text', label: '调价条款（fixed/adjustable/not_disclosed）' },
    recognized_revenue: { unit: 'cny', label: '当期确认收入' },
  },
}

/**
 * 注册表强制检查：字段名必须在对应事件注册表内；unit 必须与注册表一致；
 * 有值字段的 denominator 必须满足 fixed/requires 约定。
 * 返回问题清单（空数组＝合规）。供共同校验器与 runner 共用同一套规则。
 */
export function checkRegistry(envelope) {
  const issues = []
  ;(envelope.events ?? []).forEach((event, i) => {
    const registry = FIELD_REGISTRY[event.event_type]
    if (registry === undefined) return // 事件类型非法由 Schema 层报告
    for (const [name, fv] of Object.entries(event.fields ?? {})) {
      const spec = registry[name]
      const where = `events[${i}].fields.${name}`
      if (spec === undefined) {
        issues.push(`[注册表] ${where} 不在 ${event.event_type} 注册表中`)
        continue
      }
      if (fv.unit !== spec.unit) {
        issues.push(`[注册表] ${where}.unit 应为 "${spec.unit}"，实际 ${JSON.stringify(fv.unit)}`)
      }
      const hasValue = fv.status === 'extracted' || fv.status === 'needs_review'
      if (hasValue && spec.fixedDenominator !== undefined && fv.denominator !== spec.fixedDenominator) {
        issues.push(`[注册表] ${where}.denominator 必须为 "${spec.fixedDenominator}"，实际 ${JSON.stringify(fv.denominator)}`)
      }
      const DENOMS = ['holder_shares', 'total_share_capital', 'net_assets', 'other']
      if (hasValue && spec.requiresDenominator === true && !DENOMS.includes(fv.denominator)) {
        issues.push(`[注册表] ${where} 有值但缺 denominator（${DENOMS.join('/')}）`)
      }
    }
  })
  return issues
}