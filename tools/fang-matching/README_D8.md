# 方轩诚 D8：对齐规则＋关联解释

本包为 **D8.2 当前交付版**，替代此前仅有规则的 D8.1 包。交付保持本地，未推送 GitHub。

## 从这里开始

- [对齐规则与接口_D8.md](docs_D8/对齐规则与接口_D8.md)：三态规则、`--matcher` 接法与完整入口。
- [关联解释_D8.md](docs_D8/关联解释_D8.md)：宗方13组、魏方3组补充样本及2组粒度挑战的逐对判定与双侧出处。
- [兼容性与交接_D8.md](docs_D8/兼容性与交接_D8.md)：队友提交版本、实际验证结果、尚待团队确认的边界。
- [公开开发集说明_D8.md](public_dev_D8/公开开发集说明_D8.md)：原13组原样保留，补充集单列，不用合成数据凑真实样本。

## 本地运行（Node.js 24，零第三方运行依赖）

在本文件所在文件夹打开 PowerShell：

```powershell
node --test tests_D8/rules.test_D8.mjs tests_D8/latest.test_D8.mjs
node src_D8/run_public_D8.mjs --out docs_D8/validation_D8/public_report_D8.json
node peer_reference_D8/score-pairs_D8.mjs --pairs public_dev_D8/pairs.dev30_D8.json --report docs_D8/validation_D8/public_report_D8.json --strict
node src_D8/run_public_D8.mjs --manifest public_dev_D8/expanded_pairs_D8.json --out docs_D8/validation_D8/expanded_report_D8.json
node tests_D8/compatibility_latest_D8.mjs
```

现有结果：**89项测试通过；宗方公开集13/13；魏方补充严格集3/3；合并公开集16/16**。两组粒度挑战保留未知。原30份公开文档全组合435对：4 related、407 unrelated、24 unknown；只有清单中的配对有公开期望，其余回放用于兼容性检查，不能称为准确率。

完整三态入口输出关联和解释，不执行金额、比例或群体合计比较。魏方旧 `--matcher` 入口也已实际加载通过，但其旧组级判定/合计逻辑仍归魏方引擎控制，详见接口文档。

公开样例使用附带的**逐文件原文身份标注**（签约日期、转让双方、文档主体），运行时校验文件SHA和解析块。它不是配对答案表，也不是A模型自动抽取字段；新文件缺少相应身份依据时返回未知。标注已做机器核验，尚待队友独立语义复核。

`peer_reference_D8` 为对应提交的只读接口快照，内容字节未改，仅文件名加 `_D8`。A 信封、宗方原清单和张方索引内容均未改；参考快照与来源 SHA 见 [来源清单_D8.json](来源清单_D8.json)。
