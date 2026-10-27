import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMathContent } from "./markdown";

test("wraps an undelimited LaTeX power with a fill-in blank", () => {
  const source = String.raw`1.0 \times 10^{\text{______}}`;
  const expected = String.raw`$1.0 \times 10^{\text{______}}$`;

  assert.equal(normalizeMathContent(source), expected);
});

test("leaves an already delimited fill-in formula unchanged", () => {
  const formula = String.raw`$1.0 \times 10^{\text{______}}$`;

  assert.equal(normalizeMathContent(formula), formula);
});
