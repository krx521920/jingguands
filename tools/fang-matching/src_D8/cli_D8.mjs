/** node src_D8/cli_D8.mjs pair|batch|d7 input.json；只读输入，标准输出JSON。 */
import {readFileSync} from 'node:fs';
import {alignEventPair,alignEnvelopes} from './alignment_D8.mjs';
import {alignD7Pair} from './adapters_D8.mjs';
try {
  const [mode,path,...extra]=process.argv.slice(2);
  if(!['pair','batch','d7'].includes(mode)||!path||extra.length) throw Error('Usage: node cli_D8.mjs pair|batch|d7 input.json');
  const x=JSON.parse(readFileSync(path,'utf8'));
  const result=mode==='pair'?alignEventPair(x.left,x.right):mode==='batch'?alignEnvelopes(x.left,x.right,x.options):alignD7Pair(x.pair,x.options);
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
} catch(err) {console.error(String(err?.message??err));process.exitCode=2;}
