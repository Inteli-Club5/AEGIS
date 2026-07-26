import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));

export const REPOSITORY_ROOT = resolve(currentDirectory, "../../../..");
export const FOUNDRY_ROOT = join(REPOSITORY_ROOT, "packages/foundry");
export const TEE_VALIDATION_ENV_PATH = join(
  REPOSITORY_ROOT,
  "tee-smartcontract-validation"
);
export const COMPILED_CONTRACT_ARTIFACT_PATH = join(
  FOUNDRY_ROOT,
  "out/AegisTeeValidationRegistry.sol/AegisTeeValidationRegistry.json"
);
export const PUBLIC_DEPLOYMENT_DIRECTORY = join(
  REPOSITORY_ROOT,
  "deployments/hedera-testnet"
);
export const PUBLIC_DEPLOYMENT_ARTIFACT_PATH = join(
  PUBLIC_DEPLOYMENT_DIRECTORY,
  "tee-validation-registry.json"
);
export const PUBLIC_ABI_PATH = join(
  PUBLIC_DEPLOYMENT_DIRECTORY,
  "tee-validation-registry.abi.json"
);
export const PENDING_DEPLOYMENT_DIRECTORY = join(
  REPOSITORY_ROOT,
  ".thegraph/deployments/hedera-testnet"
);
export const PENDING_DEPLOYMENT_JOURNAL_PATH = join(
  PENDING_DEPLOYMENT_DIRECTORY,
  "tee-validation-registry.pending.json"
);
export const FAILED_DEPLOYMENT_ARCHIVE_DIRECTORY = join(
  PENDING_DEPLOYMENT_DIRECTORY,
  "failed"
);
export const PUBLIC_ABI_REPOSITORY_PATH = relative(
  REPOSITORY_ROOT,
  PUBLIC_ABI_PATH
);
export const COMPILED_ARTIFACT_REPOSITORY_PATH = relative(
  REPOSITORY_ROOT,
  COMPILED_CONTRACT_ARTIFACT_PATH
);

export const CONTRACT_NAME = "AegisTeeValidationRegistry";
export const HEDERA_TESTNET_CHAIN_ID = 296;
export const HEDERA_TESTNET_NETWORK = "hedera-testnet";
export const REGISTRY_SCHEMA_VERSION = 1;
