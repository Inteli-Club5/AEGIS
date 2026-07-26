import { AccountId } from "@hiero-ledger/sdk";

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function mirrorNodeBaseUrl(): string {
  return process.env.HEDERA_NETWORK === "mainnet"
    ? "https://mainnet-public.mirrornode.hedera.com"
    : "https://testnet.mirrornode.hedera.com";
}

/**
 * Mirrors services/agent-service/src/payment/destination.ts: prefers an
 * account's canonical mirror-node evm_address over its long-zero alias,
 * since Hedera's EVM rejects value sent to the long-zero alias from within
 * a contract call (e.g. Safe's MultiSend) once a real address is assigned.
 */
export async function resolveDestinationEvmAddress(
  destination: { kind: string; value: string },
  deps?: { fetch?: typeof fetch },
): Promise<`0x${string}`> {
  if (destination.kind === "EVM_ADDRESS") {
    if (!EVM_ADDRESS_RE.test(destination.value)) {
      throw new Error("destination EVM address is invalid");
    }
    return destination.value as `0x${string}`;
  }
  if (destination.kind === "HEDERA_ACCOUNT_ID") {
    const fetchImpl = deps?.fetch ?? fetch;
    const accountId = AccountId.fromString(destination.value);
    const longZeroAddress = `0x${accountId.toSolidityAddress()}` as const;

    const response = await fetchImpl(
      `${mirrorNodeBaseUrl()}/api/v1/accounts/${accountId.toString()}`,
    );
    if (!response.ok) {
      throw new Error(
        `could not resolve destination ${accountId.toString()} via the Hedera mirror node (status ${response.status})`,
      );
    }
    const account = (await response.json()) as { evm_address?: string | null };
    if (account.evm_address && EVM_ADDRESS_RE.test(account.evm_address)) {
      return account.evm_address as `0x${string}`;
    }
    return longZeroAddress;
  }
  throw new Error(
    `destination kind ${destination.kind} has no payable EVM address`,
  );
}