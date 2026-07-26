import { createNextCursor, createPageRequest } from "./pagination.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("onchain pagination", () => {
  it("caps page size without changing the stable ID ordering", () => {
    assert.deepEqual(createPageRequest({ limit: 500 }), {
      first: 100,
      afterId: null,
      orderBy: "id",
      orderDirection: "asc",
    });
  });

  it("round-trips a versioned ID cursor without using an offset", () => {
    const lastId = `0x${"ab".repeat(36)}`;
    const cursor = createNextCursor({ hasNextPage: true, lastId });

    assert.ok(cursor);
    assert.deepEqual(createPageRequest({ cursor }), {
      first: 25,
      afterId: lastId,
      orderBy: "id",
      orderDirection: "asc",
    });
  });

  it("rejects non-Bytes cursor entity IDs", () => {
    assert.throws(() => createNextCursor({ hasNextPage: true, lastId: "record-25" }), /valid final Bytes entity ID/);
  });

  it("does not advertise another page without an over-fetched row", () => {
    assert.equal(createNextCursor({ hasNextPage: false, lastId: `0x${"ab".repeat(36)}` }), null);
  });
});
