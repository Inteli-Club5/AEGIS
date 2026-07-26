import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, it } from "node:test";
import { TEE_VALIDATION_ENV_PATH } from "./constants.js";
import {
  TEE_VALIDATION_ENV_KEYS,
  parseTeeSmartContractValidationEnv,
  teeSmartContractValidationEnvTestApi,
} from "./loadTeeSmartContractValidationEnv.js";

const validContents = (overrides = {}) => {
  const values = {
    TEE_VALIDATION_HEDERA_RPC_URL: "https://testnet.hashio.io/api",
    TEE_VALIDATION_HEDERA_CHAIN_ID: "296",
    TEE_VALIDATION_DEPLOYER_PRIVATE_KEY: `0x${"11".repeat(32)}`,
    TEE_VALIDATION_ADMIN_ADDRESS: "0x00000000000000000000000000000000000000a1",
    TEE_VALIDATION_RECORDER_ADDRESS:
      "0x00000000000000000000000000000000000000b2",
    TEE_VALIDATION_CONFIRMATIONS: "1",
    ...overrides,
  };
  return Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
};

const withTemporaryDirectory = (run) => {
  const directory = mkdtempSync(join(tmpdir(), "aegis-tee-validation-env-"));
  try {
    return run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

describe("tee-smartcontract-validation loader", () => {
  it("targets the exact dedicated filename without generic dotenv initialization or ambient variables", () => {
    const source = readFileSync(
      new URL("./loadTeeSmartContractValidationEnv.js", import.meta.url),
      "utf8"
    );

    assert.equal(
      basename(TEE_VALIDATION_ENV_PATH),
      "tee-smartcontract-validation"
    );
    assert.equal(source.includes(["dotenv", "config"].join(".")), false);
    assert.equal(source.includes(["process", "env"].join(".")), false);
    assert.equal(source.includes(".env.local"), false);
  });

  it("returns only the strict whitelist with normalized validated values", () => {
    const parsed = parseTeeSmartContractValidationEnv(validContents());

    assert.deepEqual(Object.keys(parsed), TEE_VALIDATION_ENV_KEYS);
    assert.equal(parsed.TEE_VALIDATION_HEDERA_CHAIN_ID, 296);
    assert.equal(parsed.TEE_VALIDATION_CONFIRMATIONS, 1);
    assert.equal(
      parsed.TEE_VALIDATION_ADMIN_ADDRESS,
      "0x00000000000000000000000000000000000000A1"
    );
    assert.equal(
      parsed.TEE_VALIDATION_RECORDER_ADDRESS,
      "0x00000000000000000000000000000000000000b2"
    );
    assert.equal(Object.isFrozen(parsed), true);
  });

  it("loads a regular owner-only file after fail-closed metadata checks", () => {
    withTemporaryDirectory((directory) => {
      const envPath = join(directory, "tee-smartcontract-validation");
      writeFileSync(envPath, validContents(), { mode: 0o600 });
      chmodSync(envPath, 0o600);

      const parsed = teeSmartContractValidationEnvTestApi.loadFromPath(envPath);

      assert.deepEqual(Object.keys(parsed), TEE_VALIDATION_ENV_KEYS);
      assert.equal(parsed.TEE_VALIDATION_HEDERA_CHAIN_ID, 296);
    });
  });

  it("rejects a symbolic link even when its target is an owner-only regular file", () => {
    withTemporaryDirectory((directory) => {
      const targetPath = join(directory, "target");
      const envPath = join(directory, "tee-smartcontract-validation");
      writeFileSync(targetPath, validContents(), { mode: 0o600 });
      chmodSync(targetPath, 0o600);
      symlinkSync(targetPath, envPath);

      assert.throws(
        () => teeSmartContractValidationEnvTestApi.loadFromPath(envPath),
        /must not be a symbolic link/
      );
    });
  });

  it("rejects a non-file before attempting to read it", () => {
    withTemporaryDirectory((directory) => {
      const envPath = join(directory, "tee-smartcontract-validation");
      mkdirSync(envPath, { mode: 0o700 });

      assert.throws(
        () => teeSmartContractValidationEnvTestApi.loadFromPath(envPath),
        /must be a regular file/
      );
    });
  });

  it("fails closed when the dedicated path does not exist", () => {
    withTemporaryDirectory((directory) => {
      const envPath = join(directory, "tee-smartcontract-validation");

      assert.throws(
        () => teeSmartContractValidationEnvTestApi.loadFromPath(envPath),
        /Missing repository-root tee-smartcontract-validation file/
      );
    });
  });

  it("rejects every group or other permission bit", () => {
    for (const permissionBit of [0o040, 0o020, 0o010, 0o004, 0o002, 0o001]) {
      withTemporaryDirectory((directory) => {
        const envPath = join(directory, "tee-smartcontract-validation");
        writeFileSync(envPath, validContents(), { mode: 0o600 });
        chmodSync(envPath, 0o600 | permissionBit);

        assert.throws(
          () => teeSmartContractValidationEnvTestApi.loadFromPath(envPath),
          /must not grant permissions to group or other users/
        );
      });
    }
  });

  it("rejects unknown variables instead of accepting ambient deploy configuration", () => {
    assert.throws(
      () =>
        parseTeeSmartContractValidationEnv(
          `${validContents()}\nDATABASE_URL=postgres://not-allowed`
        ),
      /non-whitelisted variables: DATABASE_URL/
    );
  });

  it("rejects duplicate or malformed assignments before dotenv parsing", () => {
    assert.throws(
      () =>
        parseTeeSmartContractValidationEnv(
          `${validContents()}\nTEE_VALIDATION_CONFIRMATIONS=2`
        ),
      /duplicate variable TEE_VALIDATION_CONFIRMATIONS/
    );
    assert.throws(
      () =>
        parseTeeSmartContractValidationEnv(
          `${validContents()}\nthis line is not an assignment`
        ),
      /invalid assignment/
    );
  });

  it("rejects every missing required variable", () => {
    for (const missingKey of TEE_VALIDATION_ENV_KEYS) {
      const contents = validContents()
        .split("\n")
        .filter((line) => !line.startsWith(`${missingKey}=`))
        .join("\n");
      assert.throws(
        () => parseTeeSmartContractValidationEnv(contents),
        new RegExp(`${missingKey} is required`)
      );
    }
  });

  it("rejects a chain other than Hedera testnet", () => {
    assert.throws(
      () =>
        parseTeeSmartContractValidationEnv(
          validContents({ TEE_VALIDATION_HEDERA_CHAIN_ID: "295" })
        ),
      /must be 296/
    );
  });

  it("rejects malformed or credential-bearing RPC URLs", () => {
    assert.throws(
      () =>
        parseTeeSmartContractValidationEnv(
          validContents({ TEE_VALIDATION_HEDERA_RPC_URL: "not-a-url" })
        ),
      /valid HTTP\(S\) URL/
    );
    assert.throws(
      () =>
        parseTeeSmartContractValidationEnv(
          validContents({
            TEE_VALIDATION_HEDERA_RPC_URL: "https://user:password@example.com",
          })
        ),
      /without embedded credentials/
    );
  });

  it("rejects invalid deploy keys without echoing their values", () => {
    const invalidKey = "this-must-never-appear-in-an-error";
    assert.throws(
      () =>
        parseTeeSmartContractValidationEnv(
          validContents({ TEE_VALIDATION_DEPLOYER_PRIVATE_KEY: invalidKey })
        ),
      (error) =>
        error instanceof Error &&
        !error["message"].includes(invalidKey) &&
        /32-byte hex private key/.test(error["message"])
    );
  });

  it("rejects zero or malformed role addresses", () => {
    assert.throws(
      () =>
        parseTeeSmartContractValidationEnv(
          validContents({
            TEE_VALIDATION_ADMIN_ADDRESS:
              "0x0000000000000000000000000000000000000000",
          })
        ),
      /must not be the zero address/
    );
    assert.throws(
      () =>
        parseTeeSmartContractValidationEnv(
          validContents({ TEE_VALIDATION_RECORDER_ADDRESS: "not-an-address" })
        ),
      /must be a valid EVM address/
    );
  });

  it("requires a bounded positive confirmation count", () => {
    for (const confirmations of ["0", "1.5", "65"]) {
      assert.throws(() =>
        parseTeeSmartContractValidationEnv(
          validContents({ TEE_VALIDATION_CONFIRMATIONS: confirmations })
        )
      );
    }
  });
});
