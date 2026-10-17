/** Content-bound exceptions for the published FinStruct protocol and team delivery records. */
import { createHash } from 'node:crypto'
import ts from 'typescript'

/** Reviewed file digests, grouped by the single rule they may exempt. */
export interface FinStructExceptions {
  /** Published protocol identifiers and captured protocol data. */
  protocol: Record<string, string>
  /** Captured version identifiers in audit evidence. */
  records: Record<string, string>
  /** Original-language team documents outside the public bilingual guide. */
  teamDocuments: Record<string, string>
}

const kinds = ['protocol', 'records', 'teamDocuments'] as const
const ownedRoots = ['corpus/', 'evaluation/', 'interface/', 'runs/', 'scripts/jingguan/',
  'packages/jingguan/', 'workspace/cjh/', 'workspace/zhangzhibo/', 'tools/fang-', 'tools/zhang-', '.github/tdd/wei-']
// Dated delivery pages and the existing team's design/implementation notes only.
const ownedDoc = new RegExp('^docs/(?:' + [
  String.raw`[GKSTV]\d[^/]*|ce37[^/]*|d\d[^/]*|draft-README`,
  'acceptance/[^/]+|adjudication/[^/]+|chen-ui-acceptance/[^/]+|chen-ui-smoke-acceptance',
  'envelope-three-keys|n09-extract-service|product-naming-proposal|release-d14|reviews/[^/]+',
  String.raw`unified-rules-entry|全面验收-[^/]+|契约v0\.3签字-[^/]+`,
].join('|') + String.raw`)\.md$`, 'u')

function digest(source: string): string {
  return createHash('sha256').update(source.replaceAll('\r\n', '\n')).digest('hex')
}

function isOwned(file: string): boolean {
  return ownedRoots.some(prefix => file.startsWith(prefix)) || ownedDoc.test(file)
    || file === 'docs/chen-ui-acceptance/conflict-synthetic-envelope.json'
}

/**
 * Validate the exception inventory without accepting wildcards or unowned paths.
 * @param source - JSON inventory with exact repository-relative paths and SHA256 digests.
 * @returns The validated inventory; malformed entries throw before scanning.
 */
export function parseFinStructExceptions(source: string): FinStructExceptions {
  const parsed: unknown = JSON.parse(source)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('Invalid FinStruct exception inventory')
  const record = parsed as Record<string, unknown>
  if (Object.keys(record).length !== kinds.length || Object.keys(record).some(key => !kinds.some(kind => kind === key))) {
    throw new Error('FinStruct exceptions require exactly protocol, records and teamDocuments')
  }
  const result: FinStructExceptions = { protocol: {}, records: {}, teamDocuments: {} }
  for (const kind of kinds) {
    const entries = record[kind]
    if (typeof entries !== 'object' || entries === null || Array.isArray(entries)) throw new Error(`Invalid ${kind} entries`)
    for (const [file, hash] of Object.entries(entries)) {
      if (!file || file.startsWith('/') || /[\\*?]/u.test(file) || file.split('/').some(part => ['', '.', '..'].includes(part))
        || !isOwned(file)
        || (kind === 'teamDocuments' && !file.endsWith('.md'))
        || typeof hash !== 'string' || !/^[a-f0-9]{64}$/u.test(hash)) throw new Error(`Invalid ${kind} exception: ${file}`)
      result[kind][file] = hash
    }
  }
  return result
}

/**
 * Match one exact reviewed file, treating Git's CRLF conversion as equivalent.
 * @param file - Repository-relative path with forward slashes.
 * @param source - Current file contents.
 * @param kind - The specific policy exception requested.
 * @param inventory - Reviewed inventory, injectable for isolated tests.
 * @returns Whether both path and content match the review record.
 */
export function matchesFinStructException(
  file: string, source: string, kind: keyof FinStructExceptions, inventory: FinStructExceptions,
): boolean {
  return Object.hasOwn(inventory[kind], file) && inventory[kind][file] === digest(source)
}

/**
 * Reject removed or edited inventory entries before any exemptions are applied.
 * @param inventory - Reviewed exception inventory.
 * @param read - Reader for the selected working-tree or staged content plane.
 * @returns Diagnostics for missing or changed files; no automatic re-sealing occurs.
 */
export function validateFinStructExceptions(inventory: FinStructExceptions, read: (file: string) => string | undefined): string[] {
  const errors: string[] = []
  for (const kind of kinds) {
    for (const [file, hash] of Object.entries(inventory[kind])) {
      const source = read(file)
      if (source === undefined || digest(source) !== hash) errors.push(`${file}: ${kind} review digest changed; remove the exception or review its new contents`)
    }
  }
  return errors
}

/**
 * Require reviewed team documents and translation exclusions to name the same exact files.
 * @param excluded - Translation manifest exclusions, including unrelated upstream entries.
 * @param inventory - Reviewed FinStruct exception inventory.
 * @returns Diagnostics for missing seals or exclusions; directory entries cannot replace exact paths.
 */
export function finStructDocumentExclusionErrors(excluded: readonly string[], inventory: FinStructExceptions): string[] {
  return [
    ...Object.keys(inventory.teamDocuments).filter(file => !excluded.includes(file))
      .map(file => `${file}: reviewed team document needs an exact translation exclusion`),
    ...excluded.filter(file => isOwned(file) && !Object.hasOwn(inventory.teamDocuments, file))
      .map(file => `${file}: FinStruct translation exclusion needs a reviewed content digest`),
  ]
}

/**
 * Locate the version string in a local v0.3 event envelope using its JSON AST.
 * @param file - Repository-relative runtime JSON path.
 * @param source - JSON text; malformed or other document types receive no exception.
 * @returns Offset ranges for run_meta.code_version values, never surrounding prose or URLs.
 */
export function runtimeCodeVersionRanges(file: string, source: string): Array<readonly [number, number]> {
  if (!/^workspace\/cjh\/page_prototype\/data\/[^/]+\.json$/u.test(file)) return []
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch (error) {
    // Invalid JSON is not runtime evidence; the reference scanner still checks every byte.
    if (error instanceof SyntaxError) return []
    throw error
  }
  if (typeof value !== 'object' || value === null || !('schema_version' in value) || value.schema_version !== '0.3') return []
  const tree = ts.parseJsonText(file, source)
  const ranges: Array<readonly [number, number]> = []
  const object = tree.statements[0]?.expression
  if (!object || !ts.isObjectLiteralExpression(object)) return []
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.name) || property.name.text !== 'run_meta'
      || !ts.isObjectLiteralExpression(property.initializer)) continue
    for (const field of property.initializer.properties) {
      if (ts.isPropertyAssignment(field) && ts.isStringLiteral(field.name) && field.name.text === 'code_version'
        && ts.isStringLiteral(field.initializer) && /^[a-f0-9]{7,40}$/iu.test(field.initializer.text)) {
        ranges.push([field.initializer.getStart(tree), field.initializer.end])
      }
    }
  }
  return ranges
}
