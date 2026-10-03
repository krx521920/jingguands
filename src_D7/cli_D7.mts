/** 离线CLI，normalize/metrics/pair分别生成A副本、统计、B样例。 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { normalizeEnvelope, resolveUnitHints } from './normalization_D7.mts';
import { summarizeSamples } from './statistics_D7.mts';
import { buildAlignmentPair } from './alignment_D7.mts';
const read = (p: string): unknown => JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
try {
  const [command, ...args] = process.argv.slice(2); let result: unknown;
  if (command === 'normalize' && (args.length === 1 || args.length === 2)) { const e = read(args[0]!); const hints = args[1] ? resolveUnitHints(e, read(args[1])) : { hints: {}, evidence: [] }; result = { ...normalizeEnvelope(e, hints.hints), unit_evidence: hints.evidence }; }
  else if (command === 'metrics' && args.length === 1) {
    const samples = read(args[0]!); if (!Array.isArray(samples)) throw new Error('METRICS_ARRAY_REQUIRED');
    result = summarizeSamples(samples);
  } else if (command === 'pair' && args.length === 5) result = buildAlignmentPair(args[0]!, { envelope: read(args[1]!), event_id: args[2]! }, { envelope: read(args[3]!), event_id: args[4]! });
  else throw new Error('用法: node src_D7/cli_D7.mts normalize <A.json> | metrics <samples.json> | pair <id> <left.json> <E01> <right.json> <E01>');
  const digest = (file: string): string => createHash('sha256').update(readFileSync(new URL(file, import.meta.url))).digest('hex');
  process.stdout.write(JSON.stringify({ tool: 'cli_D7', version: '0.7.0', implementation_sha256: Object.fromEntries(['normalization_D7.mts', 'statistics_D7.mts', 'alignment_D7.mts', 'decimal_D7.mts'].map(p => [p, digest(p)])), result }, null, 2) + '\n');
} catch (err) { process.stderr.write(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }) + '\n'); process.exitCode = 2; }
