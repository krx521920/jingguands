# 公告事件标注规范 v0.1

## 1. 范围

本规范覆盖首批三类事件：

1. `pledge`：股权质押；
2. `equity_change`：股权变动；
3. `award_contract`：中标与合同。

同一文档可包含多个事件。每个事件独立编号、独立计分。补充、更正和后续公告不覆盖原始事件，而是建立版本关系。

## 2. 标注层

```text
文档：document_id、页码、段落、表格、单元格、坐标
事件：事件类型、主体、日期、状态、金额、数量、比例
字段：原始值、标准化值、单位、口径、证据、状态
关系：同事件、进展、更正、不同事件、未知
```

## 3. 通用规则

- 原文没有披露时使用 `not_mentioned`，不得补成 0。
- 扫描或解析失败时使用 `unreadable`，不得当作缺失。
- 原文存在但语义有歧义时使用 `pending_review`。
- 不适用于当前事件的字段使用 `not_applicable`。
- 原文明确披露为零时，零是有效值。
- 中标候选不等于正式中标；正式中标不等于合同签署或收入确认。
- 未披露调价条款使用 `not_disclosed`，不得推断为固定价格。
- 含税、不含税和未知口径必须分开记录。
- 本期值与累计值必须分开记录。
- 占持股比例和占总股本比例必须分开记录。

## 4. 字段定义

### 质押

`pledgor`、`pledgee`、`pledged_shares_current`、`pledged_shares_cumulative`、`ratio_of_holdings_pct`、`cumulative_ratio_of_holdings_pct`、`ratio_of_total_share_capital_pct`、`cumulative_ratio_of_total_share_capital_pct`、`pledge_start_date`、`pledge_end_date`。

### 股权变动

`actor`、`direction`、`change_method`、`change_shares`、`ratio_change_pct`、`shares_before`、`ratio_before_pct`、`shares_after`、`ratio_after_pct`、`event_date`、`change_reason`。

### 中标与合同

`customer`、`project`、`product`、`amount`、`currency`、`tax_basis`、`award_status`、`formal_award_notice_received`、`contract_signed`、`performance_months`、`price_adjustment_status`、`recognized_revenue`。

## 5. 证据

每条证据包含 document_id、page、source_type、excerpt，以及可选的 bbox、table、cell。

证据优先顺序：

```text
表格单元格/扫描区域 > 段落或列表项 > 文档和页码 > 无证据
```

无证据字段不能作为事实输出。确实未提及、不可读取或不适用时，必须显式标注相应状态。

## 6. 跨文档关系

- `same_event`
- `progress`
- `correction`
- `different_event`
- `unknown`

修正优先级：最新明确更正 > 后续有效公告 > 首次公告。历史值保留，canonical value 记录选择理由。

## 7. 复核

每个 Gold 文件保留 annotator、reviewer、version 和 reviewed_at。争议字段不得由业务开发者单方面修改，必须记录理由并重新计算分母。
