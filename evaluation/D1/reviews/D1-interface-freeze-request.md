# D1 接口冻结请求

请对应负责人只回答“确认”或提出具体字段修改，不接受口头模糊同意。

## 魏文宇：事件与运行接口

- [ ] 回答JSON可被事件抽取入口消费。
- [ ] case_id 和 canonical_event_id 命名可用。
- [ ] event_type 枚举：pledge / equity_change / award_contract 可用。
- [ ] status 枚举足以表达 active、completed、contract_signed。
- [ ] 字段级 evidence 可以进入统一运行日志。
- [ ] 需要补充的模型、Prompt或运行版本字段。

## 张智博：文档与证据接口

- [ ] document_id、page、source_type、excerpt 可作为稳定证据结构。
- [ ] table 和 cell 字段是否足够承载复杂表格。
- [ ] bbox 为 null 时是否必须提供替代定位信息。
- [ ] source_hash 是否随证据链传递。
- [ ] 页面、段落、表格和扫描区域是否需要统一 block_id。

## 方轩诚：标准化与核验接口

- [ ] raw_value 和 normalized_value 分开是否满足口径核验。
- [ ] unit、denominator、tax_basis、currency 字段是否足够。
- [ ] 股权变动方向 decrease 和前后值字段是否足够。
- [ ] 未披露调价条款使用 not_disclosed 是否可以。
- [ ] 是否需要增加 confidence、conflict_group 或 normalization_source。

## 陈家浩：页面与导出接口

- [ ] 页面可以直接消费 raw、gold 和 evidence。
- [ ] Gold与预测结果可以并排展示。
- [ ] 证据能跳转到页码、表格或区域。
- [ ] JSON/CSV导出字段是否足够。
- [ ] 页面是否需要额外的显示状态字段。

## 冻结结论

- 冻结版本：D1-v0.1
- 待修改项：pending
- 冻结日期：pending
- 参与确认人：pending
