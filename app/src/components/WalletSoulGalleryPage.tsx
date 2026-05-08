"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { getTokenMetadata, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { listClaimedSoulNftsByClaimer, listClaimedSoulNftsByNftMints } from "sdk";
import {
  buildClaimedSoulNftGalleryItems,
  buildSoulNftGalleryItems,
  decodeSoulNftMetadataUri,
  hydrateSoulNftGalleryItemsWithRpcProvenance,
  type ClaimedSoulNftGalleryItem,
  type DecodedSoulNftMetadata,
  type ParsedTokenAccountLike,
  type SoulNftAssociation,
  type SoulNftGalleryItem,
} from "@/lib/soulGallery";
import {
  formatGalleryFallbackMessage,
  runBoundedGalleryRequest,
} from "@/lib/galleryRecovery";
import { GalleryStatusCard } from "@/components/GalleryStatusCard";
import { SoulGalleryCard } from "@/components/SoulGalleryCard";
import { Link } from "@/i18n/navigation";
import { joinClasses, uiPrimitives } from "./uiPrimitives";

type WalletGalleryItem = ClaimedSoulNftGalleryItem | SoulNftGalleryItem;

type GalleryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; items: WalletGalleryItem[] }
  | { status: "error"; message: string };

type WalletSoulGalleryMessages = "gallery" | "profile";

const WALLET_GALLERY_TIMEOUT_MS = 12_000;

export function WalletSoulGalleryPage({
  messages = "gallery",
}: {
  messages?: WalletSoulGalleryMessages;
}) {
  const t = useTranslations(messages);
  const { connection } = useConnection();
  const { connected, publicKey } = useWallet();
  const [galleryState, setGalleryState] = useState<GalleryState>({ status: "idle" });
  const ownerLabel = useMemo(() => {
    if (!publicKey) {
      return t("ownerNone");
    }
    const address = publicKey.toBase58();
    return `${address.slice(0, 4)}…${address.slice(-4)}`;
  }, [publicKey, t]);
  useEffect(() => {
    if (!connected || !publicKey) {
      setGalleryState({ status: "idle" });
      return;
    }

    let isMounted = true;
    setGalleryState({ status: "loading" });

    async function loadGallery(owner: PublicKey): Promise<WalletGalleryItem[]> {
      const claimPage = await runBoundedGalleryRequest(
        () =>
          listClaimedSoulNftsByClaimer(connection, owner, {
            fetchMetadata: true,
            pageSize: 100,
          }),
        { timeoutMs: WALLET_GALLERY_TIMEOUT_MS, retryDelaysMs: [] },
      );
      const claimItems = buildClaimedSoulNftGalleryItems(claimPage.items);
      const claimNftMints = new Set(claimItems.map((item) => item.nftMint));
      const walletItems: SoulNftGalleryItem[] = [];

      try {
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          owner,
          { programId: TOKEN_2022_PROGRAM_ID },
          "confirmed",
        );
        const parsedAccounts = tokenAccounts.value as ParsedTokenAccountLike[];
        const nftMints = Array.from(
          new Set(
            parsedAccounts
              .map((account) => account.account.data.parsed?.info)
              .filter((info) => info?.tokenAmount?.amount === "1" && info.tokenAmount.decimals === 0)
              .map((info) => info?.mint)
              .filter((mint): mint is string => Boolean(mint)),
          ),
        );
        const metadataByMint = new Map<string, DecodedSoulNftMetadata | null>();
        const tokenMintByNftMint = new Map<string, SoulNftAssociation>();

        await Promise.all(
          nftMints.map(async (mintAddress) => {
            try {
              const metadata = await getTokenMetadata(
                connection,
                new PublicKey(mintAddress),
                "confirmed",
                TOKEN_2022_PROGRAM_ID,
              );
              metadataByMint.set(
                mintAddress,
                metadata ? decodeSoulNftMetadataUri(metadata.uri) : null,
              );
            } catch {
              metadataByMint.set(mintAddress, null);
            }
          }),
        );
        const claimsByNftMint = await listClaimedSoulNftsByNftMints(
          connection,
          nftMints.map((mintAddress) => new PublicKey(mintAddress)),
          { fetchMetadata: false },
        );
        for (const [nftMint, claim] of claimsByNftMint.entries()) {
          if (!claim.tokenMint) {
            continue;
          }
          tokenMintByNftMint.set(nftMint, {
            claim: claim.claim.toBase58(),
            tokenMint: claim.tokenMint.toBase58(),
            soul: claim.soul.toBase58(),
            generation: claim.generationCount.toString(),
            sequence: claim.sequence,
          });
        }

        walletItems.push(
          ...buildSoulNftGalleryItems(parsedAccounts, metadataByMint, tokenMintByNftMint).filter(
            (item) => !claimNftMints.has(item.mint),
          ),
        );
      } catch {
        // Receipt binding records remain the primary Profile source. Token-account
        // scans only enrich/append wallet-owned metadata when the RPC path is available.
      }

      return runBoundedGalleryRequest(
        () => hydrateSoulNftGalleryItemsWithRpcProvenance([...claimItems, ...walletItems]),
        { timeoutMs: WALLET_GALLERY_TIMEOUT_MS, retryDelaysMs: [] },
      );
    }

    loadGallery(publicKey)
      .then((items) => {
        if (isMounted) {
          setGalleryState({ status: "loaded", items });
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setGalleryState({
            status: "error",
            message: formatGalleryFallbackMessage(error, {
              loadError: t("loadError"),
              timeoutError: t("timeoutError"),
              retryGuidance: t("retryGuidance"),
            }),
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [connected, connection, publicKey, t]);

  return (
    <main className="mx-auto min-h-[calc(100vh-73px)] max-w-screen-sm px-4 py-8 sm:px-6 sm:py-12 lg:max-w-7xl">
      <section className={joinClasses(uiPrimitives.panel, "mb-5 grid min-w-0 gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end")}>
        <div className="min-w-0">
          <p className={joinClasses(uiPrimitives.label, "w-fit")}>{t("eyebrow")}</p>
          <h1 className="mt-2 break-words text-3xl font-black sm:text-4xl">{t("title")}</h1>
          <p className="mt-4 max-w-3xl text-white/65">{t("description")}</p>
        </div>
        <p className={joinClasses(uiPrimitives.denseRow, "mt-4 text-sm text-white/65")}>{t("wallet", { owner: ownerLabel })}</p>
      </section>

      {!connected || !publicKey ? (
        <GalleryStatusCard>{t("connectPrompt")}</GalleryStatusCard>
      ) : null}

      {galleryState.status === "loading" ? (
        <GalleryStatusCard>{t("loading")}</GalleryStatusCard>
      ) : null}

      {galleryState.status === "error" ? (
        <GalleryStatusCard tone="error">{galleryState.message}</GalleryStatusCard>
      ) : null}

      {galleryState.status === "loaded" && galleryState.items.length === 0 ? (
        <GalleryStatusCard>
          {t.rich("empty", {
            link: (chunks) => (
              <Link className={joinClasses(uiPrimitives.buttonSecondary, "px-2 py-1 text-soul-mint underline")} href="/launch">
                {chunks}
              </Link>
            ),
          })}
        </GalleryStatusCard>
      ) : null}

      {galleryState.status === "loaded" && galleryState.items.length > 0 ? (
        <div className="grid min-w-0 gap-3 lg:grid-cols-2">
          {galleryState.items.map((item) => (
            <SoulGalleryCard item={item} key={galleryItemKey(item)} scope="gallery" />
          ))}
        </div>
      ) : null}
    </main>
  );
}

function galleryItemKey(item: WalletGalleryItem): string {
  return "nftMint" in item ? `${item.claim}-${item.nftMint}` : `${item.tokenAccount}-${item.mint}`;
}

export default WalletSoulGalleryPage;
