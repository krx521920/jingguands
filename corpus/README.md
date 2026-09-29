# 联调语料（从队友分支引入，注明出处）

- `zhangzhibo/`：张智博真实解析产出（来源分支 zhangzhibo@a439659）
  - `parse/*.parse.json`：evidence/0.2 解析结果（真实公告 PDF，块级出处）
  - `d3/`：张智博 D3 交付（zhangzhibo@e6b8f7e，evidence/0.7）——同批公告重解析，
    表格单元格为独立块（带 table_ref.cell_ref 与多层表头 header_path），跨页续表与分栏就绪
  - 原始 PDF 不入库（团队规则：不二次分发公开披露文件）——URL＋sha256 见 d3/manifest.json，按需用张的 fetch_samples.py 取回
- `zongbowen/`：宗博文 D2 评测资产（来源分支 zongbowen@7e6d0e7）
  - `dev/manifest.json`＋`dev/raw/`（6 份受控合成样例）＋`dev/gold/`（Gold 答案信封 v0.3）
  - `tests/standardization-format.test.mjs`（20 条标准化/格式测试，他侧 20/20）
- 受控合成样例（source_status=controlled_synthetic）不进封存测试、不计真实成绩（宗的 manifest 政策）。
