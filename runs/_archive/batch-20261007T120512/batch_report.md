# 批量运行报告 20261007T120512

- 输入：35 份（成功 26）；契约校验问题合计 6 条
- 模式：真实模型调用

| 案例 | 类型 | run_id | 字段状态 | 校验问题 |
|---|---|---|---|---|
| note-unknown | ? | — | 失败 | — |
| pledge-corrupt | pledge | — | 失败 | — |
| D4-PLD-001 | pledge | 20261007T120512-pledge-efed | {"extracted":36,"not_mentioned":3,"needs_review":3} | 0 |
| D4-PLD-002 | pledge | 20261007T120512-pledge-d473 | {"extracted":13,"not_mentioned":1} | 0 |
| D4-PLD-003 | pledge | 20261007T120512-pledge-71f8 | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-004 | pledge | 20261007T120512-pledge-f441 | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-005 | pledge | 20261007T120516-pledge-bbf9 | {"extracted":25,"not_mentioned":3} | 0 |
| D4-PLD-006 | pledge | 20261007T120516-pledge-f3d2 | {"extracted":13,"not_mentioned":1} | 0 |
| D4-PLD-007 | pledge | 20261007T120516-pledge-bfc5 | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D4-PLD-008 | pledge | 20261007T120520-pledge-f65a | {"extracted":11,"not_mentioned":2,"needs_review":1} | 0 |
| D4-PLD-009 | pledge | 20261007T120520-pledge-c946 | {"extracted":36,"not_mentioned":6} | 0 |
| D4-PLD-010 | pledge | 20261007T120522-pledge-669b | {"extracted":12,"not_mentioned":1,"needs_review":1} | 0 |
| D5-EQC-001 | equity_change | 20261007T120523-equity_change-9069 | {"extracted":45} | 0 |
| D5-EQC-002 | equity_change | 20261007T120525-equity_change-e8b3 | {"extracted":27} | 0 |
| D5-EQC-003 | equity_change | 20261007T120526-equity_change-b04f | {"extracted":5,"not_mentioned":4} | 0 |
| D5-EQC-004 | equity_change | 20261007T120530-equity_change-4f46 | {"extracted":8,"needs_review":1} | 0 |
| D5-EQC-005 | equity_change | 20261007T120532-equity_change-473f | {"extracted":8,"needs_review":1} | 0 |
| D5-EQC-006 | equity_change | 20261007T120533-equity_change-a253 | {"extracted":9} | 0 |
| D5-EQC-007 | equity_change | 20261007T120535-equity_change-e9d8 | {"extracted":9} | 0 |
| D5-EQC-008 | equity_change | 20261007T120537-equity_change-f4ba | {"extracted":9} | 0 |
| D5-EQC-009 | equity_change | 20261007T120539-equity_change-b0cd | {"extracted":9} | 0 |
| D5-EQC-010 | equity_change | 20261007T120539-equity_change-15b3 | {"extracted":8,"needs_review":1} | 0 |
| D6-AWD-001 | award_contract | 20261007T120540-award_contract-fc9c | {"extracted":5,"not_mentioned":6,"not_applicable":2,"not_disclosed":1} | 0 |
| D6-AWD-002 | award_contract | 20261007T120542-award_contract-aec3 | {"extracted":24,"not_mentioned":22,"not_applicable":8,"not_disclosed":2} | 0 |
| D6-AWD-003 | award_contract | 20261007T120543-award_contract-b734 | {"extracted":21,"not_mentioned":15,"not_applicable":6} | 0 |
| D6-AWD-004 | award_contract | 20261007T120544-award_contract-d025 | {"extracted":9,"not_applicable":2,"not_mentioned":3} | 0 |
| D6-AWD-005 | award_contract | 20261007T120544-award_contract-4e00 | {"extracted":11,"not_mentioned":3} | 0 |
| D6-AWD-006 | award_contract | 20261007T120548-award_contract-afde | 失败 | 1 |
| D6-AWD-007 | award_contract | 20261007T120548-award_contract-9790 | 失败 | 1 |
| D6-AWD-008 | award_contract | 20261007T120549-award_contract-9355 | 失败 | 1 |
| D6-AWD-009 | award_contract | 20261007T120550-award_contract-aaa6 | 失败 | 1 |
| D6-AWD-010 | award_contract | 20261007T120550-award_contract-eed6 | 失败 | 1 |
| award-empty-text | award_contract | — | 失败 | — |
| pledge-empty | pledge | — | 失败 | — |
| pledge-scan-degrade | pledge | 20261007T120550-pledge-scan | {"unreadable":14} | 1 |

## Gold 对照（开发期错误定位；正式成绩以评测脚本为准）

| 案例 | gold应提取 | 值命中 | 字段准确率 | 错误填充 | 状态一致率 | gold不可支撑 |
|---|---|---|---|---|---|---|
| D4-PLD-001 | 36 | 36 | 100.0% | 0 | 100.0% | 0 |
| D4-PLD-002 | 13 | 13 | 100.0% | 0 | 100.0% | 0 |
| D4-PLD-003 | 12 | 12 | 100.0% | 0 | 100.0% | 0 |
| D4-PLD-004 | 12 | 12 | 100.0% | 0 | 100.0% | 0 |
| D4-PLD-005 | 25 | 25 | 100.0% | 0 | 100.0% | 0 |
| D4-PLD-006 | 13 | 13 | 100.0% | 0 | 100.0% | 0 |
| D4-PLD-007 | 12 | 12 | 100.0% | 0 | 100.0% | 0 |
| D4-PLD-008 | 11 | 11 | 100.0% | 0 | 100.0% | 0 |
| D4-PLD-009 | 36 | 36 | 100.0% | 0 | 100.0% | 0 |
| D4-PLD-010 | 12 | 12 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-001 | 45 | 45 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-002 | 27 | 27 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-003 | 5 | 5 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-004 | 8 | 8 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-005 | 8 | 8 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-006 | 9 | 9 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-007 | 9 | 9 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-008 | 9 | 9 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-009 | 9 | 9 | 100.0% | 0 | 100.0% | 0 |
| D5-EQC-010 | 8 | 8 | 100.0% | 0 | 100.0% | 0 |
| D6-AWD-001 | 5 | 5 | 100.0% | 0 | 100.0% | 0 |
| D6-AWD-002 | 24 | 24 | 100.0% | 0 | 100.0% | 0 |
| D6-AWD-003 | 21 | 21 | 100.0% | 0 | 100.0% | 0 |
| D6-AWD-004 | 9 | 9 | 100.0% | 0 | 100.0% | 0 |
| D6-AWD-005 | 11 | 11 | 100.0% | 0 | 100.0% | 0 |
| D6-AWD-006 | 0 | 0 | — | 0 | — | 0 |
| D6-AWD-007 | 0 | 0 | — | 0 | — | 0 |
| D6-AWD-008 | 0 | 0 | — | 0 | — | 0 |
| D6-AWD-009 | 0 | 0 | — | 0 | — | 0 |
| D6-AWD-010 | 0 | 0 | — | 0 | — | 0 |

### 差异明细

**D6-AWD-006**

| 字段 | 判定 | 说明 |
|---|---|---|
| (E01 上海同济建设有限公司) | MINE_MISSING_EVENT | gold 事件未在系统输出中找到（键：上海同济建设有限公司\|上海金滨海房地产开发有限公司\|pledge\|金山新城JSC1-0403单元3-02-01地块商品房项目-工程总承包项目） |

**D6-AWD-007**

| 字段 | 判定 | 说明 |
|---|---|---|
| (E01 江河幕墙中东工程有限公司) | MINE_MISSING_EVENT | gold 事件未在系统输出中找到（键：江河幕墙中东工程有限公司\|\|pledge\|WResidences幕墙工程） |

**D6-AWD-008**

| 字段 | 判定 | 说明 |
|---|---|---|
| (E01 快乐小草运动草（内蒙古）科技有限公司) | MINE_MISSING_EVENT | gold 事件未在系统输出中找到（键：快乐小草运动草（内蒙古）科技有限公司\|巴彦淖尔市林业和草原局\|pledge\|内蒙古自治区巴彦淖尔市乌拉特后旗三北工程林草湿荒一体化保护修复项目（2026年度）施工二标段） |

**D6-AWD-009**

| 字段 | 判定 | 说明 |
|---|---|---|
| (E01 浙江大丰实业股份有限公司) | MINE_MISSING_EVENT | gold 事件未在系统输出中找到（键：浙江大丰实业股份有限公司\|深圳市建筑工务署工程管理中心\|pledge\|深圳歌剧院项目舞台机械设备工程I标） |
| (E02 浙江大丰实业股份有限公司) | MINE_MISSING_EVENT | gold 事件未在系统输出中找到（键：浙江大丰实业股份有限公司\|绍兴市上虞舜韵产业运营管理有限公司\|pledge\|水韵“青春之城”EOD项目—曹娥江文化艺术中心产业综合体舞台工艺设备采购项目） |
| (E03 浙江大丰实业股份有限公司) | MINE_MISSING_EVENT | gold 事件未在系统输出中找到（键：浙江大丰实业股份有限公司\|惠州大亚湾润华旅游开发有限公司\|pledge\|大亚湾综合文化创意园项目—大亚湾综合文化创意园项目B区室内装修施工） |

**D6-AWD-010**

| 字段 | 判定 | 说明 |
|---|---|---|
| (E01 广东飞南资源利用股份有限公司) | MINE_MISSING_EVENT | gold 事件未在系统输出中找到（键：广东飞南资源利用股份有限公司\|\|pledge\|销毁类报废品处置项目） |
