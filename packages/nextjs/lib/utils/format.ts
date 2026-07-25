import { formatBaseUnitAmount } from "~~/lib/policy/amount";
import type { AssetIdentity } from "~~/lib/policy/hash";

export function truncateAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatHbar(amount: number) {
  return `${amount.toFixed(2)} ℏ`;
}

export function formatDateTime(value: string | number) {
  const d = new Date(typeof value === "number" ? value * 1000 : value);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${date} · ${time}`;
}

export function formatPolicyAmount(value: string | null, asset: AssetIdentity | undefined) {
  if (value === null) return "No limit";
  if (!asset) return `${value} base units`;
  const amount = formatBaseUnitAmount(value, asset.decimals);
  return asset.kind === "NATIVE" ? `${amount} ℏ` : `${amount} units (${asset.tokenId})`;
}

export function formatPolicyValidity(unixSeconds: number | null) {
  return unixSeconds === null ? "No expiry" : formatDateTime(unixSeconds);
}
