import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveDestinationEvmAddress } from "./destination.js";

const noEvmAddressFetch: typeof fetch = (async () =>
  new Response(JSON.stringify({ evm_address: null }), { status: 200 })) as typeof fetch;

describe("resolveDestinationEvmAddress", () => {
  it("passes through a valid EVM address destination", async () => {
    const address = "0x03f197ABD7C8AcFecE274261cA20bee0E6BB3b5f";
    assert.equal(
      await resolveDestinationEvmAddress({ kind: "EVM_ADDRESS", value: address }),
      address,
    );
  });

  it("rejects an invalid EVM address destination", async () => {
    await assert.rejects(() =>
      resolveDestinationEvmAddress({ kind: "EVM_ADDRESS", value: "not-an-address" }),
    );
  });

  it("falls back to a Hedera account id's long-zero solidity address when it has no assigned evm_address", async () => {
    const resolved = await resolveDestinationEvmAddress(
      { kind: "HEDERA_ACCOUNT_ID", value: "0.0.98765" },
      { fetch: noEvmAddressFetch },
    );
    assert.match(resolved, /^0x[0-9a-fA-F]{40}$/);
    const hex = (98765).toString(16);
    assert.equal(resolved.toLowerCase(), `0x${"0".repeat(40 - hex.length)}${hex}`);
  });

  it("prefers a Hedera account's canonical mirror-node evm_address over its long-zero alias", async () => {
    const canonicalAddress = "0x6cb3edf0111cddb079478ab5fabd5724dbfa5549";
    const canonicalFetch: typeof fetch = (async () =>
      new Response(JSON.stringify({ evm_address: canonicalAddress }), { status: 200 })) as typeof fetch;
    const resolved = await resolveDestinationEvmAddress(
      { kind: "HEDERA_ACCOUNT_ID", value: "0.0.98765" },
      { fetch: canonicalFetch },
    );
    assert.equal(resolved, canonicalAddress);
  });

  it("rejects when the mirror node lookup fails", async () => {
    const failingFetch: typeof fetch = (async () =>
      new Response("not found", { status: 404 })) as typeof fetch;
    await assert.rejects(() =>
      resolveDestinationEvmAddress(
        { kind: "HEDERA_ACCOUNT_ID", value: "0.0.98765" },
        { fetch: failingFetch },
      ),
    );
  });

  it("rejects a URL_ORIGIN destination as non-payable", async () => {
    await assert.rejects(() =>
      resolveDestinationEvmAddress({ kind: "URL_ORIGIN", value: "https://example.com" }),
    );
  });
});