# D8 跨文档配对开发集与评分脚本（评测侧）

日期：2026-10-04
交付人：宗（评测侧）

## 一、交付物

| 文件 | 说明 |
|---|---|
| `pairs/pairs.dev30.json` | 13 组公开开发配对清单（4 同事件 + 8 不同事件 + 1 证据不足），附预期与双侧出处哈希 |
| `score-pairs.mjs` | 评分脚本：自检 + 对 B 流程输出打分 |
| `build-pairs.mjs` | 可复现构建脚本（从 dev-30 与封存哈希重建清单） |
| `reference/b-report-20261004.json` | **魏 B 全量报告（本清单 13 组，含证据不足组）** — 严格评分依据 |
| `reference/b-report-excerpt-20261003.json` | 魏 B 报告摘录（12 组，含来源提交），用于 D7 回放演示 |
| `reference/score-result-20261004.json` | **13 组严格评分结果（PASS）** |
| `reference/score-result-excerpt.json` | 12 组摘录的评分结果 |

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

`--strict` 下，未出现在 B 报告中的配对计为失败；非 strict 下计为 `not_run`。魏已于 2026-10-04 用真实 B 引擎（含 `pledge-scan-degrade` 信封）跑本清单：`runs/D8-b-report-20261004.json`，`D8-PAIR-013` 判定为 `unknown`（`reasons: INSUFFICIENT_SIGNALS, MEMBER_NO_USABLE_FIELDS:pledge-scan-degrade`）。宗侧 `--strict` 复评结果：**13/13 PASS**。

## 八、v0.2 更正（方侧指出）

- **公告编号误标**：方指出科创新材 `002`/`003` 的 `2025-097` 出现在正文「前次权益变动报告书的披露情况」引用中，不是本文件编号。
  - 已核原文（`D5-EQC-002` 第16页 `d46bc2ef0_p016_b00010`；`D5-EQC-003` 第18页 `d173fee90_p018_b00008`）。
  - `build-pairs.mjs` 改为**只取文件首页（前 400 字）的公告编号**作为本文件编号；正文引用编号改记 `referenced_notice_numbers` 并加 `notice_note`。
  - 同时发现 `D5-EQC-009` 的 `2026-026` 实为《股东减持股份计划公告》引用，同类更正。
  - `D8-PAIR-003` 的 `relation_basis` 由「同为2025-097」更正为「同一次2026-09-23协议转让；2025-097为正文对前次报告的引用」。`expected_relation` 与成员不变。
- 清单版本升为 `financial-events-d8-pair-dev-v0.2`。

## 九、扩展集独立验证（方完整三态入口）

- 输入：方 `public_dev_D8/expanded_pairs_D8.json`（16 组 = 本包 13 组 + 魏方 3 组公开演示补料）。
- 引擎：方 `src_D8/run_public_D8.mjs` → `docs_D8/validation_D8/expanded_report_D8.json`。
- 宗侧评分：`node evaluation/D8/score-pairs.mjs --pairs <expanded_pairs> --report <expanded_report> --strict` → **16/16 PASS**（同事件 **6/6**、不同事件 **9/9**、证据不足 **1/1**）。
- 结果文件：`evaluation/D8/reference/score-result-fang-expanded.json`；另对 13 组开发集运行方引擎得 `score-result-fang-public.json`（13/13）。
- 口径声明：**组级三态判定归方模块**；`--matcher` 仅替换字段对齐，不接管组级判定与合计核验。

### 上游文件哈希（方 `交付清单_D8.json`）

| 文件 | sha256 |
|---|---|
| `public_dev_D8/expanded_pairs_D8.json` | `f40620854f813eea0c691c20be03161da1e8f2d38e3b17d7af39ec933e85717b` |
| `docs_D8/validation_D8/expanded_report_D8.json` | `7c50132960e715fa44c5a8e9c4099abf0251108a3ad638d95e25efb0ffc935ad` |
| `docs_D8/validation_D8/public_report_D8.json` | `669e34e3a04b3c98b6a5863aabfed3296ff9df8d8ffcd5f5aa9589bdd0903e11` |
| `docs_D8/公告编号核对_D8.md` | `9038af69a6a41d0e30e7331b80a5dbdb5e76dab1dc1c856d86b9…` |
