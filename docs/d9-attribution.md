# D9 · B 归因流程与调用轨迹（提前于 10-05 交付）

> 交付人：魏文宇　日期：2026-10-04　状态：引擎＋单测＋门禁就绪，待接方 D9 归因规则库与宗 20 条归因用例
> 任务表 D9 魏："编排归因/核验工具；模型可解释但不得覆盖确定性规则判定。"

## 一、工具

`scripts/jingguan/attribute_b.mjs`——输入 B 报告（verify_crossdoc 产出），对每条矛盾/证据不足
输出**确定性归因**＋**调用轨迹**（trace：规则、输入值、引文、结论，逐条可审计）。

```bash
node scripts/jingguan/attribute_b.mjs --report runs/D8-b-report-20261004.json [--rules <规则模块>] [--out <out.json>]
```

## 二、内置归因链（确定性，顺序即优先级）

| # | 规则 id | 归因 | 判据 |
|---|---|---|---|
| 1 | INSUFFICIENT_EVIDENCE | 证据不足（不猜） | 组判 unknown/INSUFFICIENT_SIGNALS——不强行归因 |
| 2 | UNIT_SCALE_MISMATCH | 口径差异·单位量级 | 两值有效数字一致、量级差 10^4/10^8（万/亿） |
| 3 | CUMULATIVE_VS_INCREMENTAL | 口径差异·累计 vs 单次 | 一值 == 其余值之和（合计勾稽形状） |
| 4 | CURRENCY_EQUIV | 口径差异·币种折算 | 引文含外币/折合人民币表述（AWD-007 型） |
| 5 | SAME_QUOTE_DIFFERENT_NUMBER | **真矛盾·同句不同数** | 两侧引文归一后一致但数值不同 |
| 6 | TEMPORAL_PROGRESSION | 正常进展·时点衔接 | 一侧数值出现在对侧引文（期末=期初，鸿路演示型） |
| 7 | ROUNDING_TOLERANCE | 口径差异·约数/舍入 | 相对差 ≤0.5% |
| 8 | UNEXPLAINED_DISCREPANCY | **无法解释·保留疑点** | 以上皆不中——按方 D9 原则"不能解释则保留疑点"，不自动定矛盾 |

顺序原则：可解释口径最优先（同句不同数若属量级错配仍归口径）；真矛盾从严——只有
"同一原句不同数值"才自动判真矛盾，其余疑点留给人工/更正线索。

## 三、插件接口（方 D9 归因规则库接入点）

```js
// rules 模块导出：
export const attributeRules = [{
  id: 'FANG_TAX_CALIBER', label: '口径差异·含税/未税',
  applies: (ctx) => ...,   // ctx = { group, kind, entry, values, quotes }
  decide: (ctx) => ({ attribution: 'caliber_tax', confidence: 'high', evidence: '...' }),
}]
```

插件规则**先于**内置链执行（规则库同为确定性规则）；插件异常逐条捕获记入 trace
不炸整跑（B2 精神），并落回内置链。`model_explanation` 字段接口预留（LLM 解释只附加、
**永不覆盖**规则判定——当前恒 null）。

## 四、验证

- **单测 11 组**（`test_attribution.mjs`，已入第 14 道门禁）：万/亿错配、累计 vs 单次
  （科创新材真实数字 8,427,900=四分项之和）、币种（AWD-007 真实数字 317,915,000 vs
  173,800,000）、同句不同数、时点衔接（鸿路真实数字 744,970,839→753,463,864）、舍入、
  无法解释保留疑点、证据不足不猜、插件优先＋轨迹、插件异常隔离、无差异空报告。
- **真实报告**：宗 13 组 B 报告 → 1 条归因（PAIR-013 → insufficient_evidence，
  `runs/D8-attribution-20261004.json`）；其余 12 组 0 矛盾（引擎零误报的副产品）。

## 五、明日接线清单（D9 正式日）

1. **方**归因规则库（单位/币种/税口径/分母/累计/时间）→ 以 `--rules` 接入，单测里
   FANG_TAX_CALIBER 桩已验证通路。
2. **宗** 20 条归因用例（正常进展/更正/口径差异/真矛盾）→ 作为归因回归集；鸿路
   "区间披露 vs 单次触及"（runs/d8-demo-20261004/demo-report-5groups-record.json）
   可直接作"口径差异"候选用例。
3. **陈**：trace/attribution 字段进核验清单页（双侧证据视图的"差异归因"列）。
4. 更正（correction）类归因当前落在 UNEXPLAINED（保留疑点）——待宗用例给出更正的
   判别特征（公告编号继任/更正公告标题）后升级为独立规则。

## 六、宗 D9 20 条归因用例接入（2026-10-05，当日完成）

宗交付（88d8e545，已按 git hash --no-filters 字节一致引入 evaluation/D9/）当日接入：

- **runner**（`scripts/jingguan/run_d9_rules.mjs`）：消费 rules-cases.dev.json，产出宗 §五约定的
  B 侧归因报告（corroborated/explainable_difference/restated/conflict/insufficient）。
  判定链只读 sides 数据（值/字段/主体/引文/块）——**期望标签（expected_verdict/category/
  attribution_basis）不进入判定**；顺序：空值→币种折合→单侧（主体可锚=部分覆盖/不可锚=证据不足）
  →字段口径（本次vs累计/分母/含税）→显式更正→合计形态→同主体等值互证→合计语境→反向咬合→
  量级/舍入/时点→矛盾候选（须双侧证据，缺则 insufficient）。
- **成绩**：`score-rules.mjs --strict` **PASS 20/20（0 fail 0 not_run，矛盾误报 0 漏报 0）**；
  判定分布与期望全等（互证 5/可解释 11/证据不足 2/更正 1/真矛盾 1）。
  证据：runs/D9-rules-report-20261005.json＋runs/D9-rules-score-20261005.json。
- **门禁第 16 道**：`test_d9_rules.mjs`（runner＋严格评分，临时报告用后即删）。
- 修正记录：首跑 19/20——D9-RULE-003（于春生增持股数两文档一致）被"合计语境"分支误截；
  链序修正为"同主体等值互证先于合计语境"（合计字样是语境描述，不改变该主体数值一致性）。

## 七、宗 v0.2 重锚版消费＋块内容级硬校验（2026-10-05）

宗 5d1b06f0 按张/魏重锚清单修正 5 处 block_id（RULE-009→b00015、RULE-010×2→b00025/b00084、
RULE-012×2→b00026/b00027；歧义处 50,350,000 由宗人工定为 b00084）——当日消费：

- re-vendor 字节一致（git hash --no-filters 校验）。
- **`--verify-blocks` 块内容级硬校验上线**（主源＝批次信封 parse_meta.blocks，不依赖张包
  再生成）：NFKC＋去空白归一后 quote∈block 逐真实侧验证——**30 个真实侧全部 true、0 false**
  （含宗新锚的 5 处；RULE-017 扫描降级侧与 SYNTH-* 受控项按设计豁免记 null）。
- 真实语料 conflict 的双侧证据从"报告层存在性"升为"块内容级"：任一侧不可验证 →
  evidence_verified=false。--bilateral 标注层保留（张包待按 v0.2 再生成）。
- v0.2 + --verify-blocks：宗评分 --strict **PASS 20/20**；门禁 16 升级（块级 true=30/false=0
  入断言）。证据：runs/D9-rules-report-v02-20261005.json。
