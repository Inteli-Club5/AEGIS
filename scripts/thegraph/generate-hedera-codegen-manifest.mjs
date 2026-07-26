import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDirectory, "../..");
const subgraphDirectory = join(repoRoot, "subgraphs/aegis-hedera");
const templatePath = join(subgraphDirectory, "subgraph.template.yaml");
const outputPath = join(subgraphDirectory, ".thegraph/codegen.yaml");
const matchstickPath = join(subgraphDirectory, ".thegraph/matchstick.yaml");

const template = readFileSync(templatePath, "utf8");
const unaddressedManifest = template
  .replaceAll("{{NETWORK}}", "hedera-testnet")
  .replace(/^\s+address: "\{\{REGISTRY_ADDRESS\}\}"\n/m, "")
  .replace(/^\s+startBlock: \{\{REGISTRY_START_BLOCK\}\}\n/m, "");
const manifest = unaddressedManifest.replaceAll("./", "../");

if (/\{\{[^}]+\}\}/.test(manifest)) {
  throw new Error("Codegen-only manifest still contains an unresolved template value.");
}

mkdirSync(dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.tmp`;
writeFileSync(
  temporaryPath,
  "# CODEGEN/UNIT-TEST ONLY: registry address and start block are intentionally absent. Never deploy this manifest.\n" +
    manifest,
  { mode: 0o644 },
);
renameSync(temporaryPath, outputPath);
const matchstickTemporaryPath = `${matchstickPath}.tmp`;
writeFileSync(
  matchstickTemporaryPath,
  "# CODEGEN/UNIT-TEST ONLY: registry address and start block are intentionally absent. Never deploy this manifest.\n" +
    unaddressedManifest,
  { mode: 0o644 },
);
renameSync(matchstickTemporaryPath, matchstickPath);
console.log("Generated an unaddressed Hedera codegen/unit-test manifest; live deployment remains blocked.");
