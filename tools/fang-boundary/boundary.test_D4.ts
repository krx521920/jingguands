import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { checkPledge, verifyPledge, type CheckOptions, type PledgeInput } from "../checks_D4.ts";
import { verifyPledge as d3 } from "../pledge_arithmetic_D4.ts";
import { normalize } from "../../normalization/normalization_D4.ts";

type BoundaryCase = {
  id: string; input: PledgeInput; options: CheckOptions; expectedStatus: string;
  expectedCodes: string[]; forbiddenCodes: string[]; expected: Record<string, unknown>;
};
const root = new URL("../../../", import.meta.url);
const read = (name: string): unknown => JSON.parse(readFileSync(new URL(`tests_D4/fixtures/${name}`, root), "utf8"));
const cases = read("boundary_cases_D4.json") as BoundaryCase[];
function partial(actual: unknown, expected: unknown): void {
  if (expected !== null && typeof expected === "object" && !Array.isArray(expected)) {
    assert.ok(actual !== null && typeof actual === "object");
    for (const [key, value] of Object.entries(expected)) partial((actual as Record<string, unknown>)[key], value);
  } else assert.deepEqual(actual, expected);
}
assert.equal(cases.length, 50);
for (const example of cases) {
  test(`D4 边界 ${example.id}`, () => {
    const original = JSON.stringify(example.input);
    const result = checkPledge(example.input, example.options);
    assert.equal(result.status, example.expectedStatus);
    const codes = result.reasons.map(reason => reason.code);
    for (const code of example.expectedCodes) assert.ok(codes.includes(code), `${example.id}: missing ${code}; got ${codes}`);
    for (const code of example.forbiddenCodes) assert.ok(!codes.includes(code), `禁止误报 ${code}`);
    partial(result, example.expected);
    if (!result.audit.prerequisitesMet) {
      assert.equal(result.calculation, null, "依据不齐不得生成计算值或区间");
      assert.equal(result.comparison, null, "依据不齐不得比较数值");
      assert.ok(["invalid", "needs_review"].includes(result.status));
    }
    assert.equal(result.audit.sourceContentsVerified, false, "引用检查不等于原文已核验");
    assert.equal(JSON.stringify(example.input), original, "不改写原始字段、缺失状态或出处");
    assert.doesNotThrow(() => JSON.stringify(result));
  });
}

test("D4 公开入口接受全部53条D3输入，仅明确收紧或修正既有语义", async () => {
  const old = read("pledge_regression_D4.json") as { id: string; input: PledgeInput }[];
  assert.equal(old.length, 53);
  for (const row of old) {
    const previous = d3(row.input);
    const next = checkPledge(row.input, { evidenceMode: "synthetic_test" });
    // D3 的比例未知分母被归为 invalid；D4 保留数值并明确归入 needs_review。
    assert.equal(next.status, row.id.startsWith("43_") ? "needs_review" : previous.status, row.id);
    if (["verified", "calculated", "mismatch"].includes(previous.status)) {
      assert.deepEqual(next.calculation, previous.calculation, row.id);
      assert.deepEqual(next.comparison, previous.comparison, row.id);
      assert.deepEqual(next.normalized, previous.normalized, row.id);
    }
  }
  assert.equal(verifyPledge, checkPledge, "兼容函数名也必须经过D4依据检查");
  const api = await import("finance-agent-pledge-checks-d4");
  assert.equal(api.verifyPledge, checkPledge, "package exports 必须指向公开安全入口");
  const typedResult: import("../checks_D4.ts").PledgeResult = api.verifyPledge(old[0]!.input);
  assert.equal(typedResult.status, "needs_review", "兼容名字不能绕过默认来源检查");
});

test("D2 normalize默认仍拒绝有值比例缺分母，D4只开放保留标准值", () => {
  const fact = structuredClone(cases[1]!.input.ratio!.measure);
  fact.denominator = null;
  assert.throws(() => normalize(fact), /denominator/);
  assert.equal(normalize(fact, { allowUnknownRatioDenominator: true }).value, "20");
  assert.equal(normalize(fact, { allowUnknownRatioDenominator: true }).denominator, null);
});

test("缺依据的任意数值扰动都不能触发关系计算", () => {
  for (const amount of ["0", "1", "5000000", "9007199254740993"]) {
    for (const path of ["unknown_basis", "unknown_ratio_basis", "missing_date", "missing_source"]) {
      const input = structuredClone(cases[1]!.input);
      Object.assign(input.shares!.measure, { rawValue: amount, sourceUnit: "股", status: amount === "0" ? "explicit_zero" : "present" });
      if (path === "unknown_basis") input.denominator!.kind = "unknown";
      if (path === "unknown_ratio_basis") input.ratio!.measure.denominator = null;
      if (path === "missing_date") input.denominator!.fact.context.asOf = null;
      const result = path === "missing_source" ? checkPledge(input) : checkPledge(input, { evidenceMode: "synthetic_test" });
      assert.equal(result.status, "needs_review");
      assert.equal(result.audit.prerequisitesMet, false);
      assert.equal(result.calculation, null);
      assert.equal(result.comparison, null);
    }
  }
});

test("配置无效、缺少精度策略及错误JSON类型不静默猜默认值", () => {
  for (const options of [null, [], { evidenceMode: "skip" }, { ignoreEvidence: true }]) {
    assert.equal(checkPledge(cases[1]!.input, options as CheckOptions).status, "invalid");
  }
  for (const value of [null, 0, [], {}, "1", { ...cases[1]!.input, ratioPolicy: null }]) {
    const result = checkPledge(value);
    assert.equal(result.status, "invalid");
    assert.equal(result.calculation, null);
  }
});

test("CLI默认严格；合成模式仅显式启用，返回机器可读JSON", () => {
  const cli = fileURLToPath(new URL("src_D4/pledge/cli_D4.ts", root));
  const input = fileURLToPath(new URL("examples_D4/pledge_input_D4.json", root));
  const run = spawnSync(process.execPath, [cli, input], { encoding: "utf8" });
  const output = JSON.parse(run.stdout);
  assert.ok(output.results.length > 0);
  assert.equal(output.evidenceMode, "required");
  assert.equal(output.summary.verified, 0);
  assert.equal(output.summary.calculated, 0);
  for (const row of output.results) {
    assert.equal(row.result.calculation, null);
    assert.equal(row.result.comparison, null);
  }
  // 数据均可读取；默认模式下需复核不等于进程失败。
  assert.equal(run.status, 0);
  const bad = spawnSync(process.execPath, [cli, "--skip-evidence", input], { encoding: "utf8" });
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stderr).status, "error");
});
