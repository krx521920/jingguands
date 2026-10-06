# 方轩诚 D10｜推送精简版

本目录内文件可按原有相对路径推送到自己的分支根目录，与已有 `src_D9` 并列。本次仅整理本地，未推送。

## 保留内容

- `src_D10/`：报告组装、命令行生成、结构校验及必要的单文件 schema 校验依赖。
- `schema_D10/核验报告_schema_D10.json`：事件、差异、归因、计算、边界五段结构。
- `results_D10/核验报告合集_D10.json`：**原10组结果完整合并，字节未改**。包括全部事件、字段、证据、计算与边界，不是摘要。
- `results_D10/audit_D10/cache_audit_D10.json`：原结果引用的缓存检查记录。
- `tests_D10/verify_D10.mjs`：不依赖原始快照的17项检查。
- `兼容性检查_D10.json`、`依赖与来源_D10.json`、`LICENSE_D10.txt`：检查结论、外部来源与必要许可证。

不再重复提交93份缓存信封、张的原解析、队友脚本副本、旧D8/D9模块、10份分组JSON、重复CSV/页面投影和测试日志。需要CSV或陈的投影时，用 `report_D10.mjs` 的 `toCSV(bundle)` / `toChenVerify(bundle)` 直接从主报告生成。

## 直接检查推送文件

Node.js 24.x；不需要npm安装、API Key或网络。在本目录执行：

```powershell
node .\tests_D10\verify_D10.mjs
```

实测17/17，10组Schema与引用通过。精简前后报告完全一致；生成器使用外部D9和实际魏B接口、张解析重跑后，10组事件/差异/计算/证据及归因结论一致。

## 生成新报告：复用现有团队文件

1. 魏先运行既有B入口，启用 `--d9-enrich`，提供 `results[].d9_context` 和 `a_run_links`。本工具不重新启动A/B或调用模型。
2. 使用已有D9目录，其中包含 `src_D9/attribution_D9.mjs` 及其原运行依赖。
3. 使用张的 `sample/D4|D5|D6/parse/<成员>.parse.json`。魏内嵌简化块会缺少部分累计表头，完整结果应传 `--parse-root`；文件哈希不符会拒绝使用，不自动移块补证。

以下示例在整合了队友文件的仓库根目录执行，B文件名替换为实际路径：

```powershell
node .\src_D10\build_D10.mjs `
  --b-report .\runs\d10-b-enriched.json `
  --cases .\evaluation\D10\cases\integration-cases.json `
  --attribution-cases .\evaluation\D9\cases\rules-cases.dev.json `
  --d9-root . `
  --parse-root .\sample `
  --out-dir .\runs\fang-report-D10
```

也支持 `--context <JSON>` 提供完整 `{documents,parses}`；documents按成员ID索引，parses为同SHA的解析。旧B报告没有d9_context时必须用此方式。A运行ID必须与B的a_run_links一致，防止旧B套新A。

`--cache-audit <JSON>` 可选。缺省不宣称缓存通过；只有该记录的replay run_id与当前A一致才采用。旧缓存报告不能证明新批次命中。新增报告的 `records[].input_artifact` 指向本次提供的上下文JSON或B报告容器，hash为该文件字节SHA；字段具体位置仍由成员/事件/证据ID定位。

编程调用的变更仅是显式传入D9函数，避免静态依赖被删目录：

```javascript
import {attributeCase} from './src_D9/attribution_D9.mjs';
import {buildGroup} from './src_D10/report_D10.mjs';
const result = buildGroup({...options, attributeCase});
```

其余报告字段和JSON Schema版本保持 `verification-report/1.0`。未加载D9时生成器明确报错，读取/校验已交付报告及CSV/页面投影则无需D9。

## 验收与历史引用

报告结构10/10、精简检查17/17；使用固定队友版本的16份A schema/陈bridge和陈实际renderer函数兼容检查通过。renderer为DOM冒烟，不是实际Web服务器验收。

原报告的宗整链严格评分仍为 **FAIL 0/10**：缓存完整业务字段与基线存在差异，冷调用日志/实际Web-CLI尚未独立证实，未把null改成true。精简不更改财务结论、六态、未知状态或已有边界，也不据此归责个人。

原报告中 `inputs_D10/...`、`peer_reference_D10/...` 等是当时生成过程的历史引用，不代表这些副本还在推送目录；对应仓库提交、原路径、SHA列在 `依赖与来源_D10.json`。完整旧包已移到本机工作区备份，无需推送。D8/D9源文件留在既有交付中，不再次复制。

再生成新报告会改变run_id/时间和容器来源；不要将新结果与旧结果的整文件哈希直接等同。随包原结果哈希用于此次精简一致性校验。
