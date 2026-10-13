# 回复魏：sample 分支已推 ＋ 两处核对结果

> 回复人：张智博　日期：2026-10-12
> 对应：宗转达的「sample 分支 404，重推」＋「三项验证」＋「tag 41f15d31」

---

## 一、sample 分支：已推上 ✅

**根因不是推送失败，是那个分支名从来不存在。** 我一直在往 `zhangzhibo` 推，
`sample` 只是我一个**目录名**（`sample/D3|D4|D5|D6|D8…`），不是一个分支。

现在已经建好并推送：

```
sample  →  542634f6   （暂指向 zhangzhibo 的 HEAD）
```

**内容（已核）**：

| 路径 | 文件数 |
| --- | ---: |
| `sample/`（D3/D4/D5/D6/D8/D9/D10/D11/D12/D13/D14 交付物） | 见下 |
| `src/finstruct/parse` | 9 |
| `tools`（含 `demo_degrade.py`、`check_evidence_chain.py`、`reanchor_provenance.py`） | 12 |
| `tests/fixtures` | 10 |
| `schemas` | 3 |

**说明**：`sample` 是 `zhangzhibo` HEAD 的**同一棵树**。若你们要的是"只放样例的干净分支"，
告诉我，我另建一个只含 `sample/` 的分支 —— 现在这个含全部源码与回归。

---

## 二、你给的三项验证，我这边对应物如下

**请先看这个区分：有些是**我的**，有些不是。**

| # | 你要验的 | 我的分支里有吗 | 对应物 |
| --- | --- | :---: | --- |
| ① | **两个信封**过 v0.3 契约校验器 | **❓不确定** | 我全库搜「两个信封」只命中 1 个文件；**我不清楚你指哪两个** |
| ② | **degrade-demo** 对照 `pledge-scan-degrade` | ✅ | `tools/demo_degrade.py`（名字里没有连字符，所以按 `degrade-demo` 搜不到） |
| ③ | **dual-channel** 的 6 个 extracted 字段验出处锚点 | ❌ | **全库搜 `dual-channel` / `dual_channel` / `dualchannel` 命中 0** |

**③ 不是我的产物。** 我搜了自己整棵树，没有 `dual-channel` 这个东西。
**若它指陈页面的某个视图或你自己的某个产物，请指明来源分支** —— 我不猜，也不冒领。

**② 的配套凭证**（你要的「可回锚才算数」正是我 D9 交付的口径）：

| 文件 | 内容 |
| --- | --- |
| `sample/D9/bilateral_evidence.json` | 20 用例 / 35 侧，每侧 `block_id`/`page`/`region`/`quote` ＋ `evidence_status` |
| `sample/D11/d6_side_verification.json` | **8 侧逐条命中**，含 `parse_sha256`、`cell_ref` |
| `sample/D6/parse-official/manifest.sha256` | D6 十份逐文件哈希 |

**注意**：`sample/D11/d6_side_verification.json` 里我记了
`quote_in_block_raw` 与 `quote_in_block_ws_normalized` 两个字段 ——
**前者才算"可回锚"**，后者只是去空白后能匹配。别把这两个混了。

---

## 三、tag 核对：你给的 sha 与当前分支 head **已不一致**

你说「tag 已落 `41f15d31`（= `delivery/v2.0.3` head）」。我核了远端：

| 项 | 值 |
| --- | --- |
| `41f15d31` | = **`refs/tags/v2.0-delivery`**，「delivery(v2.0.3): complete union - page + evaluator」（**10-12 12:56**） |
| `delivery/v2.0.3` **当前 head** | **`8e75ea46`**，「delivery(v2.0.3 rev2): swap in chen's re-recorded …」（**10-12 13:18**） |

**分支在打 tag 之后又前进了一次（rev2）。**

**所以「`41f15d31` = `delivery/v2.0.3` head」这句话现在不成立** ——
tag 是完整的封版点，分支 head 已经越过它。请确认：

- **要核的是 tag `41f15d31`**（那我按这个 sha 核）→ 我按这个执行
- **还是要核 `8e75ea46`（rev2）**？若是，**是否需要补打 tag**，否则"tag = head"的对齐会失真

**我按你的回话执行，不自行选一个。**

---

## 四、关于「扫描件仅降级」的边界表述

你说若 `dual-channel` 进材料，你来同步给改法 —— 收到，**等你给**。

同时提醒一句（这条我已登记在 `src/finstruct/docs/解析能力边界表.md`）：

> **扫描件只降级、不识别。`scan_region` 的 `text_raw` 为空是设计如此**
> —— 它断言"这块读不出字"，因此**不能作为 `provenance.quote` 的来源**。

若 `dual-channel` 真的能从扫描件里取出字段，**那说明它不是靠 `scan_region` 取的**，
可能走了别的通道（OCR？外包服务？）。**那种情况下"仅降级"这句就要改，
而且新通道必须单独报分母** —— 否则会把 OCR 的命中混进解析的命中率里。

---

## 五、我这边其余状态

- `zhangzhibo` = `542634f6`，远端同步
- `sample` = `542634f6`，**新推**
- 回归 **89 条全绿**
- 挂我名的两条未达标项（宗 D14 清单 #9/#10）均已处理
