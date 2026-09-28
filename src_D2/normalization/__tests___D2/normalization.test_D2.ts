import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalize, type MeasureInput, type NormalizedMeasure } from "../index_D2.ts";

type Expected = Pick<NormalizedMeasure, "value" | "unit" | "status" | "qualifier" | "scope" | "denominator">;
type Case = { id: string; inputs: MeasureInput[]; expected: Expected[] };
const cases = JSON.parse(readFileSync(new URL("../../../tests/fixtures/normalization_cases.json", import.meta.url), "utf8")) as Case[];

assert.equal(cases.length, 20, "D2 must ship exactly 20 scenarios");

for (const example of cases) {
  test(example.id, () => {
    assert.equal(example.inputs.length, example.expected.length);
    for (const [index, input] of example.inputs.entries()) {
      const result = normalize(input);
      const { value, unit, status, qualifier, scope, denominator } = result;
      assert.deepEqual({ value, unit, status, qualifier, scope, denominator }, example.expected[index]);
      assert.equal(result.rawText, input.rawText);
      assert.equal(result.rawValue, input.rawValue);
      assert.equal(result.sourceUnit, input.sourceUnit);
    }
  });
}

test("rejects guesses, missing denominators, fractional shares and inconsistent states", () => {
  const amount: MeasureInput = { kind: "amount", rawText: "金额12.34元", rawValue: "12.34", sourceUnit: "元", qualifier: "exact", scope: "single", status: "present", denominator: null };
  const ratio: MeasureInput = { kind: "ratio", rawText: "占2.5%", rawValue: "2.5", sourceUnit: "%", qualifier: "exact", scope: "single", status: "present", denominator: null };

  // 缺失与无法读取不得携带数值（不得把部分数字当结果）。
  assert.throws(() => normalize({ ...amount, status: "not_mentioned" }), /cannot carry a number/);
  assert.throws(() => normalize({ ...amount, status: "unreadable" }), /cannot carry a number/);

  // 有值比例必须有明确分母，定义不能为空。
  assert.throws(() => normalize(ratio), /denominator/);
  assert.throws(() => normalize({ ...ratio, denominator: { kind: "total_share_capital", definition: "  " } }), /denominator/);

  // 非比例字段不得携带分母。
  assert.throws(() => normalize({ ...amount, denominator: { kind: "other", definition: "x" } }), /only applies/);

  // 股数换算后必须是整数股。
  assert.throws(() => normalize({ kind: "shares", rawText: "0.00001万股", rawValue: "0.00001", sourceUnit: "万股", qualifier: "exact", scope: "single", status: "present", denominator: null }), /whole shares/);

  // 不支持的源单位拒绝换算（故意传入类型外的单位，测试运行期校验）。
  // @ts-expect-error "万美元" 不在 sourceUnit 联合类型内，此处刻意越界以验证运行期抛错。
  assert.throws(() => normalize({ ...amount, sourceUnit: "万美元" }), /Invalid stated/);

  // 明确零必须是精确的零；精确零必须标记为 explicit_zero。
  assert.throws(() => normalize({ ...amount, status: "explicit_zero" }), /Explicit zero requires/);
  assert.throws(() => normalize({ ...amount, rawValue: "0" }), /explicit_zero status/);
});
