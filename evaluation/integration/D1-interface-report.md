# D1 接口对接报告

检查日期：2026-09-27。

## 已到位产物

- 评测：`zongbowen` at `36187af`，D1 v0.1.1 自检候选版。
- 魏文宇：`weiwenyu` at `0dd17d8`，事件JSON接口、运行入口和三类Mock/调用日志。
- 方轩诚：`feature/fang-rules` at `c856882`，金融口径字典、标准化函数和10个案例。
- 张智博：`feature/zhang-parser` 仍在 `477b4f4`，D1未提交。
- 陈家浩：`feature/chen-ui` 仍在 `477b4f4`，D1未提交。
- `master` 由 `fxc178` 直接上传了方轩诚的ZIP文件，提交 `e502c0d`，尚未合并或评审。

## 已执行验证

- 方的标准化测试：直接运行测试文件，11/11通过。
- 魏的质押Mock：运行成功，输出1个事件、8个extracted字段、1个not_mentioned字段。
- 联合A→B集成：未执行，因为接口契约冲突。

## 接口冲突

### 事件类型

- 魏：`bid_won`
- 评测：`award_contract`

建议统一为 `award_contract`，因为该事件覆盖中标到合同签署。

### 字段状态

- 魏：`extracted | not_mentioned | unreadable | needs_review`
- 方：`present | not_mentioned | explicit_zero | unreadable`
- 评测：`confirmed | not_disclosed | not_applicable`

建议统一为：

```text
extracted
not_mentioned
unreadable
needs_review
not_disclosed
not_applicable
```

映射：

- 方 `present` → `extracted`
- 方 `explicit_zero` → `extracted` 且 value=0
- 评测 `confirmed` → `extracted`

### 单位

- 魏：`shares | cny | percent | date | text | count`
- 方：`元 | 股 | %`
- 评测：包含 `share | CNY | month | calendar_day | yuan_per_share`

必须统一内部英文枚举，中文单位仅用于显示。

### 比例分母

- 魏：`shares_held | total_shares`
- 方：`total_share_capital | holder_shares | net_assets | other`
- 评测：`pledgor_holdings | total_share_capital`

建议统一为：

```text
holder_shares
total_share_capital
net_assets
other
```

### 证据结构

- 魏：`block_id | page | region | quote`
- 评测：`document_id | page | source_type | excerpt | bbox | table | cell`

建议统一为证据超集：

```text
document_id
block_id
page
quote
source_type
region/bbox
table
cell
```

### 字段注册表

魏的注册表使用聚合字段 `pledged_shares`；评测Gold需要区分本次分项、本次合计、累计值、占持股比例和占总股本比例。接口必须增加相应字段，或允许复合字段使用数组。

## 当前门禁

- 个人产物到位：3/6（评测、魏、方）。
- 接口兼容：1/6，魏与方尚未互相对齐，也尚未与评测答案Schema对齐。
- 联合集成：未执行。
- D1冻结：阻塞于上述接口差异。

## 需要确认

- 魏：决定并发布统一接口版本。
- 张：确认provenance、block_id、region和表格定位能力，并提交D1解析产物。
- 方：将状态和单位映射到统一枚举，补充兼容测试。
- 陈：确认页面可以消费统一状态和证据结构，并提交D1页面骨架。
- 评测：接口冻结后重跑D1验证，保留v0.1.1作为集成前基线。
