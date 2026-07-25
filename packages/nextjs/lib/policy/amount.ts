const DECIMAL_AMOUNT_RE = /^(0|[1-9]\d*)(?:\.(\d+))?$/;
const BASE_UNIT_AMOUNT_RE = /^(0|[1-9]\d*)$/;

export function parseDisplayAmount(value: string, decimals: number): string {
  assertDecimals(decimals);

  const normalized = value.trim();
  const match = DECIMAL_AMOUNT_RE.exec(normalized);
  if (!match) {
    throw new Error("Enter a non-negative decimal amount without commas or scientific notation.");
  }

  const fraction = match[2] ?? "";
  if (fraction.length > decimals) {
    throw new Error(`This asset supports at most ${decimals} decimal places.`);
  }

  const wholeBaseUnits = BigInt(match[1]) * 10n ** BigInt(decimals);
  const fractionalBaseUnits = fraction ? BigInt(fraction.padEnd(decimals, "0")) : 0n;
  return (wholeBaseUnits + fractionalBaseUnits).toString();
}

export function formatBaseUnitAmount(value: string, decimals: number): string {
  assertDecimals(decimals);
  if (!BASE_UNIT_AMOUNT_RE.test(value)) {
    throw new Error("Base-unit amounts must be canonical non-negative integer strings.");
  }
  if (decimals === 0) return value;

  const padded = value.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function assertDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 30) {
    throw new Error("Asset decimals must be an integer between 0 and 30.");
  }
}
