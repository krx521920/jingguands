/**
 * JSON Schema 子集校验器（零依赖）——全队共同契约校验的核心。
 * 支持：$ref（本地 #/$defs/…）、type（含类型数组）、enum、const、required、
 * properties、additionalProperties（false 或 schema）、items、minItems/maxItems、
 * minLength、pattern、minimum。足够覆盖 event-envelope.schema.json 的全部约束。
 * 各模块提交前必须通过：node scripts/jingguan/validate_envelope.mjs <文件…>
 */

/** 校验 instance 是否符合 schema，返回问题清单（空数组＝合规）。 */
export function validateAgainstSchema(instance, schema, root = schema, path = '$') {
  const issues = []
  if (schema === false) {
    issues.push(`${path}: 不允许出现（additionalProperties:false）`)
    return issues
  }
  if (schema === true || schema === undefined) return issues
  if (schema.$ref !== undefined) {
    const target = resolveRef(schema.$ref, root)
    if (target === undefined) {
      issues.push(`${path}: schema 引用无法解析 ${schema.$ref}`)
      return issues
    }
    return validateAgainstSchema(instance, target, root, path)
  }
  if (schema.allOf !== undefined) {
    for (const sub of schema.allOf) issues.push(...validateAgainstSchema(instance, sub, root, path))
  }
  if (schema.anyOf !== undefined) {
    const ok = schema.anyOf.some((sub) => validateAgainstSchema(instance, sub, root, path).length === 0)
    if (!ok) issues.push(`${path}: 不满足 anyOf 的任何分支`)
  }
  if (schema.const !== undefined && !deepEqual(instance, schema.const)) {
    issues.push(`${path}: 必须恒等于 ${JSON.stringify(schema.const)}，实际 ${JSON.stringify(instance)}`)
  }
  if (schema.enum !== undefined && !schema.enum.some((v) => deepEqual(instance, v))) {
    issues.push(`${path}: 必须是 ${JSON.stringify(schema.enum)} 之一，实际 ${JSON.stringify(instance)}`)
  }
  const type = schema.type
  if (type !== undefined && !matchesType(instance, Array.isArray(type) ? type : [type])) {
    issues.push(`${path}: 类型应为 ${Array.isArray(type) ? type.join('|') : type}，实际 ${jsonTypeOf(instance)}`)
  }
  if (instance !== null && instance !== undefined && typeof instance === 'object' && !Array.isArray(instance)) {
    for (const key of schema.required ?? []) {
      if (!(key in instance)) issues.push(`${path}.${key}: 缺少必填字段`)
    }
    const props = schema.properties ?? {}
    for (const [key, value] of Object.entries(instance)) {
      if (key in props) {
        issues.push(...validateAgainstSchema(value, props[key], root, `${path}.${key}`))
      } else if (schema.additionalProperties === false) {
        issues.push(`${path}.${key}: 不在允许的字段列表中`)
      } else if (schema.additionalProperties !== undefined && schema.additionalProperties !== true) {
        issues.push(...validateAgainstSchema(value, schema.additionalProperties, root, `${path}.${key}`))
      }
    }
  }
  if (Array.isArray(instance)) {
    if (schema.minItems !== undefined && instance.length < schema.minItems) {
      issues.push(`${path}: 数组长度 ${instance.length} < minItems ${schema.minItems}`)
    }
    if (schema.maxItems !== undefined && instance.length > schema.maxItems) {
      issues.push(`${path}: 数组长度 ${instance.length} > maxItems ${schema.maxItems}`)
    }
    if (schema.items !== undefined) {
      instance.forEach((item, i) => issues.push(...validateAgainstSchema(item, schema.items, root, `${path}[${i}]`)))
    }
  }
  if (typeof instance === 'string') {
    if (schema.minLength !== undefined && instance.length < schema.minLength) {
      issues.push(`${path}: 字符串长度 ${instance.length} < minLength ${schema.minLength}`)
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(instance)) {
      issues.push(`${path}: 不匹配模式 ${schema.pattern}`)
    }
  }
  if (typeof instance === 'number') {
    if (schema.minimum !== undefined && instance < schema.minimum) issues.push(`${path}: ${instance} < minimum ${schema.minimum}`)
  }
  return issues
}

function resolveRef(ref, root) {
  if (!ref.startsWith('#')) return undefined
  let node = root
  for (const part of ref.slice(1).split('/').filter(Boolean)) {
    node = node?.[decodeURIComponent(part.replace(/~1/g, '/').replace(/~0/g, '~'))]
  }
  return node
}

function jsonTypeOf(v) {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  if (typeof v === 'number' && !Number.isInteger(v)) return 'number'
  if (typeof v === 'number') return 'integer'
  return typeof v
}

function matchesType(v, types) {
  const actual = jsonTypeOf(v)
  return types.some((t) => t === actual
    || (t === 'number' && actual === 'integer')
    || (t === 'object' && actual === 'object'))
}

function deepEqual(a, b) {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  const ka = Object.keys(a), kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) => deepEqual(a[k], b[k]))
}
