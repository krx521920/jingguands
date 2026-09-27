import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalize, type MeasureInput, type NormalizedMeasure } from "../index.ts";

type Expected = Pick<NormalizedMeasure, "value" | "unit" | "status" | "qualifier" | "scope" | "denominator">;
type Case = { id: string; inputs: MeasureInput[]; expected: Expected[] };
const cases = JSON.parse(readFileSync(new URL("../../../tests/fixtures/normalization_cases.json", import.meta.url), "utf8")) as Case[];

assert.equal(cases.length, 10, "D1 must ship exactly 10 scenarios");

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

test("rejects guesses, missing denominator and fractional shares", () => {
  const amount = cases[0].inputs[0];
  const ratio = cases[6].inputs[0];
  assert.throws(() => normalize({ ...amount, rawValue: null }), /Invalid stated/);
  assert.throws(() => normalize({ ...ratio, denominator: null }), /denominator/);
  assert.throws(() => normalize({ ...amount, status: "not_mentioned" }), /cannot carry a number/);
  assert.throws(() => normalize({ ...cases[4].inputs[0], rawValue: "0.00001" }), /whole shares/);
});
