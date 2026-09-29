/**
 * 数值规范化——方轩诚 D1 产物 `src/normalization/index.ts`（feature/fang-rules c856882）的
 * 零依赖移植，逻辑逐行等价（字符串精确十进制，不用浮点）。
 * 她的 10 个换算用例（tests/fixtures/normalization_cases.json）作为本移植的验收测试
 * （scripts/jingguan/test_normalization.mjs）；她的 TS 实现是参照实现，两侧必须同步改。
 *
 * 状态映射（她 → 信封 v0.3）：present→extracted；explicit_zero→extracted(value=0)；
 * not_mentioned/unreadable 同名。qualifier/scope/denominator.kind 为她的口径语义，
 * 信封侧 qualifier 写入 note，scope 由字段名（_this_time/_cumulative）承载。
 */

/** 数值类别。 */
export const KINDS = ['amount', 'shares', 'ratio']
/** 她的状态枚举。 */
export const FANG_STATUSES = ['present', 'not_mentioned', 'explicit_zero', 'unreadable']
const SCOPES = ['single', 'cumulative', 'unknown']
const QUALIFIERS = ['exact', 'approx', 'at_most']
const DENOMINATORS = ['total_share_capital', 'holder_shares', 'net_assets', 'other']

const factors = {
  amount: { '元': 0, '万元': 4, '亿元': 8 },
  shares: { '股': 0, '万股': 4, '亿股': 8 },
  ratio: { '%': 0 },
}
const canonicalUnits = { amount: '元', shares: '股', ratio: '%' }

function shiftDecimal(raw, places) {
  const negative = raw.startsWith('-')
  const [whole, fraction = ''] = (negative ? raw.slice(1) : raw).split('.')
  const point = whole.length + places
  const digits = (whole + fraction).padEnd(point + 1, '0')
  const integer = digits.slice(0, point).replace(/^0+(?=\d)/, '')
  const decimal = digits.slice(point).replace(/0+$/, '')
  const normalized = integer + (decimal ? `.${decimal}` : '')
  return negative && normalized !== '0' ? `-${normalized}` : normalized
}

/** 与她的 normalize(input) 等价：成功返回 NormalizedMeasure，违规抛 Error。 */
export function fangNormalize(input) {
  if (!Object.hasOwn(factors, input.kind) || !FANG_STATUSES.includes(input.status) || !SCOPES.includes(input.scope)) {
    throw new Error('Invalid kind, status or scope')
  }
  const unit = canonicalUnits[input.kind]
  if (input.kind === 'ratio' && (input.status === 'present' || input.status === 'explicit_zero')) {
    if (!input.denominator || !DENOMINATORS.includes(input.denominator.kind) || !input.denominator.definition.trim()) {
      throw new Error('Ratio denominator must be explicit')
    }
  } else if (input.denominator !== null) {
    throw new Error('Denominator only applies to a stated ratio')
  }
  if (input.status === 'not_mentioned' || input.status === 'unreadable') {
    if (input.rawValue !== null || input.sourceUnit !== null || input.qualifier !== null) {
      throw new Error('Missing or unreadable values cannot carry a number')
    }
    return { ...input, value: null, unit }
  }
  if (!input.rawText?.trim() || input.rawValue === null ||
      !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(input.rawValue) ||
      !input.sourceUnit || !Object.hasOwn(factors[input.kind], input.sourceUnit) ||
      !input.qualifier || !QUALIFIERS.includes(input.qualifier)) {
    throw new Error('Invalid stated numeric value, unit or qualifier')
  }
  const places = factors[input.kind][input.sourceUnit]
  if (places === undefined) throw new Error('Unsupported source unit')
  const value = shiftDecimal(input.rawValue, places)
  if (input.kind === 'shares' && value.includes('.')) throw new Error('Shares must be whole shares')
  if (input.status === 'explicit_zero' && (value !== '0' || input.qualifier !== 'exact')) {
    throw new Error('Explicit zero requires an exact stated zero')
  }
  if (input.status === 'present' && value === '0' && input.qualifier === 'exact') {
    throw new Error('Exact stated zero requires explicit_zero status')
  }
  return { ...input, value, unit }
}

// ---------- 信封侧适配：从 FieldValue 构造 MeasureInput ----------

const UNIT_TO_KIND = { shares: 'shares', cny: 'amount', percent: 'ratio' }

/** 信封 denominator → 她的 denominator 结构；无对应（net_assets/other 属她的扩展口径）返回 null。 */
const DENOMINATOR_MAP = {
  total_share_capital: { kind: 'total_share_capital', definition: '本公告时点公司总股本' },
  holder_shares: { kind: 'holder_shares', definition: '本公告时点该股东所持股份' },
  net_assets: { kind: 'net_assets', definition: '报告期末归属于母公司股东的净资产' },
  other: { kind: 'other', definition: '其他分母口径，具体见字段 note' },
}

/** 从 raw_value 文本探测她的 sourceUnit；探测不到返回 null。
 * 裸数字（表格常见，如 "7,800,000"）无万/亿标记时按基础单位处理——
 * 缺 magnitude 标记本身即表明是基础单位，非猜测。 */
function detectSourceUnit(rawText, unit) {
  if (unit === 'percent') return '%' // 比例列裸数字（表格常见）按 % 处理
  if (unit === 'cny') {
    if (rawText.includes('亿元')) return '亿元'
    if (rawText.includes('万元')) return '万元'
    if (rawText.includes('元')) return '元'
    return '元'
  }
  if (rawText.includes('亿股')) return '亿股'
  if (rawText.includes('万股')) return '万股'
  if (rawText.includes('股')) return '股'
  return '股'
}

/** 从 raw_value 文本探测 qualifier 语义。 */
function detectQualifier(rawText) {
  if (/约|大约/.test(rawText)) return 'approx'
  if (/不超过|不高于|不多于|最多/.test(rawText)) return 'at_most'
  return 'exact'
}

/**
 * 对一个数值型 FieldValue 做标准化：成功则原位改写 value/standardized（并在 note 补充
 * qualifier 语义），返回 null；失败（她的规则抛错或依据不足）返回错误消息——调用方
 * 记入 run_meta.errors 并保持 standardized=false，不静默修正。
 */
export function normalizeFieldValue(fieldName, fv) {
  const kind = UNIT_TO_KIND[fv.unit]
  if (kind === undefined || (fv.status !== 'extracted')) return null
  if (typeof fv.raw_value !== 'string' || fv.raw_value.trim().length === 0) {
    return `[标准化] ${fieldName}: status=extracted 但 raw_value 缺失，无法标准化`
  }
  const scope = fieldName.endsWith('_cumulative') ? 'cumulative'
    : fieldName.endsWith('_this_time') ? 'single' : 'unknown'
  const sourceUnit = detectSourceUnit(fv.raw_value, fv.unit)
  if (sourceUnit === null) {
    return `[标准化] ${fieldName}: 无法从原文 "${fv.raw_value}" 探测单位（${fv.unit}）`
  }
  const rawDigits = fv.raw_value.replace(/[,\s，]/g, '').match(/-?\d+(?:\.\d+)?/)
  if (rawDigits === null) {
    return `[标准化] ${fieldName}: 原文 "${fv.raw_value}" 中找不到十进制数值`
  }
  let status = 'present'
  if (rawDigits[0] === '0' || /^0(?:\.0+)?$/.test(rawDigits[0])) status = 'explicit_zero'
  const input = {
    kind,
    rawText: fv.raw_value,
    rawValue: rawDigits[0],
    sourceUnit,
    qualifier: detectQualifier(fv.raw_value),
    scope,
    status,
    denominator: kind === 'ratio' ? (DENOMINATOR_MAP[fv.denominator] ?? null) : null,
  }
  try {
    const result = fangNormalize(input)
    // 精度安全才转数值，否则保留精确十进制字符串（schema 允许两者）
    fv.value = String(Number(result.value)) === result.value ? Number(result.value) : result.value
    fv.standardized = true
    if (result.qualifier === 'approx') {
      fv.note = `${fv.note ?? ''}［约数］`
    } else if (result.qualifier === 'at_most') {
      fv.note = `${fv.note ?? ''}［上限值］`
    }
    return null
  } catch (err) {
    fv.standardized = false
    return `[标准化] ${fieldName}: ${err.message}`
  }
}
