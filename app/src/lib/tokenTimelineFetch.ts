import {
  PublicKey,
  type Commitment,
  type ConfirmedSignatureInfo,
  type Connection,
  type Finality,
} from "@solana/web3.js";
import {
  fetchBondingCurve,
  fetchSoul,
  listClaimedSoulNftsByMint,
  type BondingCurveAccount,
  type ClaimedSoulNftPage,
  type SoulAccount,
} from "sdk";
import {
  fetchGenerationRowsFromFinalizedRpc,
  type GenerationProvenanceRow,
} from "./generationProvenance";
import {
  buildTokenTimelineSnapshot,
  type TokenTimelineSignature,
  type TokenTimelineSnapshot,
  type TokenTimelineSnapshotWarning,
} from "./tokenTimeline";
import { deriveSolSoulTokenPdas } from "./tokenPdaValidation";

interface TokenTimelineLoaders {
  fetchBondingCurve: (
    connection: Connection,
    mint: PublicKey,
    options: { commitment: Commitment },
  ) => Promise<BondingCurveAccount>;
  fetchSoul: (
    connection: Connection,
    mint: PublicKey,
    options: { commitment: Commitment },
  ) => Promise<SoulAccount>;
  listClaimedSoulNftsByMint: (
    connection: Connection,
    mint: PublicKey,
    options: {
      commitment: Commitment;
      fetchMetadata: boolean;
      page: number;
      pageSize: number;
      receiptLifecycle: "all";
    },
  ) => Promise<ClaimedSoulNftPage>;
  getSignaturesForAddress: (
    connection: Connection,
    address: PublicKey,
    limit: number,
    commitment: Finality,
  ) => Promise<ConfirmedSignatureInfo[]>;
  fetchGenerationRowsFromFinalizedRpc: (options: {
    connection: Connection;
    filters: { mint: string; soul: string };
    signatureLimit: number;
    maxTransactions: number;
    stopAfterRows: number;
  }) => Promise<GenerationProvenanceRow[]>;
}

export interface LoadTokenTimelineSnapshotOptions {
  connection: Connection;
  mint: PublicKey;
  rpcEndpoint: string;
  commitment?: Commitment;
  signatureLimit?: number;
  claimPageSize?: number;
  maxGenerationTransactions?: number;
  stopAfterGenerationRows?: number;
  loaders?: Partial<TokenTimelineLoaders>;
}

const DEFAULT_SIGNATURE_LIMIT = 20;
const DEFAULT_CLAIM_PAGE_SIZE = 24;
const DEFAULT_MAX_GENERATION_TRANSACTIONS = 16;
const DEFAULT_STOP_AFTER_GENERATION_ROWS = 12;

export async function loadTokenTimelineSnapshot({
  connection,
  mint,
  rpcEndpoint,
  commitment = "confirmed",
  signatureLimit = DEFAULT_SIGNATURE_LIMIT,
  claimPageSize = DEFAULT_CLAIM_PAGE_SIZE,
  maxGenerationTransactions = DEFAULT_MAX_GENERATION_TRANSACTIONS,
  stopAfterGenerationRows = DEFAULT_STOP_AFTER_GENERATION_ROWS,
  loaders = {},
}: LoadTokenTimelineSnapshotOptions): Promise<TokenTimelineSnapshot> {
  const resolvedLoaders = resolveLoaders(loaders);
  const { curve, soul } = deriveSolSoulTokenPdas(mint);
  const warnings: TokenTimelineSnapshotWarning[] = [];

  const generationRowsPromise = resolvedLoaders
    .fetchGenerationRowsFromFinalizedRpc({
      connection,
      filters: { mint: mint.toBase58(), soul: soul.toBase58() },
      signatureLimit,
      maxTransactions: maxGenerationTransactions,
      stopAfterRows: stopAfterGenerationRows,
    })
    .catch((error: unknown): GenerationProvenanceRow[] => {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn("[tokenTimeline] generation-row fetch failed:", reason);
      warnings.push({ source: "fetchGenerationRowsFromFinalizedRpc", reason });
      return [];
    });

  const [bondingCurve, soulAccount, claimsPage, generationRows] = await Promise.all([
    resolvedLoaders.fetchBondingCurve(connection, mint, { commitment }),
    resolvedLoaders.fetchSoul(connection, mint, { commitment }),
    resolvedLoaders.listClaimedSoulNftsByMint(connection, mint, {
      commitment,
      fetchMetadata: false,
      receiptLifecycle: "all",
      page: 1,
      pageSize: claimPageSize,
    }),
    generationRowsPromise,
  ]);

  const signatureAddresses = uniquePublicKeys([
    mint,
    curve,
    ...claimsPage.items.flatMap((claim) => [claim.claim, claim.nftMint]),
  ]);

  const signaturesByAddress = await loadSignaturesByAddress({
    addresses: signatureAddresses,
    commitment: toSignatureFinality(commitment),
    connection,
    limit: signatureLimit,
    loader: resolvedLoaders.getSignaturesForAddress,
    warnings,
  });

  const snapshot = buildTokenTimelineSnapshot({
    mint,
    curve,
    soul,
    bondingCurve,
    soulAccount,
    claims: claimsPage.items,
    generationRows,
    signaturesByAddress,
    fetchedAt: new Date(),
    rpcEndpoint,
  });

  if (warnings.length > 0) {
    return { ...snapshot, partial: true, warnings };
  }

  return snapshot;
}

function resolveLoaders(loaders: Partial<TokenTimelineLoaders>): TokenTimelineLoaders {
  return {
    fetchBondingCurve: loaders.fetchBondingCurve ?? fetchBondingCurve,
    fetchSoul: loaders.fetchSoul ?? fetchSoul,
    listClaimedSoulNftsByMint: loaders.listClaimedSoulNftsByMint ?? listClaimedSoulNftsByMint,
    getSignaturesForAddress:
      loaders.getSignaturesForAddress ??
      ((connection, address, limit, commitment) =>
        connection.getSignaturesForAddress(address, { limit }, commitment)),
    fetchGenerationRowsFromFinalizedRpc:
      loaders.fetchGenerationRowsFromFinalizedRpc ??
      ((options) => fetchGenerationRowsFromFinalizedRpc(options)),
  };
}

async function loadSignaturesByAddress({
  addresses,
  commitment,
  connection,
  limit,
  loader,
  warnings,
}: {
  addresses: PublicKey[];
  commitment: Finality;
  connection: Connection;
  limit: number;
  loader: TokenTimelineLoaders["getSignaturesForAddress"];
  warnings: TokenTimelineSnapshotWarning[];
}): Promise<Record<string, TokenTimelineSignature[]>> {
  const entries = await Promise.all(
    addresses.map(async (address) => {
      const base58 = address.toBase58();
      try {
        const signatures = await loader(connection, address, limit, commitment);
        return [
          base58,
          signatures
            .filter((signature) => !signature.err)
            .map((signature) => ({
              address: base58,
              signature: signature.signature,
              slot: signature.slot,
              blockTime: signature.blockTime,
            })),
        ] as const;
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(`[tokenTimeline] signature fetch failed for ${base58}:`, reason);
        warnings.push({ source: `getSignaturesForAddress:${base58}`, reason });
        return [base58, []] as const;
      }
    }),
  );

  return Object.fromEntries(entries);
}

function uniquePublicKeys(keys: PublicKey[]): PublicKey[] {
  return Array.from(new Map(keys.map((key) => [key.toBase58(), key])).values());
}

function toSignatureFinality(commitment: Commitment): Finality {
  return commitment === "finalized" ? "finalized" : "confirmed";
}
