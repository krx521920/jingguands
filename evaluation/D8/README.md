# D8 跨文档配对开发集与评分脚本（评测侧）

日期：2026-10-04
交付人：宗（评测侧）

## 一、交付物

| 文件 | 说明 |
|---|---|
| `pairs/pairs.dev30.json` | 13 组公开开发配对清单（4 同事件 + 8 不同事件 + 1 证据不足），附预期与双侧出处哈希 |
| `score-pairs.mjs` | 评分脚本：自检 + 对 B 流程输出打分 |
| `build-pairs.mjs` | 可复现构建脚本（从 dev-30 与封存哈希重建清单） |
| `reference/b-report-excerpt-20261003.json` | 魏 B 报告摘录（12 组，含来源提交），用于离线演示评分 |
| `reference/score-result-excerpt.json` | 上述摘录的评分结果 |

## 二、诚实边界：同事件配对上界为 4，不是 6

计划表建议「6 组同事件 + 6 组不同事件」。实查公开 30 份开发集后确认：**只有两个可核验的同事件簇**——

- 科创新材 2026-09-23 协议转让：`D5-EQC-001`（简式，出让方）、`D5-EQC-002`（详式，受让方）、`D5-EQC-003`（财务顾问核查意见）→ 3 对；
- 海正药业协议转让：`D5-EQC-004`（受让方）、`D5-EQC-005`（出让方）→ 1 对。

同事件配对上界 = `C(3,2) + C(2,2) = 4`。其余 24 份的证券代码各不相同，不存在第二个可核验同事件关系。

**因此据实交付：4 组同事件 + 8 组不同事件 + 1 组证据不足 = 13 组**，不以虚构配对凑到 6。若必须达到 6 组同事件，需扩充公开语料（新增公告并重新解析/标注），这是当日团队级决定，不是评测侧可以单方面补足的数字。

## 三、配对构成

- **同事件 4 组**（`D8-PAIR-001..004`）：科创新材 3 组、海正药业 1 组，均带双侧 raw/gold sha256。
- **不同事件 8 组**（`D8-PAIR-005..012`）：同类型不同主体 5 组 + 跨类型不同主体 3 组。
- **证据不足 1 组**（`D8-PAIR-013`）：`pledge-scan-degrade`（14 字段全 `unreadable`、0 可用字段）× `D6-AWD-001`。

## 四、评分规则

| 预期 | 通过条件 |
|---|---|
| `related` | B 输出 `predicted_relation === "related"` |
| `unrelated` | B 输出 `"unrelated"` **且** `consistency.conflicts` 为 0（不同事件不得进入数值矛盾比较） |
| `insufficient` | B 输出 `"unknown"`，或 `reasons` 含 `INSUFFICIENT_SIGNALS`（证据不足不得强行下结论） |
| 版本可追踪 | 每个成员的 `a_run_links` 含 `a_run_id` + `code_version` + `is_mock:false` |

## 五、运行

```powershell
# 清单自检（离线，无需 B）
node evaluation/D8/score-pairs.mjs --self-check

# 对 B 输出打分（离线演示用摘录）
node evaluation/D8/score-pairs.mjs `
  --report evaluation/D8/reference/b-report-excerpt-20261003.json `
  --json evaluation/D8/reference/score-result-excerpt.json

# 对真实 B 全量输出打分（B 全跑后）
node evaluation/D8/score-pairs.mjs --report <b-report.json> --json evaluation/D8/score-result.json --strict
```

## 六、接口

`pairs/pairs.dev30.json` 采用与封存清单相同的结构（`groups[].members` + `groups[].expected_relation` + `member_hashes`），可直接作为 B 流程清单输入：

```powershell
node scripts/jingguan/verify_crossdoc.mjs --envelopes-dir <envelopes> `
  --manifest evaluation/D8/pairs/pairs.dev30.json --expect
```

`--strict` 下，未出现在 B 报告中的配对计为失败；非 strict 下计为 `not_run`。当前 `D8-PAIR-013` 尚未被任何 B 运行覆盖，故演示结果为 `12 pass / 0 fail / 1 not_run`。
