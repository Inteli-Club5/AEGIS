import Safe from "@safe-global/protocol-kit";
import { hederaTestnet } from "viem/chains";
import { contractNetworks } from "./safeContracts.js";
import { getAgent, getAgentPrivateKey, setAgentSafeAddress } from "./store.js";
import type { AgentProfile } from "./types.js";

export type CreateWalletResult = {
  safeAddress: string;
  owners: string[];
  threshold: number;
  transactionHash: string;
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
): Promise<CreateWalletResult> {
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) throw new Error("RPC_URL must be set");

  const profile: AgentProfile | undefined = getAgent(agentId);
  const agentKey = getAgentPrivateKey(agentId);
  if (!profile || !agentKey) throw new Error("agent_not_found");

  const owners = [profile.evmAddress, getCosignerAddress(), recoveryGuardianAddress];

  let protocolKit = await Safe.init({
    provider: rpcUrl,
    signer: normalizeKey(agentKey),
    predictedSafe: {
      safeAccountConfig: { owners, threshold: 2 },
    },
    contractNetworks,
  });

  const safeAddress = await protocolKit.getAddress();
  const deploymentTransaction = await protocolKit.createSafeDeploymentTransaction();

  const safeProvider = protocolKit.getSafeProvider();
  const signerClient = await safeProvider.getExternalSigner();
  if (!signerClient) throw new Error("failed to get an external signer for deployment");

  const transactionHash = await signerClient.sendTransaction({
    to: deploymentTransaction.to as `0x${string}`,
    value: BigInt(deploymentTransaction.value),
    data: deploymentTransaction.data as `0x${string}`,
    chain: hederaTestnet,
  });

  const publicClient = safeProvider.getExternalProvider();
  await publicClient.waitForTransactionReceipt({ hash: transactionHash });

  protocolKit = await protocolKit.connect({ safeAddress });

  setAgentSafeAddress(agentId, safeAddress);

  return {
    safeAddress,
    owners: await protocolKit.getOwners(),
    threshold: await protocolKit.getThreshold(),
    transactionHash,
  };
}