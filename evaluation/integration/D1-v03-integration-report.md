# D1 v0.3 对接实测报告

检查日期：2026-09-28。

## 契约 v0.3

- 分支：`weiwenyu`
- 提交：`00a472c`
- 已解决：`award_contract`统一、六种字段状态、四类比例分母、表格`table_id/cell_ref`、region坐标语义。
- 页面直接消费：`runs/**/events.json`。

## 实际测试结果

| 项目 | 结果 |
|---|---|
| 魏 v0.3 runs JSON | 7份可解析，事件类型正确 |
| 魏共同校验器 | 失败，缺少`scripts/jingguan/lib/*.mjs` |
| 张 v0.2 出处自检 | 71/71 block，text_raw 71/71，100% |
| 方标准化测试 | 11/11通过 |
| 魏 v0.3 → 陈页面桥接 | 1个事件→1个事件，12条证据 |
| 方记录 → 陈页面桥接 | 7条记录→2个事件，7条证据 |

## 新阻断

### 1. 魏的共同校验器不能运行

`validate_envelope.mjs`和`run_extract.mjs`导入了以下文件：

```text
scripts/jingguan/lib/schema_validator.mjs
scripts/jingguan/lib/registry.mjs
scripts/jingguan/lib/fang_normalize.mjs
```

但这些文件没有提交到`weiwenyu`分支。结果是：

- `run_extract.mjs`无法启动；
- `validate_envelope.mjs`无法执行；
- “全模块提交前必跑共同校验器”目前不可复现。

必须由魏补齐并推送这些文件。

### 2. 中标契约仍缺少专业边界字段

当前`award_contract`注册表只有：

```text
bidder
tenderer
project_name
bid_amount
currency
tax_included
duration
consortium
bid_date
```

缺少：

```text
contract_signed
formal_award_notice_received
price_adjustment_status
recognized_revenue
```

因此当前契约不能表达：

- 中标候选、正式中标、合同签署的区别；
- 未披露调价条款不等于固定价格；
- 合同金额不等于当期收入。

这些字段是赛题专业边界，不应只存在于评测Gold中。建议由魏增加为可选字段，至少在award_contract中注册。

### 3. 评测Gold投影适配器尚未实现

内部Gold v0.1.1保持完整语义；下一步需要一个适配器把它们投影成v0.3信封。

适配器至少要完成：

```text
confirmed -> extracted
confirmed pledge fields -> v0.3 split field names
actor -> holder
customer -> tenderer
project -> project_name
amount -> bid_amount
excerpt -> quote
bbox -> region
table -> table_id
cell -> cell_ref
```

映射不能丢失`not_disclosed`、`not_applicable`和表格证据。

## 当前进度

- 五份个人产物：5/5已推送。
- 页面桥接：魏→陈、方→陈已实际通过。
- 张→魏：block级映射结构明确，但尚未写成自动化转换。
- 完整A→B→页面→评测：尚未执行。
- D1冻结：未完成，阻塞于魏缺失lib文件和中标边界字段缺口。
