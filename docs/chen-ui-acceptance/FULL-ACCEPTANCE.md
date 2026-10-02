# 陈 UI 对比页 · 完整独立验收记录（实际运行页面＋真实信封）

- 验收人：魏文宇（结果 JSON 生产方 / 架构编排，代陈家浩完成独立验收）
- 日期：2026-10-02
- 被验分支：`feature/chen-ui` @ `7cc470e4`（`workspace/cjh/page_prototype`）
- 方式：独立 worktree 全新启动 `node server.js`（端口 8643），**浏览器实际运行**（可交互验收，非仅 API 层）；
  灌入魏文宇当日旗舰批次（437/437=100%）的 9 份真实 v0.3 信封作为数据集
- 复现：`data/acc_*.json` ← `runs/batch-20261002T115129|115030|115231/envelopes/`（D5-EQC-002/006/007/010、D6-AWD-002/009/010、D4-PLD-005/009）

## 一、证据联动 ✓

- 点击②区字段行"出质人 光线控股"的证据锚点 `ev-0002`
- ③区 25 张证据卡中**恰好** `ev-0002`（quote「股东名称」）获得 `.ev-item.active` 高亮（accent 边框＋阴影），其余 24 张不受影响
- 字段行内证据锚点带**单元格级定位**：`证据 ev-0003 · 表格#r14c3`；证据卡显示 `block: d97e2cfab_p002_b00035`、`表格 d97e2cfab_p002_t001#r14c3`、`bbox:有`

## 二、冲突提示 ✓（含反向用例）

**正例（干净数据零误报）**：D5-EQC-006（被动稀释：前后股数相等 249,519,764、比例 45.62%→44.89%、变动股数 0）——勾稽一致、方向一致，**无任何冲突提示**；同时验证：
- 方向徽章：`减持` 徽章渲染于 E01 事件头
- 前后并排：`股数 249,519,764 → 249,519,764`、`比例 45.62% → 44.89%` 箭头对比

**反例（注入三处矛盾的合成信封，见 conflict-synthetic-envelope.json）**：direction=decrease＋shares_after=300,000,000（后>前）＋change_shares=12,345（≠前后差 50,480,236），页面冲突提示**三条全部命中**：

> ⚠ 冲突提示：前后股数差 50,480,236 股 ≠ 变动股数 12,345 股；方向=减持 但 变动后股数 > 变动前股数；比例变动方向与股数变动方向相反（可能存在总股本变动），建议人工复核

截图：`conflict-prompt-screenshot.png`

## 三、导出一致性 ✓（页面＝API＝原始信封 三方比对）

- 导出按钮实现为直链 `/api/export?dataset=X&format=csv|json`——页面所见即导出所得（同一读取＋过桥路径）
- D5-EQC-006 导出 CSV 原始字节核验：
  - HTTP 200；**UTF-8 BOM 存在**（首字节 ef bb bf，Excel 兼容）
  - 10 行＝表头＋9 个 extracted 字段（holder/shares_before/shares_after/ratio_before/ratio_after/change_shares/method/change_date/direction）
  - 值与页面 DOM 展示、原始信封三方一致：`商晓波及其一致行动人`、`249519764 股`×2、`45.62`/`44.89`、`可转债转股被动稀释`、`2026-09-22/2026-09-23`
  - 出处列完整：evidence_id（ev-0003/0004）＋ block_id（d97e2cfab_p002_b00035）＋ `r14c3` 单元格引用

## 四、结论

**通过**。证据联动、冲突提示（含误报反向验证）、导出一致性三项全部实证通过；此前 API 层 9 项验收记录见 `docs/chen-ui-smoke-acceptance.md`。两份记录合并可作为宗博文 integration-status 中 chenjiahui 阻塞项（"Chen page smoke/acceptance test"）的完成证据。

## 备注

- 验收输入中的合成冲突信封已存 `conflict-synthetic-envelope.json`，可作为页面冲突提示的常驻回归用例（放入 `data/` 即成数据集）
- 本记录由魏文宇以自动化浏览器实际交互完成（点击/切换/抓取），过程可复现：worktree 起服务→拷贝信封→按上文步骤操作
