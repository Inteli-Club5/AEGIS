const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

type RecoveryGuardianAddressInput = {
  requestedAddress?: string;
  configuredAddress?: string;
  ownerWallet?: string;
};

export function resolveRecoveryGuardianAddress({
  requestedAddress,
  configuredAddress,
  ownerWallet,
}: RecoveryGuardianAddressInput): string | undefined {
  return requestedAddress ?? configuredAddress ?? ownerWallet;
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
