import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDirectory, "../..");
const checkOnly = process.argv.includes("--check");
const networkArgumentIndex = process.argv.indexOf("--network");
const requestedNetwork = networkArgumentIndex === -1 ? "all" : process.argv[networkArgumentIndex + 1];

if (!["all", "hedera", "0g"].includes(requestedNetwork)) {
  throw new Error("--network must be one of: all, hedera, 0g");
}

const configurations = [
  {
    key: "hedera",
    label: "Hedera TeeML validation registry",
    artifactPath:
      process.env.THEGRAPH_HEDERA_DEPLOYMENT_ARTIFACT ||
      join(repoRoot, "deployments/hedera-testnet/tee-validation-registry.json"),
    templatePath: join(repoRoot, "subgraphs/aegis-hedera/subgraph.template.yaml"),
    outputPath: join(repoRoot, "subgraphs/aegis-hedera/subgraph.yaml"),
    expectedChainId: 296,
    graphNetwork: "hedera-testnet",
    addressToken: "{{REGISTRY_ADDRESS}}",
    startBlockToken: "{{REGISTRY_START_BLOCK}}",
  },
  {
    key: "0g",
    label: "0G Agentic ID",
    artifactPath:
      process.env.THEGRAPH_0G_DEPLOYMENT_ARTIFACT ||
      join(repoRoot, "subgraphs/aegis-0g/config/agentic-id.json"),
    templatePath: join(repoRoot, "subgraphs/aegis-0g/subgraph.template.yaml"),
    outputPath: join(repoRoot, "subgraphs/aegis-0g/subgraph.yaml"),
    expectedChainId: 16602,
    graphNetwork: "0g-galileo",
    addressToken: "{{AGENTIC_ID_ADDRESS}}",
    startBlockToken: "{{AGENTIC_ID_START_BLOCK}}",
  },
];

const selectedConfigurations = configurations.filter(
  configuration => requestedNetwork === "all" || requestedNetwork === configuration.key,
);

for (const configuration of selectedConfigurations) {
  const artifact = readArtifact(configuration);
  const address = requireAddress(artifact.address, configuration.label);
  const startBlock = requireStartBlock(artifact, configuration.label);
  const chainId = requireChainId(artifact.chainId, configuration.label);

  if (chainId !== configuration.expectedChainId) {
    throw new Error(
      `${configuration.label} artifact chainId is ${chainId}; expected ${configuration.expectedChainId}.`,
    );
  }

  if (configuration.key === "hedera") {
    verifyOrRefreshRegistryAbi(artifact, checkOnly);
  }

  const template = readFileSync(configuration.templatePath, "utf8");
  const manifest = template
    .replaceAll("{{NETWORK}}", configuration.graphNetwork)
    .replaceAll(configuration.addressToken, address)
    .replaceAll(configuration.startBlockToken, String(startBlock));

  if (/\{\{[^}]+\}\}/.test(manifest)) {
    throw new Error(`${configuration.label} manifest still contains unresolved template values.`);
  }

  if (!checkOnly) {
    writeAtomic(configuration.outputPath, manifest);
    console.log(`Generated ${configuration.outputPath.replace(`${repoRoot}/`, "")}`);
  } else {
    console.log(
      `Validated ${configuration.label} artifact (${address}, chain ${chainId}, start block ${startBlock}).`,
    );
  }
}

function readArtifact(configuration) {
  if (!existsSync(configuration.artifactPath)) {
    throw new Error(
      `${configuration.label} public deployment artifact is missing: ${configuration.artifactPath}. ` +
        "A manifest will not be generated without a real address and start block.",
    );
  }

  try {
    return JSON.parse(readFileSync(configuration.artifactPath, "utf8"));
  } catch (error) {
    throw new Error(`${configuration.label} deployment artifact is not valid JSON: ${error.message}`);
  }
}

function requireAddress(value, label) {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${label} artifact address must be a 20-byte 0x-prefixed EVM address.`);
  }
  if (/^0x0{40}$/i.test(value)) {
    throw new Error(`${label} artifact address must not be the zero address.`);
  }
  return value;
}

function requireStartBlock(artifact, label) {
  const value = artifact.startBlock ?? artifact.deployBlock ?? artifact.deploymentBlock;
  const parsed = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} artifact must contain a non-negative integer startBlock or deployBlock.`);
  }
  return parsed;
}

function requireChainId(value, label) {
  const parsed =
    typeof value === "string" && /^0x[0-9a-f]+$/i.test(value)
      ? Number.parseInt(value.slice(2), 16)
      : typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
        : value;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} artifact chainId must be a positive integer.`);
  }
  return parsed;
}

function verifyOrRefreshRegistryAbi(artifact, isCheckOnly) {
  const localAbiPath = join(repoRoot, "subgraphs/aegis-hedera/abis/AegisTeeValidationRegistry.json");
  let abi = readAbi(localAbiPath, "registry ABI exported from the compiler artifact");

  if (typeof artifact.abiPath === "string" && artifact.abiPath.trim()) {
    const artifactAbiPath = isAbsolute(artifact.abiPath)
      ? artifact.abiPath
      : resolve(repoRoot, artifact.abiPath);
    if (!existsSync(artifactAbiPath)) {
      throw new Error(`Registry artifact abiPath does not exist: ${artifactAbiPath}`);
    }
    abi = readAbi(artifactAbiPath, "compiled registry ABI");
    if (!isCheckOnly) {
      writeAtomic(localAbiPath, `${JSON.stringify(abi, null, 2)}\n`);
      console.log("Refreshed the registry ABI from the compiled artifact.");
    }
  } else {
    console.warn(
      "Registry deployment artifact has no abiPath; using the ABI already exported from the Foundry compiler artifact.",
    );
  }

  assertRegistryEvent(abi);
}

function readAbi(path, label) {
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  const abi = Array.isArray(parsed) ? parsed : parsed.abi;
  if (!Array.isArray(abi)) {
    throw new Error(`${label} does not contain an ABI array.`);
  }
  return abi;
}

function assertRegistryEvent(abi) {
  const expectedInputs = [
    ["requestId", "bytes32", true],
    ["agentIdHash", "bytes32", true],
    ["actionHash", "bytes32", true],
    ["policyHash", "bytes32", false],
    ["semanticContextHash", "bytes32", false],
    ["teemlRequestHash", "bytes32", false],
    ["artifactHash", "bytes32", false],
    ["modelIdHash", "bytes32", false],
    ["reasonCodeHash", "bytes32", false],
    ["safe", "address", false],
    ["agenticIdTokenId", "uint256", false],
    ["verdict", "uint8", false],
    ["recorder", "address", false],
    ["schemaVersion", "uint16", false],
  ];
  const event = abi.find(item => item?.type === "event" && item?.name === "TeeMLValidationRecorded");
  if (!event || event.inputs?.length !== expectedInputs.length) {
    throw new Error("Registry ABI is missing the exact TeeMLValidationRecorded event.");
  }
  for (let index = 0; index < expectedInputs.length; index += 1) {
    const [name, type, indexed] = expectedInputs[index];
    const input = event.inputs[index];
    if (input.name !== name || input.type !== type || Boolean(input.indexed) !== indexed) {
      throw new Error(`Registry ABI TeeMLValidationRecorded input ${index} does not match ${name}:${type}.`);
    }
  }
}

function writeAtomic(path, content) {
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, content, { mode: 0o644 });
  renameSync(temporaryPath, path);
}
