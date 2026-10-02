# 陈 UI 对比页 · 独立运行验收记录（smoke / acceptance）

- 验收人：魏文宇（结果 JSON 生产方 / 架构编排）
- 日期：2026-10-02
- 被验分支：`feature/chen-ui` @ `7cc470e4`（`workspace/cjh/page_prototype`）
- 方式：独立 worktree 全新启动（非开发者本机环境），`node server.js`，默认端口 8642，mock 模式

## 结论：**通过**（可解除 integration-status 中 chenjiahui 的 blocking 项）

## 验收项与结果

| # | 验收项 | 结果 |
|---|---|---|
| 1 | 服务冷启动（node>=22，零依赖安装） | ✓ `node server.js` 直接起，无 npm install |
| 2 | 首页加载 | ✓ `GET /` → HTTP 200 |
| 3 | `GET /api/datasets` | ✓ 正确列举 11 个数据集（含 5 个 wei_real_* 真实信封数据集） |
| 4 | mock 数据集渲染 | ✓ pledge/share_change/bank_guarantee 正常出结构 |
| 5 | **真实 v0.3 信封过桥（本次重点）** | ✓ 双批次信封（D5-EQC-002/006/007、D6-AWD-002/009）事件数全部正确（3/1/1/4/3，与 gold 一致），零转换错误 |
| 6 | 完整性检查 contract.integrity | ✓ 5 份真实信封 `integrity.ok=true`、error=0（断链/evidence_id 悬空/cell 缺 table_id 三类红线全过） |
| 7 | 聚合主体渲染 | ✓ `商晓波及其一致行动人`、`红豆集团有限公司及其一致行动人` 原样呈现 |
| 8 | **单元格级出处保真** | ✓ evidence 携带 `table_id=d97e2cfab_p001_t001`、`cell_ref=r2c2`（v0.3 表格证据不丢失） |
| 9 | `GET /api/export?format=csv` | ✓ UTF-8 BOM（Excel 兼容）、18 列含 table_id/cell_ref/source_type/quote、聚合主体名与生效日期（2026-09-29）字节级正确 |

## 复现步骤

```bash
git worktree add ../cjh-ui origin/feature/chen-ui
cd ../cjh-ui/workspace/cjh/page_prototype
# 把 weiwenyu 分支 runs/batch-*/envelopes/*.json 拷入 data/ 即可作为数据集
node server.js   # → http://127.0.0.1:8642
curl -s "http://127.0.0.1:8642/api/result?dataset=<名称>"   # 看 integrity.ok
curl -s "http://127.0.0.1:8642/api/export?dataset=<名称>&format=csv"
```

## 备注

- 本次为 API/数据契约层验收（页面契约 docs/API.md v0.3 全项核对）；浏览器内交互（上传/切换数据集 UI 操作）建议陈本人或演示环节再走一遍录屏。
- 宗博文 `evaluation/D5/evidence/integration-status.json` 中 required_before_completion 的 "Chen page smoke/acceptance test" 一项，本记录可作为完成证据；"Second-person review record" 仍需团队排一人复核签字。
