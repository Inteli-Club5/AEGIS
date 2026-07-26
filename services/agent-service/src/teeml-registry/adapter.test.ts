import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { keccak256, stringToHex } from "viem";
import {
  HederaTeeValidationRegistryAdapter,
  TeeMLRegistryVerificationError,
  TeeMLRegistryWriteError,
} from "./adapter.js";
import { hashCanonicalAgentId, hashCanonicalRequestId, TeeMLRegistryInputError } from "./hashing.js";
import type {
  TeeMLValidationRecord,
  TeeMLValidationRegistryDriver,
  TeeMLVerificationEvidence,
  TransactionHash,
  VerifiedTeeMLValidation,
} from "./types.js";

const HASH = (byte: string): `0x${string}` => `0x${byte.repeat(64)}`;
const TX_HASH = HASH("a") as TransactionHash;
const RECORD_HASH = HASH("b");

describe("TeeML registry canonical hashes", () => {
  it("matches the existing keccak256 UTF-8 trim convention for agent and request IDs", () => {
    assert.equal(hashCanonicalAgentId("  agent-1  "), keccak256(stringToHex("agent-1")));
    assert.equal(hashCanonicalRequestId("  request-1  "), keccak256(stringToHex("request-1")));
    assert.equal(hashCanonicalAgentId("Agent-1"), keccak256(stringToHex("Agent-1")));
    assert.notEqual(hashCanonicalAgentId("Agent-1"), hashCanonicalAgentId("agent-1"));
  });

  it("rejects empty canonical identifiers", () => {
    assert.throws(() => hashCanonicalAgentId("   "), TeeMLRegistryInputError);
    assert.throws(() => hashCanonicalRequestId("\n"), TeeMLRegistryInputError);
  });
});

describe("HederaTeeValidationRegistryAdapter", () => {
  it("writes verified ALLOW and returns receipt plus onchain commitment", async () => {
    const driver = new TestRegistryDriver();
    const adapter = new HederaTeeValidationRegistryAdapter(driver);
    const result = await adapter.recordVerifiedValidation(validInput());

    assert.equal(driver.records.length, 1);
    assert.equal(driver.records[0]?.verdict, 1);
    assert.equal(driver.records[0]?.requestId, hashCanonicalRequestId("request-1"));
    assert.equal(driver.records[0]?.agentIdHash, hashCanonicalAgentId("agent-1"));
    assert.equal(result.transactionHash, TX_HASH);
    assert.equal(result.recordHash, RECORD_HASH);
    assert.equal(result.blockNumber, 42n);
  });

  it("exposes the verified-verdict writer port without weakening any verification gate", async () => {
    const driver = new TestRegistryDriver();
    const adapter = new HederaTeeValidationRegistryAdapter(driver);
    const result = await adapter.recordVerifiedVerdict(validInput());

    assert.equal(result.transactionHash, TX_HASH);
    assert.equal(driver.records.length, 1);
  });

  it("maps a verified DENY to the only other accepted onchain verdict", async () => {
    const driver = new TestRegistryDriver();
    const adapter = new HederaTeeValidationRegistryAdapter(driver);

    await adapter.recordVerifiedValidation(validInput({ verdict: "DENY" }));

    assert.equal(driver.records[0]?.verdict, 2);
  });

  it("rejects every missing verification before calling the contract", async () => {
    for (const flag of Object.keys(verifiedEvidence()) as (keyof TeeMLVerificationEvidence)[]) {
      const driver = new TestRegistryDriver();
      const adapter = new HederaTeeValidationRegistryAdapter(driver);
      const input = validInput({ verification: { ...verifiedEvidence(), [flag]: false } });

      await assert.rejects(() => adapter.recordVerifiedValidation(input), TeeMLRegistryVerificationError);
      assert.equal(driver.records.length, 0, `${flag} must block the write`);
    }
  });

  it("never treats failed or fallback model states as final verdicts", async () => {
    const driver = new TestRegistryDriver();
    const adapter = new HederaTeeValidationRegistryAdapter(driver);
    const invalid = { ...validInput(), verdict: "TEEML_FAILED" } as unknown as VerifiedTeeMLValidation;

    await assert.rejects(() => adapter.recordVerifiedValidation(invalid), TeeMLRegistryVerificationError);
    assert.equal(driver.records.length, 0);
  });

  it("validates fixed-size commitments, Safe, token ID, and schema before writing", async () => {
    const invalidInputs: VerifiedTeeMLValidation[] = [
      validInput({ policyHash: "0x1234" }),
      validInput({ artifactHash: HASH("0") }),
      validInput({ safe: "0x0000000000000000000000000000000000000000" }),
      validInput({ agenticIdTokenId: -1n }),
      validInput({ agenticIdTokenId: 1n << 256n }),
      validInput({ schemaVersion: 0 }),
      validInput({ schemaVersion: 65_536 }),
    ];

    for (const input of invalidInputs) {
      const driver = new TestRegistryDriver();
      const adapter = new HederaTeeValidationRegistryAdapter(driver);
      await assert.rejects(() => adapter.recordVerifiedValidation(input), TeeMLRegistryInputError);
      assert.equal(driver.records.length, 0);
    }
  });

  it("does not report a write when the transaction reverted", async () => {
    const driver = new TestRegistryDriver();
    driver.receiptStatus = "reverted";
    const adapter = new HederaTeeValidationRegistryAdapter(driver);

    await assert.rejects(() => adapter.recordVerifiedValidation(validInput()), TeeMLRegistryWriteError);
  });

  it("requires a non-zero stored recordHash after confirmation", async () => {
    const driver = new TestRegistryDriver();
    driver.recordHash = HASH("0");
    const adapter = new HederaTeeValidationRegistryAdapter(driver);

    await assert.rejects(() => adapter.recordVerifiedValidation(validInput()), TeeMLRegistryInputError);
  });

  it("rejects malformed transaction hashes and unconfirmed block numbers", async () => {
    const malformedHashDriver = new TestRegistryDriver();
    malformedHashDriver.transactionHash = "0x1234";
    await assert.rejects(
      () => new HederaTeeValidationRegistryAdapter(malformedHashDriver).recordVerifiedValidation(validInput()),
      TeeMLRegistryInputError,
    );

    const missingBlockDriver = new TestRegistryDriver();
    missingBlockDriver.blockNumber = 0n;
    await assert.rejects(
      () => new HederaTeeValidationRegistryAdapter(missingBlockDriver).recordVerifiedValidation(validInput()),
      TeeMLRegistryWriteError,
    );
  });
});

class TestRegistryDriver implements TeeMLValidationRegistryDriver {
  records: TeeMLValidationRecord[] = [];
  receiptStatus: "success" | "reverted" = "success";
  recordHash = RECORD_HASH;
  transactionHash: TransactionHash = TX_HASH;
  blockNumber = 42n;

  async writeRecord(record: TeeMLValidationRecord): Promise<TransactionHash> {
    this.records.push(record);
    return this.transactionHash;
  }

  async waitForReceipt(): Promise<{ status: "success" | "reverted"; blockNumber: bigint }> {
    return { status: this.receiptStatus, blockNumber: this.blockNumber };
  }

  async readRecordHash(): Promise<`0x${string}`> {
    return this.recordHash;
  }
}

function verifiedEvidence(): TeeMLVerificationEvidence {
  return {
    privateRoutingConfirmed: true,
    teeVerificationConfirmed: true,
    outputSchemaValid: true,
    policyHashVerified: true,
    actionHashVerified: true,
    semanticContextHashVerified: true,
    teemlRequestHashVerified: true,
    artifactHashVerified: true,
    modelIdHashVerified: true,
    reasonCodeHashVerified: true,
  };
}

function validInput(overrides: Partial<VerifiedTeeMLValidation> = {}): VerifiedTeeMLValidation {
  return {
    requestId: "request-1",
    agentId: "agent-1",
    agenticIdTokenId: 7n,
    safe: "0x00000000000000000000000000000000000000a1",
    policyHash: HASH("1"),
    actionHash: HASH("2"),
    semanticContextHash: HASH("3"),
    teemlRequestHash: HASH("4"),
    artifactHash: HASH("5"),
    modelIdHash: HASH("6"),
    reasonCodeHash: HASH("7"),
    verdict: "ALLOW",
    schemaVersion: 1,
    verification: verifiedEvidence(),
    ...overrides,
  };
}
