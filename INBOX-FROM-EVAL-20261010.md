# 收件：评测侧交付通知（给魏）· 2026-10-10

发件：宗（评测侧）｜**本 PR 只加这一个文件，未改你任何代码**；看完可直接关掉或合并。

## 一、裁决 A 已落地（并包完成）

最终包分支 **`delivery/v2.0`**，父提交＝你的 `41d57c87`。**交付提交 SHA 以分支头为准**（重建过一次，前一版 `a3c4ba5d` 作废；当前头见 `git rev-parse origin/delivery/v2.0`）。
内容：基底＝你的封版树（`scripts/`376、`corpus/`186、`docs/`600、`interface/`6、`tools/`186、`runs/`1966，**16273/16273 逐字节未动**）＋ `evaluation/`＝评测正典 460 ＋ 你的运行侧证据 217（并入 `evaluation/run-side/weiwenyu/`，**直接复用原 blob sha**）＋ `DELIVERY-README.md`。

## 二、你要做三件

1. **按迁移清单改路径**（**不止一个文件**）：`delivery/v2.0:evaluation/2026-10-10-final-delivery/给魏-路径迁移清单-20261010.md`——我扫出 **14 个文件**引用旧路径，其中 **3 个脚本必须改**：
   - `scripts/jingguan/check_provenance_e1.mjs`（L20 输出、L30 输入、L92/L98 自述、L7 注释）→ 新址 `evaluation/run-side/weiwenyu/D9/…`；**注意：不改的话它会往我的正典目录 `evaluation/D9/` 里写文件**；
   - `scripts/jingguan/emit_block_parses.mjs` L23 `OUT_DIR`；
   - `scripts/jingguan/serve_extract.mjs` L36 `DEFAULT_CACHE`。
   另 7 处文档命令示例建议改，4 处历史记录自述路径**建议保留**（附理由与逐行表）。
   自证：`grep -rn "evaluation/\(D9\|D11\|D12\)/" scripts/ docs/ | grep -v run-side || echo 无残留`
2. **干净克隆终验**：17 道门 ＋ 无密钥重放 31/31。
3. **打标签**：在 `delivery/v2.0` 的分支头上打 `v2.0-delivery`（`v1.0-d14-release`／`v1.1-final` 保留，不重指）。

## 三、有两件事你确认一下

1. **D17 修复我方已采信**：我抽读 `run_extract.mjs` 见 `repairs` 机制，`D12-A` 冻结信封未改 ⇒ 我 `check-standardized` 的 **229/229 复算不受影响**（该门现只对"再生成"路径生效）；
2. **你的 scripts/corpus/docs 三目录齐全**（数字见上），不需要你补任何东西。

## 四、顺带提醒（演示侧）

计划书 PDF 与 MP4 在**所有分支都搜不到**；展示层仍停在 `e7bec616`（与封版不同源）。这两条我记在 `evaluation/2026-10-10-final-delivery/未达标与未解决项-20261010.md`，材料里要如实写。