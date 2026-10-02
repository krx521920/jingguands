/** D6 离线 CLI：一份信封或信封数组，单项错误不删除批次分母。 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { checkAwardEnvelope } from './award_check_D6.ts';

try {
  const args = process.argv.slice(2), synthetic = args[0] === '--synthetic-test';
  if (synthetic) args.shift();
  if (args.length !== 1 || args[0]!.startsWith('--')) throw new Error('用法：node src_D6/cli_D6.ts [--synthetic-test] input_D6.json');
  const bytes = readFileSync(args[0]!), parsed: unknown = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
  const reports = (Array.isArray(parsed) ? parsed : [parsed]).map(v => checkAwardEnvelope(v, { evidenceMode: synthetic ? 'synthetic_test' : 'required' }));
  const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');
  const result = { tool: 'award_cli_D6', version: '0.6.0', input_sha256: sha(bytes), implementation_sha256: sha(readFileSync(new URL('./award_check_D6.ts', import.meta.url))), total: reports.length, counts: Object.fromEntries(['verified', 'needs_review', 'invalid', 'skipped'].map(s => [s, reports.filter(r => r.status === s).length])), reports };
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exitCode = reports.some(r => r.status === 'invalid') ? 1 : reports.length === 0 || reports.some(r => r.status !== 'verified') ? 3 : 0;
} catch (error) {
  process.stderr.write(JSON.stringify({ tool: 'award_cli_D6', error: error instanceof Error ? error.message : String(error) }) + '\n');
  process.exitCode = 2;
}
