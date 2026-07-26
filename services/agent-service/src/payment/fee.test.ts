import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateExecutionFeeTinybar,
  MAX_EXECUTION_FEE_TINYBAR,
  MIN_EXECUTION_FEE_TINYBAR,
} from "./fee.js";

describe("calculateExecutionFeeTinybar", () => {
  it("applies the 1% rate for amounts between the floor and cap", () => {
    assert.equal(
      calculateExecutionFeeTinybar("10000000000"),
      "100000000",
    );
  });

  it("floors tiny amounts at the minimum fee", () => {
    assert.equal(calculateExecutionFeeTinybar("1"), MIN_EXECUTION_FEE_TINYBAR.toString());
    assert.equal(calculateExecutionFeeTinybar("0"), MIN_EXECUTION_FEE_TINYBAR.toString());
  });

  it("caps large amounts at the maximum fee", () => {
    assert.equal(
      calculateExecutionFeeTinybar("10000000000000"),
      MAX_EXECUTION_FEE_TINYBAR.toString(),
    );
  });

  it("rejects a negative or non-integer amount", () => {
    assert.throws(() => calculateExecutionFeeTinybar("-1"));
    assert.throws(() => calculateExecutionFeeTinybar("1.5"));
    assert.throws(() => calculateExecutionFeeTinybar("abc"));
  });
});