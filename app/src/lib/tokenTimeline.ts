import type { PublicKey } from "@solana/web3.js";
import type { BondingCurveAccount, ClaimedSoulNft, SoulAccount } from "sdk";
import type { GenerationProvenanceRow, GenerationSide } from "./generationProvenance";

export type TokenTimelineEventKind = "launch" | "trade" | "generation" | "claim";

export type TokenTimelineLinkLabel =
  | "token"
  | "gallery"
  | "soul"
  | "transaction"
  | "mint"
  | "nft";

export interface TokenTimelineLink {
  labelKey: TokenTimelineLinkLabel;
  href: string;
  external?: boolean;
}

export interface TokenTimelineSignature {
  signature: string;
  slot: number;
  blockTime?: number | null;
  address: string;
}

export interface TokenTimelineEvent {
  id: string;
  kind: TokenTimelineEventKind;
  tokenMint: string;
  tokenLabel: string;
  evidenceSource?: string;
  evidenceAddress?: string;
  generation?: string;
  sequence?: string;
  side?: GenerationSide;
  amount?: string;
  trader?: string;
  tokenAccount?: string;
  seedHash?: string;
  receiptLifecycleState?: ClaimedSoulNft["receiptLifecycleState"];
  receiptAccount?: string;
  receiptBoundQuantity?: string;
  receiptBoundBoundary?: string;
  soul?: string;
  signature?: string;
  slot?: number;
  blockTime?: number | null;
  links: TokenTimelineLink[];
}

export interface TokenTimelineSnapshotWarning {
  source: string;
  reason: string;
}

export interface TokenTimelineSnapshot {
  tokenMint: string;
  events: TokenTimelineEvent[];
  source: {
    fetchedAt: string;
    rpcEndpoint: string;
  };
  partial?: boolean;
  warnings?: TokenTimelineSnapshotWarning[];
}

export interface BuildTokenTimelineInput {
  mint: PublicKey;
  curve: PublicKey;
  soul: PublicKey;
  bondingCurve: BondingCurveAccount;
  soulAccount: SoulAccount | null;
  claims: ClaimedSoulNft[];
  generationRows?: GenerationProvenanceRow[];
  signaturesByAddress?: Record<string, TokenTimelineSignature[]>;
  fetchedAt?: Date;
  rpcEndpoint?: string;
}

type TimelineEventWithSort = TokenTimelineEvent & {
  fallbackOrder: number;
};

const DEVNET_EXPLORER_ADDRESS = "https://explorer.solana.com/address";
const DEVNET_EXPLORER_TX = "https://explorer.solana.com/tx";

export function buildTokenTimelineSnapshot(input: BuildTokenTimelineInput): TokenTimelineSnapshot {
  const mint = input.mint.toBase58();
  const curve = input.curve.toBase58();
  const soul = input.soul.toBase58();
  const tokenLabel = input.soulAccount?.memeSymbol || truncateAddress(mint);
  const signaturesByAddress = input.signaturesByAddress ?? {};
  const launchEvidence = earliestSignature(signaturesByAddress, [mint, curve, soul]);
  const tradeEvidence = latestSignature(signaturesByAddress, [curve]);
  const generationRows = (input.generationRows ?? []).filter(
    (row) => row.tokenMint === mint && row.soul === soul,
  );
  const events: TimelineEventWithSort[] = [
    withEvidence(
      {
        id: `launch:${mint}`,
        kind: "launch",
        tokenMint: mint,
        tokenLabel,
        fallbackOrder: 0,
        links: [
          { labelKey: "token", href: `/token/${mint}` },
          { labelKey: "mint", href: devnetExplorerAddress(mint), external: true },
        ],
      },
      launchEvidence,
    ),
  ];

  const generationCount = input.soulAccount?.generationCount ?? 0n;
  if (input.bondingCurve.cumulativeSol > 0n || generationCount > 0n) {
    events.push(
      withEvidence(
        {
          id: `trade:${mint}:${generationCount.toString()}`,
          kind: "trade",
          tokenMint: mint,
          tokenLabel,
          generation: generationCount > 0n ? generationCount.toString() : undefined,
          fallbackOrder: 1,
          links: [
            { labelKey: "token", href: `/token/${mint}` },
            { labelKey: "soul", href: devnetExplorerAddress(soul), external: true },
          ],
        },
        tradeEvidence,
      ),
    );
  }

  for (const row of generationRows) {
    events.push(
      generationEventFromRow({
        row,
        tokenLabel,
        fallbackOrder: 2 + row.generation / 1_000_000,
      }),
    );
  }

  for (const claim of input.claims) {
    const claimAddress = claim.claim.toBase58();
    const nftMint = claim.nftMint.toBase58();
    const claimEvidence = latestSignature(signaturesByAddress, [claimAddress, nftMint]);
    events.push(
      withEvidence(
        {
          id: `claim:${claimAddress}`,
          kind: "claim",
          tokenMint: mint,
          tokenLabel,
          generation: claim.generationCount.toString(),
          sequence: claim.sequence.toString(),
          receiptLifecycleState: claim.receiptLifecycleState,
          receiptAccount: claim.receiptAccount?.toBase58(),
          receiptBoundQuantity: claim.receipt?.boundQuantity.toString(),
          receiptBoundBoundary: claim.receipt?.boundBoundary.toString(),
          fallbackOrder: 3 + Number(claim.sequence) / 1_000_000,
          links: [
            { labelKey: "gallery", href: `/token/${mint}/gallery` },
            { labelKey: "nft", href: devnetExplorerAddress(nftMint), external: true },
          ],
        },
        claimEvidence,
      ),
    );
  }

  return {
    tokenMint: mint,
    events: events
      .sort(compareTimelineEvents)
      .map(({ fallbackOrder: _fallbackOrder, ...event }) => event),
    source: {
      fetchedAt: (input.fetchedAt ?? new Date()).toISOString(),
      rpcEndpoint: input.rpcEndpoint ?? "public devnet RPC",
    },
  };
}

function generationEventFromRow({
  fallbackOrder,
  row,
  tokenLabel,
}: {
  fallbackOrder: number;
  row: GenerationProvenanceRow;
  tokenLabel: string;
}): TimelineEventWithSort {
  return {
    id: row.id,
    kind: "generation",
    tokenMint: row.tokenMint,
    tokenLabel,
    generation: row.generation.toString(),
    side: row.side,
    amount: row.amount,
    trader: row.trader,
    tokenAccount: row.tokenAccount,
    seedHash: row.seedHash,
    soul: row.soul,
    evidenceSource: row.source,
    evidenceAddress: row.tokenAccount,
    signature: row.signature,
    slot: row.slot,
    blockTime: row.blockTime,
    fallbackOrder,
    links: [
      { labelKey: "token", href: `/token/${row.tokenMint}` },
      { labelKey: "soul", href: devnetExplorerAddress(row.soul), external: true },
      {
        labelKey: "transaction",
        href: devnetExplorerTx(row.signature),
        external: true,
      },
    ],
  };
}

function withEvidence<T extends TimelineEventWithSort>(
  event: T,
  evidence: TokenTimelineSignature | undefined,
): T {
  if (!evidence) {
    return event;
  }

  return {
    ...event,
    evidenceSource: "public-address-signatures",
    evidenceAddress: evidence.address,
    signature: evidence.signature,
    slot: evidence.slot,
    blockTime: evidence.blockTime,
    links: [
      ...event.links,
      {
        labelKey: "transaction",
        href: devnetExplorerTx(evidence.signature),
        external: true,
      },
    ],
  };
}

function earliestSignature(
  signaturesByAddress: Record<string, TokenTimelineSignature[]>,
  addresses: string[],
): TokenTimelineSignature | undefined {
  return collectSignatures(signaturesByAddress, addresses).sort(compareSignaturesAscending)[0];
}

function latestSignature(
  signaturesByAddress: Record<string, TokenTimelineSignature[]>,
  addresses: string[],
): TokenTimelineSignature | undefined {
  return collectSignatures(signaturesByAddress, addresses).sort(compareSignaturesDescending)[0];
}

function collectSignatures(
  signaturesByAddress: Record<string, TokenTimelineSignature[]>,
  addresses: string[],
): TokenTimelineSignature[] {
  return addresses.flatMap((address) => signaturesByAddress[address] ?? []);
}

function compareSignaturesAscending(
  left: TokenTimelineSignature,
  right: TokenTimelineSignature,
): number {
  return left.slot - right.slot || left.signature.localeCompare(right.signature);
}

function compareSignaturesDescending(
  left: TokenTimelineSignature,
  right: TokenTimelineSignature,
): number {
  return right.slot - left.slot || left.signature.localeCompare(right.signature);
}

function compareTimelineEvents(left: TimelineEventWithSort, right: TimelineEventWithSort): number {
  if (left.blockTime != null && right.blockTime != null) {
    if (left.blockTime !== right.blockTime) {
      return left.blockTime - right.blockTime;
    }
  }

  if (left.slot !== undefined && right.slot !== undefined && left.slot !== right.slot) {
    return left.slot - right.slot;
  }

  return left.fallbackOrder - right.fallbackOrder || left.id.localeCompare(right.id);
}

function devnetExplorerAddress(address: string): string {
  return `${DEVNET_EXPLORER_ADDRESS}/${address}?cluster=devnet`;
}

function devnetExplorerTx(signature: string): string {
  return `${DEVNET_EXPLORER_TX}/${signature}?cluster=devnet`;
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}
