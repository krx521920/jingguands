"use strict";
/**
 * D12评审 C2 配套：evaluation/ 路径解析助手
 *
 * 背景：`evaluation/` 是**评测侧（宗博文）负责的目录**。D12 评审要求把它从我的分支移除，
 *   理由是"你的是快照、会过期；将来有人引用会读到作废的 gold / 旧锚点用例"。
 *   本模块把这件事显式化：
 *     - evaluation/ 不再入库（见仓库根 .gitignore 与 D12_评审整改说明.md）
 *     - 依赖它的只读脚本统一走本模块，缺失时**抛出可执行的报错**，绝不静默0 命中
 *     - 本地文件保留不动（本地开发库不变），只在 git 索引层面移除
 *
 * 为什么必须显式报错：此前踩过两次同类坑——
 *   ① 退级少一级 → 路径指向 workspace/ →静默 0 命中，被误读成"Gold 缺失"；
 *   ② `parity()` 空跑判pass → "没跑成"被算成"跑成了且一致"（与 D10 造假同款）。
 *   路径找不到时静默继续，等于把"没数据"伪装成"有结论"。
 *
 * 用法：
 *   const ev = require("./_evals_paths.js");
 *   const gold = ev.goldDirs();            // string[]，缺失即抛
 *   ev.envDir();                           // 重测输入信封目录
 *   ev.tryGoldDirs();                      // 不抛，返回存在的目录（用于可选依赖）
 */

const fs = require("fs");
const path = require("path");

// demo/_evals_paths.js → demo → page_prototype → cjh → workspace → jingguands（退四级）
const REPO = path.resolve(__dirname, "..", "..", "..", "..");
const EV = path.join(REPO, "evaluation");

/** 本地检出副本（不入库）的信封目录，重测脚本的优先输入 */
const LOCAL_ENVELOPES = path.join(REPO, "workspace", "cjh", "page_prototype", "data_unified");

/** 生成"如何修复"的可执行提示——错误信息必须告诉人下一步做什么 */
function howToFetch(what) {
  return [
    "",
    "─".repeat(72),
    `evaluation/ 不在本仓库：它是评测侧（宗博文）负责的目录，D12 评审 C2 要求不得在个人分支夹带副本。`,
    `当前缺失：${what}`,
    "",
    "本机只读检出（不入库、不会被他人引用为权威数据）：",
    "  git fetch --depth=1 --filter=blob:none origin zongbowen",
    "  Z=$(head -1 .git/FETCH_HEAD | cut -f1)",
    "  git show $Z:evaluation/... > <目标路径>",
    "",
    "权威副本始终在宗分支与合流后的 develop 上；本脚本只做只读对账，不写入 evaluation/。",
    "─".repeat(72)
  ].join("\n");
}

function requireDir(p, what) {
  if (!fs.existsSync(p)) {
    const err = new Error(`缺少评测侧目录：${what}\n  期望路径：${p}${howToFetch(what)}`);
    err.code = "EVALS_MISSING";
    throw err;
  }
  return p;
}

/** Gold 标准答案目录（D4/D5/D6）。缺任一即抛，不静默降级。 */
function goldDirs() {
  return ["D4", "D5", "D6"].map(d => {
    const p = path.join(EV, d, "dev", "gold");
    return requireDir(p, `evaluation/${d}/dev/gold/`);
  });
}

/** 可选 Gold 目录：只返回存在的那些（用于"部分数据集有 Gold"的宽松统计场景） */
function tryGoldDirs() {
  return ["D4", "D5", "D6"]
    .map(d => path.join(EV, d, "dev", "gold"))
    .filter(p => fs.existsSync(p));
}

/**
 * 重测输入信封目录。优先仓库内 `evaluation/D11/firsttest-envelopes/`（合流后），
 * 回退到本地只读检出 `data_unified/`。两者都没有则抛。
 */
function envDir() {
  const inRepo = path.join(EV, "D11", "firsttest-envelopes");
  if (fs.existsSync(inRepo)) return inRepo;
  if (fs.existsSync(LOCAL_ENVELOPES)) return LOCAL_ENVELOPES;
  const err = new Error(
    "找不到重测输入信封目录。" + howToFetch("evaluation/D11/firsttest-envelopes/（或本地 data_unified/）")
  );
  err.code = "ENVELOPES_MISSING";
  throw err;
}

/** 封存集目录（宗保管）。只在需要诊断封存集时调用。 */
function sealedDir(...sub) {
  return requireDir(path.join(EV, "sealed", ...sub), "evaluation/sealed/" + sub.join("/"));
}

module.exports = { REPO, EV, LOCAL_ENVELOPES, goldDirs, tryGoldDirs, envDir, sealedDir, howToFetch };