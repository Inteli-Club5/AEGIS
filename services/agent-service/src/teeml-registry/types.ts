import type { Hex32 } from "../policy-engine/types.js";

export type EvmAddress = `0x${string}`;
export type TransactionHash = `0x${string}`;
export type TeeMLFinalVerdict = "ALLOW" | "DENY";

export type TeeMLVerificationEvidence = {
  privateRoutingConfirmed: boolean;
  teeVerificationConfirmed: boolean;
  outputSchemaValid: boolean;
  policyHashVerified: boolean;
  actionHashVerified: boolean;
  semanticContextHashVerified: boolean;
  teemlRequestHashVerified: boolean;
  artifactHashVerified: boolean;
  modelIdHashVerified: boolean;
  reasonCodeHashVerified: boolean;
};

export type VerifiedTeeMLValidation = {
  requestId: string;
  agentId: string;
  agenticIdTokenId: bigint;
  safe: EvmAddress;
  policyHash: Hex32;
  actionHash: Hex32;
  semanticContextHash: Hex32;
  teemlRequestHash: Hex32;
  artifactHash: Hex32;
  modelIdHash: Hex32;
  reasonCodeHash: Hex32;
  verdict: TeeMLFinalVerdict;
  schemaVersion: number;
  verification: TeeMLVerificationEvidence;
};

export type TeeMLValidationRecord = {
  requestId: Hex32;
  agentIdHash: Hex32;
  actionHash: Hex32;
  policyHash: Hex32;
  semanticContextHash: Hex32;
  teemlRequestHash: Hex32;
  artifactHash: Hex32;
  modelIdHash: Hex32;
  reasonCodeHash: Hex32;
  safe: EvmAddress;
  agenticIdTokenId: bigint;
  verdict: 1 | 2;
  schemaVersion: number;
};

export type TeeMLValidationRegistryReceipt = {
  status: "success" | "reverted";
  blockNumber: bigint;
};

export type TeeMLValidationRegistryWriteResult = {
  requestIdHash: Hex32;
  agentIdHash: Hex32;
  recordHash: Hex32;
  transactionHash: TransactionHash;
  blockNumber: bigint;
};

export type TeeMLValidationRegistryDriver = {
  writeRecord(record: TeeMLValidationRecord): Promise<TransactionHash>;
  waitForReceipt(transactionHash: TransactionHash): Promise<TeeMLValidationRegistryReceipt>;
  readRecordHash(requestIdHash: Hex32): Promise<Hex32>;
};

export type TeeMLValidationRegistryPort = {
  recordVerifiedValidation(input: VerifiedTeeMLValidation): Promise<TeeMLValidationRegistryWriteResult>;
};

export type VerifiedTeeMlRegistryInput = VerifiedTeeMLValidation;
export type RegistryReceipt = TeeMLValidationRegistryWriteResult;

export type VerifiedTeeMlRegistryWriter = {
  recordVerifiedVerdict(input: VerifiedTeeMlRegistryInput): Promise<RegistryReceipt>;
};
