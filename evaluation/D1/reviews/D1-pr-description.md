# D1 评测基线

## 内容

- 冻结标注规范与计分分母 v0.1。
- 增加质押、股权变动、中标合同三类公开开发样例。
- 增加三份 Gold 答案和字段级证据。
- 增加 Evidence 与答案 Schema。
- 增加字段评分模板和 D1 自动校验。

## 数据来源

- 萬集科技：https://static.cninfo.com.cn/finalpage/2026-09-25/1225582749.PDF
- 诺唯赞：https://static.cninfo.com.cn/finalpage/2026-09-25/1225581464.PDF
- 华康洁净：https://static.cninfo.com.cn/finalpage/2026-09-24/1225582697.PDF

## 验证

运行：

```sh
node evaluation/D1/tests/validate-d1.mjs
```

当前结果：PASS，3个样例、38个字段、36条有效证据。

## 待办

- 第二人复核。
- 魏、张、方、陈确认接口。
- 确认后冻结 D1-v0.1，再进入 D2。
