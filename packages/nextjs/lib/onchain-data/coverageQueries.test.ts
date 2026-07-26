import {
  POLICY_REFERENCES_QUERY,
  POLICY_REFERENCE_BY_ID_QUERY,
  SAFE_EXECUTIONS_QUERY,
  SAFE_EXECUTION_BY_ID_QUERY,
  buildPolicyReferenceVariables,
  buildSafeExecutionVariables,
} from "./coverageQueries.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("execution and policy GraphQL queries", () => {
  it("keeps Safe execution filters in variables and over-fetches one cursor row", () => {
    const safe = `0x${"AA".repeat(20)}`;
    const transactionHash = `0x${"BB".repeat(32)}`;
    const variables = buildSafeExecutionVariables({
      limit: 25,
      filters: { safe, success: false, transactionHash, dateFrom: 100, dateTo: 200 },
    });

    assert.deepEqual(variables, {
      first: 26,
      where: {
        safe: safe.toLowerCase(),
        success: false,
        transactionHash: transactionHash.toLowerCase(),
        blockTimestamp_gte: "100",
        blockTimestamp_lte: "200",
      },
    });
    assert.equal(SAFE_EXECUTIONS_QUERY.includes(safe), false);
  });

  it("uses static detail documents and typed policy variables", () => {
    const policyHash = `0x${"CC".repeat(32)}`;
    assert.deepEqual(buildPolicyReferenceVariables({ limit: 10, filters: { policyHash, dateFrom: 50 } }), {
      first: 11,
      where: { policyHash: policyHash.toLowerCase(), lastReferencedAt_gte: "50" },
    });
    assert.match(SAFE_EXECUTION_BY_ID_QUERY, /query SafeExecutionById\(\$id: ID!\)/);
    assert.match(POLICY_REFERENCE_BY_ID_QUERY, /query PolicyReferenceById\(\$id: ID!\)/);
    assert.match(POLICY_REFERENCES_QUERY, /orderBy: id, orderDirection: asc/);
  });
});
