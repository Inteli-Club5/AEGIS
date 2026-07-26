import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { acknowledgeConfirmedFailedDeployment } from "./acknowledgeFailedDeployment.js";
import { loadTeeSmartContractValidationEnv } from "./loadTeeSmartContractValidationEnv.js";

export const ACKNOWLEDGE_FAILED_FLAG =
  "--acknowledge-confirmed-failed-deployment";

export function parseAcknowledgementArguments(args) {
  if (args.length !== 2 || args[0] !== ACKNOWLEDGE_FAILED_FLAG) {
    throw new Error(
      `Usage: ${ACKNOWLEDGE_FAILED_FLAG} <exact-pending-deploy-tx-hash>`
    );
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(args[1])) {
    throw new Error(
      "Failed deployment acknowledgement requires an exact transaction hash."
    );
  }
  return args[1];
}

export async function main(args = process.argv.slice(2)) {
  const approvedTxHash = parseAcknowledgementArguments(args);
  const config = loadTeeSmartContractValidationEnv();
  const archive = await acknowledgeConfirmedFailedDeployment(
    config,
    approvedTxHash
  );
  process.stdout.write(
    `${JSON.stringify({
      classification: archive.classification,
      deployTxHash: archive.deployTxHash,
      receiptStatus: archive.receiptStatus,
      receiptBlockNumber: archive.receiptBlockNumber,
      predictedAddress: archive.predictedAddress,
      archived: true,
      nextDeploymentRequires: `--after-confirmed-failure ${archive.deployTxHash}`,
    })}\n`
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(() => {
    process.stderr.write(
      "Failed registry deployment acknowledgement failed closed. The pending journal was preserved unless a matching sanitized archive was durably written. No provider or secret details were printed.\n"
    );
    process.exitCode = 1;
  });
}
