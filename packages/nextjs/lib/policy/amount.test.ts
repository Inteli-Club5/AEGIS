import { formatBaseUnitAmount, parseDisplayAmount } from "./amount.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("Policy amount conversion", () => {
  it("converts decimal display amounts to exact integer base-unit strings", () => {
    assert.equal(parseDisplayAmount("1.23456789", 8), "123456789");
    assert.equal(parseDisplayAmount("0.00000001", 8), "1");
    assert.equal(parseDisplayAmount("9007199254740993.00000001", 8), "900719925474099300000001");
  });

  it("rejects values that cannot be represented exactly", () => {
    for (const value of ["0.000000001", "-1", "1e8", "1,5", ".5", ""]) {
      assert.throws(() => parseDisplayAmount(value, 8));
    }
  });

  it("formats base units without passing through JavaScript numbers", () => {
    assert.equal(formatBaseUnitAmount("123450000", 8), "1.2345");
    assert.equal(formatBaseUnitAmount("1", 8), "0.00000001");
    assert.equal(formatBaseUnitAmount("900719925474099300000001", 8), "9007199254740993.00000001");
  });
});
