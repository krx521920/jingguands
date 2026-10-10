# 给陈（可直接粘贴）· `standardized` 判据收口 · 2026-10-10

宗｜这份是补上我欠的那一项（注册表 `standardized_rate` 的 `blocked_by` 点名我）。裁定全文：`evaluation/D17/裁定-standardized判据-20261010.md`

## 一、判据其实只有一套，对不上的是分母与样本

我把权威批（31 份 / 606 字段）逐个字段算了一遍：

| 量 | 值 |
|---|---|
| 有值字段（= `status: extracted`） | **437** |
| 其中 `unit: text` | 208（**键无契约含义，不入分母**） |
| **其中非 text（主口径分母）** | **229**（shares 76 / percent 90 / date 35 / date_range 13 / cny 15） |
| 主口径覆盖率 | **229 / 229 = 100%** |
| 辅助口径（含 text 噪声） | 433 / 437 = 99.08% |
| 弃权字段 | 169（**不得标 true**） |
| 标注完整率 | 437 / 437 = 100% |

**三个历史数的定性**：
- 你的卡片 **71.62%（434/606）**：分母把 169 个**弃权字段**算进来了，分子还混进了弃权字段上的 1 个 true → **作废**；
- 你的注册表 **99.1%（442/446）**：判据是对的，只是样本含 `DEMO-EQC-HL-0930` 且分母含 208 个 text 噪声 → 保留作"扩大口径"对照，权威口径写 **229/229**；
- **364/521**：我在 30 核心 / 31 权威 / 32 全量三种切法下**都算不出**这两个数，也找不到产出脚本 → 判为**不可核历史数，禁止再引用**（要保留就必须补批次哈希+脚本）。

## 二、要你改三处

1. **卡片拆两个**：
   - **标准化覆盖率**（主口径，100%，分母 229——**不挂目标**，它不是准确率）；
   - **标准化正确率**（**目标 98% 挂这一项**，值 100%，依据＝D11 值层 437/437，非 text 的 229 是它的子集）。
2. **注册表 `standardized_rate`**：改为主口径 **229/229**，`blocked_by` 改"已裁定（`evaluation/D17/裁定-standardized判据-20261010.md`）"，`source_script` 指向 `evaluation/D17/check-standardized.mjs`。
3. **`text` 字段不显示标准化状态**（这是 D13-C2 早就裁过的，一并落实）。

## 三、顺手给你的门

```bash
node evaluation/D17/check-standardized.mjs --dir <envelopes 目录> --exclude DEMO-EQC-HL-0930.json
node evaluation/D17/check-standardized.mjs --self-test
```

它给我上面那张表，并**自动单列两类违规**：有值却缺布尔、弃权却标 true。跑权威批现在报 **1 处违规**：

> `D4-PLD-008` E01 `announcement_date`：`status: not_mentioned`、`value: null`、`provenance: []`，却标 `standardized: true`

这处**不用你改**（属抽取侧产出，我已登记给魏）——列出来是让你知道：门会替我们盯住这一类，不必靠人记。

## 四、验收

改完后：口径对账门（`check-metrics-caliber`）里"标准化"那条应从 FAIL 转 PASS（卡片与注册表同值同分母）；另外两条门（副本时效、关系层）仍在等你刷新用例与集成包。