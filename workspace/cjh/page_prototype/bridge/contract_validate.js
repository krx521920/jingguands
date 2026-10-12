// contract_validate.js —— v0.3 契约的零依赖机器校验器（单一真源）
//
// ★ 为什么不用 ajv：本项目不装依赖（package.json 无 install 步骤），
//   且契约只有 99 行、枚举有限 —— 手写校验器反而能给出**人话错误信息**，
//   而ajv 的报错对"哪个队友的哪个字段错了"这件事是不可读的。
//
// 校验分两层（与魏的 registry.mjs 同构）：
//   L1 JSON Schema 层：顶层必填 / additionalProperties / 枚举 / 类型 / event_id pattern
//   L2 注册表层：字段名在注册表内？unit 与注册表一致？denominator 是否满足 fixed/requires？
//
// 返回 { ok, errors[], warnings[] }；error = 契约违规，warn = 可降级但必须上报。
"use strict";

const fs = require("fs");
const path = require("path");

const SPEC_DIR = path.join(__dirname, "..", "..", "spec", "v0.3");
const SCHEMA_PATH = path.join(SPEC_DIR, "event-envelope.schema.json");
const REGISTRY_PATH = path.join(SPEC_DIR, "registry.mjs");

const SCHEMA = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8"));

// registry.mjs 是 ESM，require 不了；这里只取两个纯数据导出，用正则解析并**自校验**
// （解析不出就报错，绝不静默返回空注册表 ——空注册表会让所有字段"合规"，与 D10 同款漏洞）。
const REGISTRY = loadRegistry();

function loadRegistry() {
  const src = fs.readFileSync(REGISTRY_PATH, "utf8");
  const grab = (name) => {
    const re = new RegExp("export\\s+const\\s+" + name + "\\s*=\\s*(\\[[\\s\\S]*?\\])");
    const m = src.match(re);
    if (!m) throw new Error(`registry.mjs 解析失败：找不到 export const ${name}（拒绝用空注册表校验）`);
    return JSON.parse(m[1].replace(/'/g, '"'));
  };
  // FIELD_REGISTRY 是嵌套对象字面量，转成 JSON 需���引号化（源码是 JS 字符串键）
  const fm = src.match(/export\s+const\s+FIELD_REGISTRY\s*=\s*(\{[\s\S]*?\n\})/);
  if (!fm) throw new Error("registry.mjs 解析失败：找不到 FIELD_REGISTRY");
  const FIELD_REGISTRY = (new Function("return " + fm[1].replace(/'/g, '"')))();
  return {
    EVENT_TYPES: grab("EVENT_TYPES"),
    STATUSES: grab("STATUSES"),
    FIELD_REGISTRY,
  };
}

// ─────────────────────────────────────────────────────────────
// L1 JSON Schema 层
// ─────────────────────────────────────────────────────────────
function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (Number.isInteger(v)) return "integer";
  return typeof v;                     // number/string/boolean/object
}

function typeMatches(v, spec) {
  const ts = Array.isArray(spec) ? spec : [spec];
  const actual = typeOf(v);
  if (!ts.includes(actual) && !(ts.includes("number") && actual === "integer")) return false;
  if (spec === "integer" && actual === "integer") return true;
  return true;
}

function validateAgainst(node, value, ptr, errors) {
  if (node.$ref) {
    const key = node.$ref.replace("#/$defs/", "");
    return validateAgainst(SCHEMA.$defs[key], value, ptr, errors);
  }
  // 枚举
  if (node.enum !== undefined) {
    const ok = node.enum.some((e) => e === value || (e === null && value === null));
    if (!ok) errors.push(`${ptr}: 值 ${JSON.stringify(value)} 不在枚举 [${node.enum.map((x) => JSON.stringify(x)).join(", ")}]`);
    return;
  }
  if (node.const !== undefined && value !== node.const) {
    errors.push(`${ptr}: 应恒为 ${JSON.stringify(node.const)}，实际 ${JSON.stringify(value)}`);
    return;
  }
  if (node.type !== undefined && !typeMatches(value, node.type)) {
    errors.push(`${ptr}: 类型应为 ${JSON.stringify(node.type)}，实际 ${typeOf(value)}`);
    return;
  }
  if (node.type === "object" || (node.type === undefined && typeOf(value) === "object")) {
    if (typeOf(value) !== "object") return;
    for (const r of node.required || []) {
      if (!(r in value)) errors.push(`${ptr}: 缺必填字段 "${r}"`);
    }
    if (node.additionalProperties === false && node.properties) {
      for (const k of Object.keys(value)) {
        if (!(k in node.properties)) errors.push(`${ptr}.${k}: 契约 additionalProperties=false，此字段不允许出现在契约对象里`);
      }
    }
    for (const [k, sub] of Object.entries(node.properties || {})) {
      if (k in value && value[k] !== undefined) validateAgainst(sub, value[k], `${ptr}.${k}`, errors);
    }
    return;
  }
  if (node.type === "array") {
    if (!Array.isArray(value)) return;
    if (node.minItems !== undefined && value.length < node.minItems) errors.push(`${ptr}: 至少 ${node.minItems} 项，实际 ${value.length}`);
    if (node.maxItems !== undefined && value.length > node.maxItems) errors.push(`${ptr}: 至多 ${node.maxItems} 项，实际 ${value.length}`);
    if (node.items) value.forEach((v, i) => validateAgainst(node.items, v, `${ptr}[${i}]`, errors));
  }
  if (node.minLength !== undefined && typeof value === "string" && value.length < node.minLength) {
    errors.push(`${ptr}: 字符串长度应≥ ${node.minLength}，实际 ${value.length}`);
  }
  if (node.minimum !== undefined && typeof value === "number" && value < node.minimum) {
    errors.push(`${ptr}: 应≥ ${node.minimum}，实际 ${value}`);
  }
  if (node.pattern && typeof value === "string" && !new RegExp(node.pattern).test(value)) {
    errors.push(`${ptr}: "${value}" 不匹配 pattern ${node.pattern}`);
  }
}

/** L1：信封对 schema 的符合性 */
function validateSchema(envelope) {
  const errors = [];
  validateAgainst(SCHEMA, envelope, "envelope", errors);
  return errors;
}

// ─────────────────────────────────────────────────────────────
// L2 注册表层（对齐魏 registry.mjs 的 checkRegistry）
// ─────────────────────────────────────────────────────────────
const DENOMS = ["holder_shares", "total_share_capital", "net_assets", "other"];
// 语义上"不该有值"的契约状态（计划书 §四.4 错误填充率的判定依据）
const NO_VALUE_STATUS = new Set(["not_mentioned", "not_disclosed", "not_applicable"]);

function validateRegistry(envelope) {
  const errors = [];
  const warnings = [];
  (envelope.events || []).forEach((event, i) => {
    const reg = REGISTRY.FIELD_REGISTRY[event.event_type];
    if (reg === undefined) return;                       // 事件类型非法由 L1 报
    for (const [name, fv] of Object.entries(event.fields || {})) {
      const spec = reg[name];
      const where = `events[${i}].fields.${name}`;
      if (spec === undefined) {
        errors.push(`${where}: 不在 ${event.event_type} 注册表中`);
        continue;
      }
      if (fv.unit !== spec.unit) {
        errors.push(`${where}.unit 应为 "${spec.unit}"，实际 ${JSON.stringify(fv.unit)}`);
      }
      const hasValue = fv.status === "extracted" || fv.status === "needs_review";
      if (hasValue && spec.fixedDenominator !== undefined && fv.denominator !== spec.fixedDenominator) {
        errors.push(`${where}.denominator 必须为 "${spec.fixedDenominator}"，实际 ${JSON.stringify(fv.denominator)}`);
      }
      if (hasValue && spec.requiresDenominator === true && !DENOMS.includes(fv.denominator)) {
        errors.push(`${where}: 有值但缺 denominator（${DENOMS.join("/")}）`);
      }
      // ── 计划书 §四.2「出处随数据生成、不事后回原文搜索」的机械化守卫 ──
      if (hasValue) {
        const provs = fv.provenance || [];
        if (!provs.length) {
          errors.push(`${where}: 有值但 provenance 为空（计划书 §四.2 要求出处随数据生成，缺出处＝不可核验）`);
        }
        for (const [k, p] of provs.entries()) {
          if (!p.quote || !String(p.quote).trim()) {
            errors.push(`${where}.provenance[${k}].quote 为空（契约要求 minLength≥1，且禁止事后按数字反搜）`);
          }
          if (typeof p.page !== "number") {
            errors.push(`${where}.provenance[${k}].page 必须是整数（计划书四级出处：文件/页码/页面区域/表格行列）`);
          }
          if (p.source_type === "cell" && (!p.table_id || !p.cell_ref)) {
            errors.push(`${where}.provenance[${k}]: source_type=cell 必带 table_id + cell_ref（表格出处定位到单元格）`);
          }
        }
      }
      // ── 计划书 §四.4 错误填充率的机械化线索 ──
      // 语义上"不该有值"的状态却带着取值 = 原文没有却给出了一个值（幻觉）。
      // 这里只报 error 级**结构性**线索；数值合理性（如 quote 是否含 value）不校验，
      // 因为不同事件类型口径不同，猜错就是制造假警报（_secret_guard 的教训）。
      if (NO_VALUE_STATUS.has(fv.status) && fv.value !== null && fv.value !== undefined && fv.value !== "") {
        errors.push(`${where}: status=${fv.status} 语义上不应有值，实际带value=${JSON.stringify(fv.value)}（计划书 §四.4 错误填充）`);
      }
    }
  });
  return { errors, warnings };
}

/** 一次性跑完两层。envelope 必须是契约信封本体。 */
function validate(envelope, opts = {}) {
  const schemaErrors = validateSchema(envelope);
  const reg = REGISTRY.EVENT_TYPES.includes(envelope && envelope.event_type) ||
    (envelope.events || []).some((e) => REGISTRY.EVENT_TYPES.includes(e.event_type))
    ? validateRegistry(envelope) : { errors: [], warnings: [] };
  const errors = [...schemaErrors, ...reg.errors];
  return {
    ok: errors.length === 0,
    errors: errors.slice(0, opts.max || 50),
    error_count: errors.length,
    warnings: reg.warnings.slice(0, 10),
    // ★ 带上实测schema_version 与是否属"旧版数据"：D1 骨架期的 v0.1/v0.2 数据
    //   本来就不合 v0.3 契约，混进"违规"会淹没真正的新错误。
    schema_version: envelope && envelope.schema_version !== undefined ? envelope.schema_version : null,
    is_stale_version: !!envelope && envelope.schema_version !== undefined && envelope.schema_version !== "0.3",
    layers: { schema: schemaErrors.length, registry: reg.errors.length },
  };
}

module.exports = {
  SCHEMA, REGISTRY, SCHEMA_PATH, REGISTRY_PATH, NO_VALUE_STATUS,
  validate, validateSchema, validateRegistry,
  registry_status: () => ({
    event_types: REGISTRY.EVENT_TYPES,
    statuses: REGISTRY.STATUSES,
    field_count: Object.values(REGISTRY.FIELD_REGISTRY).reduce((n, r) => n + Object.keys(r).length, 0),
    source: "spec/v0.3/registry.mjs（直接解析，不手抄）",
  }),
};