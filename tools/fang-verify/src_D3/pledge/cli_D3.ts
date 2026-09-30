/** 离线 CLI：一个 JSON 对象或对象数组输入，stdout 为结果与运行记录。 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { verifyPledge } from "./pledge_D3.ts";

const sha256 = (bytes: string | Buffer): string => createHash("sha256").update(bytes).digest("hex");
const startedAt = new Date().toISOString();
try {
  if (process.argv.length !== 3) throw new Error("用法：node src_D3/pledge/cli_D3.ts <input_D3.json>");
  const inputFile = resolve(process.argv[2]!);
  const bytes = readFileSync(inputFile);
  const parsed: unknown = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""));
  const inputs: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
  if (!inputs.length) throw new Error("输入数组不得为空");
  const codeFiles = ["./cli_D3.ts", "./pledge_D3.ts", "../normalization/normalization_D3.ts"];
  const codeSha256 = Object.fromEntries(codeFiles.map(file => [file, sha256(readFileSync(new URL(file, import.meta.url)))]));
  const results = inputs.map(input => ({ input, result: verifyPledge(input) }));
  const envelope = {
    tool: "pledge_verify_D3", version: "0.3.0", nodeVersion: process.version,
    startedAt, completedAt: new Date().toISOString(),
    fileAccess: [{ action: "read", path: inputFile, sha256: sha256(bytes) }], codeSha256,
    sourceValidation: "未读取公告文件；字段出处仅透传，不代表已核验哈希或页面内容",
    results,
    summary: Object.fromEntries(["verified", "mismatch", "calculated", "needs_review", "invalid"].map(status => [status, results.filter(row => row.result.status === status).length])),
  };
  process.stdout.write(JSON.stringify(envelope, null, 2) + "\n");
  process.exitCode = results.some(row => row.result.status === "invalid") ? 2 : 0;
} catch (error) {
  process.stderr.write(JSON.stringify({ tool: "pledge_verify_D3", status: "error", startedAt, message: error instanceof Error ? error.message : String(error) }) + "\n");
  process.exitCode = 1;
}
