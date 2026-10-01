/** D5 离线 JSON 文件入口；不调用模型、不覆盖输入。 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { checkEquityEnvelope } from "./equity_check_D5.ts";

const args = process.argv.slice(2);
const synthetic = args[0] === "--synthetic-test";
if (synthetic) args.shift();
if (args.length !== 1 || args[0]!.startsWith("--")) {
  process.stderr.write("用法：node src_D5/cli_D5.ts [--synthetic-test] <events.json>\n");
  process.exitCode = 2;
} else {
  try {
    const bytes = readFileSync(args[0]!);
    const input: unknown = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""));
    const started = new Date().toISOString();
    const result = checkEquityEnvelope(input, { evidenceMode: synthetic ? "synthetic_test" : "required" });
    const hash = (data: Buffer): string => createHash("sha256").update(data).digest("hex");
    const implementation = [new URL("./equity_check_D5.ts", import.meta.url), new URL("./cli_D5.ts", import.meta.url)];
    process.stdout.write(JSON.stringify({ ...result, execution: {
      started_at: started, node: process.version, input_sha256: hash(bytes),
      implementation_sha256: Object.fromEntries(implementation.map(url => [url.pathname.split("/").at(-1), hash(readFileSync(url))])),
    } }, null, 2) + "\n");
    // 0=所有适用检查通过；1=冲突/无效；2=执行失败；3=需复核或无适用事件。
    process.exitCode = result.status === "verified" ? 0 : ["mismatch", "invalid"].includes(result.status) ? 1 : 3;
  } catch (error) {
    process.stderr.write(JSON.stringify({ code: "EXECUTION_FAILED", message: error instanceof Error ? error.message : String(error) }) + "\n");
    process.exitCode = 2;
  }
}
