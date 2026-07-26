import { createNextCursor } from "./pagination.ts";
import { QUERY_CATALOG, RECENT_TEEML_VALIDATIONS_QUERY, buildValidationQueryVariables } from "./queries.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("The Graph query catalog", () => {
  it("keeps user filters in variables instead of modifying the static query document", () => {
    const document = RECENT_TEEML_VALIDATIONS_QUERY;
    const variables = buildValidationQueryVariables({
      limit: 20,
      filters: {
        verdict: "DENY",
        requestId: `0x${"AB".repeat(32)}`,
        dateFrom: 1_700_000_000,
      },
    });

    assert.equal(RECENT_TEEML_VALIDATIONS_QUERY, document);
    assert.equal(document.includes(variables.where.requestId as string), false);
    assert.deepEqual(variables, {
      first: 21,
      where: {
        verdict: "DENY",
        requestId: `0x${"ab".repeat(32)}`,
        blockTimestamp_gte: "1700000000",
      },
    });
  });

  it("uses a versioned entity ID cursor with deterministic ascending ordering", () => {
    const afterId = `0x${"cd".repeat(36)}`;
    const cursor = createNextCursor({ hasNextPage: true, lastId: afterId });
    const variables = buildValidationQueryVariables({ limit: 20, cursor });

    assert.deepEqual(variables, { first: 21, where: { id_gt: afterId } });
    assert.match(RECENT_TEEML_VALIDATIONS_QUERY, /orderBy: id, orderDirection: asc/);
  });

  it("never requests private TeeML payloads or descriptive agent metadata", () => {
    const catalog = Object.values(QUERY_CATALOG).flat().join("\n").toLowerCase();
    for (const forbidden of [
      "detailedreason",
      "agentreason",
      "prompt",
      "semanticrules",
      "rawteemloutput",
      "rawattestation",
      "rawproof",
      "semanticcontextplaintext",
      "metadatauri",
      "privatekey",
      "apikey",
      "authtoken",
      "decryptedmetadata",
    ]) {
      assert.equal(catalog.includes(forbidden), false, forbidden);
    }
  });
});
