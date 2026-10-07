// 假 CLI：模拟魏文宇将来提供的抽取入口（stdout 输出信封 JSON，exit=0）。
// 用途只有一个——证明页面侧的 CLI 通道是活的，不是空壳。
// 真实实现由魏提供；页面侧契约见 bridge/extractor.js 的 cliProvider 注释。
"use strict";
const fs = require("fs");
const path = require("path");

const caseId = process.env.CASE_ID;
const pdf = process.env.PDF_PATH;
if (!caseId) { process.stderr.write("CASE_ID 未设\n"); process.exit(2); }
if (!pdf || !fs.existsSync(pdf)) { process.stderr.write("PDF 不存在: " + pdf + "\n"); process.exit(3); }

// 假实现：读本地同名信封当作"抽取结果"（仅用于打通链路验证，不得作为成绩）
const stub = path.resolve(__dirname, "..", "data", caseId + ".json");
if (!fs.existsSync(stub)) { process.stderr.write(`无 ${caseId}.json\n`); process.exit(4); }
process.stdout.write(fs.readFileSync(stub, "utf8"));
process.exit(0);
