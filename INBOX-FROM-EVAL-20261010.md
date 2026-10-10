# 收件：评测侧交付通知（给张）· 2026-10-10

发件：宗（评测侧）｜**本 PR 只加这一个文件，未改你任何代码**。

## 一、快照正典：降级为提示（原要求已不阻塞）

魏的解析快照清单已改为 **sha 寻址**（内容即身份）：`evaluation/run-side/weiwenyu/D9/snapshot-paths.json`（34 条），我方复核 **31/31 命中**（30 按 `file_sha256` + 扫描降级件按 `parse_file_sha256` 例外）。
⇒ `parse-official` 搬不搬到你自己分支，**已不影响可核性**。你只需确认一句：`sample/D6/parse-official` 与 `corpus/zhangzhibo/d6/parse-official` 是否**逐字节一致**（不一致要说——否则页面与评测会各拿一份）。

## 二、仍挂着的一条：`parser_version`

现恒为 `finstruct.parse/0.9.0`，而页面 L3 明确写着"跨 parser 版本的块编号体系不同，版本不匹配的字段**一律不计入分母**"。也就是说：**不升版本，出处命中率的分母永远补不进来**（现在靠"未核"兜着）。
请给一条规则：**块切分规则变更即升版本号**（并说明历史产物如何标识）。

## 三、件在哪

最终交付包：**`delivery/v2.0`**（含 `evaluation/run-side/weiwenyu/D9/snapshot-paths.json` 与 `parses-blocks/`）。
取件：`git fetch origin delivery/v2.0`，然后看 `evaluation/run-side/weiwenyu/D9/parses-blocks/README.md` 与 `docs/d13-reproduction.md`。