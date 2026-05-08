import { PublicKey, type Connection, type Transaction } from "@solana/web3.js";
import type { SendTransactionOptions } from "@solana/wallet-adapter-base";
import {
  MIN_CLAIM_BALANCE,
  buyAndAutoClaimSoul,
  type BondingCurveAccount,
  type BuyAndAutoClaimSoulResult,
  type GenerationProvenance,
  type TradeWithGenerationProvenanceResult,
} from "sdk";
import {
  withPreSignTransactionReview,
  type PreSignReviewHandler,
} from "./preSignReview";
import { calculateLockFee, quoteBuyTokenOut } from "./curveMath";

export type WalletSendTransaction = (
  transaction: Transaction,
  connection: Connection,
  options?: SendTransactionOptions,
) => Promise<string>;

export type SubmitWalletBuyParams = {
  connection: Connection;
  payer: PublicKey | null;
  connected: boolean;
  sendTransaction: WalletSendTransaction;
  mint: PublicKey;
  solAmount: string;
  slippagePercent: string;
  curve: BondingCurveAccount | null;
  buyWithWallet?: (params: {
    connection: Connection;
    payer: PublicKey;
    mint: PublicKey;
    sendTransaction: WalletSendTransaction;
    solIn: bigint;
    minAmountOut: bigint;
    commitment: "finalized";
    includeGenerationProvenance: true;
    generationApiBaseUrl: "/";
  }) => Promise<string | TradeWithGenerationProvenanceResult | BuyAndAutoClaimSoulResult>;
  onPreSignReview?: PreSignReviewHandler;
};

export type SubmitWalletBuyResult = {
  signature: string;
  solInLamports: bigint;
  minAmountOut: bigint;
  expectedTokenOut: bigint;
  generationProvenance: GenerationProvenance | null;
  nftMint: string | null;
};

const LAMPORTS_PER_SOL_BIGINT = 1_000_000_000n;
const MAX_U64 = 18_446_744_073_709_551_615n;
const MAX_SLIPPAGE_BPS = 5_000;

export function parseSolAmountToLamports(input: string): bigint {
  const trimmed = input.trim();
  if (!/^\d+(?:\.\d{0,9})?$/.test(trimmed)) {
    throw new Error("Enter a SOL amount with up to 9 decimal places.");
  }

  const [whole = "0", fractional = ""] = trimmed.split(".");
  const lamports =
    BigInt(whole) * LAMPORTS_PER_SOL_BIGINT +
    BigInt(fractional.padEnd(9, "0"));
  if (lamports <= 0n) {
    throw new Error("Enter a SOL amount greater than 0.");
  }
  if (lamports > MAX_U64) {
    throw new Error("SOL amount is too large.");
  }

  return lamports;
}

export function parseSlippageBps(input: string): number {
  const trimmed = input.trim();
  if (!/^\d+(?:\.\d{0,2})?$/.test(trimmed)) {
    throw new Error("Enter slippage with up to 2 decimal places.");
  }

  const [whole = "0", fractional = ""] = trimmed.split(".");
  const bps = Number(BigInt(whole) * 100n + BigInt(fractional.padEnd(2, "0")));
  if (bps < 0 || bps > MAX_SLIPPAGE_BPS) {
    throw new Error("Slippage must be between 0% and 50%.");
  }

  return bps;
}

export { quoteBuyTokenOut, calculateLockFee };

export function applySlippage(amount: bigint, slippageBps: number): bigint {
  if (amount <= 0n) {
    throw new Error("Expected output must be greater than 0.");
  }
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > MAX_SLIPPAGE_BPS) {
    throw new Error("Slippage must be between 0% and 50%.");
  }

  const BPS_DENOMINATOR = 10_000n;
  const minAmountOut =
    (amount * (BPS_DENOMINATOR - BigInt(slippageBps))) / BPS_DENOMINATOR;
  return minAmountOut > 0n ? minAmountOut : 1n;
}

export async function submitWalletBuy(params: SubmitWalletBuyParams): Promise<SubmitWalletBuyResult> {
  if (!params.connected || !params.payer) {
    throw new Error("Connect a devnet wallet before buying.");
  }
  if (!params.curve) {
    throw new Error("Curve state is still loading. Try again in a moment.");
  }
  if (params.curve.selfDeprecated) {
    throw new Error("This curve has reached its supply cap and no longer accepts buys.");
  }

  const solInLamports = parseSolAmountToLamports(params.solAmount);
  const slippageBps = parseSlippageBps(params.slippagePercent);
  const expectedTokenOut = quoteBuyTokenOut(params.curve.cumulativeSol, params.curve.totalMinted, solInLamports);
  if (expectedTokenOut < MIN_CLAIM_BALANCE) {
    throw new Error("Buy at least 10,000 tokens through SolSoul Swap to auto-issue one MT/Soul NFT.");
  }
  const minAmountOut = applySlippage(expectedTokenOut, slippageBps);
  const buyWithWallet: NonNullable<SubmitWalletBuyParams["buyWithWallet"]> =
    params.buyWithWallet ??
    ((buyAndAutoClaimSoul as unknown as NonNullable<SubmitWalletBuyParams["buyWithWallet"]>));
  const tradeResult = await buyWithWallet({
    connection: params.connection,
    payer: params.payer,
    mint: params.mint,
    sendTransaction: withPreSignTransactionReview(
      params.sendTransaction,
      params.onPreSignReview,
    ),
    solIn: solInLamports,
    minAmountOut,
    commitment: "finalized",
    includeGenerationProvenance: true,
    generationApiBaseUrl: "/",
  });
  const signature =
    typeof tradeResult === "string" ? tradeResult : tradeResult.signature;

  return {
    signature,
    solInLamports,
    minAmountOut,
    expectedTokenOut,
    generationProvenance:
      typeof tradeResult === "string" ? null : tradeResult.generationProvenance,
    nftMint:
      typeof tradeResult === "string" || !("nftMint" in tradeResult)
        ? null
        : tradeResult.nftMint.toBase58(),
  };
}
