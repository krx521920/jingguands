#!/usr/bin/env node
/**
 * 出处断言单元测试（D3 审计）：checkPageBounds 越界拦截＋checkProvenance 翻转坐标拦截。
 * 用法：node scripts/jingguan/test_checks.mjs
 */
import { checkPageBounds, checkProvenance, checkEquityDirection } from './lib/checks.mjs'

let failed = 0
const assert = (cond, msg) => { if (cond) console.log(`✓ ${msg}`); else { failed++; console.log(`✗ ${msg}`) } }

// checkPageBounds：页1 尺寸 100×100
const env = {
  events: [{
    fields: {
      f1: {
        status: 'extracted',
        provenance: [
          { page: 1, region: [10, 10, 500, 20], quote: 'x' }, // 越界：right 500 > 100
          { page: 2, region: [10, 10, 50, 20], quote: 'y' },  // 页2无尺寸→跳过
          { page: 1, region: [10, 10, 90, 20], quote: 'z' },  // 界内→通过
          { page: 1, region: null, quote: 'w' },               // 无region→跳过
        ],
      },
    },
  }],
}
const dims = new Map([[1, { width: 100, height: 100 }]])
const bounds = checkPageBounds(env, dims)
assert(bounds.length === 1 && bounds[0].includes('越出第1页边界'), `checkPageBounds 越界恰好报1处（实际 ${bounds.length}：${bounds.join(';')}）`)
assert(checkPageBounds(env) .length === 0 && checkPageBounds(env, undefined).length === 0, 'checkPageBounds 无尺寸时安全跳过')

// checkProvenance：翻转坐标与负值
const env2 = {
  events: [{
    fields: {
      f: { status: 'extracted', provenance: [{ page: 1, region: [50, 20, 30, 40], quote: 'x' }] }, // left>right
      g: { status: 'extracted', provenance: [{ page: 1, region: [10, 40, 30, 20], quote: 'x' }] }, // top>bottom
      h: { status: 'extracted', provenance: [{ page: 1, region: [-1, 10, 30, 40], quote: 'x' }] }, // 负值
      ok: { status: 'extracted', provenance: [{ page: 1, region: [10, 10, 30, 40], quote: 'x' }] },
    },
  }],
}
const prov = checkProvenance(env2)
assert(prov.length === 3, `checkProvenance 翻转/负值恰好报3处（实际 ${prov.length}）`)
assert(prov.some(i => i.includes('left(50) ≥ right(30)')) && prov.some(i => i.includes('top(40) ≥ bottom(20)')) && prov.some(i => i.includes('坐标为负')), 'checkProvenance 三类断言文案齐全')

// checkEquityDirection：方向一致性（D5 完成标准"前后方向不得默默反转"）
const eqEnv = {
  events: [
    { event_type: 'equity_change', fields: {
        shares_before: { status: 'extracted', value: 1000 },
        shares_after: { status: 'extracted', value: 500 },
        direction: { status: 'extracted', value: 'increase' },
    }},
    { event_type: 'equity_change', fields: {
        shares_before: { status: 'extracted', value: 500 },
        shares_after: { status: 'extracted', value: 1000 },
        direction: { status: 'extracted', value: 'increase' },
    }},
    { event_type: 'equity_change', fields: {
        shares_before: { status: 'extracted', value: 1000 },
        shares_after: { status: 'extracted', value: 800 },
        direction: { status: 'extracted', value: 'decrease' },
    }},
    { event_type: 'equity_change', fields: {
        shares_before: { status: 'not_mentioned', value: null },
        shares_after: { status: 'extracted', value: 800 },
        direction: { status: 'extracted', value: 'increase' },
    }},
    { event_type: 'pledge', fields: {
        direction: { status: 'extracted', value: 'release' },
    }},
  ],
}
const dir = checkEquityDirection(eqEnv)
assert(dir.length === 1, `checkEquityDirection 恰好报1处（实际 ${dir.length}：${dir.join(';')}）`)
assert(dir[0].includes('方向反转') && dir[0].includes('increase'), `方向反转文案含关键字（实际：${dir[0]}）`)

console.log(failed === 0 ? '全部通过：出处断言＋方向一致性单元测试' : `失败：${failed}`)
process.exit(failed === 0 ? 0 : 1)
