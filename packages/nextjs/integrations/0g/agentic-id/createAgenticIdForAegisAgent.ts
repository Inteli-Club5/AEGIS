import { agenticIdAbi } from "./abi";
import {
  ZERO_G_GALILEO_CHAIN_ID,
  getServerZeroGGalileoRpcUrl,
  getZeroGAgenticIdContractAddress,
  getZeroGExplorerTxUrl,
} from "./chain";
import { getRequiredEnvValue } from "./env";
import { buildAgentProfileMetadata, buildAgenticIdIntelligentData, buildMetadataHash } from "./metadata";
import { uploadAgentMetadataToZeroGStorage } from "./storage";
import type { CreateAgenticIdForAegisAgentInput, CreateAgenticIdForAegisAgentResult } from "./types";
import { Contract, Interface, JsonRpcProvider, Wallet, ZeroAddress, getAddress, isAddress } from "ethers";
import "server-only";
import type { Address, Hex } from "viem";

const toAddress = (value: string, label: string): Address => {
  if (!isAddress(value)) {
    throw new Error(`${label} must be a valid EVM address.`);
  }

  return getAddress(value) as Address;
};

const toBytes32 = (value: string, label: string): Hex => {
  if (!/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error(`${label} must be a bytes32 hex value.`);
  }

  return value as Hex;
};

const normalizePrivateKey = (value: string) => {
  const privateKey = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
    throw new Error("ZERO_G_PRIVATE_KEY or PRIVATE_KEY must be a 32-byte hex private key.");
  }

  return privateKey;
};

export const normalizeCreateAgenticIdInput = (input: unknown): CreateAgenticIdForAegisAgentInput => {
  const raw = input as Partial<Record<keyof CreateAgenticIdForAegisAgentInput, unknown>>;
  const capabilities = Array.isArray(raw.capabilities)
    ? raw.capabilities
        .map(String)
        .map(value => value.trim())
        .filter(Boolean)
    : [];

  if (capabilities.length === 0) {
    throw new Error("capabilities must contain at least one capability.");
  }

  const normalized = {
    aegisAgentId: String(raw.aegisAgentId || "").trim(),
    ownerAddress: toAddress(String(raw.ownerAddress || ""), "ownerAddress"),
    agentName: String(raw.agentName || "").trim(),
    agentDescription: String(raw.agentDescription || "").trim(),
    agentType: String(raw.agentType || "").trim(),
    capabilities,
    agentWalletAddress: toAddress(String(raw.agentWalletAddress || ""), "agentWalletAddress"),
    policyHash: toBytes32(String(raw.policyHash || ""), "policyHash"),
    metadata: raw.metadata && typeof raw.metadata === "object" ? (raw.metadata as Record<string, unknown>) : undefined,
  };

  for (const field of ["aegisAgentId", "agentName", "agentDescription", "agentType"] as const) {
    if (!normalized[field]) {
      throw new Error(`${field} is required.`);
    }
  }

  return normalized;
};

const getMintedTokenId = (
  logs: Array<{ address: string; data: string; topics: readonly string[] }>,
  contractAddress: Address,
  recipient: Address,
) => {
  const iface = new Interface(agenticIdAbi);

  for (const log of logs) {
    if (log.address.toLowerCase() !== contractAddress.toLowerCase()) {
      continue;
    }

    const parsedLog = (() => {
      try {
        return iface.parseLog({ data: log.data, topics: [...log.topics] });
      } catch {
        return null;
      }
    })();
    if (!parsedLog || parsedLog.name !== "Transfer") {
      continue;
    }

    const [from, to, tokenId] = parsedLog.args;
    if (
      String(from).toLowerCase() === ZeroAddress.toLowerCase() &&
      String(to).toLowerCase() === recipient.toLowerCase()
    ) {
      return BigInt(tokenId.toString());
    }
  }

  throw new Error("AgenticID mint confirmed, but Transfer mint event could not be parsed.");
};

export const createAgenticIdForAegisAgent = async (
  rawInput: CreateAgenticIdForAegisAgentInput,
): Promise<CreateAgenticIdForAegisAgentResult> => {
  const input = normalizeCreateAgenticIdInput(rawInput);
  const rpcUrl = getServerZeroGGalileoRpcUrl();
  const provider = new JsonRpcProvider(rpcUrl, ZERO_G_GALILEO_CHAIN_ID);
  const wallet = new Wallet(normalizePrivateKey(getRequiredEnvValue(["ZERO_G_PRIVATE_KEY", "PRIVATE_KEY"])), provider);
  const serviceSignerAddress = getAddress(await wallet.getAddress()) as Address;
  const ownerAddress = input.ownerAddress;
  const contractAddress = toAddress(getZeroGAgenticIdContractAddress(), "ZERO_G_AGENTIC_ID_CONTRACT_ADDRESS");
  const contract = new Contract(contractAddress, agenticIdAbi, wallet);

  const metadata = buildAgentProfileMetadata(input);
  const metadataHash = buildMetadataHash(metadata);
  const intelligentData = buildAgenticIdIntelligentData(input, metadataHash);
  const uploadedMetadata = await uploadAgentMetadataToZeroGStorage(metadata, wallet);

  const mintFee = (await contract.mintFee()) as bigint;

  // TODO(agentic-id-custody): if AEGIS should never temporarily own the token,
  // add an AgenticID operator role flow or require a user/delegated signer that
  // can call both iMint and setTokenURI before final ownership is assigned.
  const mintTx = await contract.iMint(serviceSignerAddress, intelligentData, { value: mintFee });
  const mintReceipt = await mintTx.wait();
  if (!mintReceipt || mintReceipt.status !== 1) {
    throw new Error("0G Agentic ID mint transaction failed.");
  }

  const tokenId = getMintedTokenId(mintReceipt.logs, contractAddress, serviceSignerAddress);
  const setTokenUriTx = await contract.setTokenURI(tokenId, uploadedMetadata.uri);
  const setTokenUriReceipt = await setTokenUriTx.wait();
  if (!setTokenUriReceipt || setTokenUriReceipt.status !== 1) {
    throw new Error("0G Agentic ID setTokenURI transaction failed.");
  }

  let transferTxHash: Hex | null = null;
  if (ownerAddress !== serviceSignerAddress) {
    const transferTx = await contract.transferFrom(serviceSignerAddress, ownerAddress, tokenId);
    const transferReceipt = await transferTx.wait();
    if (!transferReceipt || transferReceipt.status !== 1) {
      throw new Error("0G Agentic ID transfer to final owner failed.");
    }
    transferTxHash = transferTx.hash as Hex;
  }

  const finalTokenOwner = getAddress((await contract.ownerOf(tokenId)) as string) as Address;
  if (finalTokenOwner !== ownerAddress) {
    throw new Error("0G Agentic ID final token owner does not match ownerAddress.");
  }

  const tokenURI = (await contract.tokenURI(tokenId)) as string;
  if (tokenURI !== uploadedMetadata.uri) {
    throw new Error("0G Agentic ID tokenURI does not match uploaded 0G Storage metadata URI.");
  }

  // TODO(persistence): persist this result in the real AEGIS backend database
  // after the core app storage layer exists. This function intentionally does
  // not write local browser state.
  return {
    aegisAgentId: input.aegisAgentId,
    agenticIdTokenId: tokenId.toString(),
    agenticIdContractAddress: contractAddress,
    metadataHash,
    metadataRootHash: uploadedMetadata.rootHash,
    metadataURI: uploadedMetadata.uri,
    metadata,
    intelligentData,
    metadataUploadTxHash: uploadedMetadata.uploadTxHash,
    mintTxHash: mintTx.hash as Hex,
    txHash: mintTx.hash as Hex,
    setTokenUriTxHash: setTokenUriTx.hash as Hex,
    transferTxHash,
    explorerUrl: getZeroGExplorerTxUrl(mintTx.hash),
    ownerAddress,
    serviceSignerAddress,
    finalTokenOwner,
  };
};
