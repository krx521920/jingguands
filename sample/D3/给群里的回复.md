# 给群里的回复（D3）

> 本文件是可复制粘贴的成稿。分两类：**回魏文宇的验证反馈** 与 **回宗博文的 D3 接口答复**。

---

## 一、回魏文宇（关于他对 evidence/0.7 的认可与 source_type 闭环）

> 收到，谢谢。我独立复核了你的集成，三件事都对上了：
>
> ① 你说的 `质押数量 = r2c3` —— 我这边 `r2c3` 确实是 `2,100,000`，`header_path` 是「本次质押数量（股）」，对得上；
>
> ② 你 `4427d69` 那次运行，13 个字段的 `source_type` 分布是 **cell=11 / paragraph=1**，和你说的「cell×11」一致。每个质押字段的 `cell_ref` 都落到了具体单元格：
> ```
> pledgor                           r2c1    翟军
> pledgee                           r2c10   建德市新安小额贷款股份有限公司
> pledged_shares_this_time          r2c3    2,100,000
> pledged_shares_cumulative         r3c5    50,350,000
> pledged_ratio_this_time_of_held   r2c4    2.40%
> pledged_ratio_this_time_of_total  r2c5    0.99%
> pledged_ratio_cumulative_of_held  r3c6    57.58%
> pledged_ratio_cumulative_of_total r3c7    23.62%
> start_date                        r2c8    2026年09月23日
> end_date                          r2c9    申请解除质押登记日
> purpose                           r2c11   融资
> announcement_date                 段落     2026年09月25日
> ```
> `announcement_date` 正确地来自正文段落而不是表格，这个区分是对的；
>
> ③ 契约里新加的 `provenance.source_type` 我看了，你代码读的 `block.source_type` 就是我的字段名，命名一致、没有映射损耗。
>
> ### 但有一处枚举缺口要提醒你
>
> 你的 `source_type` 是 `[paragraph, cell, null]`，**我的结构允许 5 个值**：
> `paragraph / table / cell / scan_region / document`。
>
> 现在没暴雷是**巧合**：我在 D3 修掉 `cell_id` 跨表撞车之后，`table` 块从 8 个降到了 0。
> 但 **D2 那版就产出过 8 个** —— 例如 `d878ebffb_p002_b00004`，`degraded=true`，
> 内容是「股东名称 国寿成达（上海）健康产业股权投资中心（有限合伙）」。
>
> 而那个兜底分支**现在仍然活在代码里**：任何一份「表内有字符落在检出单元格之外」的公告都会再次触发它（多行表头 + 纵向合并时常见）。触发时你的校验器会**拒绝整个信封**，而不是只丢那一条出处。
>
> 建议补成 `[paragraph, table, cell, scan_region, document, null]`：
> - **`table`** = 表格内未能归入检出单元格的兜底块，**一定伴随 `degraded: true`**，消费方可以据此降权或跳过；
> - **`scan_region` / `document`** 是 D4 的 OCR 通道会用的，你提到的「待 D4 扩展」正好覆盖这两个。
>
> 这几个值的 `region` 语义与段落完全一致（同样是 `[left, top, right, bottom]` PDF 点、原点左上），不需要额外处理。
> 校验器如果只想放行 `paragraph/cell`，更稳的写法是**遇到未知值降级为警告**而不是硬失败 —— 这样解析侧新增取值不会打断你的流水线。

---

## 二、回宗博文（D3 接口答复；如果他在群里问）

> D3 的解析/出处包在 `sample/D3/`，结构版本 `evidence/0.7`：
>
> - **多层表头绑定**：`table_ref.header_path` 把多行表头逐级拼成完整列名。实测 `pledge-001` 第 1 页表 2 的「已质押股份情况」跨 2 列，其下两个子列分别得到
>   「已质押股份情况/已质押股份限售和冻结、标记数量（股）」与「已质押股份情况/占已质押股份比例（%）」——
>   不拼前缀就分不清它属于「已质押」还是「未质押」那一组。
> - **单元格级出处可核对**：`table_ref.cell_ref`（1 基网格位置，如 `r2c3`）+ `table_id`。你要的分层统计（段落 / 表格 / 单元格）靠 `source_type` 区分。
> - **跨页续表已标**：`pledge-001` 的股东名称被页边界切成两半（上页「山东省国际信托股份」+ 下页「有限公司－山东信托·传字6364号财富传承财产信托」），碎片单元格带 `table_ref.continues` 指回上页同列。**只取下半截当股东名称就是错值。**
> - **`sample/D2/` 已冻结**（`evidence/0.3`，228 块），可作你的基线；按 `schemas/archive/evidence.v0.3.json` 校验。
>
> 三份公告的区域重建一致率 127/127、61/61、75/75 全部 100%，回归 56 条全绿。
>
> 已知边界（诚实标注）：无框表格检不出；分栏只处理竖向栏缝；续表只打标不自动拼接；
> 双栏正例是合成 fixture（现有四份真实文档全是单栏，没有真实正例可用）。
