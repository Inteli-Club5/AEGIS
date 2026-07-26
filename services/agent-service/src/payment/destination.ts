import { AccountId } from "@hiero-ledger/sdk";
import type { DestinationIdentity } from "../policy-engine/types.js";

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function mirrorNodeBaseUrl(): string {
  return process.env.HEDERA_NETWORK === "mainnet"
    ? "https://mainnet-public.mirrornode.hedera.com"
    : "https://testnet.mirrornode.hedera.com";
}

/**
 * Resolves a policy-checked destination to the EVM address that the Hedera
 * JSON-RPC relay accepts as a `to` field.
 *
 * Every Hedera account has an implicit "long-zero" alias
 * (AccountId.toSolidityAddress()), but once an account has been assigned a
 * real ECDSA-derived EVM address, Hedera's EVM rejects value sent to the
 * long-zero alias from *within* a contract call (e.g. Safe's MultiSend) even
 * though top-level transfers and read-only balance queries resolve it fine
 * (confirmed via a live GS013 revert during Safe-batched execution). So the
 * mirror node is queried for the account's canonical evm_address, which is
 * used whenever present; the long-zero form is only a fallback for accounts
 * that have never been assigned one.
 */
export async function resolveDestinationEvmAddress(
  destination: DestinationIdentity,
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
