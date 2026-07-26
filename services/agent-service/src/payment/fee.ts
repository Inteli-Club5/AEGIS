import type { BaseUnitAmount } from "../policy-engine/types.js";

/**
 * AEGIS execution fee: 1% of the transferred amount, floored at 0.01 HBAR
 * and capped at 2.00 HBAR (docs/aegis_financial_model.md §3.2). The
 * financial model quotes the floor/cap in USDC; this Hedera-native HBAR
 * flow (docs/AEGIS_ARCHITECTURE.md §4.4/§5.2 - "AEGIS's fee slice in HBAR
 * in that same execution") has no price oracle, so the floor/cap are
 * applied as the same numeric HBAR amounts rather than a USD conversion.
 */
const FEE_BPS = 100n;
const FEE_BPS_DIVISOR = 10_000n;
const TINYBAR_PER_HBAR = 100_000_000n;
export const MIN_EXECUTION_FEE_TINYBAR = TINYBAR_PER_HBAR / 100n; // 0.01 HBAR
export const MAX_EXECUTION_FEE_TINYBAR = TINYBAR_PER_HBAR * 2n; // 2.00 HBAR

export function calculateExecutionFeeTinybar(
  amountTinybar: BaseUnitAmount,
): BaseUnitAmount {
  const amount = parseNonNegativeBigInt(amountTinybar);
  const raw = (amount * FEE_BPS) / FEE_BPS_DIVISOR;
  const clamped =
    raw < MIN_EXECUTION_FEE_TINYBAR
      ? MIN_EXECUTION_FEE_TINYBAR
      : raw > MAX_EXECUTION_FEE_TINYBAR
        ? MAX_EXECUTION_FEE_TINYBAR
        : raw;
  return clamped.toString();
}

function parseNonNegativeBigInt(value: string): bigint {
  if (!/^[0-9]+$/.test(value)) {
    throw new Error("amount must be a non-negative base-unit integer string");
  }
  return BigInt(value);
}