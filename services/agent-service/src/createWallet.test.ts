import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveSafeSaltNonce } from "./createWallet.js";

describe("deterministic Safe deployment identity", () => {
  it("derives a stable decimal salt per normalized agent id", () => {
    const upper = "018F0000-0000-7000-8000-0000000000AA";
    const lower = upper.toLowerCase();
    const salt = deriveSafeSaltNonce(upper);

    assert.match(salt, /^(0|[1-9][0-9]*)$/);
    assert.equal(salt, deriveSafeSaltNonce(lower));
    assert.notEqual(
      salt,
      deriveSafeSaltNonce("018f0000-0000-7000-8000-0000000000bb"),
    );
  });
});
