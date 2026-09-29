# 联调语料（从队友分支引入，注明出处）

- `zhangzhibo/`：张智博真实解析产出（来源分支 zhangzhibo@a439659）
  - `parse/*.parse.json`：evidence/0.2 解析结果（真实公告 PDF，块级出处）
  - `raw/*.pdf`：原始公告 PDF（pledge-001 为 D3 质押闭环首份真实文档）
- `zongbowen/`：宗博文 D2 评测资产（来源分支 zongbowen@7e6d0e7）
  - `dev/manifest.json`＋`dev/raw/`（6 份受控合成样例）＋`dev/gold/`（Gold 答案信封 v0.3）
  - `tests/standardization-format.test.mjs`（20 条标准化/格式测试，他侧 20/20）
- 受控合成样例（source_status=controlled_synthetic）不进封存测试、不计真实成绩（宗的 manifest 政策）。
