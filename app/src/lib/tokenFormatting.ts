const TOKEN_DECIMALS = 6n;
const TOKEN_BASE_UNITS = 1_000_000n;
const SOL_DECIMALS = 9n;
const LAMPORTS_PER_SOL = 1_000_000_000n;

export function formatTokenAmount(baseUnits: bigint): string {
  return formatFixedBaseUnits(baseUnits, TOKEN_BASE_UNITS, TOKEN_DECIMALS);
}

export function formatTokenDisplayAmount(baseUnits: bigint): string {
  const whole = baseUnits / TOKEN_BASE_UNITS;
  const fractional = baseUnits % TOKEN_BASE_UNITS;
  const wholeText = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (fractional === 0n) {
    return wholeText;
  }

  return `${wholeText}.${fractional
    .toString()
    .padStart(Number(TOKEN_DECIMALS), "0")
    .replace(/0+$/, "")}`;
}

export function formatSolAmount(lamports: bigint): string {
  return formatFixedBaseUnits(lamports, LAMPORTS_PER_SOL, SOL_DECIMALS);
}

export function formatCompactAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function formatFixedBaseUnits(value: bigint, baseUnits: bigint, decimals: bigint): string {
  const whole = value / baseUnits;
  const fractional = (value % baseUnits).toString().padStart(Number(decimals), "0");
  return `${whole}.${fractional}`;
}
