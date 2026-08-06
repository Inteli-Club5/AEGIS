import { parseDisplayAmount } from "./amount";
import { type AssetIdentity, type DestinationIdentity, evmAddressDestination, hederaAccountDestination } from "./hash";
import type { PrecheckActionInput } from "~~/lib/api/actions";

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const HEDERA_ACCOUNT_ID_RE = /^\d+\.\d+\.\d+$/;
const MAX_DEADLINE_MINUTES = 1440;

export type ActionDestinationKind = "HEDERA_ACCOUNT_ID" | "EVM_ADDRESS";
export type ActionDestinationFormValue = { kind: ActionDestinationKind; value: string };

export type ActionFormValues = {
  destination: ActionDestinationFormValue;
  amount: string;
  deadlineMinutes: string;
};

export function destinationFormKey(destination: ActionDestinationFormValue): string {
  return `${destination.kind}:${destination.value}`;
}

export function emptyActionFormValues(defaultDestination?: DestinationIdentity): ActionFormValues {
  return {
    destination:
      defaultDestination?.kind === "HEDERA_ACCOUNT_ID" || defaultDestination?.kind === "EVM_ADDRESS"
        ? { kind: defaultDestination.kind, value: defaultDestination.value }
        : { kind: "HEDERA_ACCOUNT_ID", value: "" },
    amount: "",
    deadlineMinutes: "30",
  };
}

export function parseActionForm(
  values: ActionFormValues,
  actionType: string,
  asset: AssetIdentity,
  nowSeconds = Math.floor(Date.now() / 1000),
): PrecheckActionInput {
  const destinationValue = values.destination.value.trim();
  let destination: DestinationIdentity;
  if (values.destination.kind === "EVM_ADDRESS") {
    if (!EVM_ADDRESS_RE.test(destinationValue)) {
      throw new Error(`"${destinationValue}" must be a 0x-prefixed EVM address.`);
    }
    destination = evmAddressDestination(destinationValue as `0x${string}`);
  } else {
    if (!HEDERA_ACCOUNT_ID_RE.test(destinationValue)) {
      throw new Error(`"${destinationValue}" must be a Hedera account ID (0.0.x).`);
    }
    destination = hederaAccountDestination(destinationValue);
  }

  const amountInput = values.amount.trim();
  if (!amountInput) throw new Error("Enter an amount to send.");
  const amount = parseDisplayAmount(amountInput, asset.decimals);
  if (BigInt(amount) <= 0n) throw new Error("Amount must be greater than zero.");

  const deadlineMinutes = Number(values.deadlineMinutes.trim());
  if (!Number.isFinite(deadlineMinutes) || deadlineMinutes <= 0 || deadlineMinutes > MAX_DEADLINE_MINUTES) {
    throw new Error(`Enter how many minutes from now this action stays valid (1-${MAX_DEADLINE_MINUTES}).`);
  }

  return {
    actionType,
    destination,
    assetId: asset.kind === "NATIVE" ? asset.assetId : asset.tokenId,
    amount,
    actionDeadline: nowSeconds + Math.floor(deadlineMinutes * 60),
  };
}
