import Safe from "@safe-global/protocol-kit";
import { keccak256, stringToHex } from "viem";
import { hederaTestnet } from "viem/chains";
import { contractNetworks } from "./safeContracts.js";
import { getAgent, getAgentPrivateKey, setAgentSafeAddress } from "./store.js";
import { buildSafeAccountConfig } from "./walletConfig.js";

export type CreateWalletResult = {
  safeAddress: string;
  owners: string[];
  threshold: number;
  transactionHash: string | null;
  deploymentProvenance?:
    | "BROADCAST_RECEIPT"
    | "PREDICTED_SAFE_RECONCILIATION";
};

export type CreateWalletDeploymentContext = {
  saltNonce: string;
  expectedSafeAddress: `0x${string}` | null;
  expectedOwners: `0x${string}`[] | null;
  expectedThreshold: number | null;
  transactionHash: `0x${string}` | null;
  onPrepared(
    predictedSafeAddress: `0x${string}`,
    expectedOwners: `0x${string}`[],
    expectedThreshold: number,
  ): Promise<void>;
  onBroadcast(transactionHash: `0x${string}`): Promise<void>;
  onFailed(
    transactionHash: `0x${string}`,
    failureCode: "TRANSACTION_REVERTED",
  ): Promise<void>;
};

export type ExistingSafeWallet = {
  safeAddress: `0x${string}`;
  owners: `0x${string}`[];
  threshold: number;
};

function getCosignerAddress(): string {
  const address = process.env.AEGIS_COSIGNER_ADDRESS;
  if (!address) throw new Error("AEGIS_COSIGNER_ADDRESS must be set");
  return address;
}

function normalizeKey(key: string): `0x${string}` {
  return key.startsWith("0x") ? (key as `0x${string}`) : `0x${key}`;
}

export async function createWallet(
  agentId: string,
  recoveryGuardianAddress: string,
  deploymentContext: CreateWalletDeploymentContext,
): Promise<CreateWalletResult> {
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) throw new Error("RPC_URL must be set");

  const profile = getAgent(agentId);
  const agentKey = getAgentPrivateKey(agentId);
  const persistedAccountConfig =
    deploymentContext.expectedOwners !== null &&
    deploymentContext.expectedThreshold !== null
      ? {
          owners: deploymentContext.expectedOwners,
          threshold: deploymentContext.expectedThreshold,
        }
      : null;
  const profileAccountConfig = profile
    ? buildSafeAccountConfig(
        profile.evmAddress,
        getCosignerAddress(),
        recoveryGuardianAddress,
      )
    : null;
  if (profileAccountConfig && persistedAccountConfig) {
    assertExpectedSafeConfiguration(
      profileAccountConfig.owners,
      profileAccountConfig.threshold,
      persistedAccountConfig.owners,
      persistedAccountConfig.threshold,
    );
  }
  const safeAccountConfig = profileAccountConfig ?? persistedAccountConfig;
  if (!safeAccountConfig) throw new Error("agent_not_found");

  let protocolKit = await Safe.init({
    provider: rpcUrl,
    signer: agentKey ? normalizeKey(agentKey) : undefined,
    predictedSafe: {
      safeAccountConfig,
      safeDeploymentConfig: {
        saltNonce: deploymentContext.saltNonce,
      },
    },
    contractNetworks,
  });

  const safeAddress = (await protocolKit.getAddress()).toLowerCase() as `0x${string}`;
  if (
    deploymentContext.expectedSafeAddress !== null &&
    deploymentContext.expectedSafeAddress.toLowerCase() !== safeAddress
  ) {
    throw new Error("wallet_prediction_conflict");
  }
  const expectedOwners = safeAccountConfig.owners.map(
    owner => owner.toLowerCase() as `0x${string}`,
  );
  await deploymentContext.onPrepared(
    safeAddress,
    expectedOwners,
    safeAccountConfig.threshold,
  );

  const safeProvider = protocolKit.getSafeProvider();
  const publicClient = safeProvider.getExternalProvider();
  const isAlreadyDeployed = await protocolKit.isSafeDeployed();
  let transactionHash = deploymentContext.transactionHash;
  let deploymentProvenance: CreateWalletResult["deploymentProvenance"];

  if (isAlreadyDeployed) {
    if (transactionHash !== null) {
      await waitForSuccessfulReceipt(
        publicClient,
        transactionHash,
        deploymentContext,
      );
      deploymentProvenance = "BROADCAST_RECEIPT";
    } else {
      deploymentProvenance = "PREDICTED_SAFE_RECONCILIATION";
    }
  } else if (transactionHash !== null) {
    await waitForSuccessfulReceipt(
      publicClient,
      transactionHash,
      deploymentContext,
    );
    if (!(await protocolKit.isSafeDeployed())) {
      throw new Error("safe_deployment_not_observed_after_receipt");
    }
    deploymentProvenance = "BROADCAST_RECEIPT";
  } else {
    if (!agentKey) {
      throw new Error("agent_signer_unavailable_for_wallet_deployment");
    }
    const deploymentTransaction =
      await protocolKit.createSafeDeploymentTransaction();
    const signerClient = await safeProvider.getExternalSigner();
    if (!signerClient) {
      throw new Error("failed to get an external signer for deployment");
    }

    transactionHash = await signerClient.sendTransaction({
      to: deploymentTransaction.to as `0x${string}`,
      value: BigInt(deploymentTransaction.value),
      data: deploymentTransaction.data as `0x${string}`,
      chain: hederaTestnet,
    });
    await deploymentContext.onBroadcast(transactionHash);
    await waitForSuccessfulReceipt(
      publicClient,
      transactionHash,
      deploymentContext,
    );
    deploymentProvenance = "BROADCAST_RECEIPT";
  }

  protocolKit = await protocolKit.connect({ safeAddress });

  const owners = await protocolKit.getOwners();
  const threshold = await protocolKit.getThreshold();
  assertExpectedSafeConfiguration(
    owners,
    threshold,
    safeAccountConfig.owners,
    safeAccountConfig.threshold,
  );

  setAgentSafeAddress(agentId, safeAddress);

  return {
    safeAddress,
    owners,
    threshold,
    transactionHash,
    deploymentProvenance,
  };
}

export function deriveSafeSaltNonce(agentId: string): string {
  const commitment = keccak256(
    stringToHex(`aegis.safe.${hederaTestnet.id}.${agentId.toLowerCase()}`),
  );
  return BigInt(commitment).toString(10);
}

export async function inspectExistingSafeWallet(
  safeAddress: string,
): Promise<ExistingSafeWallet> {
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) throw new Error("RPC_URL must be set");
  if (!/^0x[a-fA-F0-9]{40}$/.test(safeAddress)) {
    throw new Error("legacy Safe address must be a valid EVM address");
  }
  const normalizedAddress = safeAddress.toLowerCase() as `0x${string}`;
  const protocolKit = await Safe.init({
    provider: rpcUrl,
    safeAddress: normalizedAddress,
    contractNetworks,
  });
  if (!(await protocolKit.isSafeDeployed())) {
    throw new Error("persisted_legacy_safe_is_not_deployed");
  }
  const owners = (await protocolKit.getOwners()).map(
    owner => owner.toLowerCase() as `0x${string}`,
  );
  const threshold = await protocolKit.getThreshold();
  if (
    owners.length === 0 ||
    !Number.isInteger(threshold) ||
    threshold <= 0 ||
    threshold > owners.length
  ) {
    throw new Error("persisted_legacy_safe_configuration_invalid");
  }
  return { safeAddress: normalizedAddress, owners, threshold };
}

async function waitForSuccessfulReceipt(
  publicClient: {
    waitForTransactionReceipt(input: {
      hash: `0x${string}`;
    }): Promise<{ status: string }>;
  },
  transactionHash: `0x${string}`,
  deploymentContext: CreateWalletDeploymentContext,
): Promise<void> {
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: transactionHash,
  });
  if (receipt.status !== "success") {
    await deploymentContext.onFailed(
      transactionHash,
      "TRANSACTION_REVERTED",
    );
    throw new Error("safe_deployment_transaction_reverted");
  }
}

function assertExpectedSafeConfiguration(
  actualOwners: string[],
  actualThreshold: number,
  expectedOwners: string[],
  expectedThreshold: number,
): void {
  const normalizedActualOwners = actualOwners
    .map(owner => owner.toLowerCase())
    .sort();
  const normalizedExpectedOwners = expectedOwners
    .map(owner => owner.toLowerCase())
    .sort();
  if (
    actualThreshold !== expectedThreshold ||
    normalizedActualOwners.length !== normalizedExpectedOwners.length ||
    normalizedActualOwners.some(
      (owner, index) => owner !== normalizedExpectedOwners[index],
    )
  ) {
    throw new Error("deployed_safe_configuration_mismatch");
  }
}
