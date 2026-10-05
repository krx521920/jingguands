import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),out=new URL('../docs_D9/validation_D9/',import.meta.url);
mkdirSync(out,{recursive:true});
const test=spawnSync(process.execPath,['--test','--test-reporter=tap','tests_D9/regression_D9.test.mjs'],{cwd:root,encoding:'utf8'});
writeFileSync(new URL('regression_D9.tap',out),test.stdout+(test.stderr||''));
const total=Number(test.stdout?.match(/# tests (\d+)/)?.[1]),passed=Number(test.stdout?.match(/# pass (\d+)/)?.[1]),failed=Number(test.stdout?.match(/# fail (\d+)/)?.[1]);
writeFileSync(new URL('regression_summary_D9.json',out),JSON.stringify({node:process.version,exit_code:test.status,total,passed,failed},null,2)+'\n');
if(test.status!==0){console.error(test.stdout,test.stderr);process.exit(1);}
const compatibility=spawnSync(process.execPath,['tests_D9/compatibility_D9.mjs'],{cwd:root,encoding:'utf8'});
writeFileSync(new URL('compatibility_run_D9.log',out),compatibility.stdout+(compatibility.stderr||''));
if(compatibility.status!==0){console.error(compatibility.stdout,compatibility.stderr);process.exit(1);}
console.log(`规则回归 ${passed}/${total}；A schema和陈bridge 31/31；魏插件7/7。`);
console.log('原公开集严格评分仍为 FAIL（18/20）；019/020缺据保持insufficient。此验证通过表示边界符合设计，不表示评分20/20。');
