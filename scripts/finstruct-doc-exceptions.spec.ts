import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { matchesFinStructException, parseFinStructExceptions, validateFinStructExceptions, runtimeCodeVersionRanges, finStructDocumentExclusionErrors } from './finstruct-doc-exceptions.ts'
import { findConcreteTermViolations } from './verify-concrete-terms.ts'
import { findRepositoryReferences } from './verify-repository-references.ts'
import { readGitIndexBlob } from './translation-pairing-git.ts'

const digest = (text: string) => createHash('sha256').update(text.replaceAll('\r\n', '\n')).digest('hex')
const file = 'interface/event-envelope.schema.json'
const body = '{"version":"0.3"}\n'
const manifest = { protocol: { [file]: digest(body) }, records: {}, teamDocuments: {} }

describe('reviewed FinStruct documentation exceptions', () => {
  it('validates staged review contents independently of dirty working-tree files', (test) => {
    const root = mkdtempSync(join(tmpdir(), 'finstruct-staged-docs-'))
    test.onTestFinished(() => { rmSync(root, { recursive: true, force: true }) })
    execFileSync('git', ['init', '--quiet', root])
    mkdirSync(join(root, 'interface'))
    mkdirSync(join(root, 'scripts'))
    const path = 'interface/README.md'
    const inventoryPath = 'scripts/finstruct-doc-exceptions.json'
    const policy = { protocol: {}, records: {}, teamDocuments: { [path]: digest(body) } }
    writeFileSync(join(root, path), body)
    writeFileSync(join(root, inventoryPath), JSON.stringify(policy))
    execFileSync('git', ['-C', root, 'add', path, inventoryPath])
    writeFileSync(join(root, path), 'unstaged changes')
    writeFileSync(join(root, inventoryPath), 'invalid unstaged JSON')
    const staged = parseFinStructExceptions(readGitIndexBlob(root, inventoryPath)!.toString('utf8'))
    expect(validateFinStructExceptions(staged, file => readGitIndexBlob(root, file)?.toString('utf8'))).toEqual([])
    expect(validateFinStructExceptions(staged, file => readFileSync(join(root, file), 'utf8'))).toHaveLength(1)
  })
  it('keeps the real v0.3 schema compatible but rejects appended prose and copies at new paths', () => {
    const source = readFileSync(new URL('../interface/event-envelope.schema.json', import.meta.url), 'utf8')
    const term = 'prove' + 'nance'
    expect(findConcreteTermViolations(file, source)).toEqual([])
    expect(findConcreteTermViolations(file, source + `\n${term}`)).not.toEqual([])
    expect(findConcreteTermViolations('interface/new.schema.json', source)).not.toEqual([])
  })

  it('retains captured checkpoints but rejects newly added commit references', () => {
    const path = '.github/tdd/wei-live-delivery-20261017.md'
    const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
    const commit = source.match(/(?<![a-z0-9])[a-f0-9]{8}(?![a-z0-9])/iu)?.[0]
    expect(commit).toBeDefined()
    const commits = new Set([commit!])
    expect(findRepositoryReferences(path, source, commits)).toEqual([])
    expect(findRepositoryReferences(path, source + `\n${commit}`, commits)).not.toEqual([])
    expect(findRepositoryReferences('.github/tdd/new.md', source, commits)).not.toEqual([])
  })
  it('rejects an empty or narrowed seal list and unreviewed translation exclusions', () => {
    const path = 'interface/README.md'
    const policy = { ...manifest, teamDocuments: { [path]: digest(body) } }
    expect(finStructDocumentExclusionErrors([path], policy)).toEqual([])
    expect(finStructDocumentExclusionErrors([path], manifest)).toHaveLength(1)
    expect(finStructDocumentExclusionErrors([], policy)).toHaveLength(1)
    expect(finStructDocumentExclusionErrors(['interface/'], policy)).toHaveLength(2)
    expect(finStructDocumentExclusionErrors([path, 'interface/new.md'], policy)).toHaveLength(1)
  })
  it('accepts only an exact registered path and reviewed contents', () => {
    expect(matchesFinStructException(file, body, 'protocol', manifest)).toBe(true)
    expect(matchesFinStructException(file, body.replaceAll('\n', '\r\n'), 'protocol', manifest)).toBe(true)
    for (const path of [`${file}.bak`, `other/${file}`, 'interface/new.json']) {
      expect(matchesFinStructException(path, body, 'protocol', manifest)).toBe(false)
    }
    expect(matchesFinStructException(file, `${body}new text`, 'protocol', manifest)).toBe(false)
    expect(matchesFinStructException(file, body, 'records', manifest)).toBe(false)
  })

  it('rejects missing, changed and stale exceptions instead of silently shrinking coverage', () => {
    expect(validateFinStructExceptions(manifest, () => body)).toEqual([])
    expect(validateFinStructExceptions(manifest, () => undefined)).toHaveLength(1)
    expect(validateFinStructExceptions(manifest, () => 'changed')).toHaveLength(1)
  })

  it('rejects malformed manifests and paths outside FinStruct ownership', () => {
    expect(parseFinStructExceptions(JSON.stringify(manifest))).toEqual(manifest)
    for (const value of [null, {}, { ...manifest, bypass: true }, { ...manifest, protocol: [] },
      { ...manifest, protocol: { [file]: 'short' } },
      ...['../README.md', '/interface/a.json', 'interface/../AGENTS.md', 'interface\\a.json',
        'packages/core/agent/src/index.ts', 'scripts/verify-md-wrap.ts', 'docs/architecture.md',
        'docs/user/guide/index.md', 'interface/'].map(path => ({ ...manifest, protocol: { [path]: digest(body) } })),
      { ...manifest, teamDocuments: { 'interface/result.json': digest(body) } },
    ]) expect(() => parseFinStructExceptions(JSON.stringify(value))).toThrow()
  })

  it('allows only code_version string values in actual local event envelopes', () => {
    const commit = '1234567abcdef'
    const input = JSON.stringify({ schema_version: '0.3', run_meta: { code_version: commit }, note: commit }, null, 2)
    const path = 'workspace/cjh/page_prototype/data/live.json'
    const ranges = runtimeCodeVersionRanges(path, input)
    expect(ranges).toHaveLength(1)
    expect(input.slice(ranges[0]![0], ranges[0]![1])).toBe(`"${commit}"`)
    for (const other of ['docs/live.json', 'workspace/cjh/page_prototype/data-backup/live.json', `${path}.md`]) {
      expect(runtimeCodeVersionRanges(other, input)).toEqual([])
    }
    for (const other of ['{broken', JSON.stringify({ code_version: commit }),
      JSON.stringify({ schema_version: '0.3', run_meta: { code_version: `notes ${commit}` } }),
      JSON.stringify({ schema_version: '0.3', run_meta: { code_version: { text: commit } } }),
      input.replace('"run_meta"', '"other"'), input.replace('"0.3"', '"unknown"')]) {
      expect(runtimeCodeVersionRanges(path, other)).toEqual([])
    }
  })
})
