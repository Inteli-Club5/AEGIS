import { getServerZeroGGalileoRpcUrl, getZeroGStorageIndexerUrl, getZeroGStorageUriPrefix } from "./chain";
import { stableStringify } from "./metadata";
import { Indexer, ZgFile } from "@0glabs/0g-ts-sdk";
import { randomUUID } from "crypto";
import type { Wallet } from "ethers";
import { mkdtemp, readFile, unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

export type UploadedAgentMetadata = {
  rootHash: string;
  uri: string;
  uploadTxHash: string;
};

export const uploadAgentMetadataToZeroGStorage = async (
  metadata: Record<string, unknown>,
  wallet: Wallet,
): Promise<UploadedAgentMetadata> => {
  const metadataJson = stableStringify(metadata);
  const indexer = new Indexer(getZeroGStorageIndexerUrl());
  const tempDir = await mkdtemp(join(tmpdir(), "aegis-0g-agentic-id-"));
  const sourcePath = join(tempDir, `${randomUUID()}.json`);
  const verifiedPath = join(tempDir, `${randomUUID()}.verified.json`);

  await writeFile(sourcePath, metadataJson);

  const file = await ZgFile.fromFilePath(sourcePath);
  try {
    const [tree, treeError] = await file.merkleTree();
    if (treeError || !tree) {
      throw new Error(`0G Storage Merkle tree generation failed: ${treeError?.message || "missing tree"}`);
    }

    const rootHash = tree.rootHash();
    if (!rootHash) {
      throw new Error("0G Storage Merkle tree did not return a root hash.");
    }

    const signer = wallet as unknown as Parameters<Indexer["upload"]>[2];
    const [uploadResult, uploadError] = await indexer.upload(file, getServerZeroGGalileoRpcUrl(), signer);
    if (uploadError || !uploadResult) {
      throw new Error(`0G Storage upload failed: ${uploadError?.message || "missing upload result"}`);
    }

    if (!uploadResult.rootHash) {
      throw new Error("0G Storage upload did not return a root hash.");
    }

    if (uploadResult.rootHash.toLowerCase() !== rootHash.toLowerCase()) {
      throw new Error("0G Storage upload root hash does not match locally computed Merkle root.");
    }

    const downloadError = await indexer.download(rootHash, verifiedPath, true);
    if (downloadError) {
      throw new Error(`0G Storage verified download failed: ${downloadError.message}`);
    }

    const verifiedJson = await readFile(verifiedPath, "utf8");
    if (verifiedJson !== metadataJson) {
      throw new Error("0G Storage verified download content does not match uploaded metadata.");
    }

    return {
      rootHash,
      uri: `${getZeroGStorageUriPrefix()}${rootHash}`,
      uploadTxHash: uploadResult.txHash,
    };
  } finally {
    await file.close();
    await unlink(sourcePath).catch(() => undefined);
    await unlink(verifiedPath).catch(() => undefined);
  }
};
