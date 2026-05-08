import { PublicKey } from "@solana/web3.js";
import { deriveCurvePda, deriveSoulPda } from "sdk";

export const UNSUPPORTED_SOLSOUL_MINT_MESSAGE =
  "This token mint is not a SolSoul launch mint.";

export class UnsupportedSolSoulMintError extends Error {
  constructor(message = UNSUPPORTED_SOLSOUL_MINT_MESSAGE) {
    super(message);
    this.name = "UnsupportedSolSoulMintError";
  }
}

export function deriveSolSoulTokenPdas(mint: PublicKey): {
  curve: PublicKey;
  soul: PublicKey;
} {
  try {
    return {
      curve: deriveCurvePda(mint),
      soul: deriveSoulPda(mint),
    };
  } catch (error) {
    if (isPdaDerivationFailure(error)) {
      throw new UnsupportedSolSoulMintError();
    }
    throw error;
  }
}

export function isUnsupportedSolSoulMintError(error: unknown): boolean {
  if (error instanceof UnsupportedSolSoulMintError) {
    return true;
  }
  if (error instanceof Error) {
    return error.name === "UnsupportedSolSoulMintError" || isPdaDerivationFailure(error);
  }
  return isPdaDerivationFailure(error);
}

export function safeTokenLoadErrorMessage(error: unknown, fallback: string): string {
  if (isUnsupportedSolSoulMintError(error)) {
    return UNSUPPORTED_SOLSOUL_MINT_MESSAGE;
  }
  return fallback;
}

function isPdaDerivationFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /invalid seeds|fall off the curve|pda deriv/i.test(message);
}
