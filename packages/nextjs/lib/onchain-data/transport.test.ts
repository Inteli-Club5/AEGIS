import { executeGraphQLRequest } from "./transport.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("GraphQL transport", () => {
  it("posts a static document and variables to the configured endpoint", async () => {
    let observedBody = "";
    const result = await executeGraphQLRequest<{ value: string }>({
      endpoint: "http://127.0.0.1:8000/subgraphs/name/aegis/hedera",
      document: "query Value($id: ID!) { value(id: $id) }",
      variables: { id: "event-1" },
      fetcher: async (_url, init) => {
        observedBody = String(init?.body);
        return new Response(JSON.stringify({ data: { value: "ok" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    assert.deepEqual(result, { value: "ok" });
    assert.deepEqual(JSON.parse(observedBody), {
      query: "query Value($id: ID!) { value(id: $id) }",
      variables: { id: "event-1" },
    });
  });

  it("fails explicitly on GraphQL indexing errors and returns no fallback data", async () => {
    await assert.rejects(
      () =>
        executeGraphQLRequest({
          endpoint: "http://127.0.0.1:8000/subgraphs/name/aegis/hedera",
          document: "query Broken { value }",
          fetcher: async () =>
            new Response(JSON.stringify({ errors: [{ message: "indexing_error" }] }), {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
        }),
      error => error instanceof Error && error.name === "OnchainGraphQLError" && /indexing_error/.test(error.message),
    );
  });
});
