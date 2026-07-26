const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

type RecoveryGuardianAddressInput = {
  requestedAddress?: string;
  configuredAddress?: string;
  ownerWallet?: string;
};

export type RecoveryGuardianSource =
  | "REQUESTED"
  | "CONFIGURED_AEGIS"
  | "OWNER_FALLBACK";

export type ResolvedRecoveryGuardian = {
  address: string;
  source: RecoveryGuardianSource;
};

export function resolveRecoveryGuardian({
  requestedAddress,
  configuredAddress,
  ownerWallet,
}: RecoveryGuardianAddressInput): ResolvedRecoveryGuardian | undefined {
  if (requestedAddress !== undefined) {
    return { address: requestedAddress, source: "REQUESTED" };
  }
  if (configuredAddress !== undefined) {
    return { address: configuredAddress, source: "CONFIGURED_AEGIS" };
  }
  if (ownerWallet !== undefined) {
    return { address: ownerWallet, source: "OWNER_FALLBACK" };
  }
  return undefined;
}

export function resolveRecoveryGuardianAddress({
  requestedAddress,
  configuredAddress,
  ownerWallet,
}: RecoveryGuardianAddressInput): string | undefined {
  return resolveRecoveryGuardian({
    requestedAddress,
    configuredAddress,
    ownerWallet,
  })?.address;
}

export function buildSafeAccountConfig(
  agentAddress: string,
  cosignerAddress: string,
  recoveryGuardianAddress: string,
): { owners: string[]; threshold: number } {
  const owners = [agentAddress, cosignerAddress, recoveryGuardianAddress];

  for (const owner of owners) {
    if (!EVM_ADDRESS_RE.test(owner)) {
      throw new Error(`Safe owner must be a valid EVM address: ${owner}`);
    }
  }

  const uniqueOwners = new Set(owners.map(owner => owner.toLowerCase()));
  if (uniqueOwners.size !== owners.length) {
    throw new Error(
      "Safe owners must be unique. Configure a recovery guardian that differs from the agent and AEGIS co-signer.",
    );
  }

  return { owners, threshold: 2 };
}
