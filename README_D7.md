# 方轩诚 D7：A规则回归与B接口样例

交付日期：2026-10-03。任务对应team_plan_14days.xlsx「14天并行分工」G13。全部文件扩展名前以_D7结尾。本包可独立运行，也可复制到团队仓库根目录。无第三方运行依赖，不需要前六天目录，不修改根package.json。

## 直接运行

使用Node.js 24或更高版本，在本文件所在目录执行：

```powershell
node --test tests_D7/rules.test_D7.mjs
node src_D7/cli_D7.mts normalize examples_D7/A_input_D7.json
node src_D7/cli_D7.mts metrics examples_D7/metrics_input_D7.json
node src_D7/cli_D7.mts pair demo examples_D7/A_input_D7.json E01 examples_D7/A_input_D7.json E01
```

最后一条展示接口调用，左右使用同一合成输入，不能用来证明跨文档关联；完整双侧样例见[8组B样例](examples_D7/B_pairs_D7.json)。CLI成功返回0，参数、文件、JSON或输入结构错误返回2；业务待复核记录在JSON中，不能只看退出码判业务通过。标准输出仅JSON，错误写入标准错误，记录实现文件SHA。重定向应写入新文件，不能覆盖输入。

有同源解析包时，normalize命令还接受第二个文件参数：`node src_D7/cli_D7.mts normalize A.json parsed.json`。没有相符的文件SHA、块、页、单元格和原文引用，不能借用表头单位。

## 修复内容

1. **标准化适配。** 不再抓原文第一个数字；多金额、外币混用、错千分位、无单位、冲突单位和未知分母均阻断。失败后清除standardized并将已抽取候选降为needs_review，保留原始值和出处。零与缺失分开，金额全程十进制字符串。约数/上界保留限定词；暂定或不能确定的限定词不强算。
2. **统计口径。** 不硬编码100%；文本字段不进入数值标准化分母。全部应提取数值字段和实际提取数值字段分别作分母，失败文件留在预期清单内。四个空状态都计入错误填充的适用分母，旧的两状态口径另列供对照。没有独立出处审核记录时不生成出处准确率。
3. **B接口样例。** 提供三类事件、8种场景、JSON Schema和可调用构造函数。保留左右文件哈希、版本、事件、原字段六状态、金额/税/份额/分母/本次累计及全部引用。所有D7样例都为unknown、may_compare=false；第八天同事件判定与第九天差异比较不在今天提前执行。

## API接入

```typescript
import { normalizeEnvelope, resolveUnitHints } from './src_D7/normalization_D7.mts';
import { summarizeSamples } from './src_D7/statistics_D7.mts';
import { buildAlignmentPair } from './src_D7/alignment_D7.mts';

const units = resolveUnitHints(aEnvelope, parsedDocument);
const aResult = normalizeEnvelope(aEnvelope, units.hints);
// aResult.envelope仍是公共v0.3信封，可传给现有页面转换器。
// aResult.changes为独立审计记录，原aEnvelope不变。
const pair = buildAlignmentPair('pair-01',
  { envelope: aResult.envelope, event_id: 'E01', unit_hints: units.hints },
  { envelope: otherEnvelope, event_id: 'E01' });
```

仅有信封时使用`normalizeEnvelope(aEnvelope)`；缺单位会保留候选并降级。低层`normalizeFieldValue(name, field, unitHint, context)`保留上游“原位更新、成功null、失败错误字符串”的调用方式。第四参数应使用`eventContext(ev)`；若金额原文仅写“元”而无同事件币种上下文，不会默认人民币。解压独立运行用`.mts`明确ESM，避免依赖父目录package.json的type字段。

统计输入为Sample数组，每个预期文件一行，字段包括case_id、cohort、gold、actual、execution、format_valid。失败actual=null，不能删样本行。可传event_map（Gold事件ID→实际事件ID，一对一）与unit_hints；未传event_map时只按文件内同ID定位，不保证不同抽取输出的ID语义相同。格式是否合规应由共享Schema校验器给出，未校验填null。命令行演示使用的[统计输入](examples_D7/metrics_input_D7.json)故意含一份失败样本，展示分母保留。

团队离线回放命令需本地仓库包含固定Git对象：

```powershell
node tests_D7/compatibility_D7.mjs C:/path/to/jingguands
# 已有TypeScript与@types/node的环境：
npx --no-install tsc --noEmit -p tsconfig_D7.json
```

[可选上游接入补丁](integration_D7.patch)只调整标准化导入、同事件上下文及控制台数值标准化计数，未自动应用。应用前将本包src_D7复制到仓库根目录，先`git apply --check integration_D7.patch`；实际抽取需要另行做模型回归。也可以只采用normalizeEnvelope后处理接口。不要同时重复接入两个阶段。

## 验证结果与边界

见[验收与兼容性记录](docs_D7/验收记录_D7.md)、[完整离线结果](docs_D7/A_regression_results_D7.json)和[交付清单](交付清单_D7.json)。已有437/437字段一致性已复现；独立数值复算只有121/181项具备当前检查所需依据，剩余项单列，不能把条件比率100%宣称为整体标准化正确率100%。已验证项比例是本工具的验证覆盖率，不等于官方标准化准确率，未验证项也不自动判错。

本交付不覆盖队友Gold、不读取封存测试、不调用付费模型、不推送GitHub。未替团队签署A最终验收，B格式是D7接口提案而非已批准公共协议。
