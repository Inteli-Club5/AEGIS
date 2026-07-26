import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deployTeeValidationRegistry } from "./deployment.js";
import { loadTeeSmartContractValidationEnv } from "./loadTeeSmartContractValidationEnv.js";

export const AFTER_CONFIRMED_FAILURE_FLAG = "--after-confirmed-failure";

export function parseDeploymentArguments(args) {
  let allowRedeploy = false;
  let afterConfirmedFailureTxHash;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--redeploy" && !allowRedeploy) {
      allowRedeploy = true;
      continue;
    }
    if (
      argument === AFTER_CONFIRMED_FAILURE_FLAG &&
      afterConfirmedFailureTxHash === undefined
    ) {
      const value = args[index + 1];
      if (!value || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
        throw new Error(
          `${AFTER_CONFIRMED_FAILURE_FLAG} requires the exact archived failed transaction hash.`
        );
      }
      afterConfirmedFailureTxHash = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown TeeML registry deployment argument: ${argument}`);
  }
  return Object.freeze({ allowRedeploy, afterConfirmedFailureTxHash });
}

export async function main(args = process.argv.slice(2)) {
  const options = parseDeploymentArguments(args);
  const config = loadTeeSmartContractValidationEnv();
  const artifact = await deployTeeValidationRegistry(config, options);
  process.stdout.write(
    `${JSON.stringify({
      contractName: artifact.contractName,
      address: artifact.address,
      deployTxHash: artifact.deployTxHash,
      deployBlock: artifact.deployBlock,
      adminAddress: artifact.adminAddress,
      recorderAddress: artifact.recorderAddress,
    })}\n`
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(() => {
    process.stderr.write(
      "TeeML registry deployment failed closed. If a pending journal exists, run the dedicated recovery command. No provider or secret details were printed.\n"
    );
    process.exitCode = 1;
  });
}
