import {
  PublicKey,
  type Connection,
  type ParsedAccountData,
  type Transaction,
} from "@solana/web3.js";
import type { SendTransactionOptions } from "@solana/wallet-adapter-base";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import {
  sell,
  type BondingCurveAccount,
  type GenerationProvenance,
  type ReceiptSettlementState,
  type SettlementReceiptCandidate,
  type TradeWithGenerationProvenanceResult,
} from "sdk";
import { applySlippage, parseSlippageBps } from "./buySubmit";
import { quoteSellSolOut } from "./curveMath";
import {
  assertBoundarySettlementExpectation,
  resolveBoundarySettlement,
  type BoundarySettlementExpectation,
  type BoundarySettlementPreview,
} from "./settlementSubmit";
import {
  formatPreSignPublicKeyLabel,
  withPreSignTransactionReview,
  type PreSignReceiptIntent,
  type PreSignReviewHandler,
} from "./preSignReview";
import { formatTokenAmount as formatTokenBaseUnits } from "./tokenFormatting";

export type WalletSendTransaction = (
  transaction: Transaction,
  connection: Connection,
  options?: SendTransactionOptions,
) => Promise<string>;

export type SubmitWalletSellParams = {
  connection: Connection;
  payer: PublicKey | null;
  connected: boolean;
  sendTransaction: WalletSendTransaction;
  mint: PublicKey;
  tokenAmount: string;
  slippagePercent: string;
  curve: BondingCurveAccount | null;
  sellWithWallet?: (params: {
    connection: Connection;
    payer: PublicKey;
    mint: PublicKey;
    sendTransaction: WalletSendTransaction;
    sellerTokenAccount: PublicKey;
    tokenIn: bigint;
    minAmountOut: bigint;
    commitment: "finalized";
    includeGenerationProvenance: true;
    generationApiBaseUrl: "/";
    settlement?: {
      authority: PublicKey;
      tokenAccount: PublicKey;
      tokenMint: PublicKey;
      receipts: PublicKey[];
      state: ReceiptSettlementState;
      movementAmount: bigint;
    };
  }) => Promise<string | TradeWithGenerationProvenanceResult>;
  settlementMode?: ReceiptSettlementState;
  settlementCandidates?: SettlementReceiptCandidate[];
  activeReceiptCount?: bigint;
  expectedSettlement?: BoundarySettlementExpectation;
  onPreSignReview?: PreSignReviewHandler;
};

export type SubmitWalletSellResult = {
  signature: string;
  tokenIn: bigint;
  minAmountOut: bigint;
  expectedSolOut: bigint;
  sellerTokenAccount: PublicKey;
  generationProvenance: GenerationProvenance | null;
  settlement: BoundarySettlementPreview;
};

export type DiscoveredTokenAccount = {
  pubkey: PublicKey;
  amount: bigint;
  isAta: boolean;
};

const TOKEN_DECIMALS = 6;
const TOKEN_BASE_UNITS = 1_000_000n;
const MAX_U64 = 18_446_744_073_709_551_615n;

export function parseTokenAmountToBaseUnits(input: string): bigint {
  const trimmed = input.trim();
  if (!/^\d+(?:\.\d{0,6})?$/.test(trimmed)) {
    throw new Error("Enter a token amount with up to 6 decimal places.");
  }

  const [whole = "0", fractional = ""] = trimmed.split(".");
  const baseUnits =
    BigInt(whole) * TOKEN_BASE_UNITS +
    BigInt(fractional.padEnd(TOKEN_DECIMALS, "0"));
  if (baseUnits <= 0n) {
    throw new Error("Enter a token amount greater than 0.");
  }
  if (baseUnits > MAX_U64) {
    throw new Error("Token amount is too large.");
  }

  return baseUnits;
}

export { quoteSellSolOut };

export async function discoverSellTokenAccount(
  connection: Connection,
  owner: PublicKey,
  mint: PublicKey,
  tokenIn: bigint,
): Promise<DiscoveredTokenAccount> {
  const ata = getAssociatedTokenAddressSync(
    mint,
    owner,
    true,
    TOKEN_2022_PROGRAM_ID,
  );
  const response = await connection.getParsedTokenAccountsByOwner(
    owner,
    { programId: TOKEN_2022_PROGRAM_ID },
    "confirmed",
  );
  const discovered = response.value
    .map((entry) => {
      const amount = readParsedTokenAmount(entry.account.data, mint);
      if (amount === null) {
        return null;
      }
      return {
        pubkey: entry.pubkey,
        amount,
        isAta: entry.pubkey.equals(ata),
      };
    })
    .filter((entry): entry is DiscoveredTokenAccount => entry !== null);

  try {
    return selectDiscoveredTokenAccount(discovered, tokenIn);
  } catch {
    const total = discovered.reduce((sum, account) => sum + account.amount, 0n);
    throw new Error(
      `Insufficient token balance: trying to sell ${formatTokenAmount(
        tokenIn,
      )} tokens but wallet holds ${formatTokenAmount(total)}.`,
    );
  }
}

export async function fetchOwnerTokenBalance(
  connection: Connection,
  owner: PublicKey,
  mint: PublicKey,
): Promise<{ amount: bigint; accounts: DiscoveredTokenAccount[] }> {
  const ata = getAssociatedTokenAddressSync(
    mint,
    owner,
    true,
    TOKEN_2022_PROGRAM_ID,
  );
  const response = await connection.getParsedTokenAccountsByOwner(
    owner,
    { programId: TOKEN_2022_PROGRAM_ID },
    "confirmed",
  );
  const accounts = response.value
    .map((entry) => {
      const amount = readParsedTokenAmount(entry.account.data, mint);
      if (amount === null) {
        return null;
      }
      return {
        pubkey: entry.pubkey,
        amount,
        isAta: entry.pubkey.equals(ata),
      };
    })
    .filter((entry): entry is DiscoveredTokenAccount => entry !== null);

  return {
    amount: accounts.reduce((sum, account) => sum + account.amount, 0n),
    accounts: sortDiscoveredTokenAccounts(accounts),
  };
}

export function selectDiscoveredTokenAccount(
  accounts: readonly DiscoveredTokenAccount[],
  tokenIn: bigint,
): DiscoveredTokenAccount {
  const sufficient = sortDiscoveredTokenAccounts(accounts).find(
    (account) => account.amount >= tokenIn,
  );
  if (!sufficient) {
    throw new Error("No single Token-2022 source account has enough balance.");
  }
  return sufficient;
}

function sortDiscoveredTokenAccounts(
  accounts: readonly DiscoveredTokenAccount[],
): DiscoveredTokenAccount[] {
  return [...accounts].sort((left, right) => {
    if (left.isAta !== right.isAta) {
      return left.isAta ? -1 : 1;
    }
    if (left.amount === right.amount) {
      return left.pubkey.toBase58().localeCompare(right.pubkey.toBase58());
    }
    return left.amount > right.amount ? -1 : 1;
  });
}

export async function submitWalletSell(
  params: SubmitWalletSellParams,
): Promise<SubmitWalletSellResult> {
  if (!params.connected || !params.payer) {
    throw new Error("Connect a devnet wallet before selling.");
  }
  if (!params.curve) {
    throw new Error("Curve state is still loading. Try again in a moment.");
  }
  if (params.curve.selfDeprecated) {
    throw new Error("This curve has reached its supply cap and no longer accepts sells.");
  }

  const tokenIn = parseTokenAmountToBaseUnits(params.tokenAmount);
  const slippageBps = parseSlippageBps(params.slippagePercent);
  const expectedSolOut = quoteSellSolOut(params.curve.cumulativeSol, params.curve.totalMinted, tokenIn);
  const minAmountOut = applySlippage(expectedSolOut, slippageBps);
  const sellerTokenAccount = await discoverSellTokenAccount(
    params.connection,
    params.payer,
    params.mint,
    tokenIn,
  );
  const settlement = await resolveBoundarySettlement({
    connection: params.connection,
    owner: params.payer,
    mint: params.mint,
    tokenAccountBalance: sellerTokenAccount.amount,
    movementAmount: tokenIn,
    state: params.settlementMode,
    candidates: params.settlementCandidates,
    activeReceiptCount: params.activeReceiptCount,
  });
  assertBoundarySettlementExpectation({
    expected: params.expectedSettlement,
    actual: settlement,
    actualSourceTokenAccount: sellerTokenAccount.pubkey,
    actualSourceTokenBalance: sellerTokenAccount.amount,
  });
  if (settlement.required && !sellerTokenAccount.isAta) {
    throw new Error(
      "Boundary settlement sells must use the canonical Token-2022 associated token account.",
    );
  }
  const sellWithWallet: NonNullable<SubmitWalletSellParams["sellWithWallet"]> =
    params.sellWithWallet ??
    ((sell as unknown as NonNullable<SubmitWalletSellParams["sellWithWallet"]>));
  const receiptIntent = buildSettlementReceiptIntent({
    settlement,
    movementAmount: tokenIn,
    sourceTokenAccount: sellerTokenAccount.pubkey,
    sourceTokenBalance: sellerTokenAccount.amount,
  });
  const sellParams = {
    connection: params.connection,
    payer: params.payer,
    mint: params.mint,
    sendTransaction: withPreSignTransactionReview(
      params.sendTransaction,
      params.onPreSignReview,
      receiptIntent,
    ),
    sellerTokenAccount: sellerTokenAccount.pubkey,
    tokenIn,
    minAmountOut,
    commitment: "finalized",
    includeGenerationProvenance: true,
    generationApiBaseUrl: "/",
  } satisfies Parameters<NonNullable<SubmitWalletSellParams["sellWithWallet"]>>[0];
  const tradeResult = await sellWithWallet(
    settlement.required
      ? {
          ...sellParams,
          settlement: {
            authority: params.payer,
            tokenAccount: sellerTokenAccount.pubkey,
            tokenMint: params.mint,
            receipts: settlement.selectedReceipts.map((receipt) => receipt.receiptAccount),
            state: settlement.state,
            movementAmount: tokenIn,
          },
        }
      : sellParams,
  );
  const signature =
    typeof tradeResult === "string" ? tradeResult : tradeResult.signature;

  return {
    signature,
    tokenIn,
    minAmountOut,
    expectedSolOut,
    sellerTokenAccount: sellerTokenAccount.pubkey,
    settlement,
    generationProvenance:
      typeof tradeResult === "string" ? null : tradeResult.generationProvenance,
  };
}

function buildSettlementReceiptIntent(params: {
  settlement: BoundarySettlementPreview;
  movementAmount: bigint;
  sourceTokenAccount: PublicKey;
  sourceTokenBalance: bigint;
}): PreSignReceiptIntent | undefined {
  if (!params.settlement.required) {
    return undefined;
  }

  return {
    state: params.settlement.state,
    movementAmountBaseUnits: params.movementAmount.toString(),
    sourceTokenAccount: formatPreSignPublicKeyLabel(
      params.sourceTokenAccount,
      "source-token",
    ),
    sourceTokenBalanceBaseUnits: params.sourceTokenBalance.toString(),
    activeReceiptCount: params.settlement.activeReceiptCount.toString(),
    postWholeUnits: params.settlement.postWholeUnits.toString(),
    selectedReceipts: params.settlement.selectedReceipts.map((receipt, index) =>
      formatPreSignPublicKeyLabel(receipt.receiptAccount, `receipt-${index + 1}`) ?? "receipt:unknown",
    ),
  };
}

function readParsedTokenAmount(data: Buffer | ParsedAccountData, mint: PublicKey): bigint | null {
  if (!("parsed" in data)) {
    return null;
  }

  const info = data.parsed.info as {
    mint?: string;
    tokenAmount?: {
      amount?: string;
    };
  };
  if (info.mint !== mint.toBase58() || !info.tokenAmount?.amount) {
    return null;
  }

  return BigInt(info.tokenAmount.amount);
}

export function formatTokenAmount(baseUnits: bigint): string {
  return formatTokenBaseUnits(baseUnits);
}
