import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyTeeValidationRegistryDeployment } from "./deployment.js";
import { loadTeeSmartContractValidationEnv } from "./loadTeeSmartContractValidationEnv.js";

export async function main(args = process.argv.slice(2)) {
  if (args.length > 0) {
    throw new Error(
      `Unknown TeeML registry verification arguments: ${args.join(", ")}`
    );
  }
  const config = loadTeeSmartContractValidationEnv();
  const artifact = await verifyTeeValidationRegistryDeployment(config);
  process.stdout.write(
    `${JSON.stringify({
      contractName: artifact.contractName,
      address: artifact.address,
      chainId: artifact.chainId,
      bytecodeHash: artifact.bytecodeHash,
      adminAddress: artifact.adminAddress,
      recorderAddress: artifact.recorderAddress,
      verified: true,
    })}\n`
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(() => {
    process.stderr.write(
      "TeeML registry verification failed closed. Resolve any pending journal with the dedicated recovery command. No provider or secret details were printed.\n"
    );
    process.exitCode = 1;
  });
}
