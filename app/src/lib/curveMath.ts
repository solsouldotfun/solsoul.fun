// SolSoul exponential bonding curve math (client-side preview)
// Mirrors the Rust implementation in programs/bonding-curve/src/math.rs
// Uses floating-point Math.exp for simplicity; on-chain consensus uses fixed-point.

export const CURVE_S_LAMPORTS = 500_000_000_000n; // 500 SOL
export const CURVE_K_BASE_UNITS = 21_000_000_000_000n; // 21M tokens (6 decimals)
export const SELF_DEPRECATED_THRESHOLD = (CURVE_K_BASE_UNITS * 99n) / 100n;
export const MAX_BUY_SOL_LAMPORTS = 5_000_000_000n; // 5 SOL
export const LOCK_FEE_BPS = 10n; // 0.1%
export const BASIS_POINTS_DENOMINATOR = 10_000n;
export const LAUNCH_FEE_LAMPORTS = 30_000_000n; // 0.03 SOL
export const TOKEN_DECIMALS = 6;
export const LAMPORTS_PER_SOL = 1_000_000_000n;

export const MT_CLAIM_QUANTUM_BASE_UNITS = 10_000_000_000n; // 10,000 tokens
export const MAX_MT_SOUL_CLAIMS = 2_100n;
export const MT_SOUL_CAP_BASE_UNITS = MT_CLAIM_QUANTUM_BASE_UNITS * MAX_MT_SOUL_CLAIMS;

export type CurvePriceSample = {
  totalMinted: bigint;
  priceSolPerToken: number;
};

export type BuySolForTokenTargetEstimate = {
  targetTokenOut: bigint;
  grossSolInLamports: bigint;
  netSolInLamports: bigint;
  lockFeeLamports: bigint;
  estimatedTokenOut: bigint;
};

export function calculateLockFee(solInLamports: bigint): bigint {
  return (solInLamports * LOCK_FEE_BPS) / BASIS_POINTS_DENOMINATOR;
}

export function quoteBuyTokenOut(
  cumulativeSol: bigint,
  totalMinted: bigint,
  solInLamports: bigint,
): bigint {
  if (solInLamports <= 0n) {
    throw new Error("Enter a SOL amount greater than 0.");
  }
  if (solInLamports > MAX_BUY_SOL_LAMPORTS) {
    throw new Error("Maximum buy is 5 SOL per transaction.");
  }

  const lockFee = calculateLockFee(solInLamports);
  const netSolIn = solInLamports - lockFee;
  const rAfter = Number(cumulativeSol + netSolIn) / Number(CURVE_S_LAMPORTS);
  const tAfter = Number(CURVE_K_BASE_UNITS) * (1 - Math.exp(-rAfter));
  const tokenOut = BigInt(Math.floor(tAfter)) - totalMinted;

  if (tokenOut <= 0n) {
    throw new Error("SOL amount is too small for this curve.");
  }
  return tokenOut;
}

export function estimateBuySolForTokenTarget(params: {
  cumulativeSol: bigint;
  totalMinted: bigint;
  targetTokenOut: bigint;
}): BuySolForTokenTargetEstimate {
  const { cumulativeSol, totalMinted, targetTokenOut } = params;

  if (targetTokenOut <= 0n) {
    throw new Error("Enter a token target greater than 0.");
  }
  if (cumulativeSol < 0n || totalMinted < 0n) {
    throw new Error("Curve state is unavailable.");
  }

  const targetTotalMinted = totalMinted + targetTokenOut;
  if (targetTotalMinted >= CURVE_K_BASE_UNITS) {
    throw new Error("Token target exceeds the curve supply.");
  }

  const targetRatio = Number(targetTotalMinted) / Number(CURVE_K_BASE_UNITS);
  const requiredTotalNetSol = BigInt(
    Math.ceil(-Math.log(1 - targetRatio) * Number(CURVE_S_LAMPORTS)),
  );
  let netSolInLamports = requiredTotalNetSol - cumulativeSol;
  if (netSolInLamports <= 0n) {
    netSolInLamports = 1n;
  }

  let grossSolInLamports = grossLamportsForNetSol(netSolInLamports);
  let lockFeeLamports = calculateLockFee(grossSolInLamports);
  let estimatedTokenOut = estimateTokenOutWithoutMaxBuy({
    cumulativeSol,
    totalMinted,
    grossSolInLamports,
  });

  while (estimatedTokenOut < targetTokenOut) {
    grossSolInLamports += 1n;
    lockFeeLamports = calculateLockFee(grossSolInLamports);
    netSolInLamports = grossSolInLamports - lockFeeLamports;
    estimatedTokenOut = estimateTokenOutWithoutMaxBuy({
      cumulativeSol,
      totalMinted,
      grossSolInLamports,
    });
  }

  return {
    targetTokenOut,
    grossSolInLamports,
    netSolInLamports,
    lockFeeLamports,
    estimatedTokenOut,
  };
}

export function quoteSellSolOut(
  cumulativeSol: bigint,
  totalMinted: bigint,
  tokenInBaseUnits: bigint,
): bigint {
  if (tokenInBaseUnits <= 0n) {
    throw new Error("Enter a token amount greater than 0.");
  }
  if (tokenInBaseUnits > totalMinted) {
    throw new Error("Insufficient liquidity.");
  }

  const remaining = CURVE_K_BASE_UNITS - totalMinted;
  if (remaining > 0n) {
    const ratio = (tokenInBaseUnits * 1n) / remaining;
    if (ratio > 2n) {
      throw new Error("Sell amount too large relative to remaining supply.");
    }
  }

  const yBefore = Number(totalMinted) / Number(CURVE_K_BASE_UNITS);
  const yAfter = Number(totalMinted - tokenInBaseUnits) / Number(CURVE_K_BASE_UNITS);

  // ln(y) where y = 1 - e^(-R/S)  =>  R/S = -ln(1-y)
  const rSBefore = -Math.log(1 - yBefore);
  const rSAfter = -Math.log(1 - yAfter);
  const diff = rSBefore - rSAfter;
  const solOut = BigInt(Math.floor(diff * Number(CURVE_S_LAMPORTS)));

  if (solOut <= 0n) {
    throw new Error("Token amount is too small for this curve.");
  }
  if (solOut > cumulativeSol) {
    throw new Error("Insufficient vault liquidity.");
  }
  return solOut;
}

function grossLamportsForNetSol(netSolInLamports: bigint): bigint {
  let low = netSolInLamports;
  let high = (netSolInLamports * BASIS_POINTS_DENOMINATOR) /
    (BASIS_POINTS_DENOMINATOR - LOCK_FEE_BPS) + 2n;

  while (low < high) {
    const mid = (low + high) / 2n;
    const net = mid - calculateLockFee(mid);
    if (net >= netSolInLamports) {
      high = mid;
    } else {
      low = mid + 1n;
    }
  }

  return low;
}

function estimateTokenOutWithoutMaxBuy({
  cumulativeSol,
  totalMinted,
  grossSolInLamports,
}: {
  cumulativeSol: bigint;
  totalMinted: bigint;
  grossSolInLamports: bigint;
}): bigint {
  const lockFee = calculateLockFee(grossSolInLamports);
  const netSolIn = grossSolInLamports - lockFee;
  const rAfter = Number(cumulativeSol + netSolIn) / Number(CURVE_S_LAMPORTS);
  const tAfter = Number(CURVE_K_BASE_UNITS) * (1 - Math.exp(-rAfter));
  const tokenOut = BigInt(Math.floor(tAfter)) - totalMinted;

  if (tokenOut <= 0n) {
    throw new Error("SOL amount is too small for this curve.");
  }
  return tokenOut;
}

export function estimateSpotPriceSolPerToken(totalMintedBaseUnits: bigint): number | null {
  if (totalMintedBaseUnits < 0n || totalMintedBaseUnits >= CURVE_K_BASE_UNITS) {
    return null;
  }

  const remainingBaseUnits = CURVE_K_BASE_UNITS - totalMintedBaseUnits;
  const scaleSol = Number(CURVE_S_LAMPORTS) / Number(LAMPORTS_PER_SOL);
  const remainingTokens = Number(remainingBaseUnits) / 10 ** TOKEN_DECIMALS;
  if (!Number.isFinite(remainingTokens) || remainingTokens <= 0) {
    return null;
  }
  return scaleSol / remainingTokens;
}

export function sampleCurveSpotPrices(sampleCount = 56): CurvePriceSample[] {
  const safeSampleCount = Math.max(2, Math.floor(sampleCount));
  const maxSampleMinted = SELF_DEPRECATED_THRESHOLD;
  return Array.from({ length: safeSampleCount }, (_, index) => {
    const totalMinted =
      (maxSampleMinted * BigInt(index)) / BigInt(safeSampleCount - 1);
    return {
      totalMinted,
      priceSolPerToken: estimateSpotPriceSolPerToken(totalMinted) ?? 0,
    };
  });
}

export function formatTokenUnits(baseUnits: bigint, decimals = TOKEN_DECIMALS): string {
  const whole = baseUnits / 10n ** BigInt(decimals);
  const fractional = baseUnits % 10n ** BigInt(decimals);
  return formatWholeAndFraction(whole, fractional, decimals);
}

export function formatSolUnits(lamports: bigint): string {
  const whole = lamports / LAMPORTS_PER_SOL;
  const fractional = lamports % LAMPORTS_PER_SOL;
  return formatWholeAndFraction(whole, fractional, 9);
}

function formatWholeAndFraction(whole: bigint, fractional: bigint, decimals: number): string {
  const wholeText = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (fractional === 0n) return wholeText;
  const fractionalText = fractional.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${wholeText}.${fractionalText}`;
}

export function formatPercent(numerator: bigint, denominator: bigint, decimals = 2): string {
  if (numerator <= 0n || denominator <= 0n) return "0%";
  const scale = 10n ** BigInt(decimals);
  const scaled = (numerator * 100n * scale) / denominator;
  if (scaled === 0n) return `<${formatScaledDecimal(1n, decimals)}%`;
  return `${formatScaledDecimal(scaled, decimals)}%`;
}

function formatScaledDecimal(scaled: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const whole = scaled / scale;
  const fractional = scaled % scale;
  return `${whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fractional.toString().padStart(decimals, "0")}`;
}
