import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseAuthorizedTestRecordArguments,
  prepareAuthorizedContractIndexingTest,
} from "./authorizedTestRecord.js";

export async function main(args = process.argv.slice(2)) {
  const parsedArguments = parseAuthorizedTestRecordArguments(args);
  const evidence = await prepareAuthorizedContractIndexingTest(parsedArguments);
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(() => {
    process.stderr.write(
      "Authorized contract/indexing test record preparation failed closed. No provider or secret details were printed.\n"
    );
    process.exitCode = 1;
  });
}
