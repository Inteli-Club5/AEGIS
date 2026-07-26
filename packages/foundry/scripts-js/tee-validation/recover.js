import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { recoverTeeValidationRegistryDeployment } from "./deployment.js";
import { loadTeeSmartContractValidationEnv } from "./loadTeeSmartContractValidationEnv.js";

export async function main(args = process.argv.slice(2)) {
  if (args.length > 0) {
    throw new Error(
      `Unknown TeeML registry recovery arguments: ${args.join(", ")}`
    );
  }
  const config = loadTeeSmartContractValidationEnv();
  const artifact = await recoverTeeValidationRegistryDeployment(config);
  process.stdout.write(
    `${JSON.stringify({
      contractName: artifact.contractName,
      address: artifact.address,
      deployTxHash: artifact.deployTxHash,
      deployBlock: artifact.deployBlock,
      recovered: true,
    })}\n`
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(() => {
    process.stderr.write(
      "TeeML registry recovery failed closed. The pending journal was preserved. No provider or secret details were printed.\n"
    );
    process.exitCode = 1;
  });
}
