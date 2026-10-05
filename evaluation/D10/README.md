# D10 多公告集成案例与缓存一致性校验（评测侧）

日期：2026-10-05｜交付人：宗

## 一、交付物

| 文件 | 说明 |
|---|---|
| `cases/integration-cases.json` | **10 组多公告集成案例**（成员、目的、预期） |
| `check-integration.mjs` | 校验器：单例必填项 + 缓存三项一致性 |
| `reference/adversarial-bundle.json` | 对抗样本：注入缺哈希/缺报告/缓存不一致，验证校验器能抓到 |
| `reference/score-adversarial.json` | 上述评分结果 |

## 二、10 组案例

| # | 案例 | 成员 | 考察点 |
|---|---|---|---|
| 001 | 科创新材三份同事件互证 | EQC-001/002/003 | related + 互证 + 合计勾稽 |
| 002 | 海正药业转让双方 | EQC-004/005 | 零共享主体，反向咬合 |
| 003 | 鸿路同公司不同事件 | EQC-006 / DEMO-HL-0930 | 同主体+同持股数仍判 unrelated |
| 004 | 质押×权益变动跨类型 | PLD-001 / EQC-001 | 跨类型不自动合并 |
| 005 | 中标三份不同主体 | AWD-001/002/003 | 同类型零误报基线 |
| 006 | 扫描降级参与 | scan-degrade / AWD-001 | 证据不足单列，不进矛盾比较 |
| 007 | 含税口径 | AWD-004 / AWD-005 | 先归因再判矛盾 |
| 008 | 币种折算 | AWD-007 / AWD-002 | 缺汇率不强行换算 |
| 009 | 本次/累计口径 | PLD-001 / PLD-009 | 同值不同列 |
| 010 | 混合鲁棒链 | PLD-001/EQC-001/AWD-001/scan-degrade | 三类+降级同批不崩 |

## 三、每组必填（对接方/魏、数据/张、报告/方、展示/陈）

`input_sha256[]`（与成员数一致）· `run_id` · `code_version` · `schema_version` · `records` · `diff_list` · `report{events,diffs,attribution,boundaries}`

## 四、缓存三项一致性（对应当天共同完成标准）

| 测试 | 断言 |
|---|---|
| 缓存重放 | `replay_business_fields_identical === true`（业务字段 100% 一致） |
| 清缓存重跑 | `cold_cache_new_call_log === true`（有新调用日志） |
| Web/CLI | `web_cli_same_result === true`（同次结果一致） |

## 五、运行

```powershell
node evaluation/D10/check-integration.mjs --self-check
node evaluation/D10/check-integration.mjs --bundle <integration-bundle.json> --json evaluation/D10/score-result.json --strict
```

`--strict` 下未出现在 bundle 中的案例计为失败；非 strict 计 `not_run`。
