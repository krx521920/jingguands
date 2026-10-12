# 陈家浩 · D2 交接与待办（2026-09-28）

> 给拉库的队友/领导：本文说明页面侧（workspace/cjh/）今天做了什么、对你们的要求、以及接下来的待办。
> 页面工程入口：`workspace/cjh/page_prototype/`（零依赖，`node server.js` → http://127.0.0.1:8642）。

---

## 1. 今天（D2）页面侧完成的事

1. **契约对齐到 v0.3**（weiwenyu@00a472c）：`bid_won→award_contract`、分母四值枚举 `holder_shares/total_share_capital/net_assets/other`、字段级 6 状态、provenance 数组（region=PDF 点、左上原点、y 向下；table_id/cell_ref 表格出处）。页面契约与渲染全部同步。
2. **转接口**（`page_prototype/bridge/upstream_bridge.js`）：上游产物不用改格式即可进页面——
   - 魏的事件信封 v0.3：6 状态→徽章、provenance[]→多证据、unit 枚举→中文单位、分母直通；
   - 方的标准化记录 v0.1（`bridge:"fang-normalization-v0.1"`）：qualifier/scope/分母/百分点口径直通；
   - 未知格式：原样透传+留痕，不猜测。
3. **真实输出消费**：`data/wei_run_pledge.json` = 魏 `runs/20260928T061450-pledge-3506/events.json`（deepseek-chat 真实调用），页面下拉可选、自动过桥渲染。
4. **自测全过**：桥三路（wei/fang/mock）单测 + server 端到端冒烟。魏侧 `npm run jingguan:validate` 校验的是生产侧；页面消费侧以上述自测为准。

## 2. 给各队友的对接要求（页面需要什么）

**魏文宇**：
- ① 批量任务状态与失败隔离信号从哪个字段来（D6 批量页面要用）——v0.3 信封尚未覆盖，请补；
- ② `run_meta.model/duration_ms` 已透传展示，请保证真实 run 不缺；
- ③ v0.3 签署后请保持字段注册表稳定，破坏性变更提前半天在群里打招呼。

**张智博**：
- ① 需要一份**真实质押公告的 finstruct 解析 JSON**（与魏 D3 要的同源即可），页面用它验证 block_id/region/表格证据的真实渲染；
- ② 原文回跳需要每页 `width/height`（屏幕换算公式 region÷[page.w,page.h]×显示尺寸已在契约冻结）——请在 DocumentIR/parse_meta 里给出或说明获取方式；
- ③ 表格证据请按 v0.3 带 table_id/cell_ref，页面已支持展示。

**方轩诚**：
- ① 页面 `normalized` 显示口径=**百分点字符串**（"16.67"，不乘 100），与你的字典一致，无需动作；
- ② qualifier（约/不超过）、scope（单次/累计）页面已渲染——你的标准化记录若经 wei 信封走，请按你的状态映射 `present→extracted`，勿引入私有状态。

**宗博文**：
- ① 页面侧对 v0.3 两项裁决的确认：`award_contract` ✓、四值分母 ✓、6 状态文案 ✓（status.js 为页面单一事实源），签署表可勾"页面已对齐"；
- ② 你要重跑的对接检查若发现页面消费问题，直接在群里@我，附 events.json 样例。

**全员**：17:30 联调的统一演示样例仍未定——定了以后页面直接放 `data/` 即可出下拉。

## 3. 待办清单

**陈家浩（页面侧）**：
- [ ] D3（明天）：质押真实闭环页面 + JSON/CSV 导出；与魏/张修断链和错位
- [ ] demo/使用演示.md 补转接口一节（小事，随时）
- [ ] 等"提交"指令之外的每次变更继续遵守提交纪律
- [ ] D5（10-01）我轮值主持，09-30 晚备好合流议程

**阻塞中（等上游）**：
- [ ] 张的解析 JSON → bbox 真渲染 + 原文回跳（B2）
- [ ] 统一演示样例 → 17:30 联调（B3）
- [ ] 魏的批量状态字段 → D6 批量页面（B1 扩展）

## 4. 页面怎么跑（30 秒上手）

```bash
cd workspace/cjh/page_prototype
node server.js                     # http://127.0.0.1:8642
```

- 数据集下拉：`pledge`/`share_change`（D1 模拟）、`upstream_case`（方的口径用例过桥）、`wei_run_pledge`（魏 v0.3 真实 run，横幅显示"真实"）；
- 放任何魏的 `runs/**/events.json` 或方的标准化记录 JSON 进 `data/`，无需改代码即可在页面查看；
- 切真实接口：`DATA_SOURCE=remote REMOTE_API_URL=<上游> node server.js`。

## 5. 参照快照（只读，注明源）

| 文件 | 源 |
|---|---|
| `docs/_ref_fang_口径字典_v0.1.md` / `_ref_fang_换算用例_v0.1.md` | origin/feature/fang-rules@c856882 |
| `docs/_ref_wei_interface_README_v0.3.md` / `_ref_wei_event-envelope.schema_v0.3.json` / `_ref_wei_events_pledge_v0.3.json` | origin/weiwenyu@00a472c |

详细对齐记录见 `cjh_workspace_04_D2任务规划.md`；每日流水见 `cjh_workspace_02_临时.md`。
