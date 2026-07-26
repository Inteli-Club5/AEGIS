import { getAddress } from "viem";
import { hashCanonicalAgentId, hashCanonicalRequestId, TeeMLRegistryInputError } from "./hashing.js";
import type {
  TeeMLFinalVerdict,
  TeeMLValidationRecord,
  TeeMLValidationRegistryDriver,
  TeeMLValidationRegistryPort,
  TeeMLValidationRegistryWriteResult,
  TeeMLVerificationEvidence,
  VerifiedTeeMlRegistryWriter,
  VerifiedTeeMLValidation,
} from "./types.js";

const ZERO_BYTES32 = `0x${"00".repeat(32)}`;
const MAX_UINT256 = (1n << 256n) - 1n;
const REQUIRED_VERIFICATION_FLAGS = [
  "privateRoutingConfirmed",
  "teeVerificationConfirmed",
  "outputSchemaValid",
  "policyHashVerified",
  "actionHashVerified",
  "semanticContextHashVerified",
  "teemlRequestHashVerified",
  "artifactHashVerified",
  "modelIdHashVerified",
  "reasonCodeHashVerified",
] as const satisfies readonly (keyof TeeMLVerificationEvidence)[];

export class HederaTeeValidationRegistryAdapter implements TeeMLValidationRegistryPort, VerifiedTeeMlRegistryWriter {
  constructor(private readonly driver: TeeMLValidationRegistryDriver) {}

  async recordVerifiedValidation(input: VerifiedTeeMLValidation): Promise<TeeMLValidationRegistryWriteResult> {
    return this.recordVerifiedVerdict(input);
  }

  async recordVerifiedVerdict(input: VerifiedTeeMLValidation): Promise<TeeMLValidationRegistryWriteResult> {
    assertVerifiedEvidence(input.verification);

    const requestIdHash = hashCanonicalRequestId(input.requestId);
    const agentIdHash = hashCanonicalAgentId(input.agentId);
    const record = toOnchainRecord(input, requestIdHash, agentIdHash);
    const transactionHash = await this.driver.writeRecord(record);
    assertBytes32(transactionHash, "transactionHash");
    const receipt = await this.driver.waitForReceipt(transactionHash);

    if (receipt.status !== "success") {
      throw new TeeMLRegistryWriteError("TeeML registry transaction reverted.");
    }
    if (receipt.blockNumber <= 0n) {
      throw new TeeMLRegistryWriteError("TeeML registry receipt is missing a confirmed block number.");
    }

    const recordHash = await this.driver.readRecordHash(requestIdHash);
    assertBytes32(recordHash, "recordHash");

    return {
      requestIdHash,
      agentIdHash,
      recordHash,
      transactionHash,
      blockNumber: receipt.blockNumber,
    };
  }
}

function toOnchainRecord(
  input: VerifiedTeeMLValidation,
  requestIdHash: TeeMLValidationRecord["requestId"],
  agentIdHash: TeeMLValidationRecord["agentIdHash"],
): TeeMLValidationRecord {
  const record = {
    requestId: requestIdHash,
    agentIdHash,
    actionHash: input.actionHash,
    policyHash: input.policyHash,
    semanticContextHash: input.semanticContextHash,
    teemlRequestHash: input.teemlRequestHash,
    artifactHash: input.artifactHash,
    modelIdHash: input.modelIdHash,
    reasonCodeHash: input.reasonCodeHash,
    safe: normalizeSafe(input.safe),
    agenticIdTokenId: input.agenticIdTokenId,
    verdict: toOnchainVerdict(input.verdict),
    schemaVersion: input.schemaVersion,
  } satisfies TeeMLValidationRecord;

  for (const [name, value] of Object.entries({
    requestId: record.requestId,
    agentIdHash: record.agentIdHash,
    actionHash: record.actionHash,
    policyHash: record.policyHash,
    semanticContextHash: record.semanticContextHash,
    teemlRequestHash: record.teemlRequestHash,
    artifactHash: record.artifactHash,
    modelIdHash: record.modelIdHash,
    reasonCodeHash: record.reasonCodeHash,
  })) {
    assertBytes32(value, name);
  }

  if (record.agenticIdTokenId < 0n || record.agenticIdTokenId > MAX_UINT256) {
    throw new TeeMLRegistryInputError("agenticIdTokenId must fit an unsigned 256-bit integer.");
  }
  if (!Number.isInteger(record.schemaVersion) || record.schemaVersion < 1 || record.schemaVersion > 65_535) {
    throw new TeeMLRegistryInputError("schemaVersion must be an integer from 1 through 65535.");
  }
  return record;
}

function assertVerifiedEvidence(evidence: TeeMLVerificationEvidence): void {
  for (const flag of REQUIRED_VERIFICATION_FLAGS) {
    if (evidence[flag] !== true) {
      throw new TeeMLRegistryVerificationError(`Refusing registry write because ${flag} is not verified.`);
    }
  }
}

function assertBytes32(value: string, name: string): void {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value) || value.toLowerCase() === ZERO_BYTES32) {
    throw new TeeMLRegistryInputError(`${name} must be a non-zero bytes32 value.`);
  }
}

function normalizeSafe(value: string): TeeMLValidationRecord["safe"] {
  let address: string;
  try {
    address = getAddress(value);
  } catch {
    throw new TeeMLRegistryInputError("safe must be a valid EVM address.");
  }
  if (address === "0x0000000000000000000000000000000000000000") {
    throw new TeeMLRegistryInputError("safe must not be the zero address.");
  }
  return address as TeeMLValidationRecord["safe"];
}

function toOnchainVerdict(verdict: TeeMLFinalVerdict): 1 | 2 {
  if (verdict === "ALLOW") return 1;
  if (verdict === "DENY") return 2;
  throw new TeeMLRegistryVerificationError("Only verified ALLOW or DENY verdicts may be recorded.");
}

export class TeeMLRegistryVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeeMLRegistryVerificationError";
  }
}

export class TeeMLRegistryWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeeMLRegistryWriteError";
  }
}
