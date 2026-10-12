#!/usr/bin/env node
// report-header.mjs —— 报告口径头（评测侧，2026-10-11）
//
// 为什么要它：同一件事在不同批次/版本下会给出不同数（实例：缓存重放 **31/31 逐字节**（D12 时点）
//   vs **28/31＋4 处翻正、值层 31/31**（施加 D17 不变量后））。两个数都对，**差在批次与 code_version**。
//   凡是引用"一致率/通过率/命中率"的报告，头部必须能读到这四项，否则不许引用数字。
//
// 用法：node evaluation/2026-10-11-handoff/report-header.mjs --batch <批ID> --code-version <码版本> --anchor <输入锚点> [--caliber <口径说明>]
"use strict";
const argv=process.argv.slice(2); const arg=(k,d)=>{const i=argv.indexOf(k);return i>=0?argv[i+1]:d;};
const batch=arg("--batch","（未填）"), code=arg("--code-version","（未填）"), anchor=arg("--anchor","（未填）"),
      caliber=arg("--caliber","（未填：本次口径/分母说明）"), date=new Date().toISOString().slice(0,10);
console.log(`> **报告口径头**（引用任何比率前必读）
> 批次 id：${batch}　|　code_version：${code}　|　输入锚点：${anchor}
> 生成日期：${date}　|　口径与分母：${caliber}
> 提示：批次或码版本不同的两个数**不可并列比较**；跨版本对照必须写明"测于 <批次>/<码版本>"。`);