# D14 时效门自检记录（负向 + 正向对照）

维护：宗（评测侧）｜2026-10-10

一个新门如果只会说"PASS"，它等于没有。`check-page-copies.mjs` 用三组实测证明它会响、也会停：

| # | 场景 | 命令 | 预期 | 实测 |
|---|---|---|---|---|
| 1 | **现状**（集成包为旧构建 + 有权威数据） | `node evaluation/D14/check-page-copies.mjs --page <页面>` | FAIL，只报集成包一项 | ✅ FAIL，`gate_fail=1`，仅 `workspace/cjh/page_prototype/data/d10/integration_bundle.json` STALE，权威批次 `docs=31/31 anchor_ok=true` |
| 2 | **clone 现状**（再把 `data_unified/` 移走） | 同上 | FAIL，多报一项（批次缺失） | ✅ FAIL，`gate_fail=2`，`data_unified/ STALE docs=0/31` |
| 3 | **正向对照**（把集成包换成 `7939e399…`） | 同上 | PASS | ✅ PASS，`gate_fail=0`，8 项全 MATCH |

留痕：`page-copies-result-with-data-20261010.json`、`page-copies-result-no-data-20261010.json`、`page-copies-result-fixed-20261010.json`。

三条场景都是在**同一台机器、同一份页面副本**上跑出来的，唯一被改的是被检查的文件——所以结论只能来自字节，不可能来自"看起来像新版"。