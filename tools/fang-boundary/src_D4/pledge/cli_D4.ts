import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkPledge } from "./checks_D4.ts";

const startedAt = new Date().toISOString();
const sha256 = (bytes: string | Buffer): string => createHash("sha256").update(bytes).digest("hex");
try {
  const args = process.argv.slice(2);
  const synthetic = args[0] === "--synthetic-test";
  const filename = args[synthetic ? 1 : 0];
  if (!filename || args.length !== (synthetic ? 2 : 1) || filename.startsWith("--")) {
    throw new Error("用法：npm run check -- [--synthetic-test] <input_D4.json>；默认检查真实来源引用");
  }
  const inputFile = resolve(filename);
  const bytes = readFileSync(inputFile);
  const parsed: unknown = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""));
  const inputs: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
  if (!inputs.length) throw new Error("输入数组不得为空");
  const evidenceMode = synthetic ? "synthetic_test" : "required";
  const results = inputs.map(input => ({ input, result: checkPledge(input, { evidenceMode }) }));
  const codeFiles = ["./cli_D4.ts", "./checks_D4.ts", "./pledge_arithmetic_D4.ts", "../normalization/normalization_D4.ts"];
  const output = {
    tool: "pledge_check_D4", version: "0.4.0", nodeVersion: process.version,
    startedAt, completedAt: new Date().toISOString(), evidenceMode,
    fileAccess: [{ action: "read", path: inputFile, sha256: sha256(bytes) }],
    codeSha256: Object.fromEntries(codeFiles.map(file => [file, sha256(readFileSync(new URL(file, import.meta.url)))])),
    sourceValidation: "仅检查来源引用完整性；没有读取原始公告，未认证其真实性或定位内容",
    results,
    summary: Object.fromEntries(["verified", "mismatch", "calculated", "needs_review", "invalid"].map(status => [status, results.filter(row => row.result.status === status).length])),
  };
  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
  process.exitCode = results.some(row => row.result.status === "invalid") ? 2 : 0;
} catch (error) {
  process.stderr.write(JSON.stringify({ tool: "pledge_check_D4", status: "error", startedAt, message: error instanceof Error ? error.message : String(error) }) + "\n");
  process.exitCode = 1;
}
