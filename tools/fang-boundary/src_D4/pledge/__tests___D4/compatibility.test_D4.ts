import { checkPledge } from "../checks_D4.ts";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { verifyPledge, type PledgeInput } from "../pledge_arithmetic_D4.ts";
import { normalize, type MeasureInput, type NormalizedMeasure } from "../../normalization/normalization_D4.ts";

const root = new URL("../../../", import.meta.url);
function load(name: string): unknown { return JSON.parse(readFileSync(new URL(`tests_D4/fixtures/${name}`, root), "utf8")); }
type Case = { id: string; input: PledgeInput; expectedCode: string; expected: Record<string, unknown> };
const cases = load("pledge_regression_D4.json") as Case[];
function includes(actual: unknown, expected: unknown): void {
  if (expected !== null && typeof expected === "object" && !Array.isArray(expected)) {
    assert.ok(actual !== null && typeof actual === "object");
    for (const [key, value] of Object.entries(expected)) includes((actual as Record<string, unknown>)[key], value);
  } else assert.deepEqual(actual, expected);
}
for (const example of cases) {
  test(example.id, () => {
    const before = JSON.stringify(example.input);
    const result = verifyPledge(example.input);
    includes(result, example.expected);
    assert.equal(result.reasons[0]?.code, example.expectedCode);
    assert.equal(JSON.stringify(example.input), before, "不得回填或修改调用方原始事实");
    assert.doesNotThrow(() => JSON.stringify(result), "工具结果必须可序列化为 JSON");
    if (result.normalized.shares) assert.deepEqual(result.normalized.shares.source, example.input.shares?.source);
    if (result.normalized.ratio) assert.deepEqual(result.normalized.ratio.source, example.input.ratio?.source);
    if (result.normalized.denominator) assert.deepEqual(result.normalized.denominator.source, example.input.denominator?.fact.source);
  });
}

type Regression = { id: string; inputs: MeasureInput[]; expected: Partial<NormalizedMeasure>[] };
const regression = load("normalization_regression_D4.json") as Regression[];
assert.equal(regression.length, 20);
for (const row of regression) {
  test(`D2 回归 ${row.id}`, () => {
    assert.equal(row.inputs.length, row.expected.length);
    row.inputs.forEach((input, i) => includes(normalize(input), row.expected[i]));
  });
}

test("JSON 边界拒绝数字型财务值、未知键、布尔、数组、非有限值和错误来源信息", () => {
  const base = cases[0]!.input;
  const mutations: unknown[] = [null, [], {}, false, "20", { ...base, typo: "ignored?" }];
  for (const bad of [NaN, Infinity, 123, true, {}, "1e3", "1,000", " 20 ", "9".repeat(121)]) {
    const row = structuredClone(base);
    Object.assign(row.shares!.measure, { rawValue: bad });
    mutations.push(row);
  }
  for (const patch of [{ page: 0 }, { sha256: "abc" }, { sampleType: "other" }, { locator: "" }]) {
    const row = structuredClone(base);
    Object.assign(row.shares!.source, patch);
    mutations.push(row);
  }
  for (const raw of mutations) assert.equal(verifyPledge(raw).status, "invalid");
});

test("反推区间与穷举整股集合一致，包括零比例、100% 和舍入临界点", () => {
  // 独立小数值穷举 oracle；金融实现不使用 Number。本测试范围内所有整数均精确。
  for (const denominator of [1, 3, 16, 99, 200, 999]) {
    for (const places of [0, 1, 2]) {
      const scale = 10 ** places;
      const buckets = new Map<number, number[]>();
      for (let shares = 0; shares <= denominator; shares++) {
        const rounded = Math.floor((2 * shares * 100 * scale + denominator) / (2 * denominator));
        const bucket = buckets.get(rounded) ?? [];
        bucket.push(shares);
        buckets.set(rounded, bucket);
      }
      for (const [rounded, solutions] of buckets) {
        const row = structuredClone(cases[0]!.input);
        row.shares = null;
        Object.assign(row.denominator!.fact.measure, { rawValue: String(denominator), sourceUnit: "股" });
        row.ratioPolicy = { mode: "rounded", decimalPlaces: places };
        Object.assign(row.ratio!.measure, { rawValue: (rounded / scale).toFixed(places), status: rounded === 0 ? "explicit_zero" : "present" });
        const result = verifyPledge(row);
        assert.equal(result.status, "calculated");
        assert.deepEqual(result.calculation?.possibleWholeShares, { min: String(solutions[0]), max: String(solutions.at(-1)) });
        assert.equal(result.calculation?.value, null);
      }
    }
  }
});

test("CLI 批量、UTF-8 BOM、缺失文件、非法 JSON 与退出码", () => {
  const dir = mkdtempSync(join(tmpdir(), "pledge-D3-"));
  const cli = fileURLToPath(new URL("src_D4/pledge/cli_D4.ts", root));
  try {
    const inputPath = join(dir, "input_D3.json");
    writeFileSync(inputPath, "\uFEFF" + JSON.stringify([cases[0]!.input, cases[1]!.input]));
    const good = spawnSync(process.execPath, [cli, "--synthetic-test", inputPath], { encoding: "utf8" });
    assert.equal(good.status, 0, good.stderr);
    const output = JSON.parse(good.stdout);
    assert.equal(output.results.length, 2);
    assert.match(output.fileAccess[0].sha256, /^[a-f0-9]{64}$/);
    assert.ok(output.codeSha256["./checks_D4.ts"]);
    assert.deepEqual(output.results[0].result, checkPledge(cases[0]!.input, { evidenceMode: "synthetic_test" }));
    writeFileSync(inputPath, JSON.stringify({ id: "bad" }));
    const invalid = spawnSync(process.execPath, [cli, "--synthetic-test", inputPath], { encoding: "utf8" });
    assert.equal(invalid.status, 2);
    assert.equal(JSON.parse(invalid.stdout).summary.invalid, 1);
    writeFileSync(inputPath, "{");
    assert.equal(spawnSync(process.execPath, [cli, "--synthetic-test", inputPath], { encoding: "utf8" }).status, 1);
    assert.equal(spawnSync(process.execPath, [cli, join(dir, "missing.json")], { encoding: "utf8" }).status, 1);
  } finally {
    rmSync(join(dir, "input_D3.json"), { force: true });
    rmdirSync(dir);
  }
});
