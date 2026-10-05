# D9 归因规则开发用例与评分（评测侧）

日期：2026-10-05
交付人：宗（评测侧）
当天目标：**先归因，再判矛盾**——数值不同不等于矛盾。

## 一、交付物

| 文件 | 说明 |
|---|---|
| `cases/rules-cases.dev.json` | 20 条规则开发用例（含预期判定、双侧块级引文、归因依据） |
| `score-rules.mjs` | 评分脚本：自检 + 对 B 侧归因报告打分 + 误报/漏报统计 |
| `reference/expectation-echo-report.json` | 期望回显报告（**非引擎运行**，用于验证评分器本身） |
| `reference/adversarial-report.json` | 对抗报告：注入 5 类错误，验证评分器能抓到 |
| `reference/score-echo.json` / `score-adversarial.json` | 上述两次评分结果 |
| `误报分析.md` | 误报/漏报口径与实测结论 |

## 二、用例构成（20 条）

| 类别 | 条数 | 预期判定 | 来源 |
|---|---:|---|---|
| 互证（正常进展） | 3 | `corroborated` | 公开 |
| 合计↔明细 | 2 | `explainable_difference` | 公开 |
| 部分覆盖非矛盾 | 2 | `explainable_difference` | 公开 |
| 反向咬合 | 2 | `corroborated` | 公开 |
| 本次 vs 累计口径 | 2 | `explainable_difference` | 公开 |
| 比例分母口径 | 1 | `explainable_difference` | 公开 |
| 含税口径 | 2 | `explainable_difference` | 公开 |
| 币种/折算口径 | 2 | `explainable_difference` | 公开 |
| 证据不足 | 2 | `insufficient` | 公开（扫描降级、无 header_path） |
| 更正 | 1 | `restated` | **受控构造** |
| 真矛盾 | 1 | `conflict` | **受控构造** |

**18 条公开 + 2 条受控构造**，受控项以 `synthetic_controlled: true` 显式标注。

公开语料**没有更正公告、也没有真矛盾实例**（魏 B 引擎在公开配对上的 `conflicts=0`），所以这两类只能受控构造；不把构造项混进公开分母。

## 三、判定规则（写进用例，也写进评分器）

1. **数值不同 ≠ 矛盾**：必须先归因（口径/合计/覆盖/时点/税/币种），无法归因才进矛盾候选。
2. **疑似矛盾必须带双侧证据**：`conflict` 判定须有 ≥2 侧 `block_id + quote`，缺任一侧即判失败。
3. **缺汇率/税率/时点依据不得强行换算**：报告 `computed[]` 中未声明 `used_source` 的汇率/税率项直接判失败。
4. **更正须有后发文件的显式更正语义**；无声明不得当作更正。

## 四、运行

```powershell
node evaluation/D9/score-rules.mjs --self-check

node evaluation/D9/score-rules.mjs `
  --report evaluation/D9/reference/expectation-echo-report.json `
  --json evaluation/D9/reference/score-echo.json

node evaluation/D9/score-rules.mjs `
  --report <b-attribution-report.json> `
  --json evaluation/D9/score-result.json --strict
```

## 五、B 侧归因报告接口（约定）

```jsonc
{
  "checked_on": "2026-10-05",
  "cases": [{
    "case_id": "D9-RULE-001",
    "verdict": "corroborated",            // corroborated | explainable_difference | restated | conflict | insufficient
    "attribution": "同一主体同一字段两文档一致",
    "sides": [{ "case_id": "D5-EQC-001", "block_id": "...", "quote": "..." }],
    "computed": [{ "name": "exchange_rate", "used_source": "issuer_disclosed_equivalent" }]
  }]
}
```

## 六、实测

| 报告 | 结果 |
|---|---|
| 期望回显 | **20/20 PASS**，误报 0、漏报 0 |
| 对抗报告（注入 5 类错误） | **FAIL（15/20）**，抓到误报 3、漏报 1、缺双侧证据 1、强行换算 1 |

详见 `误报分析.md`。
