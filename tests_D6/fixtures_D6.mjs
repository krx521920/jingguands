/** 人工构造数据，仅用于边界测试；不代表真实公告。 */
export function fixture() {
  const ref = { block_id: 'synthetic-p1-b1', source_type: 'paragraph', page: 1, region: null, table_id: null, cell_ref: null, quote: '测试原文：人民币100万元，含税。甲公司、乙公司联合体。中标金额分配比例：甲公司60%；乙公司40%。' };
  const field = (raw, value, unit = 'text') => ({ raw_value: raw, value, unit, standardized: true, status: 'extracted', provenance: [{ ...ref }], denominator: null, note: null });
  const missing = unit => ({ raw_value: null, value: null, unit, standardized: false, status: 'not_mentioned', provenance: [], denominator: null, note: null });
  return {
    schema_version: '0.3', run_id: 'synthetic-award-D6', is_mock: true,
    source: { file_id: 'sha256:' + 'a'.repeat(64), file_name: 'synthetic_D6.txt', file_sha256: 'a'.repeat(64), parse_meta: { parser_version: 'synthetic', page_count: 1, blocks: null } },
    events: [{ event_id: 'E01', event_type: 'award_contract', extraction_method: 'mock', notes: null, fields: {
      bidder: field('甲公司、乙公司联合体', '甲公司、乙公司联合体'), tenderer: field('丙公司', '丙公司'), project_name: field('测试项目', '测试项目'),
      bid_amount: field('人民币100万元', '1000000', 'cny'), currency: field('人民币', 'CNY'), tax_included: field('含税', 'true'),
      duration: missing('text'), consortium_members: field('甲公司、乙公司', '甲公司、乙公司'),
      consortium_shares: field('中标金额分配比例：甲公司60%；乙公司40%', '中标金额分配比例：甲公司60%；乙公司40%'),
      bid_date: field('2026年10月2日', '2026-10-02', 'date'), contract_signed: missing('text'), formal_award_notice_received: missing('text'), price_adjustment_status: missing('text'), recognized_revenue: missing('cny'),
    } }],
    run_meta: { entry: 'tool', model: null, started_at: '2026-10-02T00:00:00+08:00', duration_ms: 0, errors: [] },
  };
}
