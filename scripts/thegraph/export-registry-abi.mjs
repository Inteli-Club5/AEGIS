import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDirectory, "../..");
const compilerArtifact =
  process.env.THEGRAPH_HEDERA_COMPILER_ARTIFACT ||
  join(
    repoRoot,
    "packages/foundry/out/AegisTeeValidationRegistry.sol/AegisTeeValidationRegistry.json",
  );
const outputPath = join(
  repoRoot,
  "subgraphs/aegis-hedera/abis/AegisTeeValidationRegistry.json",
);

if (!existsSync(compilerArtifact)) {
  throw new Error(
    `Compiler artifact is missing: ${compilerArtifact}. Run the real Foundry compile before exporting the ABI.`,
  );
}

const artifact = JSON.parse(readFileSync(compilerArtifact, "utf8"));
if (!Array.isArray(artifact.abi)) {
  throw new Error(`Compiler artifact does not contain an ABI array: ${compilerArtifact}`);
}
assertRegistryEvent(artifact.abi);

const temporaryPath = `${outputPath}.tmp`;
writeFileSync(temporaryPath, `${JSON.stringify(artifact.abi, null, 2)}\n`, { mode: 0o644 });
renameSync(temporaryPath, outputPath);
console.log("Exported AegisTeeValidationRegistry ABI atomically from the Foundry compiler artifact.");

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
    throw new Error("Compiler ABI is missing the exact TeeMLValidationRecorded event.");
  }
  for (let index = 0; index < expectedInputs.length; index += 1) {
    const [name, type, indexed] = expectedInputs[index];
    const input = event.inputs[index];
    if (input.name !== name || input.type !== type || Boolean(input.indexed) !== indexed) {
      throw new Error(`TeeMLValidationRecorded input ${index} does not match ${name}:${type}.`);
    }
  }
}
