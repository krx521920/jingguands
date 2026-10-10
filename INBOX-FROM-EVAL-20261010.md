# 收件：评测侧交付通知（给陈）· 2026-10-10

发件：宗（评测侧）｜**本 PR 只加这一个文件，未改你任何代码**；看完可直接关掉或合并。

## 一、件在哪（一个分支就够）

最终交付包在 **`delivery/v2.0`**（含评测正典＋运行侧证据），你的 7 步收口清单全文在：
`evaluation/2026-10-10-final-delivery/给陈-收口清单-最后催办版-20261010.md`

取件示例：`git fetch origin delivery/v2.0 && git show origin/delivery/v2.0:evaluation/2026-10-10-final-delivery/给陈-收口清单-最后催办版-20261010.md`

## 二、7 步速览（每步带验收命令）

1. **权威数据入库**：31 份权威信封放 `data_unified/`（取 `delivery/v2.0:evaluation/D11/firsttest-envelopes/`）。验收：clone 后只跑 `node server.js` → `/api/metrics` 的 `anchor.matches=true`、`fields_total=606`。
2. **刷新 d10 两件 + 改读法**：`integration_bundle.json` → `7939e399dd54…`；`integration_cases.json` → `40d9e267179f…`；关系判定**改读 `expected_relation`**，删掉关键词映射。验收：`node evaluation/D10/check-relation.mjs --bundle <你的 bundle>` → PASS 10/10。
3. **物化解析快照**（性价比最高）：清单 `delivery/v2.0:evaluation/run-side/weiwenyu/D9/snapshot-paths.json`（34 条，join 键＝信封 `source.file_sha256`；扫描件按 `parse_file_sha256` 例外），**按 sha 取件、逐份核 sha**。验收：`node evaluation/D18/check-snapshot-coverage.mjs --materialized <目录> --exclude DEMO-EQC-HL-0930` → 31/31、451/451（你现在只有 1 份/39 条）。
4. **标准化收口**：卡片拆「标准化覆盖率（229/229，不挂目标）」＋「标准化正确率（229/229，98% 目标挂这里）」；注册表换主口径；`text` 字段不显示标准化状态。验收：`node evaluation/D15/check-metrics-caliber.mjs --base http://127.0.0.1:8642` → 标准化那条转 PASS。
5. **上传闸门接契约校验**：缺 `run_id`/`is_mock`/`source`/`run_meta` 不能判 `ok:true`。
6. **小项一次清**：无参 `/api/result` 返 mock→400；数据集名大小写归一；parity 快照重跑或标注；导出补 `extraction_engine`；上传件保留原名大小写。
7. **README／材料**：写明"现场导入只收 `.json` 信封"；材料里**当众报展示层提交号**（现 `e7bec616`，与封版不同源就写"独立快照"）。

## 三、我这边现状（供你判断优先级）

页面仍停在 `e7bec616`（10-09 12:17），封版是 `weiwenyu@41d57c87`(10-10) → **展示与源码不同版**；三道机器门现状：副本时效 FAIL 2、口径对账 FAIL 7、关系层 FAIL 1（跑权威包 PASS 10/10）。做完 1–4 这四道门应转绿。

## 四、做完怎么回我

把那四条验收命令的输出贴回来即可；我复核后更新留痕，并把展示层状态从"未收口"改成"已收口"。