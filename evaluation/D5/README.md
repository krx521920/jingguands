# D5 股权变动开发集与方向反转挑战

## 当前状态

- 10份真实股权变动公告，16个事件、144个字段。
- Gold结构、出处、方向和挑战校验通过。
- 最新魏真实批次：`runs/batch-20261002T051119`。
- 最新对拍：16/16事件、137/137有值字段、0校验问题、MATCH。
- `D5-EQC-002`裁决采用口径A：一致行动人明确披露的变动后股数和比例必须抽取。
- 张官方解析：10/10通过。
- 方D5检查器：12/12哈希一致、10/10挑战通过。
- 陈D5对比页代码已交付，尚待独立运行验收。
- 第二人复核：pending。

## 数据入口

- Manifest：`dev/manifest.json`
- Gold：`dev/gold/D5-EQC-*.envelope.json`
- 挑战：`challenges/direction-inversion-cases.json`
- Gold决策：`handoffs/D5-gold-decisions.md`
- 最新对拍：`evidence/upstream-comparison.json`

## 验证

```powershell
node evaluation/D5/tests/validate-d5.mjs
node evaluation/D5/tests/compare-upstream-d5.mjs
```
